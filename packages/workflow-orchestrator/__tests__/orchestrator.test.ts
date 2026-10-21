import { migrate } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { ORCHESTRATION_MANIFEST } from '../src/orchestration-migrations';
import { WorkflowOrchestrator } from '../src/orchestrator';
import type { RetryPolicy } from '../src/retry-policy';
import { ArtifactStore, FileLockRegistry, PlanStore, ProjectStore, TaskStore } from '../src/stores';
import type { CreateTaskInput } from '../src/stores/task-store';
import type {
  OrchestratedProject,
  OrchestrationEvent,
  OrchestrationEventSink,
  TaskDispatcher,
  TaskDispatchResult,
  WorkflowTask,
} from '../src/types';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

class FakeDispatcher implements TaskDispatcher {
  calls: string[] = [];

  constructor(private readonly onDispatch?: (task: WorkflowTask, project: OrchestratedProject) => TaskDispatchResult) {}

  async dispatch(task: WorkflowTask, project: OrchestratedProject): Promise<TaskDispatchResult> {
    this.calls.push(task.id);
    return this.onDispatch ? this.onDispatch(task, project) : { status: 'completed', agentId: 'developer-1' };
  }
}

const FAST_RETRY: RetryPolicy = { maxAttempts: 3, maxRevisions: 3, backoffMs: () => 0 };

interface SetupOptions {
  readonly dispatcher?: TaskDispatcher;
  readonly retry?: RetryPolicy;
  readonly preLockedPath?: string;
}

async function setup(options?: SetupOptions) {
  const db = new SQL.Database();
  migrate(db, ORCHESTRATION_MANIFEST, {});
  const projects = new ProjectStore(db);
  const plans = new PlanStore(db);
  const tasks = new TaskStore(db);
  const artifacts = new ArtifactStore(db);
  const locks = new FileLockRegistry(db);
  const events: OrchestrationEvent[] = [];
  const sink: OrchestrationEventSink = { append: (event) => events.push(event) };
  const orchestrator = new WorkflowOrchestrator({
    projects,
    plans,
    tasks,
    artifacts,
    locks,
    events: sink,
    dispatcher: options?.dispatcher ?? new FakeDispatcher(),
    retry: options?.retry ?? FAST_RETRY,
  });
  if (options?.preLockedPath) {
    await locks.acquire({ path: options.preLockedPath, holderAgentId: 'other-agent', taskId: 'other-task' });
  }
  return { db, orchestrator, events, tasks, artifacts, locks };
}

async function driveToExecution(
  orchestrator: WorkflowOrchestrator,
  files: readonly string[] = ['src/a.ts'],
): Promise<OrchestratedProject> {
  const project = await orchestrator.createProject({
    name: 'Feature',
    goal: 'Build',
    repoPath: '/repo',
    workspaceId: 'ws-1',
  });
  await orchestrator.startProject(project.id);
  await orchestrator.completeAnalysis(project.id, { analystId: 'analyst', report: { summary: 'repo scanned' } });
  const tasksInput: CreateTaskInput[] = [
    {
      planId: 'unused',
      summary: 'Implement feature',
      description: 'Do the work',
      files,
      dependencies: [],
      effort: 'medium',
      requiredCapabilities: ['code-generation'],
    },
  ];
  await orchestrator.generatePlan(project.id, {
    plannerId: 'planner',
    title: 'Plan',
    goal: 'Build',
    tasks: tasksInput,
  });
  await orchestrator.reviewArchitecture(project.id, { architectId: 'architect', status: 'approved' });
  await orchestrator.approveProject(project.id, { approvalId: 'approval-1' });
  return project;
}

