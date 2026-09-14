/**
 * VES-REPO-002 — RepositorySnapshot: the future state-binding anchor
 * (REPO-INV-008, REPO-INV-009).
 *
 * A snapshot is a bounded baseline captured at a lifecycle boundary
 * (execution-start, verification-start, execution-end, manual). It is
 * metadata-bounded: path fingerprints, never repository contents.
 */
import type { RepositoryId, SnapshotId } from './identity';

/** Lifecycle boundary that caused the capture. Closed vocabulary. */
export type SnapshotReason = 'execution-start' | 'verification-start' | 'execution-end' | 'manual';

export const SNAPSHOT_REASONS: readonly SnapshotReason[] = [
  'execution-start',
  'verification-start',
  'execution-end',
  'manual',
];

/**
 * One path's fingerprint within a snapshot. The fingerprint is an opaque
 * content hash — sufficient for comparison, never the content itself.
 */
export interface PathState {
  readonly path: string;
  readonly fingerprint?: string;
  readonly untracked?: boolean;
  /**
   * Staged at capture (meaningful only when `untracked` is not true).
   * Absent on pre-partition snapshots — comparison treats flag-less paths
   * as unknown-partition (working-tree signal only, never per-list signal).
   */
  readonly staged?: boolean;
}

/**
 * Bounded baseline. Execution baselines and verification bindings reference
 * this by `snapshotId`; they never embed repository contents.
 */
export interface RepositorySnapshot {
  readonly snapshotId: SnapshotId;
  readonly repositoryId: RepositoryId;
  readonly head?: string;
  readonly branch?: string;
  readonly changedPaths: readonly PathState[];
  readonly capturedAt: string;
  readonly reason: SnapshotReason;
}

/** True when the snapshot belongs to the given repository. Pure. */
export function isSnapshotOfRepository(snapshot: RepositorySnapshot, repositoryId: RepositoryId): boolean {
  return snapshot.snapshotId.length > 0 && snapshot.repositoryId === repositoryId;
}

/** Minimal structural validation — identity link, reason, and capture time. */
export function isValidRepositorySnapshot(value: unknown): value is RepositorySnapshot {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.snapshotId === 'string' &&
    (record.snapshotId as string).length > 0 &&
    typeof record.repositoryId === 'string' &&
    (record.repositoryId as string).length > 0 &&
    typeof record.capturedAt === 'string' &&
    (SNAPSHOT_REASONS as readonly string[]).includes(record.reason as string) &&
    Array.isArray(record.changedPaths)
  );
}
