/**
 * VES-REPO-004 — comparison semantics: difference without causation.
 */
import { describe, expect, it } from 'vitest';
import { compareSnapshots, isNoChangeComparison } from '../src/comparison';
import type { RepositorySnapshot } from '../src/snapshot';

function snapshot(overrides: Partial<RepositorySnapshot> = {}): RepositorySnapshot {
  return {
    snapshotId: 's0' as never,
    repositoryId: 'r1' as never,
    head: 'aaa',
    branch: 'main',
    changedPaths: [],
    capturedAt: '2026-09-14T00:00:00.000Z',
    reason: 'execution-start',
    ...overrides,
  };
}

describe('compareSnapshots', () => {
  it('reports no material change for equivalent states with distinct identities', () => {
    const s0 = snapshot({ snapshotId: 's0' as never });
    const s1 = snapshot({ snapshotId: 's1' as never });
    const comparison = compareSnapshots(s0, s1);
    expect(comparison.sameRepository).toBe(true);
    expect(comparison.changes).toEqual(['no-material-change']);
    expect(comparison.materialChange).toBe(false);
    expect(isNoChangeComparison(comparison)).toBe(true);
    // Identity is never compared: distinct ids, equivalent state.
    expect(s0.snapshotId).not.toBe(s1.snapshotId);
  });

  it('detects HEAD and branch drift independently', () => {
    const headDrift = compareSnapshots(snapshot(), snapshot({ snapshotId: 's1' as never, head: 'bbb' }));
    expect(headDrift.changes).toContain('head-changed');
    expect(headDrift.materialChange).toBe(true);

    const branchDrift = compareSnapshots(snapshot(), snapshot({ snapshotId: 's1' as never, branch: 'dev' }));
    expect(branchDrift.changes).toContain('branch-changed');
  });

  it('detects staged, unstaged, and untracked set changes with the aggregate flag', () => {
    const comparison = compareSnapshots(
      snapshot(),
      snapshot({
        snapshotId: 's1' as never,
        changedPaths: [
          { path: 'a.ts', staged: true },
          { path: 'b.ts', staged: false },
          { path: 'c.ts', untracked: true },
        ],
      }),
    );
    expect(comparison.changes).toEqual(
      expect.arrayContaining(['staged-changed', 'unstaged-changed', 'untracked-changed', 'working-tree-changed']),
    );
    expect(comparison.changes).toContain('became-dirty');
  });

  it('detects clean to dirty and dirty to clean transitions', () => {
    const dirty = snapshot({
      snapshotId: 's1' as never,
      changedPaths: [{ path: 'a.ts', staged: false }],
    });
    expect(compareSnapshots(snapshot(), dirty).changes).toContain('became-dirty');
    expect(compareSnapshots(dirty, snapshot({ snapshotId: 's2' as never })).changes).toContain('became-clean');
  });

  it('short-circuits repository mismatch as material without causation claims', () => {
    const comparison = compareSnapshots(
      snapshot(),
      snapshot({ snapshotId: 's1' as never, repositoryId: 'r2' as never }),
    );
    expect(comparison.sameRepository).toBe(false);
    expect(comparison.changes).toEqual(['repository-mismatch']);
    expect(comparison.materialChange).toBe(true);
    expect(isNoChangeComparison(comparison)).toBe(false);
  });
});
