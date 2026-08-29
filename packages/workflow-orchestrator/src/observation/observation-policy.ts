/**
 * WFO-001 — observation policy.
 *
 * Cost and turn budgets are first-class policy inputs. They shape convergence
 * classification and the recommended action, never the state projection itself.
 */

export interface WorkflowObservationPolicy {
  /** One acknowledgement-only turn is enough to stop another free-form reasoning round. */
  readonly maxConsecutiveNoProgressTurns: number;
  /** Reasoning turns tolerated before an unresolved contradiction escalates. */
  readonly maxReasoningTurns: number;
  /** Optional hard cost ceiling for the workflow; beyond it, pause. */
  readonly maxEstimatedCost?: number;
  readonly requireReview: boolean;
  readonly requireVerification: boolean;
}

export const DEFAULT_WORKFLOW_OBSERVATION_POLICY = {
  maxConsecutiveNoProgressTurns: 1,
  maxReasoningTurns: 3,
  requireReview: true,
  requireVerification: true,
} satisfies WorkflowObservationPolicy;
