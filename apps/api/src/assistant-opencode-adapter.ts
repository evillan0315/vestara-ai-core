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
import type { CompletionRequest, CompletionResponse, StreamChunk } from '@vestara/shared';
import {
  projectDetail,
  projectEditStarted,
  projectMessagePartUpdated,
  projectPermissionRequested,
  projectPermissionResolved,
  projectTerminalCompleted,
  projectTerminalStarted,
  projectTodoSnapshot,
  projectToolCompleted,
  projectToolFailed,
  projectToolStarted,
} from './assistant-execution-projection';

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
   * Per-turn resolver: map `CompletionRequest.model` → the provider/model that
   * actually executes. When provided, the adapter never fabricates a provider —
   * provenance follows the real upstream resolution.
   */
  resolveProviderModel?: (model?: string) => { providerID: string; modelID: string } | undefined;
  title?: string;
  /** Hard cap for a single turn (ms). Default 5 minutes. */
  turnTimeoutMs?: number;
}

const TURN_TIMEOUT_MS = 5 * 60 * 1000;

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
 */
export async function* runAssistantOpenCodeTurn(
  options: AssistantOpenCodeExecutorOptions,
  request: CompletionRequest,
): AsyncIterable<StreamChunk> {
  const { client, workspaceId, directory, agent, turnTimeoutMs = TURN_TIMEOUT_MS } = options;
  const context = { workspaceId, directory };
  const userText = lastUserText(request.messages);
  if (!userText) throw new Error('Assistant OpenCode turn requires a user message');

  // Resolve the real upstream provider/model for THIS turn; never fabricated.
  const turnModel = options.resolveProviderModel?.(request.model) ?? options.model;
  const turnProvider = turnModel?.providerID ?? TRANSPORT_PROVIDER;

  const session = await client.createSession({ title: options.title ?? 'Assistant conversation' }, context);
  const sessionId = session.id;

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
        if (payload && payload.sessionID === sessionId) push(event);
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

  try {
    await client.sendMessage(
      sessionId,
      { parts: [{ type: 'text', text: userText }], agent, model: turnModel },
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

      switch (event.type) {
        case 'session.next.text.delta':
        case 'message.part.delta': {
          if (typeof payload.delta === 'string' && payload.delta) {
            yield {
              ...chunk('text', sequence++, { content: payload.delta }),
              metadata: { sequence: 0, timestamp: new Date().toISOString(), provider: turnProvider },
            };
          }
          break;
        }
        case 'message.part.updated': {
          // LIVE path: tool calls surface as tool parts on this event.
          const detail = projectMessagePartUpdated(event);
          if (detail && detail.kind === 'tool') {
            if (detail.state === 'running') {
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
        case 'permission.v2.asked': {
          const detail = projectPermissionRequested(event);
          if (detail && detail.kind === 'permission') {
            yield chunk('status', sequence++, { content: `Permission needed: ${detail.action}`, detail });
          }
          break;
        }
        case 'permission.v2.replied': {
          const detail = projectPermissionResolved(event);
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
          if (status && status.type === 'idle') turnDone = true;
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
      const diffFiles = await client.getSessionDiff(sessionId, context);
      for (const diffFile of diffFiles) {
        const detail = projectDetail({
          contract: 'assistant.execution.v1',
          version: 1,
          operationId: `edit:${sessionId}:${diffFile.path}`,
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
      const todos = await client.getSessionTodos(sessionId, context);
      if (todos.length > 0) {
        const detail = projectDetail({
          contract: 'assistant.execution.v1',
          version: 1,
          operationId: `todo:${sessionId}`,
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
  }
}

/**
 * Build a `ProviderExecutor` backed by the local OpenCode server. Additive:
 * the caller decides when to use it; it never replaces the direct-provider
 * fallback by itself (AR-009 paused).
 */
export function createAssistantOpenCodeExecutor(options: AssistantOpenCodeExecutorOptions): ProviderExecutor {
  const resolveProvider = (request: CompletionRequest): { providerID: string; modelID: string } | undefined =>
    options.resolveProviderModel?.(request.model) ?? options.model;

  return {
    async complete(request: CompletionRequest): Promise<CompletionResponse> {
      const chunks: StreamChunk[] = [];
      for await (const item of runAssistantOpenCodeTurn(options, request)) {
        chunks.push(item);
      }
      const content = chunks
        .filter((item) => item.type === 'text' && typeof item.content === 'string')
        .map((item) => item.content as string)
        .join('');
      const failed = chunks.find((item) => item.type === 'error');
      const turnModel = resolveProvider(request);
      return {
        id: `conv-${Date.now()}`,
        model: request.model,
        provider: turnModel?.providerID ?? TRANSPORT_PROVIDER,
        content: failed ? (failed.content ?? 'Assistant turn failed') : content,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
      };
    },
    async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
      yield* runAssistantOpenCodeTurn(options, request);
      yield {
        id: `oc-${Date.now()}-complete`,
        type: 'complete',
        metadata: { sequence: 0, timestamp: new Date().toISOString() },
      };
    },
  };
}
