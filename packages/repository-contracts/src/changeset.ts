/**
 * VES-REPO-002 — RepositoryChangeSet: baseline-aware observed change
 * (REPO-INV-008, REPO-INV-010).
 *
 * `baselineSnapshotId` is required: without a baseline, Vestara cannot
 * truthfully claim an execution introduced a change. `declaredScope` is what
 * the execution intended; `observedScope` is what actually changed — they
 * are compared, never assumed equal. `attribution` records who the change
 * belongs to; `confidence` records how strongly the link is evidenced.
 * Correlation is never promoted into proof (see
 * {@link claimStrengthAllowsIntroductionClaim}).
 */
import type { ChangeSetId, ExecutionId, RepositoryId, RuntimeSessionId, SnapshotId } from './identity';
import type { ChangeScope } from './scope';

/** Observed file fate. Determined by comparison, never by actor. */
export type ObservedFileFate = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';

/** One observed file difference against the baseline snapshot. */
export interface ObservedFileChange {
  readonly path: string;
  readonly fate: ObservedFileFate;
}

/** Who/what the change is attributed to. Closed vocabulary. */
export type ChangeAttribution = 'vestara-execution' | 'human' | 'external' | 'mixed' | 'unknown';

export const CHANGE_ATTRIBUTIONS: readonly ChangeAttribution[] = [
  'vestara-execution',
  'human',
  'external',
  'mixed',
  'unknown',
];

/**
 * Evidence strength for the attribution link. CORRELATED describes
 * co-occurrence (shared operation, timestamp, session); only PROVEN
 * describes a complete baseline→operation→observation chain.
 */
export type AttributionConfidence = 'PROVEN' | 'CORRELATED' | 'AMBIGUOUS' | 'UNKNOWN';

export const ATTRIBUTION_CONFIDENCES: readonly AttributionConfidence[] = [
  'PROVEN',
  'CORRELATED',
  'AMBIGUOUS',
  'UNKNOWN',
];

/** Observed change set against a baseline snapshot. */
export interface RepositoryChangeSet {
  readonly changeSetId: ChangeSetId;
  readonly repositoryId: RepositoryId;
  readonly executionId?: ExecutionId;
  readonly runtimeSessionId?: RuntimeSessionId;
  readonly baselineSnapshotId: SnapshotId;
  readonly files: readonly ObservedFileChange[];
  readonly declaredScope: readonly ChangeScope[];
  readonly observedScope: readonly ChangeScope[];
  readonly startedAt: string;
  readonly observedAt: string;
  readonly attribution: ChangeAttribution;
  readonly confidence: AttributionConfidence;
}

/**
 * True only when confidence is PROVEN. A CORRELATED (or weaker) link must
 * never be presented as “execution X introduced change Y” — this predicate
 * is the contract-level guard against promoting correlation into proof.
 */
export function claimStrengthAllowsIntroductionClaim(confidence: AttributionConfidence): boolean {
  return confidence === 'PROVEN';
}

/** Structural validity: baseline link, file list, and closed vocabularies. */
export function isValidRepositoryChangeSet(value: unknown): value is RepositoryChangeSet {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.changeSetId === 'string' &&
    (record.changeSetId as string).length > 0 &&
    typeof record.repositoryId === 'string' &&
    (record.repositoryId as string).length > 0 &&
    typeof record.baselineSnapshotId === 'string' &&
    (record.baselineSnapshotId as string).length > 0 &&
    Array.isArray(record.files) &&
    Array.isArray(record.declaredScope) &&
    Array.isArray(record.observedScope) &&
    typeof record.startedAt === 'string' &&
    typeof record.observedAt === 'string' &&
    (CHANGE_ATTRIBUTIONS as readonly string[]).includes(record.attribution as string) &&
    (ATTRIBUTION_CONFIDENCES as readonly string[]).includes(record.confidence as string)
  );
}
