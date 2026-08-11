/**
 * Verification conclusion — the derived outcome of comparing two snapshots.
 *
 * A conclusion is only ever constructed from a comparability evaluation and a
 * delta. `incomparable` evidence always yields status `indeterminate` and
 * `regressionIntroduced: null` (ADR-012 core invariant 4).
 */

import type { ComparabilityStatus } from './comparability';
import type { ConfidenceLevel } from './confidence';

export type VerificationConclusionStatus = 'pass' | 'fail' | 'indeterminate';

export interface VerificationConclusion {
  readonly status: VerificationConclusionStatus;
  readonly regressionIntroduced: boolean | null;
  readonly confidence: ConfidenceLevel;
  readonly reasons: string[];
  readonly evidenceHashes: string[];
  readonly deltaHash: string;
}

/**
 * Pure derivation of a conclusion from a delta's comparability.
 * This is the framework's guard: a conclusion cannot bypass comparability.
 */
export function deriveConclusion(input: {
  readonly comparabilityStatus: ComparabilityStatus;
  readonly changesSummary: string[];
  readonly evidenceHashes: string[];
  readonly deltaHash: string;
  readonly confidence: ConfidenceLevel;
}): VerificationConclusion {
  const reasons = [...input.changesSummary];
  if (input.comparabilityStatus === 'incomparable') {
    return {
      status: 'indeterminate',
      regressionIntroduced: null,
      confidence: input.confidence,
      reasons: [...reasons, 'evidence is incomparable; no conclusion is justified'],
      evidenceHashes: input.evidenceHashes,
      deltaHash: input.deltaHash,
    };
  }
  if (input.comparabilityStatus === 'partially-comparable') {
    return {
      status: 'indeterminate',
      regressionIntroduced: null,
      confidence: input.confidence,
      reasons: [...reasons, 'evidence is only partially comparable; no definitive conclusion'],
      evidenceHashes: input.evidenceHashes,
      deltaHash: input.deltaHash,
    };
  }
  return {
    status: input.confidence === 'high' || input.confidence === 'medium' ? 'pass' : 'indeterminate',
    regressionIntroduced: false,
    confidence: input.confidence,
    reasons,
    evidenceHashes: input.evidenceHashes,
    deltaHash: input.deltaHash,
  };
}