describe('WorkflowOrchestrator — happy path', () => {
  it('runs a sequential project to verification.passed with a full audit log', async () => {
    const { orchestrator, events, artifacts } = await setup();
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);
    await orchestrator.runVerification(project.id, { verifierId: 'verifier', report: { passed: true }, passed: true });

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.status).toBe('completed');
    expect(snapshot.phase).toBe('completed');
    expect(snapshot.tasks.every((task) => task.status === 'completed')).toBe(true);
    expect(snapshot.plan?.status).toBe('completed');

    const types = events.map((event) => event.type);
    for (const expected of [
      'project.created',
      'project.phase.changed',
      'analysis.completed',
      'plan.generated',
      'task.created',
      'architecture.reviewed',
      'plan.approved',
      'task.assigned',
      'task.started',
      'task.completed',
      'file.lock.acquired',
      'file.lock.released',
      'verification.passed',
      'project.completed',
    ]) {
      expect(types).toContain(expected);
    }
    const artifactsList = await artifacts.listForProject(project.id);
    expect(artifactsList.map((artifact) => artifact.kind)).toEqual(
      expect.arrayContaining(['analysis', 'plan', 'architecture', 'changeset', 'verification']),
    );
  });

  it('cancels a project from a non-terminal phase', async () => {
    const { orchestrator, events } = await setup();
    const project = await orchestrator.createProject({ name: 'F', goal: 'G', repoPath: '/r', workspaceId: 'ws-1' });
    const snapshot = await orchestrator.cancelProject(project.id, 'scope changed');
    expect(snapshot.status).toBe('cancelled');
    expect(events.some((event) => event.type === 'project.cancelled')).toBe(true);
  });
});

describe('WorkflowOrchestrator — retries and failures', () => {
  it('retries a failed task and completes it within maxAttempts', async () => {
    let calls = 0;
    const dispatcher = new FakeDispatcher(() => {
      calls += 1;
      return calls < 3 ? { status: 'failed', error: 'transient' } : { status: 'completed', agentId: 'developer-1' };
    });
    const { orchestrator, events } = await setup({ dispatcher });
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);

    const snapshot = await orchestrator.snapshot(project.id);
    expect(calls).toBe(3);
    expect(snapshot.tasks[0].status).toBe('completed');
    expect(events.filter((event) => event.type === 'task.retrying')).toHaveLength(2);
  });

  it('blocks a task after max attempts and keeps the project executing', async () => {
    const dispatcher = new FakeDispatcher(() => ({ status: 'failed', error: 'persistent' }));
    const { orchestrator, events } = await setup({ dispatcher });
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.phase).toBe('executing');
    expect(snapshot.tasks[0].status).toBe('blocked');
    expect(snapshot.tasks[0].lastError).toBe('persistent');
    expect(events.filter((event) => event.type === 'task.blocked')).toHaveLength(1);
  });

  it('requeues a blocked task and dispatches it again on resume', async () => {
    let calls = 0;
    const dispatcher = new FakeDispatcher(() => {
      calls += 1;
      return calls <= 3
        ? { status: 'failed', error: 'provider-failed' }
        : { status: 'completed', agentId: 'developer-1' };
    });
    const { orchestrator, events } = await setup({ dispatcher });
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);

    const blocked = (await orchestrator.snapshot(project.id)).tasks[0];
    expect(blocked.status).toBe('blocked');
    expect(blocked.attemptCount).toBe(3);

    await orchestrator.requeueTask(project.id, blocked.id);

    const requeued = (await orchestrator.snapshot(project.id)).tasks[0];
    expect(requeued.status).toBe('assigned');
    expect(requeued.attemptCount).toBe(0);
    expect(requeued.lastError).toBeUndefined();
    expect(events.filter((event) => event.type === 'task.requeued')).toHaveLength(1);

    await orchestrator.resume(project.id);

    const completed = (await orchestrator.snapshot(project.id)).tasks[0];
    expect(completed.status).toBe('completed');
    expect(calls).toBe(4);
  });

  it('refuses to requeue a task that is not recoverable', async () => {
    const { orchestrator } = await setup();
    const project = await driveToExecution(orchestrator);
    const pending = (await orchestrator.snapshot(project.id)).tasks[0];

    await expect(orchestrator.requeueTask(project.id, pending.id)).rejects.toThrow('not recoverable');
  });

  it('does not re-dispatch terminal tasks on resume', async () => {
    const dispatcher = new FakeDispatcher(() => ({ status: 'failed', error: 'persistent' }));
    const { orchestrator } = await setup({ dispatcher });
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);
    const callsAfterFirst = dispatcher.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await orchestrator.resume(project.id);
    expect(dispatcher.calls.length).toBe(callsAfterFirst);
  });
});

describe('WorkflowOrchestrator — verification and locks', () => {
  it('reopens execution when verification fails', async () => {
    const { orchestrator } = await setup();
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);
    await orchestrator.runVerification(project.id, {
      verifierId: 'verifier',
      report: { passed: false },
      passed: false,
    });

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.phase).toBe('executing');
    expect(snapshot.status).toBe('running');
  });

  it('blocks a task whose target file is already locked', async () => {
    const { orchestrator, events } = await setup({ preLockedPath: 'src/a.ts' });
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.tasks[0].status).toBe('blocked');
    expect(events.some((event) => event.type === 'file.lock.conflict')).toBe(true);
  });
});

