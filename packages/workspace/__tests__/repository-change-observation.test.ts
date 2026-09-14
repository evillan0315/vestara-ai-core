/**
 * VES-REPO-007 — closer tests (fake capture, real comparison).
 *
 * Proves the sixteen required behaviors: exact-baseline use, same-repo S1,
 * surviving partitions/drift, honest no-change, session/mode/intent
 * non-causation, outside-intent observation, and fail-closed paths.
 */
import type { RepositorySnapshot } from '@vestara/repository-contracts';
import { compareSnapshots } from '@vestara/repository-contracts';
import { describe, expect, it } from 'vitest';
import type { ChangeObservationDeps } from '../src/repository-change-observation';
import { closeExecutionObservation } from '../src/repository-change-observation';
import type { CaptureSnapshotResult } from '../src/repository-snapshot-runtime';

function intent(executionId = 'e1', repositoryId = 'r1') {
  return {
    executionId: executionId as never,
    repositoryId: repositoryId as never,
    purpose: 'persistence change',
    scopes: [{ level: 'package' as const, name: 'persistence' }],
    mutationKind: 'source' as const,
  };
}

function context(executionId = 'e1', accessMode: 'OBSERVE' | 'ANALYZE' | 'VERIFY' | 'MUTATE' = 'ANALYZE') {
  return {
    executionId: executionId as never,
    repositoryId: 'r1' as never,
    baselineSnapshotId: 's0' as never,
    accessMode,
    changeIntent: intent(executionId),
    boundAt: '2026-09-14T00:01:00.000Z',
  };
}

function snapshot(snapshotId = 's0', overrides: Partial<RepositorySnapshot> = {}): RepositorySnapshot {
  return {
    snapshotId: snapshotId as never,
    repositoryId: 'r1' as never,
    head: 'aaa',
    branch: 'main',
    changedPaths: [],
    capturedAt: '2026-09-14T00:00:00.000Z',
    reason: 'execution-start',
    ...overrides,
  };
}

function correlation(executionId = 'e1', baseline = 's0') {
  return {
    executionId: executionId as never,
    runtimeSessionId: 'ses-1' as never,
    repositoryContext: context(executionId),
    sessionOrigin: 'created' as const,
    correlatedAt: '2026-09-14T00:02:00.000Z',
  };
}

function makeDeps(s1: CaptureSnapshotResult) {
  const seen: unknown[] = [];
  const deps: ChangeObservationDeps = {
    capture: async (input) => {
      seen.push(input);
      return s1;
    },
    compare: (a, b) => compareSnapshots(a, b),
    now: () => '2026-09-14T00:03:00.000Z',
  };
  return { deps, seen };
}

function s1Ok(current: RepositorySnapshot): CaptureSnapshotResult {
  return { ok: true, snapshot: current };
}

