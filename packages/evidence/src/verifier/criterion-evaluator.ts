// Criterion evaluation — renderer-free.
//
// Evaluates a single acceptance criterion against the evidence in a
// VerificationEvidenceBundle. Deterministic: same bundle + criterion always
// produces the same verdict.

import type { EvidenceReference, VerificationCheckResult, VerificationEvidenceBundle } from '../types';
import type { CriterionVerdict, VerifierCriterionSpec } from './verifier-types';

/**
 * Evaluate one criterion against the evidence in a bundle.
 */
export function evaluateCriterion(
  bundle: VerificationEvidenceBundle,
  criterion: VerifierCriterionSpec,
): CriterionVerdict {
  const gaps: string[] = [];

  if (criterion.expectEvidenceKinds && criterion.expectEvidenceKinds.length > 0) {
    const presentKinds = new Set(bundle.evidence.map((ref) => ref.kind));
    const missing = criterion.expectEvidenceKinds.filter((kind) => !presentKinds.has(kind));
    if (missing.length > 0) {
      gaps.push(`Missing evidence kinds: ${missing.join(', ')}`);
    }
  }

  if (criterion.minEvidenceCount !== undefined) {
    const count = bundle.evidence.length;
    if (count < criterion.minEvidenceCount) {
      gaps.push(`Evidence count ${count} below minimum ${criterion.minEvidenceCount}`);
    }
  }

  if (criterion.requireChecksPassed && criterion.requireChecksPassed.length > 0) {
    const passed = new Set(bundle.checks.filter((check) => check.status === 'passed').map((check) => check.checkId));
    const failed = criterion.requireChecksPassed.filter((checkId) => !passed.has(checkId));
    if (failed.length > 0) {
      gaps.push(`Required checks not passed: ${failed.join(', ')}`);
    }
  }

  if (criterion.minConfidenceScore !== undefined) {
    if (bundle.confidence.score < criterion.minConfidenceScore) {
      gaps.push(`Confidence score ${bundle.confidence.score} below minimum ${criterion.minConfidenceScore}`);
    }
  }

  return {
    criterionId: criterion.id,
    description: criterion.description,
    required: criterion.required,
    satisfied: gaps.length === 0,
    gaps,
  };
}

/**
 * Find checks in the bundle that contradict a required criterion — i.e. checks
 * that the criterion depends on but that failed.
 */
export function findContradictions(
  bundle: VerificationEvidenceBundle,
  criteria: readonly VerifierCriterionSpec[],
): string[] {
  const contradictions: string[] = [];
  const failedChecks = new Map(
    bundle.checks
      .filter((check) => check.status === 'failed' || check.status === 'blocked')
      .map((check) => [check.checkId, check]),
  );

  for (const criterion of criteria) {
    if (!criterion.required) continue;
    if (!criterion.requireChecksPassed) continue;
    for (const checkId of criterion.requireChecksPassed) {
      const failed = failedChecks.get(checkId);
      if (failed) {
        contradictions.push(`Required check "${failed.name}" (${checkId}) ${failed.status}: ${failed.summary}`);
      }
    }
  }

  return contradictions;
}

/**
 * Find evidence references that are directly tied to a criterion's required
 * checks.
 */
export function evidenceForChecks(
  bundle: VerificationEvidenceBundle,
  checkIds: readonly string[],
): EvidenceReference[] {
  const needed = new Set(checkIds);
  const referenced = new Set<string>();
  for (const check of bundle.checks) {
    if (needed.has(check.checkId)) {
      for (const ref of check.evidenceRefs) referenced.add(ref);
    }
  }
  return bundle.evidence.filter((ref) => referenced.has(ref.ref));
}

export function checksById(bundle: VerificationEvidenceBundle): Map<string, VerificationCheckResult> {
  return new Map(bundle.checks.map((check) => [check.checkId, check]));
}
