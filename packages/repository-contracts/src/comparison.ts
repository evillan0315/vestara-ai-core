/**
 * VES-REPO-002/004 — SnapshotComparison: observed difference, never causation.
 *
 * `compareSnapshots(S0, S1)` reports what differs between two observation
 * events. "S0 → S1 changed" means a change was observed between snapshots —
 * it must not be read as "an execution caused the change" (REPO-INV-008).
 * Attribution, verification binding, HEAD-drift policy, and external-mutation
 * policy consume this comparison later; none is implemented here.
 */
import type { SnapshotId } from './identity';
import type { RepositorySnapshot } from './snapshot';

/** Closed vocabulary of detectable snapshot differences. */
export type SnapshotChangeKind =
  | 'repository-mismatch'
  | 'head-changed'
  | 'branch-changed'
  | 'working-tree-changed'
  | 'staged-changed'
  | 'unstaged-changed'
  | 'untracked-changed'
  | 'became-dirty'
  | 'became-clean'
  | 'no-material-change';

export const SNAPSHOT_CHANGE_KINDS: readonly SnapshotChangeKind[] = [
  'repository-mismatch',
  'head-changed',
  'branch-changed',
  'working-tree-changed',
  'staged-changed',
  'unstaged-changed',
  'untracked-changed',
  'became-dirty',
  'became-clean',
  'no-material-change',
];

/**
 * Observed difference between a baseline and a current snapshot.
 * `changes` carries every detected kind; when nothing material differs it
 * carries exactly `['no-material-change']`. Snapshot identity is never
 * compared — S0 ≠ S1 as observation events regardless of equivalence.
 */
export interface SnapshotComparison {
  readonly baselineSnapshotId: SnapshotId;
  readonly currentSnapshotId: SnapshotId;
  readonly sameRepository: boolean;
  readonly changes: readonly SnapshotChangeKind[];
  readonly materialChange: boolean;
}

function partition(snapshot: RepositorySnapshot): {
  staged: Set<string>;
  unstaged: Set<string>;
  untracked: Set<string>;
  unpartitioned: string[];
} {
  const staged = new Set<string>();
  const unstaged = new Set<string>();
  const untracked = new Set<string>();
  const unpartitioned: string[] = [];
  for (const entry of snapshot.changedPaths) {
    if (entry.untracked === true) {
      untracked.add(entry.path);
    } else if (entry.staged === true) {
      staged.add(entry.path);
    } else if (entry.staged === false) {
      unstaged.add(entry.path);
    } else {
      unpartitioned.push(entry.path);
    }
  }
  return { staged, unstaged, untracked, unpartitioned };
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function multisetsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

/**
 * Pure structural comparison. Repository mismatch short-circuits: snapshots
 * from different repositories are incomparable, reported as material so
 * future consumers fail closed rather than assuming equivalence.
 */
export function compareSnapshots(baseline: RepositorySnapshot, current: RepositorySnapshot): SnapshotComparison {
  const sameRepository = baseline.repositoryId === current.repositoryId;
  if (!sameRepository) {
    return {
      baselineSnapshotId: baseline.snapshotId,
      currentSnapshotId: current.snapshotId,
      sameRepository,
      changes: ['repository-mismatch'],
      materialChange: true,
    };
  }

  const changes: SnapshotChangeKind[] = [];
  if ((baseline.head ?? null) !== (current.head ?? null)) changes.push('head-changed');
  if ((baseline.branch ?? null) !== (current.branch ?? null)) changes.push('branch-changed');

  const before = partition(baseline);
  const after = partition(current);
  const stagedChanged = !setsEqual(before.staged, after.staged);
  const unstagedChanged = !setsEqual(before.unstaged, after.unstaged);
  const untrackedChanged = !setsEqual(before.untracked, after.untracked);
  const unpartitionedChanged = !multisetsEqual(before.unpartitioned, after.unpartitioned);
  if (stagedChanged) changes.push('staged-changed');
  if (unstagedChanged) changes.push('unstaged-changed');
  if (untrackedChanged) changes.push('untracked-changed');
  if (stagedChanged || unstagedChanged || untrackedChanged || unpartitionedChanged) {
    changes.push('working-tree-changed');
  }

  const wasClean = baseline.changedPaths.length === 0;
  const isClean = current.changedPaths.length === 0;
  if (wasClean && !isClean) changes.push('became-dirty');
  if (!wasClean && isClean) changes.push('became-clean');

  if (changes.length === 0) changes.push('no-material-change');
  return {
    baselineSnapshotId: baseline.snapshotId,
    currentSnapshotId: current.snapshotId,
    sameRepository,
    changes,
    materialChange: !changes.includes('no-material-change'),
  };
}

/** True when the comparison establishes no material repository-state change. */
export function isNoChangeComparison(comparison: SnapshotComparison): boolean {
  return comparison.sameRepository && !comparison.materialChange;
}