describe('closeExecutionObservation', () => {
  it('uses the exact baseline and captures S1 as execution-end', async () => {
    const { deps, seen } = makeDeps(s1Ok(snapshot('s1')));
    const result = await closeExecutionObservation(
      { context: context() as never, baseline: snapshot('s0'), observe: {} },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.change.baselineSnapshotId).toBe('s0');
    expect(result.change.observedSnapshotId).toBe('s1');
    expect(result.change.repositoryId).toBe('r1');
    expect(result.change.executionId).toBe('e1');
    expect(result.change.comparison.baselineSnapshotId).toBe('s0');
    expect((seen[0] as { reason: string }).reason).toBe('execution-end');
  });

  it('reports changed paths with surviving partitions and drift', async () => {
    const later = snapshot('s1', {
      head: 'bbb',
      branch: 'dev',
      changedPaths: [
        { path: 'a.ts', fingerprint: 'f1', staged: true },
        { path: 'b.ts', fingerprint: 'f2', staged: false },
        { path: 'c.ts', fingerprint: 'f3', untracked: true },
      ],
    });
    const { deps } = makeDeps(s1Ok(later));
    const result = await closeExecutionObservation(
      { context: context() as never, baseline: snapshot('s0'), observe: {} },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.change.comparison.changes).toEqual(
      expect.arrayContaining([
        'head-changed',
        'branch-changed',
        'staged-changed',
        'unstaged-changed',
        'untracked-changed',
        'working-tree-changed',
        'became-dirty',
      ]),
    );
  });

  it('preserves no-change facts without manufacturing ownership', async () => {
    const { deps } = makeDeps(s1Ok(snapshot('s1')));
    const result = await closeExecutionObservation(
      { context: context() as never, baseline: snapshot('s0'), observe: {} },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.change.comparison.changes).toEqual(['no-material-change']);
    expect(result.change.comparison.materialChange).toBe(false);
    const keys = Object.keys(result.change);
    for (const forbidden of ['attribution', 'actor', 'causedBy', 'violation', 'confidence']) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('carries session lineage presence without causation', async () => {
    const { deps } = makeDeps(s1Ok(snapshot('s1')));
    const result = await closeExecutionObservation(
      {
        context: context() as never,
        baseline: snapshot('s0'),
        observe: {},
        sessionCorrelation: correlation() as never,
      },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.change.runtimeSessionId).toBe('ses-1');
    expect(result.change.comparison.materialChange).toBe(false);
  });

  it('treats MUTATE and OBSERVE closures identically: evidence, never verdicts', async () => {
    const dirty = snapshot('s1', { changedPaths: [{ path: 'x.ts', fingerprint: 'f', staged: false }] });
    for (const mode of ['MUTATE', 'OBSERVE'] as const) {
      const { deps } = makeDeps(s1Ok(dirty));
      const result = await closeExecutionObservation(
        { context: context('e1', mode) as never, baseline: snapshot('s0'), observe: {} },
        deps,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.change.comparison.materialChange).toBe(true);
      expect('violation' in result.change).toBe(false);
      expect('actor' in result.change).toBe(false);
    }
  });

  it('keeps outside-intent paths as observation, not violation', async () => {
    const outside = snapshot('s1', { changedPaths: [{ path: 'unrelated/other.ts', fingerprint: 'f', staged: false }] });
    const { deps } = makeDeps(s1Ok(outside));
    const result = await closeExecutionObservation(
      { context: context() as never, baseline: snapshot('s0'), observe: {} },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.change.comparison.materialChange).toBe(true);
    expect('violation' in result.change).toBe(false);
  });

  it('fails closed on mismatch, missing, and cross-wired baselines', async () => {
    const { deps } = makeDeps(s1Ok(snapshot('s1')));
    const wrongId = await closeExecutionObservation(
      { context: context() as never, baseline: snapshot('s9'), observe: {} },
      deps,
    );
    expect(wrongId.ok).toBe(false);
    if (!wrongId.ok) expect(wrongId.reason).toBe('baseline-mismatch');

    const wrongRepo = await closeExecutionObservation(
      { context: context() as never, baseline: snapshot('s0', { repositoryId: 'r2' as never }), observe: {} },
      deps,
    );
    expect(wrongRepo.ok).toBe(false);

    const missing = await closeExecutionObservation(
      // biome-ignore lint/suspicious/noExplicitAny: exercises absent-baseline refusal
      { context: context() as never, baseline: undefined as any, observe: {} },
      deps,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('baseline-required');
  });

  it('fails closed when S1 names another repository or capture fails', async () => {
    const moved = makeDeps(s1Ok(snapshot('s1', { repositoryId: 'r2' as never })));
    const mismatch = await closeExecutionObservation(
      { context: context() as never, baseline: snapshot('s0'), observe: {} },
      moved.deps,
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.reason).toBe('repository-mismatch');

    const failed = makeDeps({ ok: false, reason: 'unstable-observation', detail: 'HEAD moved' });
    const refused = await closeExecutionObservation(
      { context: context() as never, baseline: snapshot('s0'), observe: {} },
      failed.deps,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe('unstable-observation');
  });

  it('refuses foreign session correlations', async () => {
    const { deps } = makeDeps(s1Ok(snapshot('s1')));
    const result = await closeExecutionObservation(
      {
        context: context() as never,
        baseline: snapshot('s0'),
        observe: {},
        sessionCorrelation: correlation('e9') as never,
      },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('correlation-mismatch');
  });
});
