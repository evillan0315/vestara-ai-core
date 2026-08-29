// VerifierService — renderer-free.
//
// Consumes a VerificationEvidenceBundle (produced by EvidencePipeline) and
// evaluates it against acceptance criteria to produce a structured verdict.
// Handles Director override (verdict preserved, override recorded separately)
// and re-verification (fresh verdict referencing the prior one).
//
// No filesystem, network, or renderer dependency. All logic is deterministic
// and unit-testable without a live pipeline.

import type { VerificationEvidenceBundle } from '../types';
import { evaluateCriterion, findContradictions } from './criterion-evaluator';
import {
  type CriterionVerdict,
  generateVerdictId,
  type VerifierCriterionSpec,
  type VerifierEvaluateOptions,
  type VerifierOverride,
  type VerifierOverrideInput,
  type VerifierVerdict,
  type VerifierVerdictStatus,
  type VerifierVerdictWithOverride,
} from './verifier-types';

export interface VerifierServiceOptions {
  readonly now?: () => string;
}

export class VerifierService {
  private readonly now: () => string;

  constructor(options: VerifierServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Evaluate a bundle against acceptance criteria and produce a verdict.
   */
  evaluate(
    bundle: VerificationEvidenceBundle,
    criteria: readonly VerifierCriterionSpec[],
    claim: string,
    options: VerifierEvaluateOptions = {},
  ): VerifierVerdict {
    const criterionVerdicts = criteria.map((criterion) => evaluateCriterion(bundle, criterion));
    const contradictions = findContradictions(bundle, criteria);
    const gaps = criterionVerdicts.flatMap((verdict) => verdict.gaps);
    const status = this.computeStatus(bundle, criterionVerdicts, contradictions);
    const reasoning = this.buildReasoning(status, criterionVerdicts, contradictions, bundle);

    return {
      id: generateVerdictId(bundle.executionId),
      executionId: bundle.executionId,
      claim,
      status,
      criteria: criterionVerdicts,
      gaps,
      contradictions,
      confidence: bundle.confidence,
      reasoning,
      evaluatedAt: options.evaluatedAt ?? this.now(),
      previousVerdictId: options.previousVerdictId,
    };
  }

  /**
   * Re-verify a bundle after interruption or staleness. Produces a fresh
   * verdict that references the prior one. The prior verdict is never mutated.
   */
  reverify(
    bundle: VerificationEvidenceBundle,
    criteria: readonly VerifierCriterionSpec[],
    claim: string,
    priorVerdict: VerifierVerdict,
    options: Omit<VerifierEvaluateOptions, 'previousVerdictId'> = {},
  ): VerifierVerdict {
    return this.evaluate(bundle, criteria, claim, {
      ...options,
      previousVerdictId: priorVerdict.id,
    });
  }

  /**
   * Apply a Director override to an existing verdict. The verdict is preserved
   * unchanged; the override is recorded separately. The effective decision
   * reflects the override while the underlying evidence conclusion remains.
   */
  applyOverride(verdict: VerifierVerdict, input: VerifierOverrideInput): VerifierVerdictWithOverride {
    const override: VerifierOverride = {
      verdictId: verdict.id,
      decision: input.decision,
      reason: input.reason,
      decidedBy: input.decidedBy,
      decidedAt: this.now(),
    };
    const effectiveDecision = input.decision === 'PROCEED' ? 'PROCEEDING_BY_OVERRIDE' : 'REJECTED_BY_OVERRIDE';
    return { verdict, override, effectiveDecision };
  }

  /**
   * Strip raw evidence content and secrets from a verdict for safe logging or
   * client transport. The returned verdict retains structure and references
   * but redacts anything that could contain sensitive material.
   */
  redactForTransport(verdict: VerifierVerdict): VerifierVerdict {
    return {
      ...verdict,
      reasoning: verdict.reasoning.replace(/\b(?:sk-[a-zA-Z0-9]{20,}|nvapi-|vck_)[a-zA-Z0-9]+/g, '[REDACTED]'),
    };
  }

  private computeStatus(
    bundle: VerificationEvidenceBundle,
    criterionVerdicts: readonly CriterionVerdict[],
    contradictions: readonly string[],
  ): VerifierVerdictStatus {
    // No evidence at all — cannot establish anything.
    if (bundle.evidence.length === 0 && bundle.checks.length === 0) {
      return 'INDETERMINATE';
    }

    // A required criterion has explicitly failed checks that contradict it.
    const requiredFailed = criterionVerdicts.some((v) => v.required && !v.satisfied);
    if (requiredFailed && contradictions.length > 0) {
      return 'FAILED';
    }

    // Required criterion unsatisfied but no explicit contradiction.
    if (requiredFailed) {
      return 'UNVERIFIED';
    }

    // All criteria satisfied.
    if (criterionVerdicts.every((v) => v.satisfied)) {
      return 'VERIFIED';
    }

    // Some non-required criteria have gaps.
    return 'UNVERIFIED';
  }

  private buildReasoning(
    status: VerifierVerdictStatus,
    criterionVerdicts: readonly CriterionVerdict[],
    contradictions: readonly string[],
    bundle: VerificationEvidenceBundle,
  ): string {
    const parts: string[] = [`Verdict: ${status}`];

    const satisfied = criterionVerdicts.filter((v) => v.satisfied).length;
    const total = criterionVerdicts.length;
    parts.push(`Criteria satisfied: ${satisfied}/${total}`);

    if (contradictions.length > 0) {
      parts.push(`Contradictions: ${contradictions.length}`);
    }

    parts.push(`Evidence items: ${bundle.evidence.length}`);
    parts.push(`Confidence: ${bundle.confidence.level} (${bundle.confidence.score})`);

    if (bundle.confidence.limitations.length > 0) {
      parts.push(`Limitations: ${bundle.confidence.limitations.join('; ')}`);
    }

    return parts.join(' · ');
  }
}
