// Stale-event protection for the active conversation execution.
//
// The approved state architecture requires every streamed event to be
// associated with the active conversation/execution and rejects events from
// prior or cancelled executions. This module is the pure guard used by the
// conversation coordinator; it never parses transport or protocol payloads.
//
// Identity scheme (must match the controller): conversation start/delta/
// complete events carry the execution id verbatim; tool cards carry
// `<executionId>-tool-<sequence>` so concurrent tools stay unique while
// remaining attributable to their owning execution.

export type StreamEventKind = 'conversation-start' | 'conversation-delta' | 'conversation-complete' | 'tool';

export interface StreamEventIdentity {
  readonly kind: StreamEventKind;
  readonly executionId: string;
}

export interface StreamGateState {
  readonly activeExecutionId?: string;
  readonly cancelled: boolean;
}

export function createStreamGate(initial?: Partial<StreamGateState>): StreamGateState {
  return { activeExecutionId: initial?.activeExecutionId, cancelled: initial?.cancelled ?? false };
}

/** Accept a stream event only when it targets the active, non-cancelled execution. */
export function shouldApplyEvent(state: StreamGateState, event: StreamEventIdentity): boolean {
  if (state.cancelled) return false;
  if (!state.activeExecutionId) return false;
  return targetsExecution(state.activeExecutionId, event);
}

export interface StreamGateResult {
  readonly apply: boolean;
  readonly reason: 'active' | 'stale' | 'cancelled' | 'no-active-execution';
}

/**
 * Tool cards are namespaced `<executionId>-tool-<sequence>` (see controller):
 * attributable to their execution, unique per tool, and unforgeable by a
 * prior execution (ids embed timestamp + randomness).
 */
function targetsExecution(activeExecutionId: string, event: StreamEventIdentity): boolean {
  if (event.executionId === activeExecutionId) return true;
  return event.kind === 'tool' && event.executionId.startsWith(`${activeExecutionId}-tool-`);
}

export function gateStreamEvent(state: StreamGateState, event: StreamEventIdentity): StreamGateResult {
  if (state.cancelled) return { apply: false, reason: 'cancelled' };
  if (!state.activeExecutionId) return { apply: false, reason: 'no-active-execution' };
  if (!targetsExecution(state.activeExecutionId, event)) return { apply: false, reason: 'stale' };
  return { apply: true, reason: 'active' };
}

export function startExecution(_state: StreamGateState, executionId: string): StreamGateState {
  return { activeExecutionId: executionId, cancelled: false };
}

export function cancelExecution(state: StreamGateState): StreamGateState {
  return { ...state, cancelled: true };
}

export function clearExecution(_state: StreamGateState): StreamGateState {
  return { activeExecutionId: undefined, cancelled: false };
}
