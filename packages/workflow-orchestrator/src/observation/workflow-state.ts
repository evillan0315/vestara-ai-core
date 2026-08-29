/**
 * WFO-001 — observed workflow state model.
 *
 * The observer derives an explicit, non-trivial state. It never writes this
 * state anywhere; the coordinator owns authoritative transitions.
 */

/** Explicit lifecycle observed from workflow facts (never `pending|in-progress|completed` alone). */
export type ObservedWorkflowState =
  | 'pending'
  | 'ready'
  | 'in-progress'
  | 'awaiting-review'
  | 'awaiting-verification'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'indeterminate';

/** A recommended next action. The observer recommends; it never performs. */
export type RecommendedWorkflowAction =
  | 'wait'
  | 'start-execution'
  | 'continue-execution'
  | 'request-artifact'
  | 'request-review'
  | 'request-verification'
  | 'pause-conversation'
  | 'resolve-blocker'
  | 'complete'
  | 'fail'
  | 'escalate';
