/**
 * Immutable evidence snapshot — the source of truth for the verification
 * framework (ADR-012).
 *
 * A snapshot captures what was observed (identity), how it was observed
 * (execution), and what was observed (results). `contentHash` is a
 * deterministic digest of the snapshot so baselines and current runs can be
 * compared without trusting stored conclusions.
 */

export interface EvidenceSnapshot<TIdentity, TExecution, TResult> {
  readonly schemaVersion: string;
  readonly evidenceType: string;
  readonly identity: TIdentity;
  readonly execution: TExecution;
  readonly results: TResult;
  readonly capturedAt: string;
  readonly contentHash: string;
}

export interface EvidenceIdentity {
  readonly repositoryId: string;
  readonly baselineSha: string;
  readonly currentSha: string;
  readonly branch: string;
  readonly dirtyWorkingTree: boolean;
  readonly untrackedFilesPresent: boolean;
}
