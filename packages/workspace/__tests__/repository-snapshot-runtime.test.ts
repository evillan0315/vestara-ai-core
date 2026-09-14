/**
 * VES-REPO-004 — snapshot capture tests (fake observation authority).
 *
 * Covers: clean/dirty capture, unique snapshot identity, digest equivalence,
 * unstable/failure refusal, compare integration, and absence of attribution.
 */
import { contentHash } from '@vestara/diff-engine';
import type { RepositoryState } from '@vestara/repository-contracts';
import { compareSnapshots } from '@vestara/repository-contracts';
import { describe, expect, it } from 'vitest';
import type { ObserveRepositoryResult } from '../src/repository-discovery-adapter';
import type { SnapshotRuntimeDeps } from '../src/repository-snapshot-runtime';
import { captureRepositorySnapshot, pathDescriptor, snapshotStateDigest } from '../src/repository-snapshot-runtime';

function state(overrides: Partial<RepositoryState> = {}): RepositoryState {
  return {
    repositoryId: 'r1' as never,
    branch: 'main',
    head: 'aaa',
    workingTree: { clean: true, staged: [], unstaged: [], untracked: [] },
    observedAt: '2026-09-14T00:00:00.000Z',
    ...overrides,
  };
}

function identity() {
  return {
    repositoryId: 'r1' as never,
    vcs: 'git' as const,
    root: '/repo' as never,
  };
}

function makeDeps(
  observations: ObserveRepositoryResult[],
  idPrefix = 'snap-test',
): SnapshotRuntimeDeps & { calls: number } {
  let calls = 0;
  let counter = 0;
  const deps = {
    calls: 0,
    observe: async () => {
      const next = observations[Math.min(calls, observations.length - 1)] as ObserveRepositoryResult;
      calls += 1;
      deps.calls = calls;
      return next;
    },
    generateId: () => `${idPrefix}-${++counter}` as never,
    digest: (canonical: string) => contentHash(canonical),
    now: () => '2026-09-14T00:00:00.000Z',
  };
  return deps;
}

function okObservation(customState?: RepositoryState): ObserveRepositoryResult {
  return { ok: true, identity: identity(), state: customState ?? state() };
}

describe('captureRepositorySnapshot', () => {
  it('captures a clean state with an empty path list', async () => {
    const result = await captureRepositorySnapshot({ reason: 'execution-start' }, makeDeps([okObservation()]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.snapshotId).toBe('snap-test-1');
    expect(result.snapshot.repositoryId).toBe('r1');
    expect(result.snapshot.head).toBe('aaa');
    expect(result.snapshot.branch).toBe('main');
    expect(result.snapshot.changedPaths).toEqual([]);
    expect(result.snapshot.reason).toBe('execution-start');
    // No attribution anywhere on the snapshot.
    const keys = JSON.stringify(result.snapshot);
    expect(keys).not.toContain('actor');
    expect(keys).not.toContain('executionId');
    expect(keys).not.toContain('attribution');
  });

  it('captures partitions with content-hashed fingerprints', async () => {
    const dirty = state({
      workingTree: {
        clean: false,
        staged: [{ path: 'a.ts', difference: 'modified', staged: true }],
        unstaged: [{ path: 'b.ts', difference: 'added', staged: false }],
        untracked: [{ path: 'c.ts', difference: 'untracked', staged: false }],
      },
    });
    const result = await captureRepositorySnapshot({ reason: 'execution-end' }, makeDeps([okObservation(dirty)]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.changedPaths).toEqual([
      { path: 'a.ts', fingerprint: contentHash(pathDescriptor('a.ts', 'staged')), staged: true },
      { path: 'b.ts', fingerprint: contentHash(pathDescriptor('b.ts', 'unstaged')), staged: false },
      { path: 'c.ts', fingerprint: contentHash(pathDescriptor('c.ts', 'untracked')), untracked: true },
    ]);
  });

  it('assigns unique identities to equivalent-state captures', async () => {
    const deps = makeDeps([okObservation(), okObservation()]);
    const first = await captureRepositorySnapshot({ reason: 'execution-start' }, deps);
    const second = await captureRepositorySnapshot({ reason: 'execution-end' }, deps);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.snapshot.snapshotId).not.toBe(second.snapshot.snapshotId);
    expect(snapshotStateDigest(first.snapshot)).toBe(snapshotStateDigest(second.snapshot));
  });

  it('excludes identity and timestamps from the state digest', async () => {
    const deps = makeDeps([okObservation()]);
    const result = await captureRepositorySnapshot({ reason: 'manual' }, deps);
    if (!result.ok) return;
    const renamed = {
      ...result.snapshot,
      snapshotId: 'other' as never,
      capturedAt: '2030-01-01T00:00:00.000Z',
    };
    expect(snapshotStateDigest(renamed)).toBe(snapshotStateDigest(result.snapshot));
  });

  it('refuses unstable observations without producing a snapshot', async () => {
    const unstable: ObserveRepositoryResult = {
      ok: false,
      reason: 'unstable-observation',
      detail: 'HEAD moved',
    };
    const result = await captureRepositorySnapshot({ reason: 'execution-start' }, makeDeps([unstable]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unstable-observation');
    expect('snapshot' in result).toBe(false);
  });

  it('passes observation failures through unchanged', async () => {
    for (const reason of ['repository-vanished', 'git-failure', 'binding-failed', 'non-git-path'] as const) {
      const failure: ObserveRepositoryResult = { ok: false, reason, detail: `${reason} detail` };
      const result = await captureRepositorySnapshot({ reason: 'verification-start' }, makeDeps([failure]));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).toBe(reason);
      expect(result.detail).toBe(`${reason} detail`);
    }
  });

  it('captured snapshots feed comparison: clean to dirty end to end', async () => {
    const dirty = state({
      workingTree: {
        clean: false,
        staged: [],
        unstaged: [{ path: 'work.ts', difference: 'modified', staged: false }],
        untracked: [],
      },
    });
    const deps = makeDeps([okObservation(), okObservation(dirty)], 'snap-e2e');
    const s0 = await captureRepositorySnapshot({ reason: 'execution-start' }, deps);
    const s1 = await captureRepositorySnapshot({ reason: 'execution-end' }, deps);
    if (!s0.ok || !s1.ok) return;
    const comparison = compareSnapshots(s0.snapshot, s1.snapshot);
    expect(comparison.changes).toContain('became-dirty');
    expect(comparison.changes).toContain('unstaged-changed');
    expect(comparison.materialChange).toBe(true);
    // Digest tracks state: changed state ⇒ changed digest.
    expect(snapshotStateDigest(s0.snapshot)).not.toBe(snapshotStateDigest(s1.snapshot));
  });
});
