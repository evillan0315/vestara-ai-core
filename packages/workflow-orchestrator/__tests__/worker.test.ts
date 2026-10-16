import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SubprocessTaskDispatcher } from '../src/subprocess-dispatcher';
import type { OrchestratedProject, TaskDispatcher, WorkflowTask } from '../src/types';
import { runWithConcurrency, WorkerPool } from '../src/worker-pool';

const WORKER_SCRIPT = path.resolve(__dirname, '../dist/workers/subprocess-worker.js');
const FIXTURE_EXECUTOR = path.resolve(__dirname, '../fixtures/executor.cjs');

function task(overrides?: Partial<WorkflowTask>): WorkflowTask {
  return {
    id: 'task-1',
    planId: 'plan-1',
    summary: 'Implement',
    description: 'Work',
    files: ['a.ts'],
    dependencies: [],
    status: 'pending',
    effort: 'medium',
    requiredCapabilities: ['code-generation'],
    revisionCount: 0,
    attemptCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const PROJECT = { id: 'project-1' } as OrchestratedProject;

describe('runWithConcurrency (PCS-025 §12)', () => {
  it('bounds concurrent execution to the limit', async () => {
    let active = 0;
    let peak = 0;
    const results: string[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      results.push(String(item));
    });
    expect(peak).toBe(2);
    expect(results.sort()).toEqual(['1', '2', '3', '4', '5', '6']);
  });
});

describe('WorkerPool', () => {
  class CountingDispatcher implements TaskDispatcher {
    calls = 0;
    constructor(readonly id: string) {}
    async dispatch() {
      this.calls += 1;
      return { status: 'completed', agentId: this.id };
    }
  }

  it('round-robins dispatch across workers', async () => {
    const w1 = new CountingDispatcher('w1');
    const w2 = new CountingDispatcher('w2');
    const pool = new WorkerPool({ workers: [w1, w2] });
    await pool.dispatch(task(), PROJECT);
    await pool.dispatch(task(), PROJECT);
    await pool.dispatch(task(), PROJECT);
    expect(w1.calls).toBe(2);
    expect(w2.calls).toBe(1);
  });

  it('requires at least one worker', () => {
    expect(() => new WorkerPool({ workers: [] })).toThrow(/at least one worker/);
  });

  it('dispatches a set of tasks with bounded concurrency', async () => {
    const workers = Array.from({ length: 2 }, () => new CountingDispatcher('w'));
    const pool = new WorkerPool({ workers, maxConcurrent: 1 });
    const tasks = Array.from({ length: 4 }, (_, i) => task({ id: `t-${i}` }));
    await pool.dispatchAll(tasks, PROJECT);
    expect(workers.reduce((sum, w) => sum + w.calls, 0)).toBe(4);
  });
});

describe('SubprocessTaskDispatcher (remote worker contract)', () => {
  it('executes a task in a child process (default worker)', async () => {
    const dispatcher = new SubprocessTaskDispatcher({ workerScript: WORKER_SCRIPT });
    const result = await dispatcher.dispatch(task(), PROJECT);
    expect(result.status).toBe('completed');
    expect(result.output).toContain('worker:dispatch');
  });

  it('routes dispatch/review/test through an injected executor module', async () => {
    const dispatcher = new SubprocessTaskDispatcher({ workerScript: WORKER_SCRIPT, executorModule: FIXTURE_EXECUTOR });

    const dispatch = await dispatcher.dispatch(task(), PROJECT);
    expect(dispatch.status).toBe('completed');
    expect(dispatch.output).toBe('fixture:Implement');
    expect(dispatch.agentId).toBe('remote-worker');

    const review = await dispatcher.review(task(), PROJECT, [{ taskId: 'task-1' }]);
    expect(review.decision).toBe('changes-requested');
    expect(review.feedback).toBe('fixture feedback');

    const test = await dispatcher.test(task(), PROJECT);
    expect(test.status).toBe('failed');
    expect(test.report).toEqual({ fixture: true });
  });

  it('propagates executor failures as a failed dispatch', async () => {
    const dispatcher = new SubprocessTaskDispatcher({ workerScript: WORKER_SCRIPT, executorModule: FIXTURE_EXECUTOR });
    const result = await dispatcher.dispatch(task({ summary: 'Boom' }), PROJECT);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('fixture failure');
  });
});
