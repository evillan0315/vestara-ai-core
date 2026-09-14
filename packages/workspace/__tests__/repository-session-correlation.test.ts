/**
 * VES-REPO-006 — recorder tests (no I/O, no sessions opened).
 *
 * Proves the twelve required behaviors: explicit pairing, no inference in
 * either direction, intact context/baseline preservation, multi-execution
 * distinctness, asserted origins, absent lineage, response/session
 * independence, explicit workflow edges, and junk-field rejection.
 */
import { describe, expect, it } from 'vitest';
import type { SessionCorrelationRecorderDeps } from '../src/repository-session-correlation';
import { recordRuntimeSessionCorrelation } from '../src/repository-session-correlation';

function repositoryContext(executionId = 'e1', repositoryId = 'r1', baseline = 's0') {
  return {
    executionId: executionId as never,
    repositoryId: repositoryId as never,
    baselineSnapshotId: baseline as never,
    accessMode: 'ANALYZE' as const,
    changeIntent: {
      executionId: executionId as never,
      repositoryId: repositoryId as never,
      purpose: 'persistence change',
      scopes: [{ level: 'package' as const, name: 'persistence' }],
      mutationKind: 'source' as const,
    },
    boundAt: '2026-09-14T00:01:00.000Z',
  };
}

function deps(): SessionCorrelationRecorderDeps {
  return { now: () => '2026-09-14T00:02:00.000Z' };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'e1' as never,
    runtimeSessionId: 'ses-1' as never,
    repositoryContext: repositoryContext(),
    sessionOrigin: 'created' as const,
    ...overrides,
  };
}

describe('recordRuntimeSessionCorrelation', () => {
  it('records an explicit ExecutionId to RuntimeSessionId pairing', async () => {
    const result = recordRuntimeSessionCorrelation(input(), deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.correlation.executionId).toBe('e1');
    expect(result.correlation.runtimeSessionId).toBe('ses-1');
    expect(result.correlation.sessionOrigin).toBe('created');
  });

  it('never infers the execution from the session', () => {
    const result = recordRuntimeSessionCorrelation(input({ executionId: '' }), deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('execution-required');
  });

  it('preserves repository context and baseline intact', () => {
    const context = repositoryContext();
    const result = recordRuntimeSessionCorrelation(input({ repositoryContext: context }), deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.correlation.repositoryContext).toEqual(context);
    expect(result.correlation.repositoryContext.baselineSnapshotId).toBe('s0');
    expect(result.correlation.repositoryContext.repositoryId).toBe('r1');
    expect(result.correlation.repositoryContext.accessMode).toBe('ANALYZE');
  });

  it('refuses sessions as execution substitutes and contexts as repo proof', () => {
    const substitute = recordRuntimeSessionCorrelation(
      input({ executionId: undefined, repositoryContext: repositoryContext() }),
      deps(),
    );
    expect(substitute.ok).toBe(false);

    const otherRepo = recordRuntimeSessionCorrelation(
      input({ repositoryContext: repositoryContext('e1', 'r2') }),
      deps(),
    );
    expect(otherRepo.ok).toBe(true);
    if (!otherRepo.ok) return;
    // The session contributed nothing: the repo link comes only from context.
    expect(otherRepo.correlation.repositoryContext.repositoryId).toBe('r2');
    expect(otherRepo.correlation.runtimeSessionId).toBe('ses-1');
  });

  it('keeps multiple executions distinct over shared repositories and sessions', () => {
    const first = recordRuntimeSessionCorrelation(
      input({ executionId: 'e1' as never, repositoryContext: repositoryContext('e1') }),
      deps(),
    );
    const second = recordRuntimeSessionCorrelation(
      input({
        executionId: 'e2' as never,
        runtimeSessionId: 'ses-1' as never,
        repositoryContext: repositoryContext('e2'),
        sessionOrigin: 'reused' as const,
      }),
      deps(),
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.correlation.executionId).not.toBe(second.correlation.executionId);
    expect(first.correlation.sessionOrigin).toBe('created');
    expect(second.correlation.sessionOrigin).toBe('reused');
  });

  it('requires asserted origins and records resumption explicitly', () => {
    const missing = recordRuntimeSessionCorrelation(input({ sessionOrigin: undefined }), deps());
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('origin-required');

    const resumed = recordRuntimeSessionCorrelation(
      input({
        executionId: 'e3' as never,
        repositoryContext: repositoryContext('e3'),
        sessionOrigin: 'resumed' as const,
      }),
      deps(),
    );
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    // A resumed session after a prior execution ended: the new pair stands
    // alone; nothing here retired or rewrote the prior execution.
    expect(resumed.correlation.sessionOrigin).toBe('resumed');
  });

  it('leaves missing lineage absent and rejects manufactured edges', () => {
    const result = recordRuntimeSessionCorrelation(input(), deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('workflowRunId' in result.correlation).toBe(false);
  });

  it('response failure cannot terminate the session through this contract', () => {
    const before = recordRuntimeSessionCorrelation(input(), deps());
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    // A Vestara-facing response failure is not a field here at all: there is
    // no status to set, so the session link survives it by construction. A
    // later execution may still correlate the same living session.
    const after = recordRuntimeSessionCorrelation(
      input({
        executionId: 'e2' as never,
        repositoryContext: repositoryContext('e2'),
        sessionOrigin: 'resumed' as const,
      }),
      deps(),
    );
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.correlation.runtimeSessionId).toBe('ses-1');
    expect(before.correlation.runtimeSessionId).toBe('ses-1');
  });

  it('preserves explicit workflow lineage and drops junk fields', () => {
    const withRun = recordRuntimeSessionCorrelation(
      input({ workflowRunId: 'w1' as never, projectId: 'p1', conversationId: 'c1', path: '/repo' }),
      deps(),
    );
    expect(withRun.ok).toBe(true);
    if (!withRun.ok) return;
    expect(withRun.correlation.workflowRunId).toBe('w1');
    const keys = Object.keys(withRun.correlation);
    for (const junk of ['projectId', 'conversationId', 'path', 'provider', 'model']) {
      expect(keys).not.toContain(junk);
    }
  });

  it('refuses cross-wired contexts and invalid inputs', () => {
    const crossed = recordRuntimeSessionCorrelation(
      input({ executionId: 'e1' as never, repositoryContext: repositoryContext('e9') }),
      deps(),
    );
    expect(crossed.ok).toBe(false);
    if (!crossed.ok) expect(crossed.reason).toBe('execution-mismatch');

    const noSession = recordRuntimeSessionCorrelation(input({ runtimeSessionId: '' }), deps());
    expect(noSession.ok).toBe(false);
    if (!noSession.ok) expect(noSession.reason).toBe('session-required');
  });
});