describe('WorkflowOrchestrator — recovery of wedged tasks', () => {
  /**
   * A dispatch that dies with the process leaves the task `in-progress` and
   * keeps the file locks it acquired. `runExecution` only dispatches
   * `pending` / `ready` / `assigned` tasks, so such a task wedges the project
   * and blocks every dependent task on its stale locks.
   */
  it('recovers a task wedged in-progress and reclaims its stale file locks', async () => {
    const { orchestrator, events, tasks, locks } = await setup();
    const project = await driveToExecution(orchestrator);
    const task = (await orchestrator.snapshot(project.id)).tasks[0];

    // Simulate the wedged dispatch: the task started and still holds its lock.
    await tasks.markStarted(task.id);
    await locks.acquire({ path: 'src/a.ts', holderAgentId: 'developer-1', taskId: task.id });
    expect((await locks.listActive()).map((lock) => lock.path)).toEqual(['src/a.ts']);

    await orchestrator.requeueTask(project.id, task.id, { reason: 'dispatch died with the process' });

    const recovered = (await orchestrator.snapshot(project.id)).tasks[0];
    expect(recovered.status).toBe('assigned');
    expect(recovered.startedAt).toBeUndefined();
    expect(recovered.lastError).toBeUndefined();
    // The stale lock is gone — a dependent task can now acquire it.
    expect(await locks.listActive()).toHaveLength(0);

    const requeued = events.find((event) => event.type === 'task.requeued');
    expect(requeued).toBeDefined();
    expect(requeued?.fromStatus).toBe('in-progress');
    expect(requeued?.reason).toBe('dispatch died with the process');
    expect(requeued?.releasedPaths).toEqual(['src/a.ts']);
    expect(events.filter((event) => event.type === 'file.lock.released' && event.path === 'src/a.ts')).toHaveLength(1);
  });

  it('recovers a task stuck in retrying', async () => {
    const { orchestrator, events, tasks } = await setup();
    const project = await driveToExecution(orchestrator);
    const task = (await orchestrator.snapshot(project.id)).tasks[0];
    await tasks.updateStatus(task.id, 'retrying');

    await orchestrator.requeueTask(project.id, task.id);

    const recovered = (await orchestrator.snapshot(project.id)).tasks[0];
    expect(recovered.status).toBe('assigned');
    const requeued = events.find((event) => event.type === 'task.requeued');
    expect(requeued?.fromStatus).toBe('retrying');
  });

  it('routes a failed task through the legal failed → retrying → assigned path', async () => {
    const { orchestrator, events, tasks } = await setup();
    const project = await driveToExecution(orchestrator);
    const task = (await orchestrator.snapshot(project.id)).tasks[0];
    // A task can persist as `failed` when the process dies between the failed
    // attempt and the retry bookkeeping. `failed` has no direct edge to
    // `assigned`, so the recovery walks the legal path.
    await tasks.updateStatus(task.id, 'failed', 'dispatch failed');

    await orchestrator.requeueTask(project.id, task.id);

    const recovered = (await orchestrator.snapshot(project.id)).tasks[0];
    expect(recovered.status).toBe('assigned');
    expect(recovered.lastError).toBeUndefined();
    expect(events.filter((event) => event.type === 'task.retrying')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'task.requeued')).toHaveLength(1);
  });

  it('re-dispatches a recovered task on resume', async () => {
    let calls = 0;
    const dispatcher = new FakeDispatcher(() => {
      calls += 1;
      return { status: 'completed', agentId: 'developer-1' };
    });
    const { orchestrator, tasks, locks } = await setup({ dispatcher });
    const project = await driveToExecution(orchestrator);
    const task = (await orchestrator.snapshot(project.id)).tasks[0];

    // Wedged dispatch: started, still holding its lock, never settled.
    await tasks.markStarted(task.id);
    await locks.acquire({ path: 'src/a.ts', holderAgentId: 'developer-1', taskId: task.id });

    await orchestrator.requeueTask(project.id, task.id);
    expect(calls).toBe(0);

    await orchestrator.resume(project.id);

    const completed = (await orchestrator.snapshot(project.id)).tasks[0];
    expect(completed.status).toBe('completed');
    expect(calls).toBe(1);
  });
});
