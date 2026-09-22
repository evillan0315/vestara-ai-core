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
 *
 * Execution lifecycle semantics (GA-DETACH-001):
 * - COMPLETED: natural `session.status idle` received — turn finished successfully.
 * - FAILED: runtime error or provider failure — execution did not complete.
 * - TIMEOUT: configured execution deadline actually expired.
 * - CANCELLED: explicitly authorized cancellation (user Stop, API abort).
 * - DETACHED: observer/client stopped watching — execution continues server-side.
 *   This is NOT a failure. The session remains active for later reattachment.
 */

import type { ProviderExecutor } from '@vestara/conversation';
import type { EventBus } from '@vestara/event-bus';
import type { OpenCodeEvent, OpenCodeHttpClient } from '@vestara/opencode-runtime';
import { normalizePermissionAction } from '@vestara/opencode-runtime';
import type { CompletionRequest, CompletionResponse, GAExecutionConfig, StreamChunk } from '@vestara/shared';
import { truncateReasoning } from '@vestara/shared';
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
  projectReadObservation,
  projectTerminalCompleted,
  projectTerminalStarted,
  projectTodoSnapshot,
  projectToolCompleted,
  projectToolFailed,
  projectToolStarted,
} from './assistant-execution-projection';
import type { AssistantInteractionBroker, AssistantQuestionDecision } from './assistant-interaction-broker';

/**
 * ROUTING-CONVERGENCE-001C — per-turn resolved execution persona.
 *
 * Maps the requested logical `agentId` to the OpenCode runtime agent +
 * capability policy that actually execute the turn, both sourced from the
 * canonical AgentDefinition. The prompt_async request carries `runtimeAgent`;
 * the Vestara side retains the requested id for attribution, so a mismatch
 * can never silently pass as the requested agent.
 */
export interface ResolvedAgentPersona {
  /** OpenCode runtime agent for prompt_async.agent (e.g. 'vestara-developer'). */
  readonly runtimeAgent: string;
  /** Capability policy for this turn's tools map + permission evaluation. */
  readonly capabilityPolicy?: AssistantCapabilityPolicy;
}

/**
 * Thrown when the per-turn persona cannot be resolved authoritatively.
 * The turn fails BEFORE any OpenCode session/message is created — an
 * explicitly targeted agent never executes as another persona.
 */
export class AgentPersonaError extends Error {
  readonly agentId?: string;

  constructor(message: string, agentId?: string) {
    super(message);
    this.name = 'AgentPersonaError';
    this.agentId = agentId;
  }
}

/**
 * Resolve the turn persona: per-turn resolver wins; otherwise the
 * construction-time fallback agent governs generic execution only.
 */
async function resolveTurnPersona(
  options: AssistantOpenCodeExecutorOptions,
  request: CompletionRequest,
): Promise<ResolvedAgentPersona> {
  if (options.resolveAgentPersona) {
    return options.resolveAgentPersona(request.agentId);
  }
  return {
    runtimeAgent: options.agent,
    ...(options.capabilityPolicy ? { capabilityPolicy: options.capabilityPolicy } : {}),
  };
}

export interface AssistantOpenCodeExecutorOptions {
  client: OpenCodeHttpClient;
  /** Workspace identity for the OpenCode request context. */
  workspaceId: string;
  /** Repository root (absolute) — OpenCode session directory authority. */
  directory: string;
  /**
   * Fallback OpenCode runtime agent for generic execution when no per-turn
   * persona resolver is configured. ROUTING-CONVERGENCE-001C: this is NOT
   * consulted when `resolveAgentPersona` is present — the per-turn
   * resolution governs and never silently substitutes this default for an
   * explicitly targeted agent.
   */
  agent: string;
  /** Resolved provider/model override (when known at construction time). */
  model?: { providerID: string; modelID: string };
  /**
   * ROUTING-CONVERGENCE-001C: per-turn persona resolver. Maps the requested
   * logical `CompletionRequest.agentId` → the OpenCode runtime agent +
   * capability policy that actually execute this turn. Rejects for unknown
   * explicitly-targeted agents (fail closed — never substitute the fallback
   * agent). Absent only for bespoke executors; production always provides it.
   */
  resolveAgentPersona?: (agentId?: string) => Promise<ResolvedAgentPersona>;
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
  /**
   * Attribution sink for the cancellation boundary. Every turn start/end
   * and every OpenCode abort is recorded here with its reason
   * (termination classification) and originating operation identity
   * (conversationId + OpenCode sessionId), so a future "Interrupted"
   * state is attributable instead of merely observed. Structural type
   * (not @vestara/logger) to avoid a new package dependency; wired to
   * kernel.logger in production, absent in unit tests.
   */
  logger?: {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
  };
  /**
   * AR-TOOLS-001: durable Activity Room mirror for Global Assistant tool use.
   * When set, tool start/completion/failure also emits canonical
   * `opencode.message.part.updated` events (part.type=tool) for the
   * M9IngestionBridge, which stores durable tool.called/succeeded/failed
   * facts. Fire-and-forget; mirror failures never break the turn.
   * Wired to kernel.eventBus in production, absent in unit tests.
   */
  eventBus?: EventBus;
}

