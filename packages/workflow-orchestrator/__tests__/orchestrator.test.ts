import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
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
