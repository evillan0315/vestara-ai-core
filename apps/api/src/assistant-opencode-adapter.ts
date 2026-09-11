/**
 * Assistant OpenCode Adapter — OpenCode 1.18.27 → Vestara Assistant SSE.
 *
 * GA-UX-PREMIUM M3 (contract/infrastructure). Drives one assistant turn over
 * a local OpenCode headless server: creates a session, consumes the `/event`
 * SSE stream, and projects runtime events into `assistant.execution.v1`
 * details that ride the existing Conversation SSE contract
 * (delta/status/tool/tool_result/done/error — additive, §13).
 *
 * Invariant: the browser consumes Vestara's projection contract, never raw
 * OpenCode events. React must never depend on OpenCode event schemas.
 *
 * Boundaries:
 * - Identity: OpenCode `callID` is preserved as `operationId` (§3).
 * - Lifecycle: explicit running/completed/failed; never `output === "failed"` (§4).
 * - Sanitization: every field passes the shared allowlist normalizer (§11).
 * - AR-009 remains paused: this adapter is optional wiring with graceful
 *   fallback to the direct-provider executor; it never makes OpenCode
 *   mandatory.
 */

import type { ProviderExecutor } from '@vestara/conversation';
import type { OpenCodeEvent, OpenCodeHttpClient } from '@vestara/opencode-runtime';
import { normalizePermissionAction } from '@vestara/opencode-runtime';
import type { CompletionRequest, CompletionResponse, GAExecutionConfig, StreamChunk } from '@vestara/shared';
import {
  type AssistantCapabilityPolicy,
  buildToolsMap,
  evaluatePermission,
  type PermissionEvaluation,
} from './assistant-capability-policy';
import type { AssistantConversationSessionRegistry } from './assistant-conversation-sessions';
import {
  projectDetail,
  projectEditStarted,
  projectMessagePartUpdated,
  projectPermissionRequested,
  projectPermissionResolved,
  projectQuestionAsked,
  projectQuestionResolved,
  projectTerminalCompleted,
  projectTerminalStarted,
  projectTodoSnapshot,
  projectToolCompleted,
  projectToolFailed,
  projectToolStarted,
} from './assistant-execution-projection';
import type { AssistantInteractionBroker, AssistantQuestionDecision } from './assistant-interaction-broker';

export interface AssistantOpenCodeExecutorOptions {
  client: OpenCodeHttpClient;
  /** Workspace identity for the OpenCode request context. */
  workspaceId: string;
  /** Repository root (absolute) — OpenCode session directory authority. */
  directory: string;
  agent: string;
  /** Resolved provider/model override (when known at construction time). */
  model?: { providerID: string; modelID: string };
  /**
   * Per-turn resolver: map the requested `CompletionRequest.model` /
   * `CompletionRequest.provider` → the provider/model that actually executes.
   * When provided, the adapter never fabricates a provider — provenance follows
   * the real upstream resolution. May be async (server-authoritative binding
   * validation happens before the turn is submitted).
   */
  resolveProviderModel?: (
    model?: string,
    provider?: string,
  ) =>
    | { providerID: string; modelID: string }
    | Promise<{ providerID: string; modelID: string } | undefined>
    | undefined;
  /**
   * GA-RUNTIME-001: conversation → OpenCode session registry. When set and the
   * request carries a `conversationId`, the executor reuses the conversation's
   * session across turns (single-flight creation on the first turn). Session
   * continuity is keyed by conversation identity — never by provider/model.
   */
  sessionRegistry?: AssistantConversationSessionRegistry;
  /**
   * GA-RUNTIME-001 Addendum B: interactive permission/question decisions.
   * When set, ASK policy decisions and OpenCode questions project to the
   * browser and await a real user decision instead of degrading to a status.
   */
  interactionBroker?: AssistantInteractionBroker;
  title?: string;
  /** Hard cap for a single turn (ms). Default 5 minutes. */
  turnTimeoutMs?: number;
  /**
   * GA-CAP-003: Vestara-owned capability boundary for the Global Assistant.
   * When provided, permission requests are evaluated against this policy
   * before being surfaced to the user. ALLOW decisions are auto-approved,
   * DENY decisions are auto-rejected, and ASK decisions are surfaced.
   * When absent, the adapter behaves as before (all permissions surfaced).
   */
  capabilityPolicy?: AssistantCapabilityPolicy;
}

