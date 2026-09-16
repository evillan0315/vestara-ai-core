/**
 * CI-OBS-002C / H7 — Governed external-verification wait deadline.
 *
 * A lost or never-delivered GitHub completion leaves the originating task in
 * `awaiting-verification` forever. This module is the pure deadline assessment:
 * it classifies a wait as active / resolved / stale / unknown. It never
 * mutates task state and never fabricates a completion.
 *
 * Authority: read-only classification. The caller decides what to do; active
 * reconciliation (attach/re-fetch) is a separate, explicit step.
 */

/** Deadline policy for a CI wait. */
export interface CIWaitDeadlinePolicy {
  /** Age after which an unresolved wait is considered stale. */
  readonly deadlineMs: number;
}

/** Default: 45 minutes — comfortably beyond a typical CI pipeline. */
export const DEFAULT_CI_WAIT_DEADLINE_MS = 45 * 60 * 1000;

export type CIWaitDeadlineState = 'active' | 'resolved' | 'stale' | 'unknown';

export interface CIWaitDeadlineAssessment {
  readonly state: CIWaitDeadlineState;
  readonly deadlineMs: number;
  readonly ageMs?: number;
  readonly reason: string;
}

export interface CIWaitDeadlineInput {
  readonly suspendedAt: string;
  readonly resumedAt?: string;
}

/**
 * Classify a wait against its deadline. Pure.
 *
 * - `resolved`  — the wait was resumed (authoritative).
 * - `active`    — unresolved and within the deadline.
 * - `stale`     — unresolved beyond the deadline (candidate for reconciliation).
 * - `unknown`   — suspendedAt is missing/unparseable; never assume healthy.
 */
export function evaluateWaitDeadline(
  input: CIWaitDeadlineInput,
  policy: CIWaitDeadlinePolicy = { deadlineMs: DEFAULT_CI_WAIT_DEADLINE_MS },
  now: () => number = () => Date.now(),
): CIWaitDeadlineAssessment {
  const deadlineMs = policy.deadlineMs;

  if (input.resumedAt) {
    return { state: 'resolved', deadlineMs, reason: 'Wait was resumed' };
  }
  const suspended = Date.parse(input.suspendedAt);
  if (Number.isNaN(suspended)) {
    return { state: 'unknown', deadlineMs, reason: 'Wait suspension time is missing or unparseable' };
  }
  const ageMs = Math.max(0, now() - suspended);
  if (ageMs >= deadlineMs) {
    return {
      state: 'stale',
      deadlineMs,
      ageMs,
      reason: `Unresolved for ${Math.round(ageMs / 60000)}m (deadline ${Math.round(deadlineMs / 60000)}m)`,
    };
  }
  return { state: 'active', deadlineMs, ageMs, reason: 'Unresolved but within the deadline' };
}
