/**
 * OpenCode SSE → Vestara execution-event normalization boundary.
 *
 * The Activity Room and participant projection consume Vestara's execution
 * event form, never OpenCode's raw SSE schema. This preserves the runtime
 * boundary: OpenCode (or a local/future runtime) feeds the same normalized
 * form, and the room is not bound to one backend's event shapes.
 *
 * Liveness semantics (earned by ORB): continuing activity (message deltas,
 * heartbeats, tool events) → ACTIVE; terminal event → COMPLETED/FAILED/
 * CANCELLED; no activity beyond the idle window is classified STALLED by the
 * caller from `lastActivityAt`.
 */

export type VestaraExecutionState =
  | 'queued'
  | 'preparing'
  | 'reasoning'
  | 'active'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'stalled';

export type VestaraExecutionEventType =
  | 'agent.activity'
  | 'agent.progress'
  | 'tool.started'
  | 'tool.completed'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.cancelled';

export interface VestaraExecutionEvent {
  readonly type: VestaraExecutionEventType;
  /** The participant's execution state implied by this event. */
  readonly executionState: VestaraExecutionState;
  /** Human-readable activity summary (tool name, token delta, etc.). */
  readonly activity?: string;
  readonly at: string;
  readonly sessionId?: string;
}

/** Structural subset of an OpenCode SSE event (id/type/payload). */
export interface OpenCodeExecutionEventLike {
  readonly id: string;
  readonly type: string;
  readonly timestamp?: string;
  readonly payload?: Record<string, unknown>;
}

const TOOL_PREFIXES = ['tool.started', 'tool.completed', 'tool.failed', 'step-start', 'step-finish'];

/**
 * Classify a single OpenCode SSE event into a Vestara execution event.
 * Returns undefined for events that carry no participant-visible signal.
 */
export function classifyOpenCodeExecutionEvent(
  event: OpenCodeExecutionEventLike,
  now: string = new Date().toISOString(),
): VestaraExecutionEvent | undefined {
  const type = event.type;
  const payload = event.payload ?? {};
  const sessionId = asString(payload.sessionID) ?? asString(payload.sessionId);

  if (type === 'message.part.delta' || type === 'message.part.updated') {
    const delta = typeof payload.delta === 'string' ? payload.delta : undefined;
    return {
      type: 'agent.progress',
      executionState: 'reasoning',
      activity: delta && delta.trim().length > 0 ? `streaming ${delta.trim().length} chars` : 'streaming',
      at: now,
      sessionId,
    };
  }
  if (type === 'server.heartbeat') {
    return { type: 'agent.activity', executionState: 'active', activity: 'heartbeat', at: now, sessionId };
  }
  if (type === 'session.updated') {
    return { type: 'agent.activity', executionState: 'active', activity: 'session updated', at: now, sessionId };
  }
  if (type === 'tool.started' || type === 'tool.completed' || type === 'tool.failed') {
    const tool = asString(payload.toolName) ?? asString(payload.tool);
    return {
      type: type === 'tool.started' ? 'tool.started' : 'tool.completed',
      executionState: 'active',
      activity: tool ? `${type.split('.')[1]} ${tool}` : type,
      at: now,
      sessionId,
    };
  }
  if (type === 'session.idle') {
    return { type: 'agent.completed', executionState: 'completed', activity: 'session idle', at: now, sessionId };
  }
  if (type === 'session.error' || type === 'session.unavailable') {
    return { type: 'agent.failed', executionState: 'failed', activity: type, at: now, sessionId };
  }
  if (TOOL_PREFIXES.some((prefix) => type.startsWith(prefix))) {
    return { type: 'agent.activity', executionState: 'active', activity: type, at: now, sessionId };
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
