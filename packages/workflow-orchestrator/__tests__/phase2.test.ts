import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { WorkflowOrchestrator } from '../src/orchestrator';
import { type ApprovalPolicy, DefaultRiskApprovalPolicy, TokenBudget } from '../src/policies';
import { DEFAULT_RETRY_POLICY, type RetryPolicy } from '../src/retry-policy';
import { ArtifactStore, FileLockRegistry, PlanStore, ProjectStore, TaskStore } from '../src/stores';
import type { CreateTaskInput } from '../src/stores/task-store';
import type {
  OrchestratedProject,
  OrchestrationEvent,
  OrchestrationEventSink,
  TaskDispatcher,
  TaskReviewResult,
  TaskTestResult,
  WorkflowTask,
} from '../src/types';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

const FAST_RETRY: RetryPolicy = { maxAttempts: 3, maxRevisions: 3, backoffMs: () => 0 };

class StageDispatcher implements TaskDispatcher {
  calls = 0;
  maxConcurrent = 0;
  active = 0;

  constructor(
    private readonly reviewDecisions: TaskReviewResult['decision'][] = [],
    private readonly testStatuses: TaskTestResult['status'][] = [],
  ) {}

  async dispatch(): Promise<{ status: 'completed'; agentId: string }> {
    this.calls += 1;
    this.active += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.active -= 1;
    return { status: 'completed', agentId: 'developer' };
  }

  async review(): Promise<TaskReviewResult> {
    return { decision: this.reviewDecisions.shift() ?? 'approved', agentId: 'reviewer' };
  }

  async test(): Promise<TaskTestResult> {
    return { status: this.testStatuses.shift() ?? 'passed', agentId: 'tester' };
  }
}

class SensitivePolicy implements ApprovalPolicy {
  evaluate(task: WorkflowTask) {
    return {
      required: task.files.some((file) => file.includes('sensitive')),
      reason: 'Sensitive path',
      risk: 'high' as const,
    };
  }
}

interface Harness {
  orchestrator: WorkflowOrchestrator;
  events: OrchestrationEvent[];
  dispatcher: StageDispatcher;
  tasks: TaskStore;
}

async function setup(options?: {
  dispatcher?: StageDispatcher;
  approvalPolicy?: ApprovalPolicy;
  budget?: TokenBudget;
  maxParallelTasks?: number;
}): Promise<Harness> {
  const db = new SQL.Database();
  const events: OrchestrationEvent[] = [];
  const sink: OrchestrationEventSink = { append: (event) => events.push(event) };
  const dispatcher = options?.dispatcher ?? new StageDispatcher();
  const tasks = new TaskStore(db);
  const orchestrator = new WorkflowOrchestrator({
    projects: new ProjectStore(db),
    plans: new PlanStore(db),
    tasks,
    artifacts: new ArtifactStore(db),
    locks: new FileLockRegistry(db),
    events: sink,
    dispatcher,
    retry: FAST_RETRY,
    approvalPolicy: options?.approvalPolicy,
    budget: options?.budget,
    maxParallelTasks: options?.maxParallelTasks ?? 1,
  });
  return { orchestrator, events, dispatcher, tasks };
}

async function driveToExecution(
  orchestrator: WorkflowOrchestrator,
  files: readonly string[] = ['src/a.ts'],
  tasks: readonly CreateTaskInput[] = [
    {
      planId: '',
      summary: 'Implement',
      description: 'Work',
      files,
      dependencies: [],
      effort: 'small',
      requiredCapabilities: ['code-generation'],
    },
  ],
): Promise<OrchestratedProject> {
  const project = await orchestrator.createProject({
    name: 'Feature',
    goal: 'Build',
    repoPath: '/repo',
    workspaceId: 'ws-1',
  });
  await orchestrator.startProject(project.id);
  await orchestrator.completeAnalysis(project.id, { analystId: 'analyst', report: {} });
  await orchestrator.generatePlan(project.id, { plannerId: 'planner', title: 'Plan', goal: 'Build', tasks });
  await orchestrator.reviewArchitecture(project.id, { architectId: 'architect', status: 'approved' });
  await orchestrator.approveProject(project.id, { approvalId: 'a1' });
  return project;
}

describe('Phase 2 — review and revision loops', () => {
  it('requests changes twice then approves — task completes with a bounded revision loop', async () => {
    const { orchestrator, events } = await setup({
      dispatcher: new StageDispatcher(['changes-requested', 'changes-requested', 'approved']),
    });
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.tasks[0].status).toBe('completed');
    expect(snapshot.tasks[0].revisionCount).toBe(2);
    expect(events.filter((event) => event.type === 'task.review.decided')).toHaveLength(3);
    expect(events.filter((event) => event.type === 'task.revision')).toHaveLength(2);
  });

  it('blocks a task when the revision limit is exceeded', async () => {
    const decisions = Array.from({ length: 4 }, () => 'changes-requested' as const);
    const { orchestrator, events } = await setup({ dispatcher: new StageDispatcher(decisions) });
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.tasks[0].status).toBe('blocked');
    expect(snapshot.phase).toBe('executing');
    expect(events.filter((event) => event.type === 'task.blocked')).toHaveLength(1);
  });

  it('blocks a task rejected in review', async () => {
    const { orchestrator, events } = await setup({ dispatcher: new StageDispatcher(['rejected']) });
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.tasks[0].status).toBe('blocked');
    expect(snapshot.tasks[0].lastError).toBe('review rejected');
    expect(events.filter((event) => event.type === 'task.blocked')).toHaveLength(1);
  });

  it('re-runs a task when tests fail, then completes', async () => {
    const { orchestrator, dispatcher } = await setup({
      dispatcher: new StageDispatcher([], ['failed', 'passed']),
    });
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.tasks[0].status).toBe('completed');
    expect(dispatcher.calls).toBe(2);
  });
});

