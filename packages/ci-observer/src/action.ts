/**
 * CI-OBS-002A — Orchestration-layer verification action.
 *
 * The frozen `@vestara/ci-reviewer` contract remains authoritative for the
 * promotion verdict. This module DERIVES a workflow action from the
 * observation + decision; it never extends or replaces reviewer vocabulary.
 *
 * Invariants:
 *   - CI failure ≠ repair authority (a failure yields at most a repair
 *     *candidate*, never an authorized mutation).
 *   - CI pass ≠ objective verification (a pass only proceeds to verification).
 *   - Cancelled/inconclusive evidence is not a root-cause failure.
 */

import type { CIObservation } from '@vestara/ci-contracts';
import type { ReviewerDecision } from '@vestara/ci-reviewer';

/** Workflow-level disposition derived from the review. */
export type CIVerificationAction = 'HOLD' | 'REPAIR_CANDIDATE' | 'PROCEED_TO_VERIFICATION';

export interface CIVerificationOutcome {
  readonly action: CIVerificationAction;
  readonly reason: string;
  readonly observation: CIObservation;
  readonly decision: ReviewerDecision;
}

/** Derive the workflow action. Pure — no IO, no authority. */
export function deriveVerificationAction(
  observation: CIObservation,
  decision: ReviewerDecision,
): CIVerificationOutcome {
  const verdict = decision.promotion.verdict;

  if (observation.conclusion === 'skipped' || observation.conclusion === 'unknown') {
    return {
      action: 'HOLD',
      reason: `Inconclusive CI conclusion '${observation.conclusion}': no failure to act on.`,
      observation,
      decision,
    };
  }

  if (observation.conclusion === 'cancelled') {
    return {
      action: 'HOLD',
      reason: 'CI run cancelled: cancellation is evidence, not a root-cause failure.',
      observation,
      decision,
    };
  }

  if (observation.conclusion === 'timed_out') {
    return {
      action: 'HOLD',
      reason: 'CI run timed out: inconclusive for root cause.',
      observation,
      decision,
    };
  }

  if (observation.conclusion === 'passed') {
    return {
      action: 'PROCEED_TO_VERIFICATION',
      reason: 'CI passed: CI pass is not objective verification; proceed to the verification gate.',
      observation,
      decision,
    };
  }

  // conclusion === 'failed'
  if (verdict === 'promote' && decision.promotion.evidenceRefs.length > 0) {
    return {
      action: 'REPAIR_CANDIDATE',
      reason:
        'Reviewer promoted a supported hypothesis; repair remains a candidate requiring authorization, not an instruction.',
      observation,
      decision,
    };
  }

  return {
    action: 'HOLD',
    reason: `Reviewer verdict '${verdict}': failure recorded as evidence; no repair authority conferred.`,
    observation,
    decision,
  };
}