// GA-EXEC-001: Default turn timeout. Overridden by:
//   1. Per-turn executionConfig.turnTimeoutMs (UI/session)
//   2. VESTARA_GA_TURN_TIMEOUT_MS env var (deployment default)
const TURN_TIMEOUT_MS = Number(process.env.VESTARA_GA_TURN_TIMEOUT_MS) || 15 * 60 * 1000;

/**
 * Transport label used ONLY when no real provider resolution is available
 * (no resolver wired, no model override). Never replaces real upstream
 * provenance — callers that wire a resolver always get the true provider.
 */
const TRANSPORT_PROVIDER = 'opencode';

function lastUserText(messages: CompletionRequest['messages']): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message && message.role === 'user' && typeof message.content === 'string') {
      return message.content;
    }
  }
  return '';
}

/**
 * Derive a meaningful OpenCode session title from the first user message.
 * Collapses whitespace and bounds to a single short line (48 chars).
 * Falls back to 'Assistant conversation' when no user text is available.
 */
function deriveSessionTitle(userText: string): string {
  const singleLine = userText.replace(/\s+/g, ' ').trim();
  if (singleLine.length === 0) return 'Assistant conversation';
  const maxLength = 48;
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, maxLength).trimEnd()}…`;
}

/**
 * GA-CONTEXT-002: deterministic trusted-application-context block for the
 * model. Bounded, descriptive — never repository/execution authority. The
 * surface `path`/`route`/`title` are client navigation state; the workspace
 * name/id are descriptive identity. Selection label is display data only.
 */
function buildSurfaceSystem(surfaceContext: CompletionRequest['surfaceContext']): string | undefined {
  if (!surfaceContext || !surfaceContext.surface || !surfaceContext.workspace) return undefined;
  const { workspace, surface, selected } = surfaceContext;
  const lines = ['Current Vestara application context:', `Workspace: ${workspace.name}`];
  if (surface.section) lines.push(`Section: ${surface.section}`);
  if (surface.title) lines.push(`Page: ${surface.title}`);
  if (surface.routeId) lines.push(`Route: ${surface.routeId}`);
  if (selected) {
    lines.push('Selected item:', `Type: ${selected.kind}`, `ID: ${selected.id}`);
    if (selected.label) lines.push(`Label: ${selected.label}`);
  }
  return lines.join('\n');
}

function chunk(type: StreamChunk['type'], sequence: number, extra: Partial<StreamChunk> = {}): StreamChunk {
  return {
    id: `oc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type,
    metadata: { sequence, timestamp: new Date().toISOString() },
    ...extra,
  };
}

/**
 * Run one OpenCode turn as an async generator of normalized `StreamChunk`s.
 * Events are consumed from the session-scoped `/event` stream; correlation is
 * keyed on OpenCode `callID`; every projected detail passes the sanitizer.
 *
 * GA-RUNTIME-001: when `sessionId` is provided the OpenCode session is REUSED
 * (conversation continuity); when absent a fresh session is created (backward-
 * compatible single-turn path).
 */
