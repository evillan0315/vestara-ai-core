// Verifier verdict types — renderer-free.
//
// The Verifier consumes a VerificationEvidenceBundle (produced by the
// EvidencePipeline) and evaluates it against acceptance criteria to produce
// a structured verdict. It never touches the filesystem, network, or
// renderer; all logic is deterministic and unit-testable.

import type { EvidenceKind, VerificationConfidence, VerificationEvidenceBundle } from '../types';

export type VerifierVerdictStatus = 'VERIFIED' | 'UNVERIFIED' | 'FAILED' | 'INDETERMINATE';

export interface VerifierCriterionSpec {
  readonly id: string;
  readonly description: string;
  readonly required: boolean;
  readonly expectEvidenceKinds?: readonly EvidenceKind[];
  readonly minEvidenceCount?: number;
  readonly requireChecksPassed?: readonly string[];
  readonly minConfidenceScore?: number;
}

export interface CriterionVerdict {
  readonly criterionId: string;
  readonly description: string;
  readonly required: boolean;
  readonly satisfied: boolean;
  readonly gaps: readonly string[];
}

export interface VerifierVerdict {
  readonly id: string;
  readonly executionId: string;
  readonly claim: string;
  readonly status: VerifierVerdictStatus;
  readonly criteria: readonly CriterionVerdict[];
  readonly gaps: readonly string[];
  readonly contradictions: readonly string[];
  readonly confidence: VerificationConfidence;
  readonly reasoning: string;
  readonly evaluatedAt: string;
  readonly previousVerdictId?: string;
}

export interface VerifierOverrideInput {
  readonly decision: 'PROCEED' | 'REJECT';
  readonly reason: string;
  readonly decidedBy: string;
}

export interface VerifierOverride {
  readonly verdictId: string;
  readonly decision: 'PROCEED' | 'REJECT';
  readonly reason: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
}

export type VerifierEffectiveDecision =
  | 'VERIFIED'
  | 'UNVERIFIED'
  | 'FAILED'
  | 'INDETERMINATE'
  | 'PROCEEDING_BY_OVERRIDE'
  | 'REJECTED_BY_OVERRIDE';

export interface VerifierVerdictWithOverride {
  readonly verdict: VerifierVerdict;
  readonly override?: VerifierOverride;
  readonly effectiveDecision: VerifierEffectiveDecision;
}

export interface VerifierEvaluateOptions {
  readonly previousVerdictId?: string;
  readonly evaluatedAt?: string;
}

let verdictCounter = 0;

export function generateVerdictId(executionId: string): string {
  verdictCounter += 1;
  return `verdict-${executionId}-${Date.now()}-${verdictCounter}`;
}
