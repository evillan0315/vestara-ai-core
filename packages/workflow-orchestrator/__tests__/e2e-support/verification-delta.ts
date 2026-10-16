/**
 * WFO-E2E-001F — evidence comparability and regression delta.
 *
 * ADR-012 comparability over the required identity axes, and regression
 * detection over failure-fingerprint sets. A repair that swaps one regression
 * for another stays failing — raw failure counts could miss it, fingerprint
 * deltas cannot.
 */

import type { Comparability } from '@vestara/verification-evidence';
import type { VerificationSnapshot } from './verification-profile';

export interface FailureFingerprintDelta {
  readonly added: readonly string[];
  readonly resolved: readonly string[];
  readonly unchanged: readonly string[];
}

/** Required identity axes — any difference makes the snapshots incomparable. */
const IDENTITY_AXES: Readonly<Array<[string, (s: VerificationSnapshot) => string]>> = [
  ['verificationProfileId', (s) => s.identity.verificationProfileId],
  ['verificationScope', (s) => s.identity.verificationScope],
  ['environmentFingerprint', (s) => s.identity.environmentFingerprint],
  ['repositoryBaselineSha', (s) => s.identity.repositoryBaselineSha],
];

export function evaluateVerificationComparability(
  baseline: VerificationSnapshot,
  current: VerificationSnapshot,
): Comparability {
  const incomparableAxes: string[] = [];
  const reasons: string[] = [];
  for (const [axis, axisValue] of IDENTITY_AXES) {
    if (axisValue(baseline) !== axisValue(current)) {
      incomparableAxes.push(axis);
      reasons.push(`${axis} differs between baseline and current`);
    }
  }
  if (incomparableAxes.length === 0) {
    return { status: 'comparable', reasons, comparableDimensions: [], incomparableDimensions: [] };
  }
  return {
    status: 'incomparable',
    reasons,
    comparableDimensions: [],
    incomparableDimensions: incomparableAxes,
  };
}

export function failureFingerprintDelta(
  baseline: VerificationSnapshot,
  current: VerificationSnapshot,
): FailureFingerprintDelta {
  const before = new Set(baseline.results.failureFingerprints);
  const after = new Set(current.results.failureFingerprints);
  return {
    added: [...after].filter((fingerprint) => !before.has(fingerprint)),
    resolved: [...before].filter((fingerprint) => !after.has(fingerprint)),
    unchanged: [...after].filter((fingerprint) => before.has(fingerprint)),
  };
}

export type VerificationConclusionStatus = 'pass' | 'fail' | 'indeterminate';

export interface VerificationConclusion {
  readonly status: VerificationConclusionStatus;
  readonly regressionIntroduced: boolean | null;
  readonly comparability: Comparability;
  readonly delta: FailureFingerprintDelta;
  readonly baselineHash: string;
  readonly currentHash: string;
  readonly reasons: readonly string[];
}

/**
 * Derived conclusion — ADR-012 first (incomparable/partial → indeterminate,
 * regressionIntroduced null), then fingerprint regression detection.
 */
export function deriveVerificationConclusion(
  baseline: VerificationSnapshot,
  current: VerificationSnapshot,
): VerificationConclusion {
  const comparability = evaluateVerificationComparability(baseline, current);
  const delta = failureFingerprintDelta(baseline, current);

  if (comparability.status !== 'comparable') {
    return {
      status: 'indeterminate',
      regressionIntroduced: null,
      comparability,
      delta,
      baselineHash: baseline.contentHash,
      currentHash: current.contentHash,
      reasons: [...comparability.reasons, 'evidence is incomparable; no conclusion is justified'],
    };
  }
  const status = delta.added.length > 0 ? 'fail' : 'pass';
  return {
    status,
    regressionIntroduced: delta.added.length > 0,
    comparability,
    delta,
    baselineHash: baseline.contentHash,
    currentHash: current.contentHash,
    reasons:
      delta.added.length > 0
        ? [`new failure fingerprints introduced: ${delta.added.join(', ')}`]
        : ['no new failure fingerprints'],
  };
}
