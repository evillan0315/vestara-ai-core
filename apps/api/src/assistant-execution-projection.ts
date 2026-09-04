/**
 * Assistant Execution Projection — OpenCode 1.18.27 event → `assistant.execution.v1`.
 *
 * GA-UX-PREMIUM M3. Pure functions: map a raw OpenCode event (as surfaced by
 * `@vestara/opencode-runtime`'s `/event` SSE consumer) into the allowlisted
 * payload form consumed by `normalizeAssistantExecutionDetail` (which performs
 * final bounding/sanitization). No state, no IO — the adapter owns correlation.
 *
 * Source-event audit (see docs/blueprint/GA-UX-PREMIUM-M3-execution-projection-contract.md):
 * - tool identity: `properties.callID` (stable, authoritative)
 * - permission identity: `properties.id` / `requestID`
 * - edit: `file.edited.file` + session `/diff` (runtime-provided diff)
 * - todo: `todo.updated.todos` (OpenCode local; never Vestara Workflow authority)
 * - verification: NO verification events exist in the 1.18.27 contract → UNAVAILABLE
 */

import {
  ASSISTANT_EXECUTION_CONTRACT,
  ASSISTANT_EXECUTION_VERSION,
  type AssistantExecutionDetail,
  normalizeAssistantExecutionDetail,
} from '@vestara/shared';

export interface OpenCodeEventLike {
  readonly id?: string;
  readonly type: string;
  readonly payload?: Record<string, unknown>;
}

const EVENT = {
  toolInputStarted: 'session.next.tool.input.started',
  toolCalled: 'session.next.tool.called',
  toolSuccess: 'session.next.tool.success',
  toolFailed: 'session.next.tool.failed',
  shellStarted: 'session.next.shell.started',
  shellEnded: 'session.next.shell.ended',
  permissionAsked: 'permission.v2.asked',
  permissionReplied: 'permission.v2.replied',
  todoUpdated: 'todo.updated',
  fileEdited: 'file.edited',
  messagePartUpdated: 'message.part.updated',
} as const;

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isEvent(event: OpenCodeEventLike, type: string): boolean {
  return event.type === type || event.type.startsWith(`unknown:${type}`);
}

function baseEnvelope(
  operationId: string,
  state: 'running' | 'completed' | 'failed',
  payload: Record<string, unknown>,
  kindHint?: string,
): Record<string, unknown> {
  return {
    contract: ASSISTANT_EXECUTION_CONTRACT,
    version: ASSISTANT_EXECUTION_VERSION,
    operationId,
    state,
    kind: kindHint,
    timestamp: num(payload.timestamp) ?? Date.now(),
    assistantMessageId: str(payload.assistantMessageID) ?? str(payload.assistantMessageId),
    sessionId: str(payload.sessionID) ?? str(payload.sessionId),
    tool: str(payload.tool) ?? str(payload.name),
  };
}

/** `session.next.tool.called` / `session.next.tool.input.started` → running tool. */
export function projectToolStarted(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.toolCalled) && !isEvent(event, EVENT.toolInputStarted)) return undefined;
  const payload = event.payload ?? {};
  const callID = str(payload.callID);
  const tool = str(payload.tool) ?? str(payload.name);
  if (!callID || !tool) return undefined;
  return projectDetail({
    ...baseEnvelope(callID, 'running', payload, 'tool'),
    kind: 'tool',
    tool,
  });
}

/** `session.next.tool.success` → completed tool with bounded text preview. */
export function projectToolCompleted(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.toolSuccess)) return undefined;
  const payload = event.payload ?? {};
  const callID = str(payload.callID);
  const tool = str(payload.tool);
  if (!callID) return undefined;
  // preview = joined allowlisted text parts only (never `result`, never `structured`).
  const preview = textContentPreview(payload.content);
  return projectDetail({
    ...baseEnvelope(callID, 'completed', payload, 'tool'),
    kind: 'tool',
    tool: tool ?? 'tool',
    preview,
  });
}

/** `session.next.tool.failed` → failed tool with bounded error. */
export function projectToolFailed(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.toolFailed)) return undefined;
  const payload = event.payload ?? {};
  const callID = str(payload.callID);
  if (!callID) return undefined;
  const err = payload.error as Record<string, unknown> | undefined;
  const error = str(err?.message) ?? str(payload.error);
  return projectDetail({
    ...baseEnvelope(callID, 'failed', payload, 'tool'),
    kind: 'tool',
    tool: str(payload.tool) ?? 'tool',
    error,
  });
}

/** `session.next.shell.started` → running terminal. */
export function projectTerminalStarted(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.shellStarted)) return undefined;
  const payload = event.payload ?? {};
  const callID = str(payload.callID);
  if (!callID) return undefined;
  return projectDetail({
    ...baseEnvelope(callID, 'running', payload, 'terminal'),
    kind: 'terminal',
    command: str(payload.command),
  });
}

/** `session.next.shell.ended` → completed terminal with bounded output preview. */
export function projectTerminalCompleted(
  event: OpenCodeEventLike,
  startedAtMs?: number,
): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.shellEnded)) return undefined;
  const payload = event.payload ?? {};
  const callID = str(payload.callID);
  if (!callID) return undefined;
  const durationMs =
    startedAtMs !== undefined && num(payload.timestamp) !== undefined
      ? Math.max(0, num(payload.timestamp)! - startedAtMs)
      : undefined;
  return projectDetail({
    ...baseEnvelope(callID, 'completed', payload, 'terminal'),
    kind: 'terminal',
    command: str(payload.command),
    outputPreview: str(payload.output) ?? str(payload.content),
    durationMs,
    cwdProvenance: 'unavailable',
    exitCodeProvenance: 'unavailable',
  });
}