export async function* runAssistantOpenCodeTurn(
  options: AssistantOpenCodeExecutorOptions,
  request: CompletionRequest,
  sessionId?: string,
): AsyncIterable<StreamChunk> {
  const { client, workspaceId, directory, agent, turnTimeoutMs: defaultTimeout = TURN_TIMEOUT_MS } = options;
  // GA-EXEC-001: per-turn execution config from UI. Overrides defaults.
  const execCfg: GAExecutionConfig | undefined = request.executionConfig;
  const turnTimeoutMs = execCfg?.turnTimeoutMs ?? defaultTimeout;
  // GA-EXEC-001: maxToolCalls is the canonical tool-invocation budget.
  // maxOperations was removed — it counted the same events as maxToolCalls.
  const maxToolCalls = execCfg?.maxToolCalls;
  const context = { workspaceId, directory };
  const userText = lastUserText(request.messages);
  if (!userText) throw new Error('Assistant OpenCode turn requires a user message');

  // GA-EXEC-001: tool call counter for budget enforcement
  let toolCallCount = 0;

  // Resolve the real upstream provider/model for THIS turn; never fabricated.
  // The requested provider/model is the browser's REQUESTED binding; the
  // server-side resolver validates it before execution (GA-RUNTIME-001 G).
  const turnModel = (await options.resolveProviderModel?.(request.model, request.provider)) ?? options.model;
  const turnProvider = turnModel?.providerID ?? TRANSPORT_PROVIDER;

  // GA-RUNTIME-001: reuse the conversation's session when the caller resolved
  // one; otherwise create (single-turn path).
  let resolvedSessionId = sessionId;
  if (!resolvedSessionId) {
    const session = await client.createSession({ title: deriveSessionTitle(userText) }, context);
    resolvedSessionId = session.id;
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  request.signal?.addEventListener('abort', onAbort);

  // Background event reader → FIFO queue (events may arrive before sendMessage
  // resolves; the queue guarantees none are dropped).
  const queue: OpenCodeEvent[] = [];
  const waiters: Array<() => void> = [];
  let readerDone = false;
  const wake = () => {
    const pending = waiters.splice(0);
    for (const waiter of pending) waiter();
  };
  const push = (event: OpenCodeEvent) => {
    queue.push(event);
    wake();
  };
  const readerPromise = (async () => {
    try {
      for await (const event of client.openEventStream(context, controller.signal)) {
        const payload = event.payload as Record<string, unknown> | undefined;
        if (payload && payload.sessionID === resolvedSessionId) push(event);
      }
    } catch {
      // stream closed (abort/network) — the turn loop observes readerDone.
    } finally {
      readerDone = true;
      wake();
    }
  })();

  const deadline = Date.now() + turnTimeoutMs;
  const shellStartedAt = new Map<string, number>();
  let sequence = 0;
  // GA-RUNTIME-001 cancel safety: only a natural `session.status idle` proves
  // the runtime settled; any other exit must actively settle the session.
  let completedNaturally = false;

  try {
    // GA-SSE-003B: submit asynchronously (POST /session/:id/prompt_async).
    // sendMessage() waits for full execution and is incompatible with
    // interactive runtime behavior; prompt_async is accepted in ~50ms and the
    // already-subscribed /event stream becomes the execution authority.
    await client.sendMessageAsync(
      resolvedSessionId,
      {
        parts: [{ type: 'text', text: userText }],
        agent,
        // Async input model shape: { providerId, modelId } (lowercase).
        // GA-RUNTIME-001 E: provider/model is Execution Binding — it rides the
        // prompt, never a new session.
        ...(turnModel ? { model: { providerId: turnModel.providerID, modelId: turnModel.modelID } } : {}),
        // GA-CONTEXT-002: trusted turn-time surface context via the
        // established `system` field (proven additive — the agent's own
        // governance prompt is preserved). Never concatenated into the human
        // message; never repository/execution authority.
        ...(buildSurfaceSystem(request.surfaceContext) ? { system: buildSurfaceSystem(request.surfaceContext) } : {}),
        // GA-RUNTIME-004 / GA-TOOL-001: per-turn tool availability from
        // GA-CAP-003 policy. ALLOW → true, ASK/DENY → false. This is the
        // pre-execution enforcement point that prevents the * allow wildcard
        // from auto-approving mutation tools.
        ...(options.capabilityPolicy ? { tools: buildToolsMap(options.capabilityPolicy) } : {}),
      },
      context,
    );

    let turnDone = false;
    while (!turnDone) {
      if (Date.now() > deadline) {
        yield chunk('error', sequence++, { content: 'Assistant turn timed out' });
        break;
      }
      while (queue.length === 0 && !readerDone) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
      const event = queue.shift();
      if (!event) break;

      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const callID = typeof payload.callID === 'string' ? payload.callID : undefined;

      // GA-EXEC-001: budget enforcement helper — checks tool-call limits
      // after each event. Returns an error message if exceeded, null if
      // within budget.
      const checkBudget = (): string | null => {
        if (maxToolCalls !== undefined && toolCallCount >= maxToolCalls) {
          return `Tool call limit reached: ${maxToolCalls} tool calls`;
        }
        return null;
      };

      switch (event.type) {
        case 'session.next.text.delta':
        case 'message.part.delta': {
          if (typeof payload.delta === 'string' && payload.delta) {
            // GA-EXEC-001: text deltas are LLM inference output, not governed
            // operations. They do NOT consume the maxOperations budget.
            yield {
              ...chunk('text', sequence++, { content: payload.delta }),
              // GA-RUNTIME-001 H: the displayed execution binding is the REAL
              // upstream provider/model for this turn — never the composer value.
              metadata: {
                sequence: 0,
                timestamp: new Date().toISOString(),
                provider: turnProvider,
                model: turnModel?.modelID,
                runtimeSessionId: resolvedSessionId,
              },
            };
          }
          break;
        }
        case 'message.part.updated': {
          // LIVE path: tool calls surface as tool parts on this event.
          const detail = projectMessagePartUpdated(event);
          if (detail && detail.kind === 'tool') {
            if (detail.state === 'running') {
              toolCallCount++;
              const budgetError = checkBudget();
              if (budgetError) { yield chunk('error', sequence++, { content: budgetError }); break; }
              yield chunk('tool_call', sequence++, { name: detail.tool, detail });
            } else {
              yield chunk('tool_result', sequence++, {
                name: detail.tool,
                content: detail.state === 'failed' ? (detail.error ?? 'Tool failed') : (detail.preview ?? ''),
                detail,
              });
            }
          }
          break;
        }
        case 'session.next.tool.input.started':
        case 'session.next.tool.called': {
          const detail = projectToolStarted(event);
          if (detail && detail.kind === 'tool') {
            toolCallCount++;
            const budgetError = checkBudget();
            if (budgetError) { yield chunk('error', sequence++, { content: budgetError }); break; }
            yield chunk('tool_call', sequence++, { name: detail.tool, detail });
          }
          break;
        }
        case 'session.next.tool.success': {
          const detail = projectToolCompleted(event);
          if (detail && detail.kind === 'tool') {
            yield chunk('tool_result', sequence++, { name: detail.tool, content: detail.preview ?? '', detail });
          }
          break;
        }
        case 'session.next.tool.failed': {
          const detail = projectToolFailed(event);
          if (detail && detail.kind === 'tool') {
            yield chunk('tool_result', sequence++, {
              name: detail.tool,
              content: detail.error ?? 'Tool failed',
              detail,
            });
          }
          break;
        }
        case 'session.next.shell.started': {
          const detail = projectTerminalStarted(event);
          if (detail && detail.kind === 'terminal') {
            shellStartedAt.set(detail.operationId, detail.timestamp);
            yield chunk('tool_call', sequence++, {
              name: 'bash',
              content: detail.command ?? 'Running command…',
              detail,
            });
          }
          break;
        }
        case 'session.next.shell.ended': {
          const startedAt = callID !== undefined ? shellStartedAt.get(callID) : undefined;
          const detail = projectTerminalCompleted(event, startedAt);
          if (detail && detail.kind === 'terminal') {
            yield chunk('tool_result', sequence++, {
              name: 'bash',
              content: detail.outputPreview ?? '',
              detail,
            });
          }
          break;
        }
        case 'permission.v2.asked':
        case 'permission.asked': {
          const detail = projectPermissionRequested(event);
          if (detail && detail.kind === 'permission') {
            // GA-CAP-003 / GA-RUNTIME-001 B: evaluate against the Vestara
            // capability policy when provided. ALLOW auto-approves, DENY
            // auto-rejects, ASK projects an interactive decision to the user.
            // The permission identity is the OpenCode request id (`per_*`),
            // exposed as `permissionRequestId` by the projection.
            const policy = options.capabilityPolicy;
            const permissionId = detail.permissionRequestId;
            if (policy && permissionId) {
              const action = normalizePermissionAction(detail.action);
              const resources = detail.resources ?? [];
              const evaluation: PermissionEvaluation = evaluatePermission(policy, action, resources);

              if (evaluation.decision === 'allow') {
                // Auto-approve: respond to OpenCode and surface as status
                try {
                  await client.respondToPermission(
                    resolvedSessionId,
                    permissionId,
                    {
                      decision: 'approve',
                      scope: 'session',
                      reason: evaluation.reason,
                    },
                    context,
                  );
                } catch {
                  // permission response failed — continue, OpenCode will handle timeout
                }
                yield chunk('status', sequence++, {
                  content: `Auto-approved: ${detail.action}`,
                  detail,
                });
              } else if (evaluation.decision === 'deny') {
                // Auto-reject: respond to OpenCode and surface as status
                try {
                  await client.respondToPermission(
                    resolvedSessionId,
                    permissionId,
                    {
                      decision: 'reject',
                      reason: evaluation.reason,
                    },
                    context,
                  );
                } catch {
                  // permission response failed — continue
                }
                yield chunk('status', sequence++, {
                  content: `Denied: ${detail.action} — ${evaluation.reason}`,
                  detail,
                });
              } else {
                // ASK: project a real interactive request to the browser, await
                // the user's decision, then respond with OpenCode's native
                // permission-response semantics (once / session / reject).
                const broker = options.interactionBroker;
                if (broker && request.conversationId) {
                  yield chunk('status', sequence++, {
                    content: `Waiting for permission: ${detail.action}`,
                    detail,
                  });
                  const decision = await broker.awaitPermission(request.conversationId, permissionId);
                  if (decision && decision.decision === 'approve') {
                    try {
                      await client.respondToPermission(
                        resolvedSessionId,
                        permissionId,
                        { decision: 'approve', scope: decision.scope, reason: evaluation.reason },
                        context,
                      );
                    } catch {
                      // respond failed — OpenCode will handle timeout
                    }
                    yield chunk('status', sequence++, {
                      content: `Approved: ${detail.action}`,
                      detail: {
                        ...detail,
                        permissionState: 'resolved' as const,
                        reply: decision.scope === 'session' ? ('always' as const) : ('once' as const),
                      },
                    });
                  } else if (decision && decision.decision === 'reject') {
                    try {
                      await client.respondToPermission(
                        resolvedSessionId,
                        permissionId,
                        { decision: 'reject', reason: decision.reason ?? 'Denied by user' },
                        context,
                      );
                    } catch {
                      // respond failed — OpenCode will handle timeout
                    }
                    yield chunk('status', sequence++, {
                      content: `Denied: ${detail.action}`,
                      detail: { ...detail, permissionState: 'resolved' as const, reply: 'reject' as const },
                    });
                  } else {
                    // No decision within the wait window — fail-safe reject.
                    try {
                      await client.respondToPermission(
                        resolvedSessionId,
                        permissionId,
                        { decision: 'reject', reason: 'Vestara permission request timed out' },
                        context,
                      );
                    } catch {
                      // respond failed — continue
                    }
                    yield chunk('status', sequence++, {
                      content: `Permission request timed out: ${detail.action}`,
                      detail: { ...detail, permissionState: 'resolved' as const, reply: 'reject' as const },
                    });
                  }
                } else {
                  // No broker: surface to user (status-only degradation).
                  yield chunk('status', sequence++, {
                    content: `Permission needed: ${detail.action}`,
                    detail,
                  });
                }
              }
            } else {
              // No policy or no permission id: surface to user (existing behavior)
              yield chunk('status', sequence++, { content: `Permission needed: ${detail.action}`, detail });
            }
          }
          break;
        }
        case 'permission.v2.replied':
        case 'permission.replied': {
          const detail = projectPermissionResolved(event);
          if (detail) yield chunk('status', sequence++, { detail });
          break;
        }
        case 'question.v2.asked':
        case 'question.asked': {
          // GA-RUNTIME-001 B: project the runtime question to the browser and
          // await the user's answer (correlation: conversation + session +
          // request id). No answer → fail-safe reject of the question.
          const detail = projectQuestionAsked(event);
          if (detail && detail.kind === 'question') {
            const broker = options.interactionBroker;
            if (broker && request.conversationId) {
              yield chunk('status', sequence++, {
                content: detail.questions[0]?.question ?? 'Question from the Assistant',
                detail,
              });
              const decision = (await broker.awaitQuestion(request.conversationId, detail.questionRequestId)) as
                | AssistantQuestionDecision
                | undefined;
              if (decision && decision.answers.length > 0) {
                try {
                  await client.replyToQuestion(resolvedSessionId, detail.questionRequestId, {
                    answers: decision.answers,
                  });
                } catch {
                  // reply failed — continue
                }
                yield chunk('status', sequence++, {
                  content: 'Answered',
                  detail: { ...detail, questionState: 'resolved' as const, reply: 'answered' as const },
                });
              } else {
                try {
                  await client.rejectQuestion(resolvedSessionId, detail.questionRequestId);
                } catch {
                  // reject failed — continue
                }
                yield chunk('status', sequence++, {
                  content: 'Question dismissed',
                  detail: { ...detail, questionState: 'resolved' as const, reply: 'rejected' as const },
                });
              }
            } else {
              yield chunk('status', sequence++, { content: 'Question needed', detail });
            }
          }
          break;
        }
        case 'question.v2.replied':
        case 'question.replied': {
          const detail = projectQuestionResolved(event);
          if (detail) yield chunk('status', sequence++, { detail });
          break;
        }
        case 'todo.updated': {
          const detail = projectTodoSnapshot(event);
          if (detail && detail.kind === 'task-snapshot') {
            yield chunk('status', sequence++, { content: `${detail.todos.length} todo(s)`, detail });
          }
          break;
        }
        case 'file.edited': {
          const detail = projectEditStarted(event);
          if (detail && detail.kind === 'edit') {
            yield chunk('status', sequence++, { content: `Edited ${detail.file}`, detail });
          }
          break;
        }
        case 'session.status': {
          const status = payload.status as { type?: string } | undefined;
          if (status && status.type === 'idle') {
            turnDone = true;
            completedNaturally = true;
          }
          break;
        }
        case 'session.idle': {
          // Dedicated idle event (1.18.27 contract) — authoritative settlement.
          turnDone = true;
          completedNaturally = true;
          break;
        }
        case 'session.error': {
          yield chunk('error', sequence++, { content: 'OpenCode session error' });
          turnDone = true;
          break;
        }
        default:
          break;
      }
    }

    // ── Turn-end enrichment (authoritative endpoints, bounded) ──
    try {
      const diffFiles = await client.getSessionDiff(resolvedSessionId, context);
      for (const diffFile of diffFiles) {
        const detail = projectDetail({
          contract: 'assistant.execution.v1',
          version: 1,
          operationId: `edit:${resolvedSessionId}:${diffFile.path}`,
          kind: 'edit',
          state: 'completed',
          file: diffFile.path,
          operation: diffFile.operation,
          additions: diffFile.additions,
          deletions: diffFile.deletions,
          // GA-UX-PREMIUM M3.2: OpenCode 1.18.27 exposes the diff as
          // `patch?: string` (SnapshotFileDiff/VcsFileDiff). Preserve it as
          // opaque runtime evidence — never parsed, never converted to hunks.
          patch: diffFile.patch,
          diffRepresentation: diffFile.patch !== undefined ? 'patch' : 'unavailable',
          diffProvenance: diffFile.patch !== undefined ? 'runtime-provided' : 'unavailable',
          timestamp: Date.now(),
        });
        if (detail) yield chunk('status', sequence++, { content: `Edited ${diffFile.path}`, detail });
      }
    } catch {
      // session diff unavailable — edit detail stays 'unavailable'
    }
    try {
      const todos = await client.getSessionTodos(resolvedSessionId, context);
      if (todos.length > 0) {
        const detail = projectDetail({
          contract: 'assistant.execution.v1',
          version: 1,
          operationId: `todo:${resolvedSessionId}`,
          kind: 'task-snapshot',
          state: 'completed',
          source: 'opencode',
          todos: todos.map((todo) => ({ title: todo.content, status: todo.status ?? 'pending' })),
          timestamp: Date.now(),
        });
        if (detail) yield chunk('status', sequence++, { content: `${todos.length} todo(s)`, detail });
      }
    } catch {
      // todos unavailable — task projection stays absent (explicit absence)
    }
  } finally {
    controller.abort();
    request.signal?.removeEventListener('abort', onAbort);
    await readerPromise.catch(() => undefined);
    // GA-RUNTIME-001 L: closing the Vestara SSE response alone is NOT
    // cancellation. When the turn ended without a natural `session.status
    // idle` (user stop, client disconnect, timeout), actively settle the
    // OpenCode runtime generation so the reused session is safe for the next
    // prompt_async. Authoritative on 1.18.27: POST /session/:id/abort.
    if (!completedNaturally) {
      try {
        await client.abortSession(resolvedSessionId, context);
      } catch {
        // interruption is best-effort — the SSE reader is already closed
      }
    }
  }
}

/**
 * Build a `ProviderExecutor` backed by the local OpenCode server. Additive:
 * the caller decides when to use it; it never replaces the direct-provider
 * fallback by itself (AR-009 paused).
 */
export function createAssistantOpenCodeExecutor(options: AssistantOpenCodeExecutorOptions): ProviderExecutor {
  const resolveProvider = async (
    request: CompletionRequest,
  ): Promise<{ providerID: string; modelID: string } | undefined> =>
    (await options.resolveProviderModel?.(request.model, request.provider)) ?? options.model;

  /**
   * GA-RUNTIME-001: resolve (create-or-reuse) the conversation's OpenCode
   * session. Keyed by conversation identity only — never by provider/model.
   * The session is created with the canonical repository directory (OpenCode
   * `directory` query authority) and the first-turn execution title.
   */
  async function resolveSession(request: CompletionRequest): Promise<string | undefined> {
    const registry = options.sessionRegistry;
    if (!registry || !request.conversationId) return undefined;
    const context = { workspaceId: options.workspaceId, directory: options.directory };
    const userText = lastUserText(request.messages);
    const result = await registry.acquire({
      conversationId: request.conversationId,
      repositoryDir: options.directory,
      preferredSessionId: request.runtimeSessionId,
      createSession: async () => {
        const session = await options.client.createSession({ title: deriveSessionTitle(userText) }, context);
        return session.id;
      },
      verifySession: async (id) => {
        try {
          await options.client.getSession(id, context);
          return true;
        } catch (err) {
          console.error(
            `[adapter:verifySession] FAILED session=${id} dir=${context.directory} err=${err instanceof Error ? err.message : String(err)}`,
          );
          return false;
        }
      },
    });
    return result.session.sessionId;
  }

  return {
    async complete(request: CompletionRequest): Promise<CompletionResponse> {
      const sessionId = await resolveSession(request);
      const chunks: StreamChunk[] = [];
      for await (const item of runAssistantOpenCodeTurn(options, request, sessionId)) {
        chunks.push(item);
      }
      const content = chunks
        .filter((item) => item.type === 'text' && typeof item.content === 'string')
        .map((item) => item.content as string)
        .join('');
      const failed = chunks.find((item) => item.type === 'error');
      const turnModel = await resolveProvider(request);
      return {
        id: `conv-${Date.now()}`,
        // GA-RUNTIME-001 H: the response model is the ACTUAL execution binding.
        model: turnModel?.modelID ?? request.model,
        provider: turnModel?.providerID ?? TRANSPORT_PROVIDER,
        content: failed ? (failed.content ?? 'Assistant turn failed') : content,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        ...(sessionId
          ? {
              resolution: {
                providerId: turnModel?.providerID,
                reason: turnModel ? ('explicit-model' as const) : ('default' as const),
                defaultResolution: !turnModel,
                runtimeSessionId: sessionId,
              },
            }
          : {}),
      };
    },
    async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
      // GA-SSE-003: the terminal `complete` is owned by the Conversation
      // service (emitted AFTER the authoritative message is persisted). The
      // adapter yields only the turn's incremental chunks — no duplicate
      // `done` frames on the browser SSE stream.
      const sessionId = await resolveSession(request);
      for await (const item of runAssistantOpenCodeTurn(options, request, sessionId)) {
        if (sessionId && item.metadata) {
          item.metadata.runtimeSessionId = sessionId;
        }
        yield item;
      }
    },
  };
}
