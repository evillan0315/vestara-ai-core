/**
 * CI-OBS-001I — Canonical CI notification projection.
 *
 * Classifies which CI transitions are meaningful enough to notify on and
 * produces a provider-neutral notification record. Delivery (Telegram, UI,
 * etc.) is a separate concern owned by a notifications runtime; this module is
 * the single canonical projection so channels never re-implement CI semantics.
 *
 * Notify only on meaningful transitions — never per job/step. A retrieval
 * failure is reported as an observation failure, never as a CI failure.
 */

import type { CICompletionResult } from './completion';

export type CINotificationKind =
  | 'all-required-checks-passed'
  | 'required-check-failed'
  | 'run-cancelled-or-timed-out'
  | 'observation-failed'
  | 'human-decision-required';

export type CINotificationSeverity = 'info' | 'warning' | 'error';

export interface CINotification {
  readonly kind: CINotificationKind;
  readonly severity: CINotificationSeverity;
  readonly title: string;
  readonly body: string;
  readonly observationId: string;
  readonly commitSha: string;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly at: string;
}

/**
 * Project a meaningful notification from a completed CI review, or `undefined`
 * when the transition is not worth notifying (e.g. skipped).
 */
export function projectCINotification(result: CICompletionResult): CINotification | undefined {
  const { observation, decision, outcome, correlation } = result;
  const base = {
    observationId: observation.observationId,
    commitSha: observation.commitSha,
    ...(correlation.correlationId ? { correlationId: correlation.correlationId } : {}),
    ...(correlation.originatingTaskId ? { taskId: correlation.originatingTaskId } : {}),
    at: observation.observedAt,
  };

  // Retrieval failure ≠ CI failure — report it as an observation failure.
  const isRetrievalFailure =
    observation.conclusion === 'unknown' &&
    observation.passedChecks + observation.failedChecks + observation.skippedChecks === 0;
  if (isRetrievalFailure) {
    return {
      ...base,
      kind: 'observation-failed',
      severity: 'error',
      title: 'CI observation failed',
      body: 'Could not retrieve CI state for the commit — this is not a CI failure.',
    };
  }

  switch (observation.conclusion) {
    case 'passed':
      return {
        ...base,
        kind: 'all-required-checks-passed',
        severity: 'info',
        title: 'CI passed',
        body: 'GitHub CI passed. This proceeds to Vestara verification; it is not objective verification.',
      };
    case 'failed':
      if (outcome.action === 'REPAIR_CANDIDATE') {
        return {
          ...base,
          kind: 'required-check-failed',
          severity: 'error',
          title: 'CI failed',
          body: `Reviewer promoted a ${decision.classification} finding — repair remains a candidate, not an instruction.`,
        };
      }
      return {
        ...base,
        kind: 'human-decision-required',
        severity: 'warning',
        title: 'CI failed — decision required',
        body: `Reviewer verdict ${decision.promotion.verdict}; no repair authority conferred.`,
      };
    case 'cancelled':
    case 'timed_out':
      return {
        ...base,
        kind: 'run-cancelled-or-timed-out',
        severity: 'warning',
        title: `CI run ${observation.conclusion}`,
        body: 'Inconclusive for root cause; no automatic repair.',
      };
    default:
      // skipped / unknown-with-checks are not meaningful transitions.
      return undefined;
  }
}
