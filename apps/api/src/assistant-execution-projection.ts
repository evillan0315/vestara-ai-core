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
  ASSISTANT_EXECUTION_BOUNDS,
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
  permissionAskedV1: 'permission.asked',
  permissionReplied: 'permission.v2.replied',
  permissionRepliedV1: 'permission.replied',
  questionAsked: 'question.v2.asked',
  questionAskedV1: 'question.asked',
  questionReplied: 'question.v2.replied',
  questionRepliedV1: 'question.replied',
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
  if (part?.type !== 'tool') return undefined;
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

/**
 * GA-TOOL-UX-001B — server-side OpenCode Read wrapper parse.
 *
 * Verified live grammar (OpenCode 1.18.27 `read` tool `state.output`):
 *   <path>{abs}</path>\n<type>file</type>\n<content>\n{numbered lines}\n[(trailer)]\n</content>
 * Numbered lines look like `1: alpha`; the trailer looks like
 * `(End of file - total 5 lines)`. NEVER parsed in React — this module is
 * server-only (apps/api, never imported by the browser bundle).
 *
 * Unknown/unrecognized wrappers yield metadata-only evidence
 * (`contentProvenance: 'unavailable'`) — never guessed.
 */
export interface ParsedReadOutput {
  readonly contentPreview?: string;
  readonly lineCount?: number;
  readonly offset?: number;
  readonly totalLines?: number;
  readonly contentTruncated: boolean;
  readonly contentProvenance: 'runtime-provided' | 'unavailable';
  readonly rangeProvenance: 'runtime-provided' | 'unavailable';
}

const READ_WRAPPER_RE =
  /^<path>([\s\S]*?)<\/path>\r?\n<type>([\s\S]*?)<\/type>\r?\n<content>\n([\s\S]*?)(?:<\/content>\s*)?$/;
const READ_LINE_RE = /^(\d+): ?(.*)$/;
const READ_TOTAL_RE = /\btotal (\d+) lines\b/;
const READ_TRUNCATION_RE = /truncat/i;

function unknownReadOutput(): ParsedReadOutput {
  return { contentTruncated: false, contentProvenance: 'unavailable', rangeProvenance: 'unavailable' };
}

export function parseReadOutput(output: unknown): ParsedReadOutput {
  if (typeof output !== 'string') return unknownReadOutput();
  const match = READ_WRAPPER_RE.exec(output);
  if (!match) return unknownReadOutput();
  if (match[2].trim() !== 'file') return unknownReadOutput();
  const body = match[3];
  const openCodeTruncated = READ_TRUNCATION_RE.test(body);
  const entries: Array<{ n: number; line: string }> = [];
  let totalLines: number | undefined;
  for (const rawLine of body.split('\n')) {
    const totalMatch = READ_TOTAL_RE.exec(rawLine);
    if (totalMatch) {
      const total = Number(totalMatch[1]);
      if (Number.isInteger(total) && total >= 0) totalLines = total;
      continue;
    }
    const lineMatch = READ_LINE_RE.exec(rawLine);
    if (lineMatch) {
      const n = Number(lineMatch[1]);
      if (Number.isInteger(n) && n >= 0) entries.push({ n, line: rawLine });
    }
  }
  if (entries.length === 0 && totalLines === undefined) return unknownReadOutput();
  // Bound to whole lines at the evidence budget (≤2000 chars).
  const budget = ASSISTANT_EXECUTION_BOUNDS.readContentPreview;
  const kept: string[] = [];
  let used = 0;
  let sliced = false;
  for (const entry of entries) {
    const cost = entry.line.length + 1; // + newline separator
    if (used + cost > budget && kept.length > 0) {
      sliced = true;
      break;
    }
    kept.push(entry.line);
    used += cost;
  }
  return {
    contentPreview: kept.length > 0 ? kept.join('\n') : undefined,
    lineCount: entries.length,
    offset: entries.length > 0 ? entries[0].n : undefined,
    totalLines,
    contentTruncated: sliced || openCodeTruncated,
    contentProvenance: 'runtime-provided',
    rangeProvenance: 'runtime-provided',
  };
}

