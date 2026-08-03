/**
 * PCS-026 evidence protocol contracts.
 *
 * The central contract is the VerificationEvidenceBundle — not an individual
 * screenshot, test result, or manifest. Collectors normalize producers behind
 * one boundary; confidence is derived, never agent-assigned; replay separates
 * deterministic artifact replay from execution replay (only claimed when its
 * dependencies are captured).
 */

// ─── Bundle ───────────────────────────────────────────────────

export interface VerificationEvidenceBundle {
  readonly id: string;
  readonly executionId: string;
  readonly taskId?: string;
  readonly verifierId: string;
  readonly profileId: string;

  readonly manifestId: string;
  readonly evidence: readonly EvidenceReference[];
  readonly checks: readonly VerificationCheckResult[];

  readonly replay: EvidenceReplayDescriptor;
  readonly confidence: VerificationConfidence;

  /** Bundle this one corrects/replaces (PCS-026 §6 — corrections link to the original, never mutate it). */
  readonly supersedes?: string;
  /** Bundle this one was derived from (re-run of the same scope/execution). */
  readonly derivedFrom?: string;

  readonly createdAt: string;
}

// ─── Evidence references + provenance ─────────────────────────

export type EvidenceKind =
  | 'command'
  | 'test'
  | 'build'
  | 'filesystem-change'
  | 'source-diff'
  | 'browser-navigation'
  | 'screenshot'
  | 'visual-comparison';

export interface EvidenceReference {
  readonly ref: string; // content-addressed digest (sha256)
  readonly kind: EvidenceKind;
  readonly mediaType: string;
  readonly size: number;
  readonly summary: string;
  readonly provenance: EvidenceProvenance;
  readonly relatedTo?: readonly string[];
}

export interface EvidenceProvenance {
  readonly producer: string; // which component produced it
  readonly executionId: string; // which execution produced it
  readonly operation?: string; // which command/operation created it
  readonly createdAt: string;
  readonly environment: string; // environment snapshot id/description
  readonly contentHash: string;
  readonly relatedTo?: readonly string[];
}

export type EvidenceOutcome = 'passed' | 'failed' | 'inconclusive' | 'blocked';

export type CheckStatus = 'passed' | 'failed' | 'skipped' | 'blocked';

export interface VerificationCheckResult {
  readonly checkId: string;
  readonly name: string;
  readonly status: CheckStatus;
  readonly summary: string;
  readonly evidenceRefs: readonly string[];
  readonly durationMs?: number;
}

// ─── Replay ───────────────────────────────────────────────────

export interface EvidenceReplayDescriptor {
  readonly mode: 'artifact' | 'execution';
  readonly steps: readonly ReplayStep[];
  readonly requires: ReplayRequirements;
}

export interface ReplayStep {
  readonly type: 'open-log' | 'open-artifact' | 'run-command' | 'run-scenario';
  readonly target: string;
  readonly command?: string;
}

export interface ReplayRequirements {
  readonly repositoryCommit?: string;
  readonly environmentImage?: string;
  readonly dependencies?: readonly string[];
  readonly secrets?: readonly string[];
  readonly externalServices?: readonly string[];
  readonly runtime?: string;
}

// ─── Confidence ───────────────────────────────────────────────

export type ConfidenceLevel = 'low' | 'moderate' | 'high' | 'very-high';

export type ConfidenceDimension =
  | 'profile-coverage'
  | 'check-success'
  | 'evidence-integrity'
  | 'evidence-independence'
  | 'replayability'
  | 'freshness';

export interface ConfidenceFactor {
  readonly dimension: ConfidenceDimension;
  readonly score: number; // 0..1
  readonly weight: number; // 0..1
  readonly rationale: string;
}

export interface VerificationConfidence {
  readonly score: number; // 0..1
  readonly level: ConfidenceLevel;
  readonly factors: readonly ConfidenceFactor[];
  readonly limitations: readonly string[];
}

// ─── Collection ───────────────────────────────────────────────

export interface EvidenceCollectionRequest {
  readonly executionId: string;
  readonly taskId?: string;
  readonly workspaceRoot: string;
  readonly changedFiles?: readonly string[];
  readonly profile?: string;
}

export interface EvidenceItem {
  readonly kind: EvidenceKind;
  readonly mediaType: string;
  readonly content: string | Uint8Array;
  readonly summary: string;
  readonly operation?: string;
  readonly relatedTo?: readonly string[];
}

export interface EvidenceCollectionResult {
  readonly items: readonly EvidenceItem[];
}

export interface EvidenceCollector<TRequest = EvidenceCollectionRequest> {
  readonly kind: EvidenceKind;
  collect(request: TRequest): Promise<EvidenceCollectionResult>;
}

// ─── Visual baseline governance (slice 2 model) ───────────────

export type BaselineStatus = 'missing' | 'approved' | 'rejected';

export interface VisualBaseline {
  readonly artifactDigest: string;
  readonly status: BaselineStatus;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
}
