/**
 * Canonical execution lifecycle.
 *
 * CORE-001 found five overlapping state machines:
 *   1. ServiceStatus (9 states) — service lifecycle
 *   2. RuntimeState (11 states) — runtime lifecycle
 *   3. RuntimeSessionLifecycle (5 states) — session binding
 *   4. VestaraExecutionState (9 states) — execution-level (closest to canonical)
 *   5. ProviderStatus (6 states) — provider health
 *
 * This module establishes the canonical execution lifecycle.
 * It is distinct from runtime lifecycle, session lifecycle, and service lifecycle.
 *
 * Design rationale:
 *   - 'requested'  : Execution has been requested but not yet bound to a runtime
 *   - 'binding'    : Runtime binding in progress (provider/model resolution)
 *   - 'ready'      : Bound to runtime, waiting to start
 *   - 'running'    : Actively executing in the runtime
 *   - 'completed'  : Successfully finished (execution succeeded; verification separate)
 *   - 'failed'     : Execution failed with error
 *   - 'cancelled'  : Cancelled by user or system
 *   - 'timed_out'  : Exceeded time limit
 *
 * Terminal states: completed, failed, cancelled, timed_out
 * Non-terminal states: requested, binding, ready, running
 *
 * Valid transitions:
 *   requested → binding → ready → running → completed
 *                                             ├── failed
 *                                             ├── cancelled
 *                                             └── timed_out
 *   requested → failed (binding error)
 *   requested → cancelled (user abort before binding)
 *   binding → failed (resolution error)
 *   ready → cancelled (user abort before execution)
 *   running → failed (runtime error)
 *   running → cancelled (user abort during execution)
 *   running → timed_out (timeout exceeded)
 */

/**
 * Execution lifecycle status.
 *
 * This is the Vestara-owned execution state machine.
 * Runtime-native states must map into these values.
 */
export type ExecutionStatus =
  | 'requested'
  | 'binding'
  | 'ready'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

/** Terminal execution states — no further transitions possible. */
export const EXECUTION_TERMINAL_STATES: readonly ExecutionStatus[] = [
  'completed',
  'failed',
  'cancelled',
  'timed_out',
] as const;

/** Non-terminal execution states — transitions still possible. */
export const EXECUTION_NON_TERMINAL_STATES: readonly ExecutionStatus[] = [
  'requested',
  'binding',
  'ready',
  'running',
] as const;

/** Runtime type guard for terminal states. */
export function isExecutionTerminal(status: ExecutionStatus): boolean {
  return (EXECUTION_TERMINAL_STATES as readonly string[]).includes(status);
}

/**
 * Valid state transitions.
 * Key = source state, Value = set of allowed target states.
 */
export const EXECUTION_TRANSITIONS: Readonly<Record<ExecutionStatus, readonly ExecutionStatus[]>> = {
  requested: ['binding', 'failed', 'cancelled'],
  binding: ['ready', 'failed'],
  ready: ['running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled', 'timed_out'],
  completed: [],
  failed: [],
  cancelled: [],
  timed_out: [],
};

/**
 * Check whether a state transition is valid.
 */
export function isValidTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return (EXECUTION_TRANSITIONS[from] as readonly string[]).includes(to);
}

/**
 * Activity-level execution state (distinct from lifecycle).
 *
 * While ExecutionStatus tracks the lifecycle, ExecutionActivityState
 * describes what the execution is currently doing. Tool calls are
 * activities, not lifecycle states.
 */
export type ExecutionActivityState =
  | 'idle' // No activity (between turns)
  | 'reasoning' // Model is generating text
  | 'tool_call' // Tool execution in progress
  | 'waiting' // Waiting for user input (permission/question)
  | 'enriching'; // Post-execution enrichment (diffs, todos);