/**
 * `message.part.updated` with a `tool` part → tool lifecycle.
 *
 * LIVE-EVIDENCE path (OpenCode 1.18.27): the `/event` stream surfaces tool
 * calls as message parts (`part.type === 'tool'`, identity = `part.callID`,
 * lifecycle = `part.state.status`), NOT as `session.next.tool.*` events.
 * Both paths are projected — the part path is what the running server emits.
 */
export function projectMessagePartUpdated(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.messagePartUpdated)) return undefined;
  const payload = event.payload ?? {};
  const part = payload.part as Record<string, unknown> | undefined;
  if (!part || part.type !== 'tool') return undefined;
  const callID = str(part.callID);
  const tool = str(part.tool);
  if (!callID) return undefined;
  const state = part.state as Record<string, unknown> | undefined;
  const status = str(state?.status);
  const time = state?.time as Record<string, unknown> | undefined;
  const startedAt = num(time?.start);
  const endedAt = num(time?.end);
  const durationMs = startedAt !== undefined && endedAt !== undefined ? Math.max(0, endedAt - startedAt) : undefined;
  const timestamp = endedAt ?? num(payload.time) ?? Date.now();
  const envelopeState: 'running' | 'completed' | 'failed' =
    status === 'error' ? 'failed' : status === 'completed' ? 'completed' : 'running';
  const base = baseEnvelope(callID, envelopeState, payload, 'tool');
  const toolPayload: Record<string, unknown> = {
    ...base,
    kind: 'tool',
    tool: tool ?? 'tool',
    title: str(state?.title),
    durationMs,
    timestamp,
  };
  if (envelopeState === 'failed') {
    toolPayload.error = str(state?.error) ?? 'Tool failed';
  } else if (envelopeState === 'completed') {
    // Preview = bounded part output (never the raw full output verbatim past
    // the bound); `title` stays the allowlisted display title.
    toolPayload.preview = str(state?.output) ?? str(state?.title);
  }
  return projectDetail(toolPayload);
}

/** `permission.v2.asked` → requested permission (allowlisted fields only). */
export function projectPermissionRequested(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.permissionAsked)) return undefined;
  const payload = event.payload ?? {};
  const requestId = str(payload.id);
  const action = str(payload.action);
  if (!requestId || !action) return undefined;
  return projectDetail({
    ...baseEnvelope(requestId, 'running', payload, 'permission'),
    kind: 'permission',
    permissionRequestId: requestId,
    action,
    resources: Array.isArray(payload.resources) ? (payload.resources as string[]) : [],
  });
}

/** `permission.v2.replied` → resolved permission. */
export function projectPermissionResolved(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.permissionReplied)) return undefined;
  const payload = event.payload ?? {};
  const requestId = str(payload.requestID);
  const reply = str(payload.reply);
  if (!requestId) return undefined;
  return projectDetail({
    ...baseEnvelope(requestId, 'completed', payload, 'permission'),
    kind: 'permission',
    permissionRequestId: requestId,
    action: 'unknown',
    resources: [],
    reply: reply === 'once' || reply === 'always' || reply === 'reject' ? reply : undefined,
  });
}

/** `todo.updated` → OpenCode local task snapshot (source: opencode). */
export function projectTodoSnapshot(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.todoUpdated)) return undefined;
  const payload = event.payload ?? {};
  const sessionId = str(payload.sessionID) ?? str(payload.sessionId);
  const todos = Array.isArray(payload.todos) ? (payload.todos as Record<string, unknown>[]) : [];
  return projectDetail({
    ...baseEnvelope(str(event.id) ?? `todo-${sessionId ?? Date.now()}`, 'completed', payload, 'task-snapshot'),
    kind: 'task-snapshot',
    source: 'opencode',
    todos: todos
      .map((todo) => ({
        title: str(todo.content) ?? str(todo.title),
        status: str(todo.status),
      }))
      .filter((todo): todo is { title: string; status: string } => Boolean(todo.title)),
  });
}

/** `file.edited` → running edit (no diff evidence at event time — truthful unavailable). */
export function projectEditStarted(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.fileEdited)) return undefined;
  const payload = event.payload ?? {};
  const file = str(payload.file);
  if (!file) return undefined;
  return projectDetail({
    ...baseEnvelope(str(event.id) ?? `edit-${Date.now()}`, 'running', payload, 'edit'),
    kind: 'edit',
    file,
    // "Edit applied successfully." is lifecycle/result text, NOT diff evidence.
    // At file.edited time the runtime has supplied no patch/hunks.
    diffRepresentation: 'unavailable',
    diffProvenance: 'unavailable',
    beforeAfterProvenance: 'unavailable',
  });
}

/** Verification: no authoritative source exists in the 1.18.27 contract. */
export function projectVerificationUnavailable(): AssistantExecutionDetail | undefined {
  return projectDetail({
    contract: ASSISTANT_EXECUTION_CONTRACT,
    version: ASSISTANT_EXECUTION_VERSION,
    operationId: `verify-unavailable-${Date.now()}`,
    kind: 'verification',
    state: 'failed',
    evidence: 'unavailable',
    timestamp: Date.now(),
  });
}

/** Build a safe detail through the shared normalizer (bounding + allowlist). */
export function projectDetail(payload: Record<string, unknown>): AssistantExecutionDetail | undefined {
  return normalizeAssistantExecutionDetail(payload);
}

/** Join allowlisted text parts into a preview string (never `result`/`structured`). */
export function textContentPreview(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .map((part) => {
      if (!part || typeof part !== 'object') return undefined;
      const record = part as Record<string, unknown>;
      return record.type === 'text' && typeof record.text === 'string' ? (record.text as string) : undefined;
    })
    .filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join('\n') : undefined;
}