/** Allowlisted read-tool request input (`state.input` — required by the ToolState schema). */
function readRequestInput(value: unknown): { filePath?: string; offset?: number; limit?: number } {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  return {
    filePath: str(record.filePath),
    offset: num(record.offset) !== undefined && Number.isInteger(record.offset) ? num(record.offset) : undefined,
    limit: num(record.limit) !== undefined && Number.isInteger(record.limit) ? num(record.limit) : undefined,
  };
}

/**
 * Relativize a path against the repository root for persisted evidence.
 * Already-relative paths pass through. Absolute paths inside the root become
 * relative; absolute paths outside the root degrade to their basename.
 * Any result escaping the root via `..` segments degrades to its basename —
 * the machine's absolute workspace path (and its depth) is never persisted
 * or presented.
 */
function relativizeForEvidence(path: string, repoDir?: string): string {
  const relativized = relativize(path, repoDir);
  if (/(^|\/)\.\.(\/|$)/.test(relativized)) {
    const base = relativized.split('/').pop() ?? relativized;
    return base || relativized;
  }
  return relativized;
}

function relativize(path: string, repoDir?: string): string {
  if (!path.startsWith('/')) return path;
  if (repoDir) {
    const root = repoDir.endsWith('/') ? repoDir : `${repoDir}/`;
    if (path === repoDir) return '.';
    if (path.startsWith(root)) return path.slice(root.length);
  }
  const base = path.split('/').pop() ?? path;
  return base || path;
}

/**
 * `message.part.updated` with a `read` tool part → structured `read` detail.
 *
 * Lifecycle (operationId = OpenCode `callID` in every state):
 * - running/pending: file from the request `input.filePath`
 *   (`fileProvenance: 'request-context'`), falling back to the runtime title
 *   when present. No content/range evidence yet.
 * - completed: file from the result `state.title` (`runtime-provided`);
 *   content parsed server-side from `state.output`.
 * - error: file from title when present, else request input; bounded error.
 *
 * Returns undefined for non-read parts or when no callID exists — the caller
 * falls back to the generic tool projection (unknown tools stay generic).
 */
export function projectReadObservation(
  event: OpenCodeEventLike,
  repoDir?: string,
): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.messagePartUpdated)) return undefined;
  const payload = event.payload ?? {};
  const part = payload.part as Record<string, unknown> | undefined;
  if (part?.type !== 'tool' || part.tool !== 'read') return undefined;
  const callID = str(part.callID);
  if (!callID) return undefined;
  const state = (part.state ?? {}) as Record<string, unknown>;
  const status = str(state.status);
  const time = state.time as Record<string, unknown> | undefined;
  const startedAt = num(time?.start);
  const endedAt = num(time?.end);
  const durationMs = startedAt !== undefined && endedAt !== undefined ? Math.max(0, endedAt - startedAt) : undefined;
  const timestamp = endedAt ?? num(payload.time) ?? Date.now();
  const title = str(state.title);
  const input = readRequestInput(state.input);
  const envelopeState: 'running' | 'completed' | 'failed' =
    status === 'error' ? 'failed' : status === 'completed' ? 'completed' : 'running';

  if (envelopeState === 'completed') {
    const parsed = parseReadOutput(state.output);
    const file = title ?? (input.filePath ? relativizeForEvidence(input.filePath, repoDir) : undefined);
    if (!file) return undefined;
    return projectDetail({
      ...baseEnvelope(callID, 'completed', payload, 'read'),
      kind: 'read',
      tool: 'read',
      file: relativizeForEvidence(file, repoDir),
      fileProvenance: title ? 'runtime-provided' : 'request-context',
      offset: parsed.offset,
      lineCount: parsed.lineCount,
      totalLines: parsed.totalLines,
      contentPreview: parsed.contentPreview,
      contentTruncated: parsed.contentTruncated,
      contentProvenance: parsed.contentProvenance,
      rangeProvenance: parsed.rangeProvenance,
      durationMs,
      timestamp,
    });
  }

  if (envelopeState === 'failed') {
    const file = title ?? (input.filePath ? relativizeForEvidence(input.filePath, repoDir) : undefined);
    if (!file) return undefined;
    return projectDetail({
      ...baseEnvelope(callID, 'failed', payload, 'read'),
      kind: 'read',
      tool: 'read',
      file: relativizeForEvidence(file, repoDir),
      // A requested path is request context — never successful-result evidence.
      fileProvenance: title ? 'runtime-provided' : 'request-context',
      contentTruncated: false,
      contentProvenance: 'unavailable',
      rangeProvenance: 'unavailable',
      error: str(state.error) ?? 'Read failed',
      durationMs,
      timestamp,
    });
  }

  // running / pending: request context only — no content/range/result claims.
  const file = title ?? (input.filePath ? relativizeForEvidence(input.filePath, repoDir) : undefined);
  if (!file) return undefined;
  return projectDetail({
    ...baseEnvelope(callID, 'running', payload, 'read'),
    kind: 'read',
    tool: 'read',
    file: relativizeForEvidence(file, repoDir),
    fileProvenance: title ? 'runtime-provided' : 'request-context',
    contentTruncated: false,
    contentProvenance: 'unavailable',
    rangeProvenance: 'unavailable',
    durationMs,
    timestamp,
  });
}