describe('Phase 2 — Approval Gateway', () => {
  it('holds a high-risk task awaiting approval and continues after approval', async () => {
    const { orchestrator, events } = await setup({ approvalPolicy: new SensitivePolicy() });
    const project = await driveToExecution(orchestrator, ['sensitive.txt']);
    await orchestrator.runExecution(project.id);

    let snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.phase).toBe('executing');
    expect(snapshot.tasks[0].status).toBe('awaiting-approval');
    expect(snapshot.tasks[0].approvalReason).toBe('Sensitive path');
    expect(events.some((event) => event.type === 'task.approval-requested')).toBe(true);

    const pending = await orchestrator.pendingApprovals(project.id);
    expect(pending).toHaveLength(1);

    await orchestrator.resolveTaskApproval(project.id, pending[0].id, true);
    snapshot = await orchestrator.resume(project.id);
    expect(snapshot.tasks[0].status).toBe('completed');
    expect(events.some((event) => event.type === 'task.approval-resolved')).toBe(true);
  });

  it('blocks a task whose approval is denied', async () => {
    const { orchestrator } = await setup({ approvalPolicy: new SensitivePolicy() });
    const project = await driveToExecution(orchestrator, ['sensitive.txt']);
    await orchestrator.runExecution(project.id);

    const pending = await orchestrator.pendingApprovals(project.id);
    await orchestrator.resolveTaskApproval(project.id, pending[0].id, false);
    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.tasks[0].status).toBe('blocked');
    expect(snapshot.tasks[0].lastError).toBe('approval denied');
  });

  it('default risk policy flags large change sets and sensitive paths', () => {
    const policy = new DefaultRiskApprovalPolicy();
    const task = (files: string[]): WorkflowTask =>
      ({
        id: 't',
        planId: 'p',
        summary: 's',
        description: 'd',
        files,
        dependencies: [],
        status: 'ready',
        effort: 'medium',
        requiredCapabilities: [],
        revisionCount: 0,
        attemptCount: 0,
        createdAt: 'x',
        updatedAt: 'x',
      }) as WorkflowTask;
    expect(policy.evaluate(task(['.env']), {} as never).required).toBe(true);
    expect(policy.evaluate(task(['src/a.ts']), {} as never).required).toBe(false);
    expect(policy.evaluate(task(Array.from({ length: 11 }, (_, i) => `f${i}.ts`)), {} as never).required).toBe(true);
  });
});

describe('Phase 2 — parallel waves', () => {
  it('dispatches independent tasks concurrently within a bounded wave', async () => {
    const dispatcher = new StageDispatcher();
    const { orchestrator } = await setup({ dispatcher, maxParallelTasks: 2 });
    const project = await driveToExecution(
      orchestrator,
      ['src/a.ts'],
      [
        {
          planId: '',
          summary: 'A',
          description: 'A',
          files: ['src/a.ts'],
          dependencies: [],
          effort: 'small',
          requiredCapabilities: ['code-generation'],
        },
        {
          planId: '',
          summary: 'B',
          description: 'B',
          files: ['src/b.ts'],
          dependencies: [],
          effort: 'small',
          requiredCapabilities: ['code-generation'],
        },
      ],
    );
    await orchestrator.runExecution(project.id);

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.tasks.every((task) => task.status === 'completed')).toBe(true);
    expect(dispatcher.maxConcurrent).toBe(2);
    expect(dispatcher.calls).toBe(2);
  });
});

describe('Phase 3 — token budgets and reconcile', () => {
  it('blocks a task when the token budget is exhausted', async () => {
    const budget = new TokenBudget(3);
    const { orchestrator, events } = await setup({ budget });
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.tasks[0].status).toBe('blocked');
    expect(snapshot.tasks[0].lastError).toBe('token budget exceeded');
    expect(events.some((event) => event.type === 'task.blocked')).toBe(true);
  });

  it('reconciles stored task state against the event log', async () => {
    const { orchestrator, events } = await setup();
    const project = await driveToExecution(orchestrator);
    await orchestrator.runExecution(project.id);

    const report = await orchestrator.reconcile(project.id, events);
    expect(report.consistent).toBe(true);
    expect(report.tasksChecked).toBe(1);
    expect(report.drifts).toHaveLength(0);
  });

  it('reports drift when stored state disagrees with the event log', async () => {
    const harness = await setup();
    const project = await driveToExecution(harness.orchestrator);
    await harness.orchestrator.runExecution(project.id);

    const stored = (await harness.orchestrator.snapshot(project.id)).tasks[0];
    expect(stored.status).toBe('completed');
    await harness.tasks.updateStatus(stored.id, 'retrying');

    const report = await harness.orchestrator.reconcile(project.id, harness.events);
    expect(report.consistent).toBe(false);
    expect(report.drifts).toHaveLength(1);
    expect(report.drifts[0].expected).toBe('completed');
    expect(report.drifts[0].actual).toBe('retrying');
  });
});