// GA-EXEC-001: Default turn timeout. Overridden by:
//   1. Per-turn executionConfig.turnTimeoutMs (UI/session)
//   2. VESTARA_GA_TURN_TIMEOUT_MS env var (deployment default)
// Temporary dogfood default: 60 minutes. Long engineering turns were
// hitting the old 15-minute default mid-execution (proven by
// termination="timeout" at elapsedMs=900013 with toolCallCount=175 while
// maxToolCalls=0/unlimited). Explicit overrides and the env var still take
// precedence; timeout/cancel/failure abort semantics are unchanged.
export const TURN_TIMEOUT_MS = Number(process.env.VESTARA_GA_TURN_TIMEOUT_MS) || 60 * 60 * 1000;

// GA-EXEC-001: Default per-turn tool-call budget for the Global Assistant.
// Bounds turns that arrive without an explicit executionConfig.maxToolCalls
// (e.g. Activity Room fire-and-forget turns). Explicit 0 still means
// unlimited; explicit 1–200 overrides this default.
// Default is 0 (unlimited); env VESTARA_GA_MAX_TOOL_CALLS still overrides.
const DEFAULT_MAX_TOOL_CALLS = (() => {
  const raw = process.env.VESTARA_GA_MAX_TOOL_CALLS;
  if (raw === undefined || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : 0;
})();

/**
 * Transport label used ONLY when no real provider resolution is available
 * (no resolver wired, no model override). Never replaces real upstream
 * provenance — callers that wire a resolver always get the true provider.
 */
const TRANSPORT_PROVIDER = 'opencode';
const OPENCODE_RUNTIME_ID = 'opencode';

/**
 * GA-DETACH-001: How a turn ended. This determines whether the OpenCode
 * session should be aborted or left running for later reattachment.
 *
 * - COMPLETED: natural `session.status idle` — turn finished successfully.
 * - FAILED: runtime error — execution did not complete.
 * - TIMEOUT: configured deadline expired.
 * - CANCELLED: explicitly authorized cancellation (user Stop, API abort).
 * - DETACHED: observer/client stopped watching — execution continues.
 */
type TurnTermination = 'completed' | 'failed' | 'timeout' | 'cancelled' | 'detached';

/**
 * GA-DETACH-001: Whether a turn termination requires aborting the OpenCode
 * session. COMPLETED and DETACHED do NOT require abort — the session is
 * either idle or still running. CANCELLED, TIMEOUT, and FAILED require abort
 * to settle the session for reuse.
 */
function requiresAbort(termination: TurnTermination): boolean {
  return termination === 'cancelled' || termination === 'timeout' || termination === 'failed';
}

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
/**
 * Render bounded turn surface context for the OpenCode `system` field.
 * Exported for focused contract tests (generic mechanism — no caller-specific logic).
 */
export function buildSurfaceSystem(surfaceContext: CompletionRequest['surfaceContext']): string | undefined {
  if (!surfaceContext?.surface || !surfaceContext.workspace) return undefined;
  const { workspace, surface, selected } = surfaceContext;
  const lines = ['Current Vestara application context:', `Workspace: ${workspace.name}`];
  if (surface.section) lines.push(`Section: ${surface.section}`);
  if (surface.title) lines.push(`Page: ${surface.title}`);
  if (surface.routeId) lines.push(`Route: ${surface.routeId}`);
  if (selected) {
    lines.push('Selected item:', `Type: ${selected.kind}`, `ID: ${selected.id}`);
    if (selected.label) lines.push(`Label: ${selected.label}`);
  }
  // AR-REF-001: plural references render through the same generic mechanism —
  // one bounded block per entry, each independently addressable. No
  // Activity-Room-specific logic: any producer of selectedReferences gets
  // identical treatment.
  const refs = surfaceContext.selectedReferences;
  if (refs && refs.length > 0) {
    lines.push('Referenced activities:');
    for (const ref of refs) {
      lines.push(`- Type: ${ref.kind}`, `  ID: ${ref.id}`);
      if (ref.label) lines.push(`  Label: ${ref.label}`);
    }
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
 * REASONING-BOUNDARY-001: join provider-emitted `reasoning` chunks into one
 * bounded diagnostic string. Text/tool/error chunks never contribute —
 * final content and reasoning accumulate on disjoint chunk types.
 * Returns undefined when no reasoning was emitted (absent stays absent).
 */
function accumulateReasoning(chunks: readonly StreamChunk[]): string | undefined {
  const joined = chunks
    .filter((item) => item.type === 'reasoning' && typeof item.content === 'string' && item.content.length > 0)
    .map((item) => item.content as string)
    .join('');
  if (!joined) return undefined;
  return truncateReasoning(joined);
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
  persona?: ResolvedAgentPersona,
): AsyncIterable<StreamChunk> {
  const { client, workspaceId, directory, turnTimeoutMs: defaultTimeout = TURN_TIMEOUT_MS } = options;
  // GA-EXEC-001: per-turn execution config from UI. Overrides defaults.
  const execCfg: GAExecutionConfig | undefined = request.executionConfig;
  const turnTimeoutMs = execCfg?.turnTimeoutMs ?? defaultTimeout;
  // GA-EXEC-001: maxToolCalls is the canonical tool-invocation budget.
  // maxOperations was removed — it counted the same events as maxToolCalls.
  // Falls back to DEFAULT_MAX_TOOL_CALLS (0 = unlimited). Only the
  // 15min turn timeout bounds unconstrained turns.
  const maxToolCalls = execCfg?.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const context = { workspaceId, directory };
  const userText = lastUserText(request.messages);
  if (!userText) throw new Error('Assistant OpenCode turn requires a user message');

  // ROUTING-CONVERGENCE-001C: resolve the execution persona FIRST — before
  // any session is created or message sent. Rejection fails the turn with no
  // OpenCode side effects (never a silent fallback persona).
  const turnPersona = persona ?? (await resolveTurnPersona(options, request));

  // GA-EXEC-001: tool call counter for budget enforcement
  let toolCallCount = 0;

  // REASONING-BOUNDARY-001: reasoning blocks that already streamed deltas.
  // `reasoning.ended` carries the full text as a fallback for providers that
  // emit no deltas — tracked per reasoningID so output is never double-counted.
  const reasoningSeen = new Set<string>();

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
  const turnStartedAt = Date.now();
  // Cancellation-boundary attribution: record the turn start with its
  // originating identities and bounds, so any later abort names this turn.
  options.logger?.info('assistant.turn.started', {
    conversationId: request.conversationId,
    sessionId: resolvedSessionId,
    requestedAgent: request.agentId,
    runtimeAgent: turnPersona.runtimeAgent,
    provider: turnProvider,
    model: turnModel?.modelID,
    turnTimeoutMs,
    maxToolCalls,
  });
  const shellStartedAt = new Map<string, number>();
  let sequence = 0;
  // AR-TOOLS-001: durable Activity Room mirror for Global Assistant tool use.
  // Tool lifecycle also emits canonical `opencode.message.part.updated`
  // (part.type=tool) for the M9IngestionBridge, which stores durable
  // tool.called/succeeded/failed facts keyed on OpenCode callID. The yielded
  // SSE chunks remain the live UI contract; this is the durable mirror.
  // Fire-and-forget with catch — mirror failures never break the turn.
  const mirrorToolEvent = (status: 'running' | 'completed' | 'error', callID: string, tool: string): void => {
    const bus = options.eventBus;
    if (!bus) return;
    void bus
      .emit({
        type: 'opencode.message.part.updated',
        source: 'assistant-opencode-adapter',
        actor: { id: turnPersona.runtimeAgent, role: 'agent' },
        payload: {
          part: { type: 'tool', callID, tool, state: { status } },
          conversationId: request.conversationId,
          sessionId: resolvedSessionId,
        },
        metadata: request.conversationId ? { correlationId: request.conversationId } : undefined,
      })
      .catch(() => {});
  };
  // GA-DETACH-001: Track how the turn ended. This determines whether the
  // OpenCode session should be aborted or left running for reattachment.
  // Default is DETACHED (observer went away / generator returned early):
  // disconnect must never become abort. Explicit failure paths set FAILED
  // (session.error, unexpected exception via the catch below); idle sets
  // COMPLETED; deadline sets TIMEOUT; explicit Stop sets CANCELLED.
  let termination: TurnTermination = 'detached';
  // Explicit Stop (POST /cancel → turn signal): classify as 'cancelled' so
  // the finally block aborts the session AND the termination is truthful.
  // Deadline/tool-budget exits keep their own classifications; disconnect
  // never fires this signal, so DETACHED stays DETACHED.
  request.signal?.addEventListener(
    'abort',
    () => {
      termination = 'cancelled';
    },
    { once: true },
  );

  try {
    // GA-SSE-003B: submit asynchronously (POST /session/:id/prompt_async).
    // sendMessage() waits for full execution and is incompatible with
    // interactive runtime behavior; prompt_async is accepted in ~50ms and the
    // already-subscribed /event stream becomes the execution authority.
    await client.sendMessageAsync(
      resolvedSessionId,
      {
        parts: [{ type: 'text', text: userText }],
        // ROUTING-CONVERGENCE-001C: per-turn resolved runtime persona —
        // the logical agent's OpenCode twin, never a construction default.
        agent: turnPersona.runtimeAgent,
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
        // the resolved agent's capability policy (ROUTING-CONVERGENCE-001C:
        // each logical agent executes under its own declared grants, run
        // through the same Vestara enforcement machinery — identity selects
        // the policy, never bypasses enforcement).
        ...(turnPersona.capabilityPolicy ? { tools: buildToolsMap(turnPersona.capabilityPolicy) } : {}),
      },
      context,
    );

    let turnDone = false;
    while (!turnDone) {
      if (Date.now() > deadline) {
        termination = 'timeout';
        yield chunk('error', sequence++, { content: 'Execution deadline exceeded' });
        break;
      }
      // GA-DETACH-001: Wait for events with deadline awareness.
      // Without this, the inner wait blocks indefinitely when the event
      // stream is open but idle, preventing the deadline from firing.
      while (queue.length === 0 && !readerDone) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await Promise.race([
          new Promise<void>((resolve) => waiters.push(resolve)),
          new Promise<void>((resolve) => setTimeout(resolve, Math.min(remaining, 1000))),
        ]);
      }
      // Re-check deadline after waiting — the wait may have been interrupted
      // by the timeout rather than a new event. Uses >= (not >): when the
      // remaining budget hits zero the deadline has expired even if the
      // clock has not visibly advanced past it. With strict >, a
      // same-millisecond race fell through to the silent `!event` break
      // below and misclassified a timeout as a generic failure (proven by
      // trace: loop exit with reader alive, no error chunk, termination
      // promoted to failed instead of timeout).
      if (Date.now() >= deadline) {
        termination = 'timeout';
        yield chunk('error', sequence++, { content: 'Execution deadline exceeded' });
        break;
      }
      if (queue.length === 0 && readerDone) break;
      const event = queue.shift();
      if (!event) break;

      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const callID = typeof payload.callID === 'string' ? payload.callID : undefined;

      // GA-EXEC-001: budget enforcement helper — checks tool-call limits
      // after each event. Returns an error message if exceeded, null if
      // within budget. maxToolCalls=0 means unlimited (UI hook default).
      const checkBudget = (): string | null => {
        if (maxToolCalls > 0 && toolCallCount >= maxToolCalls) {
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
                execution: {
                  runtimeId: OPENCODE_RUNTIME_ID,
                  providerId: turnProvider,
                  ...(turnModel?.modelID ? { modelId: turnModel.modelID } : {}),
                },
                runtimeSessionId: resolvedSessionId,
              },
            };
          }
          break;
        }
        case 'message.part.updated': {
          // LIVE path: tool calls surface as tool parts on this event.
          // GA-TOOL-UX-001B: read parts project structured read evidence
          // (server-side wrapper parse); all other tools keep the generic
          // projection. Unknown tools remain generic.
          const detail = projectReadObservation(event, directory) ?? projectMessagePartUpdated(event);
          if (detail && (detail.kind === 'tool' || detail.kind === 'read')) {
            const toolName = detail.tool ?? 'read';
            if (detail.state === 'running') {
              toolCallCount++;
              const budgetError = checkBudget();
              if (budgetError) {
                yield chunk('error', sequence++, { content: budgetError });
                break;
              }
              yield chunk('tool_call', sequence++, { name: toolName, detail });
              mirrorToolEvent('running', detail.operationId, toolName);
            } else {
              // Read results ride the structured detail; chunk content stays
              // within the M2 200-char boundary for the transient surface.
              const resultContent =
                detail.state === 'failed'
                  ? (detail.error ?? 'Tool failed')
                  : detail.kind === 'read'
                    ? (detail.contentPreview ?? '').slice(0, 200) || toolName
                    : (detail.preview ?? '');
              yield chunk('tool_result', sequence++, {
                name: toolName,
                content: resultContent,
                detail,
              });
              mirrorToolEvent(detail.state === 'failed' ? 'error' : 'completed', detail.operationId, toolName);
            }
          }
          break;
        }
        // REASONING-BOUNDARY-001: provider-emitted reasoning/debug output.
        // Structurally distinct from final text (own event types) — projected
        // as `reasoning` chunks that downstream persists SEPARATELY from
        // content. Never text, never tool events, never parsed from prose.
        case 'session.next.reasoning.started': {
          // Lifecycle marker only — content arrives as deltas (or the
          // ended.text fallback). Emits no chunk: markers are not output.
          break;
        }
        case 'session.next.reasoning.delta': {
          const delta = typeof payload?.delta === 'string' ? payload.delta : '';
          const reasoningId = typeof payload?.reasoningID === 'string' ? payload.reasoningID : undefined;
          if (delta) {
            if (reasoningId) reasoningSeen.add(reasoningId);
            yield {
              ...chunk('reasoning', sequence++, { content: delta }),
              // GA-RUNTIME-001 H: same execution-binding metadata as text —
              // the displayed binding is the REAL upstream one.
              metadata: {
                sequence: 0,
                timestamp: new Date().toISOString(),
                provider: turnProvider,
                model: turnModel?.modelID,
                execution: {
                  runtimeId: OPENCODE_RUNTIME_ID,
                  providerId: turnProvider,
                  ...(turnModel?.modelID ? { modelId: turnModel.modelID } : {}),
                },
                runtimeSessionId: resolvedSessionId,
              },
            };
          }
          break;
        }
        case 'session.next.reasoning.ended': {
          // Fallback for providers that emit only the completed text.
          // Skipped when deltas already streamed this block — never
          // double-count, never reconstruct hidden thought from text.
          const reasoningId = typeof payload?.reasoningID === 'string' ? payload.reasoningID : undefined;
          const text = typeof payload?.text === 'string' ? payload.text : '';
          if (text && !(reasoningId && reasoningSeen.has(reasoningId))) {
            yield {
              ...chunk('reasoning', sequence++, { content: text }),
              metadata: {
                sequence: 0,
                timestamp: new Date().toISOString(),
                provider: turnProvider,
                model: turnModel?.modelID,
                execution: {
                  runtimeId: OPENCODE_RUNTIME_ID,
                  providerId: turnProvider,
                  ...(turnModel?.modelID ? { modelId: turnModel.modelID } : {}),
                },
                runtimeSessionId: resolvedSessionId,
              },
            };
          }
          break;
        }
        case 'session.next.tool.input.started':
        case 'session.next.tool.called': {
          const detail = projectToolStarted(event);
          if (detail && detail.kind === 'tool') {
            toolCallCount++;
            const budgetError = checkBudget();
            if (budgetError) {
              yield chunk('error', sequence++, { content: budgetError });
              break;
            }
            yield chunk('tool_call', sequence++, { name: detail.tool, detail });
            mirrorToolEvent('running', detail.operationId, detail.tool);
          }
          break;
        }
        case 'session.next.tool.success': {
          const detail = projectToolCompleted(event);
          if (detail && detail.kind === 'tool') {
            yield chunk('tool_result', sequence++, { name: detail.tool, content: detail.preview ?? '', detail });
            mirrorToolEvent('completed', detail.operationId, detail.tool);
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
            mirrorToolEvent('error', detail.operationId, detail.tool);
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
            mirrorToolEvent('running', detail.operationId, 'bash');
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
            mirrorToolEvent(detail.state === 'failed' ? 'error' : 'completed', detail.operationId, 'bash');
          }
          break;
        }
        case 'permission.v2.asked':
        case 'permission.asked': {
          const detail = projectPermissionRequested(event);
          if (detail && detail.kind === 'permission') {
            // GA-CAP-003 / GA-RUNTIME-001 B: evaluate against the resolved
            // turn persona's capability policy when provided. ALLOW
            // auto-approves, DENY auto-rejects, ASK projects an interactive
            // decision to the user.
            // The permission identity is the OpenCode request id (`per_*`),
            // exposed as `permissionRequestId` by the projection.
            const policy = turnPersona.capabilityPolicy;
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
            termination = 'completed';
          }
          break;
        }
        case 'session.idle': {
          // Dedicated idle event (1.18.27 contract) — authoritative settlement.
          turnDone = true;
          termination = 'completed';
          break;
        }
        case 'session.error': {
          termination = 'failed';
          yield chunk('error', sequence++, { content: 'OpenCode session error' });
          turnDone = true;
          break;
        }
        default:
          break;
      }
    }

    // A turn that exhausts the event stream without idle/timeout/cancel is
    // an abnormal end (not a detach): the consumer stayed attached but the
    // runtime never settled, so settle FAILED and abort the session for
    // reuse (GA-RUNTIME-001 cancel-safety). Early consumer return
    // (generator.return() on reload disconnect) jumps straight to the
    // finally below and never reaches here, so DETACHED stays DETACHED
    // (disconnect ≠ cancel, no abort).
    if (termination === 'detached') termination = 'failed';

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

    // GA-EXEC-002: yield a final meta chunk with structured execution result.
    // The complete() method extracts this to populate CompletionResponse.executionResult,
    // separating the turn's termination reason from the response content.
    const elapsedMs = Date.now() - (deadline - turnTimeoutMs);
    yield chunk('meta', sequence++, {
      content: undefined,
      metadata: {
        sequence,
        timestamp: new Date().toISOString(),
        provider: turnProvider,
        model: turnModel?.modelID,
        execution: {
          runtimeId: OPENCODE_RUNTIME_ID,
          providerId: turnProvider,
          ...(turnModel?.modelID ? { modelId: turnModel.modelID } : {}),
        },
        runtimeSessionId: resolvedSessionId,
        executionResult: {
          termination,
          toolCallCount,
          elapsedMs,
          execution: {
            runtimeId: OPENCODE_RUNTIME_ID,
            providerId: turnProvider,
            ...(turnModel?.modelID ? { modelId: turnModel.modelID } : {}),
          },
        },
      },
    });
  } catch (error) {
    // Genuine runtime failure (sendMessageAsync threw, event stream errored,
    // etc.): truthfully FAILED so the session is settled for reuse. Early
    // consumer return (generator.return() on detach) does NOT land here —
    // it runs the finally with termination still DETACHED (no abort).
    if (termination === 'detached') termination = 'failed';
    throw error;
  } finally {
    controller.abort();
    request.signal?.removeEventListener('abort', onAbort);
    await readerPromise.catch(() => undefined);
    // GA-DETACH-001: Only abort the OpenCode session when explicitly cancelled.
    // - COMPLETED: session is idle, no abort needed.
    // - DETACHED (client disconnected): signal is NOT aborted, execution continues.
    // - CANCELLED: signal IS aborted (explicit Stop), abort session.
    // - TIMEOUT: deadline expired, abort session.
    // - FAILED: runtime error, abort session.
    // GA-EXEC-002: timeout and tool-limit now auto-abort without requiring
    // explicit cancellation — the session must not remain alive after Vestara
    // has declared the turn failed.
    const explicitCancellation = request.signal?.aborted === true;
    const elapsedMs = Date.now() - turnStartedAt;
    const aborting = requiresAbort(termination);
    // Cancellation-boundary attribution: every turn end records its
    // classification; every abort additionally records its reason at warn
    // level BEFORE the abort is issued, so a later OpenCode "Interrupted"
    // state maps to exactly one Vestara operation + reason.
    options.logger?.info('assistant.turn.ended', {
      conversationId: request.conversationId,
      sessionId: resolvedSessionId,
      termination,
      elapsedMs,
      toolCallCount,
      aborting,
      signalAborted: explicitCancellation,
    });
    if (aborting) {
      options.logger?.warn('assistant.turn.abortSession', {
        conversationId: request.conversationId,
        sessionId: resolvedSessionId,
        reason: termination,
        elapsedMs,
        toolCallCount,
        signalAborted: explicitCancellation,
      });
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
      // ROUTING-CONVERGENCE-001C: persona resolves BEFORE any session is
      // created — rejection fails the turn with no OpenCode side effects.
      const persona = await resolveTurnPersona(options, request);
      const sessionId = await resolveSession(request);
      const chunks: StreamChunk[] = [];
      for await (const item of runAssistantOpenCodeTurn(options, request, sessionId, persona)) {
        chunks.push(item);
      }
      const content = chunks
        .filter((item) => item.type === 'text' && typeof item.content === 'string')
        .map((item) => item.content as string)
        .join('');
      // REASONING-BOUNDARY-001: provider-emitted reasoning accumulated
      // SEPARATELY from final text (bounded). Never parsed from content,
      // never mixed into it — the data boundary is structural (chunk type).
      const reasoning = accumulateReasoning(chunks);
      const failed = chunks.find((item) => item.type === 'error');
      const turnModel = await resolveProvider(request);
      // GA-EXEC-002: extract structured execution result from the final meta chunk.
      // Separates the turn's termination reason from the response content.
      const metaChunk = chunks.find((item) => item.type === 'meta');
      const executionResult = metaChunk?.metadata?.executionResult;
      return {
        id: `conv-${Date.now()}`,
        // GA-RUNTIME-001 H: the response model is the ACTUAL execution binding.
        model: turnModel?.modelID ?? request.model,
        provider: turnModel?.providerID ?? TRANSPORT_PROVIDER,
        content: failed ? (failed.content ?? 'Assistant turn failed') : content,
        // REASONING-BOUNDARY-001: structurally separated reasoning output.
        ...(reasoning ? { reasoning } : {}),
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
        ...(executionResult ? { executionResult } : {}),
        ...(sessionId
          ? {
              resolution: {
                providerId: turnModel?.providerID,
                reason: turnModel ? ('explicit-model' as const) : ('default' as const),
                defaultResolution: !turnModel,
                runtimeSessionId: sessionId,
                // ROUTING-CONVERGENCE-001C attribution invariant:
                // requested logical agent → resolved runtime persona.
                ...(request.agentId ? { requestedAgentId: request.agentId } : {}),
                runtimeAgent: persona.runtimeAgent,
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
      // Persona first: same fail-fast ordering as complete().
      const persona = await resolveTurnPersona(options, request);
      const sessionId = await resolveSession(request);
      for await (const item of runAssistantOpenCodeTurn(options, request, sessionId, persona)) {
        if (sessionId && item.metadata) {
          item.metadata.runtimeSessionId = sessionId;
        }
        yield item;
      }
    },
  };
}