/** `permission.v2.asked` / `permission.asked` → requested permission (allowlisted fields only). */
export function projectPermissionRequested(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.permissionAsked) && !isEvent(event, EVENT.permissionAskedV1)) return undefined;
  const payload = event.payload ?? {};
  const requestId = str(payload.id);
  // v2: `action`; v1: `permission` (the OpenCode action key, e.g. `bash`).
  const action = str(payload.action) ?? str(payload.permission);
  if (!requestId || !action) return undefined;
  const resources = Array.isArray(payload.resources)
    ? (payload.resources as string[])
    : Array.isArray(payload.patterns)
      ? (payload.patterns as string[])
      : [];
  return projectDetail({
    ...baseEnvelope(requestId, 'running', payload, 'permission'),
    kind: 'permission',
    permissionRequestId: requestId,
    action,
    resources,
  });
}

/** `permission.v2.replied` / `permission.replied` → resolved permission. */
export function projectPermissionResolved(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.permissionReplied) && !isEvent(event, EVENT.permissionRepliedV1)) return undefined;
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

/** `question.v2.asked` / `question.asked` → requested question (bounded options only). */
export function projectQuestionAsked(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.questionAsked) && !isEvent(event, EVENT.questionAskedV1)) return undefined;
  const payload = event.payload ?? {};
  const requestId = str(payload.id);
  const rawQuestions = Array.isArray(payload.questions) ? (payload.questions as Record<string, unknown>[]) : [];
  if (!requestId) return undefined;
  return projectDetail({
    ...baseEnvelope(requestId, 'running', payload, 'question'),
    kind: 'question',
    questionRequestId: requestId,
    questions: rawQuestions,
  });
}

/** `question.v2.replied` / `question.replied` → resolved question. */
export function projectQuestionResolved(event: OpenCodeEventLike): AssistantExecutionDetail | undefined {
  if (!isEvent(event, EVENT.questionReplied) && !isEvent(event, EVENT.questionRepliedV1)) return undefined;
  const payload = event.payload ?? {};
  const requestId = str(payload.requestID) ?? str(payload.id);
  if (!requestId) return undefined;
  return projectDetail({
    ...baseEnvelope(requestId, 'completed', payload, 'question'),
    kind: 'question',
    questionRequestId: requestId,
    questions: [],
    reply: 'answered',
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
