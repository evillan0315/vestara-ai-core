/**
 * VES-REPO-002 — snapshot/change-set relationships: baseline-aware,
 * declared vs observed scopes distinguished, snapshots metadata-bounded.
 */
import { describe, expect, it } from 'vitest';
import { isValidRepositoryChangeSet } from '../src/changeset';
import { isSnapshotOfRepository, isValidRepositorySnapshot } from '../src/snapshot';
import { dirtyPaths, isCleanState } from '../src/state';

describe('snapshot and change-set relationships', () => {
  it('snapshots bind to one repository and carry no contents', () => {
    const snapshot = {
      snapshotId: 's0',
      repositoryId: 'r1',
      head: 'abc123',
      branch: 'main',
      changedPaths: [{ path: 'a.ts', fingerprint: 'deadbeef' }],
      capturedAt: '2026-09-14T00:00:00.000Z',
      reason: 'execution-start' as const,
    };
    expect(isValidRepositorySnapshot(snapshot)).toBe(true);
    expect(isSnapshotOfRepository(snapshot, 'r1' as never)).toBe(true);
    expect(isSnapshotOfRepository(snapshot, 'r2' as never)).toBe(false);
    expect('contents' in snapshot).toBe(false);
    expect(isValidRepositorySnapshot({ ...snapshot, reason: 'checkpoint' })).toBe(false);
  });

  it('change sets require a baseline and separate declared from observed scope', () => {
    const scope = { level: 'package' as const, name: 'persistence' };
    const observed = { level: 'path' as const, name: 'store.ts', parent: scope };
    const changeset = {
      changeSetId: 'cs1',
      repositoryId: 'r1',
      executionId: 'e1',
      baselineSnapshotId: 's0',
      files: [{ path: 'store.ts', fate: 'modified' as const }],
      declaredScope: [scope],
      observedScope: [observed],
      startedAt: '2026-09-14T00:00:00.000Z',
      observedAt: '2026-09-14T00:01:00.000Z',
      attribution: 'vestara-execution' as const,
      confidence: 'CORRELATED' as const,
    };
    expect(isValidRepositoryChangeSet(changeset)).toBe(true);
    expect(changeset.declaredScope).not.toEqual(changeset.observedScope);
    // Baseline link is mandatory.
    expect(isValidRepositoryChangeSet({ ...changeset, baselineSnapshotId: '' })).toBe(false);
  });

  it('state observation exposes dirty paths without attribution', () => {
    const state = {
      repositoryId: 'r1',
      branch: 'main',
      head: 'abc123',
      workingTree: {
        clean: false,
        staged: [{ path: 'a.ts', difference: 'modified' as const, staged: true }],
        unstaged: [],
        untracked: [{ path: 'new.ts', difference: 'untracked' as const, staged: false }],
      },
      observedAt: '2026-09-14T00:00:00.000Z',
    };
    expect(isCleanState(state as never)).toBe(false);
    expect(dirtyPaths(state as never)).toEqual(['a.ts', 'new.ts']);
    expect('actor' in state).toBe(false);
    expect('executionId' in state).toBe(false);
    expect('sessionId' in state).toBe(false);
  });
});
