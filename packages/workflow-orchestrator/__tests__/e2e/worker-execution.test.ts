import type { Database } from 'sql.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ExecutionAttemptLedger } from '../../src/distributed/execution-attempt';
import { inlineExecutor } from '../../src/distributed/worker-node';
import type { WorkflowTask } from '../../src/types';
import { createScenario, type WorkflowScenarioBuilder } from '../e2e-support/harness';
import { deferred, WorkerScenarioHarness } from '../e2e-support/worker-harness';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

function task(overrides?: Partial<WorkflowTask>): WorkflowTask {
  return {
    id: 'task-1',
    planId: 'plan-1',
    summary: 'Implement',
    description: 'Work',
    files: ['src/a.ts'],
    dependencies: [],
    status: 'pending',
    effort: 'medium',
    requiredCapabilities: ['code-generation'],
    revisionCount: 0,
    attemptCount: 0,
    createdAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

const PROJECT = { id: 'project-1', repoPath: '/repo', workspaceId: 'ws' } as const;

const scenarios: WorkflowScenarioBuilder[] = [];

afterEach(() => {
  for (const scenario of scenarios.splice(0)) scenario.dispose();
});

describe('WFO-E2E-001D worker execution and lease authority', () => {
  it('accepts at most one result per task and recovers a re-dispatched execution without duplicate output', async () => {
    let calls = 0;
    const harness = new WorkerScenarioHarness(new SQL.Database());
    await harness.addNode(
      'node-a',
      inlineExecutor({
        dispatch: async () => {
          calls += 1;
          return { status: 'completed', agentId: 'a' };
        },
      }),
    );

    const first = await harness.cluster.dispatch(task(), PROJECT as never);
    const second = await harness.cluster.dispatch(task(), PROJECT as never);

    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');
    expect(calls).toBe(1); // executionId idempotency — no duplicate execution
    expect(harness.cluster.attempts.acceptedAttempt('task-1')).toBeDefined();
  });

  it('lets a worker finish its active task while draining and schedules nothing new to it', async () => {
    const gate = deferred<{ status: 'completed'; agentId: string }>();
    const harness = new WorkerScenarioHarness(new SQL.Database());
    await harness.addNode('node-a', inlineExecutor({ dispatch: () => gate.promise }));

    const pending = harness.cluster.dispatch(task(), PROJECT as never);
    await harness.registry.disableScheduling('node-a');
    expect((await harness.registry.list()).find((node) => node.id === 'node-a')?.status).toBe('draining');

    // A draining worker receives no new task.
    await expect(
      harness.cluster.dispatch(task({ id: 'task-2', summary: 'Other work' }), PROJECT as never),
    ).rejects.toThrow(/No online worker/);

    // The in-flight task finishes while draining.
    gate.resolve({ status: 'completed', agentId: 'a' });
    expect((await pending).status).toBe('completed');

    // Once its lease is released the drain completes → offline.
    expect((await harness.registry.list()).find((node) => node.id === 'node-a')?.status).toBe('offline');
  });

  it('preserves prior execution attempts when a task is retried', async () => {
    let fail = true;
    const harness = new WorkerScenarioHarness(new SQL.Database());
    await harness.addNode(
      'node-a',
      inlineExecutor({
        dispatch: async () => {
          if (fail) {
            fail = false;
            throw new Error('transient failure');
          }
          return { status: 'completed', agentId: 'a' };
        },
      }),
    );

    await expect(harness.cluster.dispatch(task(), PROJECT as never)).rejects.toThrow(/transient failure/);
    const afterFailure = harness.cluster.attempts.attempts('task-1');
    expect(afterFailure).toHaveLength(1);
    expect(afterFailure[0]?.status).toBe('failed');

    await harness.cluster.dispatch(task(), PROJECT as never);
    const afterRetry = harness.cluster.attempts.attempts('task-1');
    expect(afterRetry).toHaveLength(2);
    expect(afterRetry[0]?.status).toBe('failed'); // prior attempt preserved, never rewritten to success
    expect(afterRetry[1]?.status).toBe('completed');
    expect(afterRetry[1]?.generation).toBe(2);
  });

  it('rejects late output from a superseded execution so it cannot overwrite an accepted result', () => {
    const ledger = new ExecutionAttemptLedger();
    const first = ledger.begin('t1', 'node-a', 'lease-1');
    const second = ledger.begin('t1', 'node-b', 'lease-2');

    expect(ledger.isAuthoritative(first.attemptId)).toBe(false);
    expect(ledger.accept(first.attemptId)).toBe('rejected-late');
    expect(ledger.attempts('t1').find((attempt) => attempt.attemptId === first.attemptId)?.status).toBe('superseded');

    expect(ledger.accept(second.attemptId)).toBe('accepted');
    expect(ledger.acceptedAttempt('t1')?.attemptId).toBe(second.attemptId);

    // The late result from the superseded attempt still cannot overwrite it.
    expect(ledger.accept(first.attemptId)).toBe('rejected-late');
    expect(ledger.acceptedAttempt('t1')?.attemptId).toBe(second.attemptId);
  });

  it('does not treat task completion as workflow completion', async () => {
    const scenario = await createScenario({
      objective: 'Add a health endpoint',
      script: { tasks: [{ taskSummary: 'Implement the health endpoint' }] },
    });
    scenarios.push(scenario);

    const project = await scenario.intake('Add a health endpoint');
    await scenario.contextAssembly(project.id);
    await scenario.plan(project.id, [scenario.taskInput({ summary: 'Implement the health endpoint' })]);
    await scenario.reviewPlan(project.id, 'approved');
    await scenario.approve(project.id);
    await scenario.execute(project.id); // tasks complete, project → verifying

    const snapshot = await scenario.snapshot(project.id);
    expect(snapshot.tasks[0]?.status).toBe('completed');
    expect(snapshot.status).not.toBe('completed');
    expect(snapshot.phase).toBe('verifying');
  });
});
