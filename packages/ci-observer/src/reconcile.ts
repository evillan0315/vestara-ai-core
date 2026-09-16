/**
 * CI-OBS-002C / H7 — Stale-wait reconciliation guidance.
 *
 * When a CI wait passes its deadline the completion webhook may have been lost.
 * This module derives the recommended reconciliation action from authoritative
 * inputs (the wait + an observed provider run for the commit). It is a pure
 * decision record — it does NOT resume, complete, or mutate task state:
 *
 *   - a run observed for the commit     → `attach-run` (first observation wins)
 *   - a run already attached            → `await-completion` (never auto-resume;
 *                                         the normal completion path adjudicates)
 *   - no run observed                   → `hold` (reported, never invented)
 *
 * Resume/completion always flows through `CIVerificationService` and the
 * reviewer decision — reconciliation never confers verification authority.
 */

import type { CIWaitDeadlineAssessment } from './wait-deadline';

/** Provider-neutral view of a run discovered for the wait's commit. */
export interface CIWaitRunObservation {
  readonly runId: string;
  readonly status?: string;
  readonly conclusion?: string;
}

export type CIWaitReconcileAction = 'none' | 'attach-run' | 'await-completion' | 'hold';

export interface CIWaitReconcileDecision {
  readonly action: CIWaitReconcileAction;
  readonly reason: string;
  readonly runRef?: string;
}

export interface CIWaitReconcileInput {
  readonly waitRef: string;
  readonly runRef?: string;
  readonly deadline: CIWaitDeadlineAssessment;
  /** A run discovered for the commit, when the caller performed the lookup. */
  readonly observation?: CIWaitRunObservation;
}

/** Derive the reconciliation recommendation for one wait. Pure. */
export function reconcileWait(input: CIWaitReconcileInput): CIWaitReconcileDecision {
  const { deadline } = input;

  if (deadline.state === 'resolved') {
    return { action: 'none', reason: 'Wait is already resolved' };
  }
  if (deadline.state === 'active') {
    return { action: 'none', reason: 'Wait is still within its deadline' };
  }
  if (deadline.state === 'unknown') {
    return { action: 'hold', reason: 'Wait age cannot be established — inspection required' };
  }

  // deadline.state === 'stale'
  if (!input.observation) {
    return {
      action: 'hold',
      reason: 'Unresolved past the deadline and no provider run was observed for the commit',
    };
  }
  if (!input.runRef) {
    return {
      action: 'attach-run',
      reason: `Provider run ${input.observation.runId} observed for the commit; attach it (first observation wins)`,
      runRef: input.observation.runId,
    };
  }
  return {
    action: 'await-completion',
    reason: `Run ${input.runRef} is attached but no resolution was recorded; completion may have been lost`,
  };
}
