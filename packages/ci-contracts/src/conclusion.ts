/**
 * CI-OBS-001B — CI terminal conclusion.
 *
 * The resolved outcome of a CI verification run. Conclusion is assigned
 * only when the run reaches a terminal status. UNKNOWN is a valid
 * conclusion — it means the system cannot determine the outcome, which
 * is distinct from FAILED.
 *
 * Provider-native conclusions (e.g. GitHub's 'failure' vs 'cancelled')
 * are mapped into this vocabulary. The raw provider conclusion is
 * preserved separately on the domain object when useful.
 *
 * Invariants:
 *   - UNKNOWN is valid evidence, not a fallback
 *   - CI Pass ≠ Objective Verification
 *   - Failure ≠ Root Cause
 */

/** Terminal conclusion of a CI verification run. */
export type CIConclusion = 'passed' | 'failed' | 'cancelled' | 'timed_out' | 'skipped' | 'unknown';

/** Closed vocabulary — all valid terminal conclusions. */
export const CI_CONCLUSIONS: readonly CIConclusion[] = [
  'passed',
  'failed',
  'cancelled',
  'timed_out',
  'skipped',
  'unknown',
];

/** Conclusions that indicate the run completed its work. */
export const COMPLETED_CONCLUSIONS: readonly CIConclusion[] = ['passed', 'failed', 'cancelled', 'timed_out'];

/** Conclusions that indicate the run did not complete its work. */
export const INCONCLUSIVE_CONCLUSIONS: readonly CIConclusion[] = ['skipped', 'unknown'];

/** True when the conclusion indicates the run completed. Pure. */
export function isCompletedConclusion(conclusion: CIConclusion): boolean {
  return COMPLETED_CONCLUSIONS.includes(conclusion);
}

/** True when the conclusion indicates the outcome could not be determined. Pure. */
export function isUnknownConclusion(conclusion: CIConclusion): boolean {
  return conclusion === 'unknown';
}

/** True when the conclusion indicates success. Pure. */
export function isPassedConclusion(conclusion: CIConclusion): boolean {
  return conclusion === 'passed';
}
