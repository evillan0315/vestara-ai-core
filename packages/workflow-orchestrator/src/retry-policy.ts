/**
 * Retry and revision policy (PCS-025 §5, §11).
 *
 * Bounded retries with exponential backoff; bounded revision loops; escalation
 * to human approval is the final path (Phase 2 Approval Gateway).
 */

export interface RetryPolicy {
  /** Max dispatch attempts per task before it is blocked. */
  readonly maxAttempts: number;
  /** Max revision loops per task (reviewer changes-requested) — Phase 2. */
  readonly maxRevisions: number;
  /** Backoff before re-dispatching after attempt N (1-based). */
  backoffMs(attempt: number): number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  maxRevisions: 3,
  backoffMs: (attempt: number) => Math.min(10_000, 100 * 2 ** (attempt - 1)),
};

export function canRetryAttempt(policy: RetryPolicy, attempt: number): boolean {
  return attempt < policy.maxAttempts;
}

export function canRevise(policy: RetryPolicy, revisionCount: number): boolean {
  return revisionCount < policy.maxRevisions;
}
