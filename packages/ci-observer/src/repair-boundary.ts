/**
 * CI-OBS-001J — Governed repair boundary (initial release: deny-by-default).
 *
 * The initial release must NOT automatically repair CI failures. Observation,
 * correlation, analysis, classification, and recommendation are allowed; edit,
 * commit, push, rerun, merge, and GitHub settings changes are not.
 *
 * `deriveVerificationAction` may produce `REPAIR_CANDIDATE` — that is a
 * *record*, never an instruction. This module is the explicit authority gate a
 * future repair loop MUST consult; in the initial release it denies every
 * request. Enabling bounded repair requires a separate authority contract.
 *
 * Authority: decision record only. Never mutates.
 */

import type { CICompletionResult } from './completion';

/** Contract version. Bump only via an authorized repair-authority amendment. */
export const CI_REPAIR_AUTHORITY_CONTRACT_VERSION = '1.0.0-deny-by-default';

export interface CIRepairRequest {
  /** Derived workflow action for the completed review. */
  readonly action: 'HOLD' | 'REPAIR_CANDIDATE' | 'PROCEED_TO_VERIFICATION';
  readonly classification: string;
  readonly evidenceRefs?: readonly string[];
}

export interface CIRepairAuthorityDecision {
  /** Always `false` in the initial release. */
  readonly authorized: false;
  readonly reason: string;
  readonly recommendation: string;
  readonly contractVersion: string;
}

/** Build a repair request from a completion result (record-only). */
export function repairRequestFromCompletion(result: CICompletionResult): CIRepairRequest {
  return {
    action: result.outcome.action,
    classification: result.decision.classification,
    evidenceRefs: result.decision.promotion.evidenceRefs,
  };
}

/**
 * Evaluate repair authority. Deny-by-default: no request is ever authorized in
 * the initial release, including a promoted failure. A failure yields at most a
 * recommendation for an authorized human follow-up.
 */
export function evaluateRepairAuthority(request: CIRepairRequest): CIRepairAuthorityDecision {
  if (request.action === 'REPAIR_CANDIDATE') {
    return {
      authorized: false,
      reason:
        'CI failure ≠ repair authority: a promoted finding is a candidate for authorized follow-up, not a repair instruction.',
      recommendation: 'Request an authorized follow-up (human or a separately contracted repair loop).',
      contractVersion: CI_REPAIR_AUTHORITY_CONTRACT_VERSION,
    };
  }
  return {
    authorized: false,
    reason: 'No repair is authorized in the initial release.',
    recommendation:
      request.action === 'PROCEED_TO_VERIFICATION'
        ? 'Proceed to Vestara verification.'
        : 'Inspect the recorded finding.',
    contractVersion: CI_REPAIR_AUTHORITY_CONTRACT_VERSION,
  };
}
