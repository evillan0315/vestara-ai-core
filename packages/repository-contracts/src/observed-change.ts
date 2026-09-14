/**
 * VES-REPO-007 — ObservedRepositoryChange: observed difference evidence.
 *
 * Answers "what changed between the identified baseline and the later
 * observed state" — never "who caused it". There is deliberately no
 * attribution, actor, session-causation, or violation field on this
 * contract: difference is observable evidence, causation belongs to
 * VES-REPO-008. An optional `runtimeSessionId` records explicit lineage
 * presence (from a validated correlation) — presence, never proof.
 */
import type { SnapshotComparison } from './comparison';
import type { ExecutionId, RepositoryId, RuntimeSessionId, SnapshotId } from './identity';

/** Observed difference across one execution observation window. Immutable value. */
export interface ObservedRepositoryChange {
  readonly executionId: ExecutionId;
  readonly repositoryId: RepositoryId;
  readonly baselineSnapshotId: SnapshotId;
  readonly observedSnapshotId: SnapshotId;
  readonly runtimeSessionId?: RuntimeSessionId;
  readonly comparison: SnapshotComparison;
  readonly observedAt: string;
}

/**
 * Structural + internal-consistency validity: present identifiers, a
 * comparison whose own baseline/current links agree with the top-level
 * snapshot links. A change whose comparison describes other snapshots is
 * invalid — links are checked, never assumed.
 */
export function isValidObservedRepositoryChange(value: unknown): value is ObservedRepositoryChange {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.executionId !== 'string' ||
    (record.executionId as string).length === 0 ||
    typeof record.repositoryId !== 'string' ||
    (record.repositoryId as string).length === 0 ||
    typeof record.baselineSnapshotId !== 'string' ||
    (record.baselineSnapshotId as string).length === 0 ||
    typeof record.observedSnapshotId !== 'string' ||
    (record.observedSnapshotId as string).length === 0 ||
    typeof record.observedAt !== 'string' ||
    (record.observedAt as string).length === 0
  ) {
    return false;
  }
  const comparison = record.comparison as SnapshotComparison | undefined;
  if (!comparison || typeof comparison !== 'object') return false;
  if (
    comparison.baselineSnapshotId !== record.baselineSnapshotId ||
    comparison.currentSnapshotId !== record.observedSnapshotId
  ) {
    return false;
  }
  if (record.runtimeSessionId !== undefined && typeof record.runtimeSessionId !== 'string') return false;
  return true;
}
