// Stale-event protection for the active conversation execution.
//
// The approved state architecture requires every streamed event to be
// associated with the active conversation/execution and rejects events from
// prior or cancelled executions. This module is the pure guard used by the
// conversation coordinator; it never parses transport or protocol payloads.

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
  return event.executionId === state.activeExecutionId;
}

export interface StreamGateResult {
  readonly apply: boolean;
  readonly reason: 'active' | 'stale' | 'cancelled' | 'no-active-execution';
}

export function gateStreamEvent(state: StreamGateState, event: StreamEventIdentity): StreamGateResult {
  if (state.cancelled) return { apply: false, reason: 'cancelled' };
  if (!state.activeExecutionId) return { apply: false, reason: 'no-active-execution' };
  if (event.executionId !== state.activeExecutionId) return { apply: false, reason: 'stale' };
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
