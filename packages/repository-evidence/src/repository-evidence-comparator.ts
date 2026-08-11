/**
 * Repository evidence comparator — owns repository-specific semantics
 * (ADR-012 reference adapter).
 *
 * Comparability rules:
 * - Same profile + same scope + same environment → comparable.
 * - Same profile + same scope but environment/lockfile changed → partially
 *   comparable (failure identity and counts remain valid; duration and
 *   artifacts are not).
 * - Different verification profile or materially different scope →
 *   incomparable (no regression conclusion is justified).
 *
 * Regression is derived from the failure fingerprint delta, never from a
 * count alone.
 */

import type { Comparability, EvidenceDelta, EvidenceSnapshot } from '@vestara/verification-evidence';
import { hashJson, MismatchedEvidenceTypeError } from '@vestara/verification-evidence';
import { environmentChanged } from './environment-fingerprint';
import { compareFailures, type FailureDelta } from './failure-fingerprint';
import type { RepositoryEvidenceResults, RepositoryEvidenceSnapshot } from './repository-evidence';

export interface RepositoryEvidenceChanges {
  readonly passingDelta: number;
  readonly failingDelta: number;
  readonly failureDelta: FailureDelta;
  readonly scopeChanged: boolean;
  readonly commandChanged: boolean;
  readonly environmentDimensionsChanged: string[];
}

export interface RepositoryComparisonResult {
  readonly delta: EvidenceDelta<RepositoryEvidenceChanges>;
  readonly regressionIntroduced: boolean | null;
  readonly comparable: boolean;
  readonly conclusion: {
    readonly status: 'pass' | 'fail' | 'indeterminate';
    readonly reasons: string[];
  };
}

function scopeKey(execution: RepositoryEvidenceSnapshot['execution']): string {
  return JSON.stringify({
    packages: [...execution.verificationScope.packages].sort(),
    applications: [...execution.verificationScope.applications].sort(),
  });
}

function evaluator(baseline: RepositoryEvidenceSnapshot, current: RepositoryEvidenceSnapshot): Comparability {
  const reasons: string[] = [];
  const comparableDimensions: string[] = [];
  const incomparableDimensions: string[] = [];
  const profileDiffers = baseline.execution.verificationProfile !== current.execution.verificationProfile;
  const scopeDiffers = scopeKey(baseline.execution) !== scopeKey(current.execution);
  const environmentDimensions = environmentChanged(
    baseline.execution.environmentFingerprint,
    current.execution.environmentFingerprint,
  );

  if (profileDiffers) {
    incomparableDimensions.push('verification-profile');
    reasons.push(
      `verification profile differs: ${baseline.execution.verificationProfile} vs ${current.execution.verificationProfile}`,
    );
  } else {
    comparableDimensions.push('verification-profile');
  }

  if (scopeDiffers) {
    incomparableDimensions.push('verification-scope');
    reasons.push('verification scope differs (packages or applications changed)');
  } else {
    comparableDimensions.push('verification-scope');
  }

  for (const dimension of environmentDimensions) {
    incomparableDimensions.push(`environment:${dimension}`);
    reasons.push(`environment dimension changed: ${dimension}`);
  }
  if (environmentDimensions.length === 0) comparableDimensions.push('environment');

  comparableDimensions.push('failure-identity');

  const status =
    incomparableDimensions.length === 0
      ? 'comparable'
      : comparableDimensions.includes('verification-profile') &&
          comparableDimensions.includes('verification-scope') &&
          environmentDimensions.length > 0
        ? 'partially-comparable'
        : 'incomparable';

  return { status, reasons, comparableDimensions, incomparableDimensions };
}

export class RepositoryEvidenceComparator {
  async compare(
    baseline: EvidenceSnapshot<unknown, unknown, RepositoryEvidenceResults>,
    current: EvidenceSnapshot<unknown, unknown, RepositoryEvidenceResults>,
  ): Promise<RepositoryComparisonResult> {
    if (baseline.evidenceType !== current.evidenceType) {
      throw new MismatchedEvidenceTypeError(baseline.evidenceType, current.evidenceType);
    }
    const b = baseline as unknown as RepositoryEvidenceSnapshot;
    const c = current as unknown as RepositoryEvidenceSnapshot;
    const comparability = evaluator(b, c);

    const failureDelta = compareFailures(b.results.failures, c.results.failures);
    const passingDelta = c.results.testSummary.passed - b.results.testSummary.passed;
    const failingDelta = c.results.testSummary.failed - b.results.testSummary.failed;
    const scopeChanged =
      JSON.stringify(b.execution.verificationScope) !== JSON.stringify(c.execution.verificationScope);
    const commandChanged = b.execution.testCommand !== c.execution.testCommand;
    const environmentDimensionsChanged = environmentChanged(
      b.execution.environmentFingerprint,
      c.execution.environmentFingerprint,
    );

    const changes: RepositoryEvidenceChanges = {
      passingDelta,
      failingDelta,
      failureDelta,
      scopeChanged,
      commandChanged,
      environmentDimensionsChanged,
    };

    const delta: EvidenceDelta<RepositoryEvidenceChanges> = {
      evidenceType: 'repository',
      baselineEvidenceHash: b.contentHash,
      currentEvidenceHash: c.contentHash,
      comparability,
      changes,
    };

    // Regression is only derived when comparability justifies it.
    // Non-comparable evidence yields null, never false: absence of evidence
    // must not be represented as proof of no regression (ADR-012 invariant).
    const comparable = comparability.status === 'comparable';
    let regressionIntroduced: boolean | null = null;
    if (comparable) {
      regressionIntroduced = failureDelta.fingerprintChanged;
    }

    const reasons = comparability.reasons;
    if (comparable) {
      if (failureDelta.addedCount > 0) reasons.push(`${failureDelta.addedCount} failure(s) added`);
      if (failureDelta.resolvedCount > 0) reasons.push(`${failureDelta.resolvedCount} failure(s) resolved`);
      if (failureDelta.addedCount === 0 && failureDelta.resolvedCount === 0)
        reasons.push('failure fingerprint unchanged');
    }

    const conclusion = comparable
      ? { status: regressionIntroduced ? ('fail' as const) : ('pass' as const), reasons }
      : { status: 'indeterminate' as const, reasons };

    return { delta, regressionIntroduced, comparable, conclusion };
  }
}

/** Derived delta hash — the delta itself is also hashed so conclusions reference it. */
export function deltaHash(delta: EvidenceDelta<RepositoryEvidenceChanges>): string {
  return hashJson({
    evidenceType: delta.evidenceType,
    baselineEvidenceHash: delta.baselineEvidenceHash,
    currentEvidenceHash: delta.currentEvidenceHash,
    comparability: delta.comparability,
    changes: delta.changes,
  });
}
