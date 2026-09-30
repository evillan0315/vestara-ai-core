/**
 * Neutral historical evidence contracts.
 *
 * These types describe the meaning and lineage of an already identified
 * historical artifact. They deliberately do not own bytes, persistence,
 * filesystem access, ingestion, or assertion semantics.
 */

/** Generic historical artifact categories; domain-specific kinds belong above this boundary. */
export type HistoricalArtifactKind =
  | 'document'
  | 'source-file'
  | 'repository-snapshot'
  | 'worktree-state'
  | 'diff'
  | 'log'
  | 'other'
  | (string & {});

/**
 * Worktree state as historically observed. Unknown facts stay unknown: no
 * clean default, inferred commit, or manufactured path list is permitted.
 */
export interface HistoricalWorktreeState {
  readonly status: 'clean' | 'dirty' | 'unknown';
  readonly commit?: string;
  readonly branch?: string;
  readonly changedPaths?: readonly string[];
}

/** Optional facts about where and when a historical artifact came from. */
export interface HistoricalProvenance {
  /** When the artifact described the observed state, if known. */
  readonly observedAt?: string;
  /** Source revision, if known; this is not invented from ingest/capture time. */
  readonly sourceCommit?: string;
  /** Human or system producer, if known. */
  readonly producer?: string;
  /** Source path, if known; it is not required for artifact identity. */
  readonly sourcePath?: string;
}

/** A stable semantic location within a historical artifact. */
export interface HistoricalAnchor {
  /** Anchor vocabulary is intentionally generic and extensible. */
  readonly kind: string;
  /** Stable semantic locator value, such as a heading, symbol, or line range. */
  readonly value: string;
  readonly label?: string;
}

/**
 * A semantic fragment locator. `artifactDigest` identifies the complete
 * evidence artifact; pairing it with `anchor` locates a fragment within that
 * artifact. The pair is not a second evidence identity.
 */
export interface HistoricalFragmentLocator {
  readonly artifactDigest: string;
  readonly anchor: HistoricalAnchor;
}

/**
 * Neutral historical evidence metadata. An artifact may have zero anchors.
 *
 * `derivedFrom` and `supersedesScope` record declared historical document
 * lineage only. They do not select a winning assertion, establish truth,
 * invalidate original evidence, supersede knowledge assertions, or imply
 * verification.
 */
export interface HistoricalEvidenceRecord {
  /** Canonical identity of the complete evidence artifact (the existing digest contract). */
  readonly artifactDigest: string;
  readonly artifactKind: HistoricalArtifactKind;
  readonly mediaType: string;
  readonly size: number;
  readonly summary: string;
  readonly worktreeState?: HistoricalWorktreeState;
  readonly provenance?: HistoricalProvenance;
  readonly anchors: readonly HistoricalAnchor[];
  /** Digest of a declared historical source document, if known. */
  readonly derivedFrom?: string;
  /** Human/domain-scoped declared lineage metadata; not a verdict. */
  readonly supersedesScope?: string;
}
