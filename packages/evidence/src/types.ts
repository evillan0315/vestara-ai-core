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

// ─── Visual artifact metadata (EVIDENCE-UX-002 M1) ────────────────
//
// Descriptive presentation metadata for image evidence, recorded from
// inspected image bytes at ingest/collect time. Never artifact identity
// (the content digest is), never verification authority (the verifier
// verdict is), never filesystem authority (digests resolve server-side).

/** Image media types with byte-level inspection support (M1). SVG is excluded. */
export type SupportedVisualMediaType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface VisualArtifactMetadata {
  /** Intrinsic pixel width inspected from image content (never filename). */
  readonly width: number;
  /** Intrinsic pixel height inspected from image content (never filename). */
  readonly height: number;
  /** MIME determined from magic bytes (never extension). Mirrors the artifact mediaType. */
  readonly mediaType: SupportedVisualMediaType;
}

export interface EvidenceReference {
  readonly ref: string; // content-addressed digest (sha256)
  readonly kind: EvidenceKind;
  readonly mediaType: string;
  readonly size: number;
  readonly summary: string;
  readonly provenance: EvidenceProvenance;
  readonly relatedTo?: readonly string[];
  /**
   * Descriptive visual metadata (EVIDENCE-UX-002 M1). Presentation hint only —
   * identity remains `ref`, authority remains provenance + verifier verdict.
   */
  readonly visual?: VisualArtifactMetadata;
  /**
   * CTX-0: Context-relevance metadata for evidence retrieval.
   * These fields extend EvidenceReference with metadata that enables
   * context intelligence to rank, budget, and filter evidence.
   */
  readonly contextRelevance?: EvidenceContextRelevance;
}

/**
 * CTX-0: Context-relevance metadata for evidence references.
 * Enables Context Intelligence to rank, budget, and filter evidence
 * during retrieval without duplicating evidence content.
 */
export interface EvidenceContextRelevance {
  /** Ranking score hint (0-1) — higher = more relevant to recent queries */
  readonly rankingScore: number;

  /** Budget allocation class — determines how much context budget this evidence consumes */
  readonly budgetClass: EvidenceBudgetClass;

  /** Freshness indicator — how recently this evidence was produced */
  readonly freshness: EvidenceFreshness;

  /** Source authority reference — which authority produced this evidence */
  readonly sourceAuthority: string;

  /** Optional: tags for filtering and categorization */
  readonly tags?: readonly string[];
}

/**
 * CTX-0: Budget allocation classes for evidence.
 * Determines how much context budget evidence consumes during retrieval.
 */
export type EvidenceBudgetClass =
  | 'minimal' // Small, low-cost evidence (e.g., status flag)
  | 'compact' // Medium-sized evidence (e.g., summary, diff)
  | 'standard' // Normal evidence (e.g., test output, log excerpt)
  | 'verbose'; // Large evidence (e.g., full file, detailed report)

/**
 * CTX-0: Freshness indicators for evidence.
 * How recently the evidence was produced relative to the current time.
 */
export type EvidenceFreshness =
  | 'stale' // > 24 hours old
  | 'recent' // 1-24 hours old
  | 'fresh' // < 1 hour old
  | 'current'; // < 5 minutes old

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
  /**
   * Item-level metadata passthrough (EVIDENCE-UX-002 M1). The pipeline merges
   * this into the manifest artifact `metadata` without affecting the content
   * digest. Visual collectors use `{ visual: VisualArtifactMetadata }`.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
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

// ─── OBS-0: Evidence Topology ──────────────────────────────────
//
// Extends PCS-026 Evidence Provenance with topology relationships:
// which evidence references which other evidence, temporal ordering,
// causal chains. These types enable graph traversal of evidence
// relationships for context intelligence and observer analysis.

/**
 * OBS-0: Typed relationship between evidence references.
 * Replaces untyped `relatedTo: string[]` with explicit relationship semantics.
 */
export interface EvidenceTopologyEdge {
  /** Source evidence reference (content-addressed digest) */
  readonly fromRef: string;

  /** Target evidence reference (content-addressed digest) */
  readonly toRef: string;

  /** The type of relationship between the two evidence references */
  readonly kind: EvidenceTopologyRelation;

  /** ISO-8601 timestamp of when this relationship was established */
  readonly establishedAt: string;

  /** Optional human-readable description of why this relationship exists */
  readonly reason?: string;
}

/**
 * OBS-0: Typed relationship kinds between evidence references.
 * Each kind implies different traversal semantics.
 */
export type EvidenceTopologyRelation =
  | 'derived-from' // Evidence B was derived from evidence A (provenance chain)
  | 'corroborates' // Evidence B supports/confirms evidence A (independent confirmation)
  | 'contradicts' // Evidence B conflicts with evidence A (needs resolution)
  | 'supersedes' // Evidence B replaces evidence A (correction/replacement)
  | 'temporal-precedes' // Evidence A occurred before evidence B (temporal ordering)
  | 'causal-chain' // Evidence A caused or contributed to evidence B (causal link)
  | 'same-incident'; // Evidence A and B belong to the same diagnostic incident

/**
 * OBS-0: Evidence topology graph — the complete set of relationships
 * between evidence references in a bundle or across bundles.
 */
export interface EvidenceTopology {
  /** Bundle ID this topology belongs to (or 'global' for cross-bundle topology) */
  readonly bundleId: string;

  /** All edges in this topology graph */
  readonly edges: readonly EvidenceTopologyEdge[];

  /** ISO-8601 timestamp of when this topology was last updated */
  readonly updatedAt: string;

  /** Optional: summary statistics about the topology */
  readonly stats?: EvidenceTopologyStats;
}

/**
 * OBS-0: Summary statistics about an evidence topology graph.
 */
export interface EvidenceTopologyStats {
  /** Total number of evidence references in the graph */
  readonly nodeCount: number;

  /** Total number of edges in the graph */
  readonly edgeCount: number;

  /** Number of connected components */
  readonly connectedComponents: number;

  /** Number of evidence references with no incoming edges (roots) */
  readonly rootCount: number;

  /** Number of evidence references with no outgoing edges (leaves) */
  readonly leafCount: number;
}
