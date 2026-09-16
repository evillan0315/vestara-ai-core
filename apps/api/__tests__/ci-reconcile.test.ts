import { describe, expect, it } from 'vitest';
import { reconcileStaleCIWaits } from '../src/ci-reconcile.js';
import type { CICorrelationWaitReadDto } from '../src/routes/ci.js';
import type { WorkspaceContext } from '../src/workspace-context.js';

const ctx = {} as WorkspaceContext;

function wait(over: Partial<CICorrelationWaitReadDto> = {}): CICorrelationWaitReadDto {
  return {
    taskId: 'task-1',
    repository: 'vestara/core',
    branch: 'vestara/task-1',
    commitSha: 'abc',
    waitRef: 'ci-corr:vestara/core:abc:task-1',
    suspendedAt: '2026-09-16T00:00:00.000Z',
    deadline: { state: 'stale', deadlineMs: 2_700_000, ageMs: 3_600_000, reason: 'Unresolved for 60m' },
    ...over,
  };
}

describe('active CI wait reconciliation (H7)', () => {
  it('ignores non-stale waits', async () => {
    const summary = await reconcileStaleCIWaits(ctx, [
      wait({ deadline: { state: 'active', deadlineMs: 2_700_000, ageMs: 1_000, reason: 'Within deadline' } }),
    ]);
    expect(summary.inspected).toBe(1);
    expect(summary.stale).toBe(0);
    expect(summary.decisions).toHaveLength(0);
  });

  it('holds a stale wait when no run can be discovered', async () => {
    const summary = await reconcileStaleCIWaits(ctx, [wait()], { findRuns: async () => undefined });
    expect(summary.stale).toBe(1);
    expect(summary.held).toBe(1);
    expect(summary.decisions[0]?.action).toBe('hold');
  });

  it('attaches a discovered run and never resumes', async () => {
    const attached: Array<{ waitRef: string; runRef: string }> = [];
    const summary = await reconcileStaleCIWaits(ctx, [wait()], {
      findRuns: async () => ({ runId: 'run-7', status: 'completed', conclusion: 'failure' }),
      attachRun: async (waitRef, runRef) => {
        attached.push({ waitRef, runRef });
      },
    });
    expect(attached).toEqual([{ waitRef: 'ci-corr:vestara/core:abc:task-1', runRef: 'run-7' }]);
    expect(summary.attached).toBe(1);
    expect(summary.decisions[0]?.action).toBe('attach-run');
  });

  it('awaits completion when a run is already attached (no re-attach)', async () => {
    let attachCalls = 0;
    const summary = await reconcileStaleCIWaits(ctx, [wait({ runRef: 'run-7' })], {
      findRuns: async () => ({ runId: 'run-7' }),
      attachRun: async () => {
        attachCalls += 1;
      },
    });
    expect(attachCalls).toBe(0);
    expect(summary.held).toBe(1);
    expect(summary.decisions[0]?.action).toBe('await-completion');
  });

  it('counts a failed attach as held', async () => {
    const summary = await reconcileStaleCIWaits(ctx, [wait()], {
      findRuns: async () => ({ runId: 'run-7' }),
      attachRun: async () => {
        throw new Error('coordinator unavailable');
      },
    });
    expect(summary.attached).toBe(0);
    expect(summary.held).toBe(1);
  });
});
