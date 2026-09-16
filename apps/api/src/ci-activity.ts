/**
 * CI-OBS-001F — Activity Room projection for CI completion/review.
 *
 * Projects a completed CI observation + reviewer decision into the Activity
 * Room as a typed `verification` record (the closest honest member of the
 * closed activity vocabulary: an external verification result). No new
 * activity kind is introduced and no activity record is mutated.
 *
 * GitHub executes; Vestara adjudicates. The record states what was observed
 * and what was decided — never that the objective is verified.
 */

import type { ActivityOrganizationalEffect, VerificationActivity, VerificationOutcome } from '@vestara/activity-room';
import type { CICompletionResult } from '@vestara/ci-observer';
import { getActivityRoom } from './activity-room';

function outcomeFromConclusion(conclusion: CICompletionResult['observation']['conclusion']): VerificationOutcome {
  if (conclusion === 'passed') return 'passed';
  if (conclusion === 'failed') return 'failed';
  // cancelled / timed_out / skipped / unknown are inconclusive for root cause.
  return 'inconclusive';
}

function effectFromAction(action: CICompletionResult['outcome']['action']): ActivityOrganizationalEffect {
  switch (action) {
    case 'REPAIR_CANDIDATE':
      return 'recommendation';
    case 'HOLD':
      return 'hold';
    default:
      return 'finding';
  }
}

/** Build the Activity Room record for one CI completion. Pure. */
export function ciCompletionActivity(result: CICompletionResult): VerificationActivity {
  const { observation, decision, outcome, correlation } = result;
  const verificationOutcome = outcomeFromConclusion(observation.conclusion);
  const taskId = correlation.originatingTaskId;
  return {
    id: `ci-${observation.observationId}`,
    sequence: 0,
    timestamp: observation.observedAt,
    kind: 'verification',
    actor: { type: 'system', id: 'github-actions', displayName: 'GitHub Actions' },
    ...(taskId ? { taskId } : {}),
    ...(correlation.correlationId ? { correlationId: correlation.correlationId } : {}),
    verificationRunId: observation.observationId,
    outcome: verificationOutcome,
    checks: [
      {
        name: 'GitHub CI',
        status:
          observation.conclusion === 'passed' ? 'passed' : observation.conclusion === 'failed' ? 'failed' : 'skipped',
        summary: `${observation.conclusion} · ${observation.failedChecks} failed / ${observation.passedChecks} passed`,
      },
    ],
    reason: `${outcome.action} · reviewer ${decision.promotion.verdict} · ${outcome.reason}`,
    evidenceRefs: [],
    effect: effectFromAction(outcome.action),
  };
}

/**
 * Append the CI completion projection. Best-effort: Activity Room projection
 * must never break CI ingress or task resume.
 */
export async function projectCICompletionToActivity(result: CICompletionResult): Promise<void> {
  try {
    await getActivityRoom().service.appendActivity(ciCompletionActivity(result));
  } catch {
    // Projection is observability only.
  }
}
