/**
 * VES-REPO-005 — binder tests (fake capture authority).
 *
 * Proves: exact id preservation, explicit mode/intent, fail-closed binding,
 * execution distinctness over shared baselines, no session/path inference.
 */
import { describe, expect, it } from 'vitest';
import type { ExecutionRepositoryContextDeps } from '../src/repository-execution-context';
import { bindExecutionRepositoryContext } from '../src/repository-execution-context';
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

function snapshot(repositoryId = 'r1', snapshotId = 's0') {
  return {
    snapshotId: snapshotId as never,
    repositoryId: repositoryId as never,
    head: 'aaa',
    branch: 'main',
    changedPaths: [],
    capturedAt: '2026-09-14T00:00:00.000Z',
    reason: 'execution-start' as const,
  };
}

function makeDeps(captured: CaptureSnapshotResult): ExecutionRepositoryContextDeps {
  return {
    capture: async () => captured,
    now: () => '2026-09-14T00:01:00.000Z',
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'e1' as never,
    accessMode: 'ANALYZE' as const,
    changeIntent: intent(),
    observe: {},
    ...overrides,
  };
}

describe('bindExecutionRepositoryContext', () => {
  it('preserves the exact repository and baseline snapshot ids', async () => {
    const result = await bindExecutionRepositoryContext(input(), makeDeps({ ok: true, snapshot: snapshot() }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.repositoryId).toBe('r1');
    expect(result.context.baselineSnapshotId).toBe('s0');
    expect(result.context.accessMode).toBe('ANALYZE');
    expect(result.context.changeIntent).toEqual(intent());
    expect(result.context.executionId).toBe('e1');
  });

  it('fails closed when observation cannot establish a baseline', async () => {
    for (const reason of ['unstable-observation', 'repository-vanished', 'git-failure', 'non-git-path'] as const) {
      const result = await bindExecutionRepositoryContext(
        input(),
        makeDeps({ ok: false, reason, detail: `${reason} detail` }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).toBe(reason);
      expect('context' in result).toBe(false);
    }
  });

  it('refuses intent/execution and intent/repository divergence', async () => {
    const deps = makeDeps({ ok: true, snapshot: snapshot() });
    const wrongExecution = await bindExecutionRepositoryContext(input({ changeIntent: intent('e9') }), deps);
    expect(wrongExecution.ok).toBe(false);
    if (!wrongExecution.ok) expect(wrongExecution.reason).toBe('intent-mismatch');

    const wrongRepo = await bindExecutionRepositoryContext(input({ changeIntent: intent('e1', 'r2') }), deps);
    expect(wrongRepo.ok).toBe(false);
    if (!wrongRepo.ok) expect(wrongRepo.reason).toBe('intent-mismatch');
  });

  it('requires explicit access mode and valid intent', async () => {
    const deps = makeDeps({ ok: true, snapshot: snapshot() });
    const noMode = await bindExecutionRepositoryContext(input({ accessMode: undefined }), deps);
    expect(noMode.ok).toBe(false);
    if (!noMode.ok) expect(noMode.reason).toBe('access-mode-required');

    const badIntent = await bindExecutionRepositoryContext(input({ changeIntent: { ...intent(), scopes: [] } }), deps);
    expect(badIntent.ok).toBe(false);
    if (!badIntent.ok) expect(badIntent.reason).toBe('invalid-intent');
  });

  it('lets distinct executions share a repository and baseline without merging identity', async () => {
    const first = await bindExecutionRepositoryContext(
      input({ executionId: 'e1' as never, changeIntent: intent('e1') }),
      makeDeps({ ok: true, snapshot: snapshot('r1', 's0') }),
    );
    const second = await bindExecutionRepositoryContext(
      input({ executionId: 'e2' as never, changeIntent: intent('e2') }),
      makeDeps({ ok: true, snapshot: snapshot('r1', 's0') }),
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.context.baselineSnapshotId).toBe(second.context.baselineSnapshotId);
    expect(first.context.executionId).not.toBe(second.context.executionId);
  });

  it('carries no session, path, project, or provider identity', async () => {
    const result = await bindExecutionRepositoryContext(input(), makeDeps({ ok: true, snapshot: snapshot() }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const keys = Object.keys(result.context);
    expect(keys).toEqual(
      expect.arrayContaining([
        'executionId',
        'repositoryId',
        'baselineSnapshotId',
        'accessMode',
        'changeIntent',
        'boundAt',
      ]),
    );
    for (const forbidden of ['runtimeSessionId', 'sessionId', 'path', 'projectId', 'provider', 'model']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
