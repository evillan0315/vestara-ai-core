/**
 * WorkflowOrchestrator — the single writer of project/plan/task workflow state.
 *
 * The orchestrator validates every transition against the @vestara/state-machine
 * transition tables, persists state, and appends an OrchestrationEvent for
 * every mutation so the workflow is replayable and auditable. Agents are
 * pluggable specialists reached through an injected TaskDispatcher; the
 * orchestrator never executes an agent itself.
 *
 * PCS-025 §17:
 *  - Phase 1: sequential lifecycle, retry policy, checkpointing, idempotent resume.
 *  - Phase 2: review/test stages with bounded revision loops, the Approval
 *    Gateway (plan + high-risk changes), and parallel task waves with
 *    file-lock contention handling.
 *  - Phase 3 foundations: token budgets and event-sourced reconcile.
 */

import { now } from './db';
import { DEFAULT_APPROVAL_POLICY } from './policies';
import { canRetryAttempt, canRevise, DEFAULT_RETRY_POLICY, type RetryPolicy } from './retry-policy';
import { canTransitionProject, canTransitionTask } from './state-machines';
import type { ArtifactStore, FileLockRegistry, PlanStore, ProjectStore, TaskStore } from './stores';
import type { CreateProjectInput } from './stores/project-store';
import type { CreateTaskInput } from './stores/task-store';
import { computeWaves } from './task-graph';
import type {
  ApprovalDecision,
  ApprovalPolicy,
  OrchestratedProject,
  OrchestrationEvent,
  OrchestrationEventSink,
  OrchestrationTelemetry,
  ProjectMetrics,
  ProjectPhase,
  ProjectSnapshot,
  TaskDispatcher,
  TaskDispatchResult,
  TaskStatus,
  TokenBudgetPolicy,
  WorkflowPlan,
  WorkflowTask,
} from './types';
import { deriveProjectStatus } from './types';
import { runWithConcurrency } from './worker-pool';

type TaskEventType =
  | 'task.ready'
  | 'task.assigned'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.blocked'
  | 'task.retrying'
  | 'task.revision'
  | 'task.approved'
  | 'task.cancelled'
  | 'task.approval-requested'
  | 'task.approval-resolved';

const TASK_EVENT: Record<TaskStatus, TaskEventType> = {
  pending: 'task.ready',
  ready: 'task.ready',
  'awaiting-approval': 'task.approval-requested',
  assigned: 'task.assigned',
  'in-progress': 'task.started',
  'needs-review': 'task.started',
  reviewing: 'task.started',
  'changes-requested': 'task.revision',
  testing: 'task.started',
  approved: 'task.approved',
  retrying: 'task.retrying',
  blocked: 'task.blocked',
  failed: 'task.failed',
  cancelled: 'task.cancelled',
  completed: 'task.completed',
};

const TASK_STATUS_FROM_EVENT: Partial<Record<OrchestrationEvent['type'], TaskStatus>> = {
  'task.created': 'pending',
  'task.ready': 'ready',
  'task.assigned': 'assigned',
  'task.started': 'in-progress',
  'task.retrying': 'retrying',
  'task.failed': 'failed',
  'task.blocked': 'blocked',
  'task.approval-requested': 'awaiting-approval',
  'task.revision': 'changes-requested',
  'task.approved': 'approved',
  'task.completed': 'completed',
  'task.cancelled': 'cancelled',
};

export interface ReconciliationDrift {
  readonly taskId: string;
  readonly expected: TaskStatus;
  readonly actual: TaskStatus;
}

export interface ReconciliationReport {
  readonly projectId: string;
  readonly eventsScanned: number;
  readonly tasksChecked: number;
  readonly consistent: boolean;
  readonly drifts: readonly ReconciliationDrift[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTaskEvent(event: OrchestrationEvent): event is Extract<OrchestrationEvent, { taskId: string }> {
  return 'taskId' in event && typeof (event as { taskId?: unknown }).taskId === 'string';
}

function taskEventStatus(event: OrchestrationEvent): TaskStatus | undefined {
  const status = TASK_STATUS_FROM_EVENT[event.type];
  return status ?? (event.type === 'task.approval-resolved' ? 'ready' : undefined);
}

export interface OrchestratorOptions {
  readonly projects: ProjectStore;
  readonly plans: PlanStore;
  readonly tasks: TaskStore;
  readonly artifacts: ArtifactStore;
  readonly locks: FileLockRegistry;
  readonly events: OrchestrationEventSink;
  readonly dispatcher: TaskDispatcher;
  readonly retry?: RetryPolicy;
  /** Approval gateway for high-risk changes (PCS-025 §13). */
  readonly approvalPolicy?: ApprovalPolicy;
  /** Token/cost budget — blocks dispatch when exhausted (PCS-025 §15). */
  readonly budget?: TokenBudgetPolicy;
  /** Max tasks dispatched concurrently per wave (default 1 = sequential). */
  readonly maxParallelTasks?: number;
  /** Bounded wait for a contended file lock before blocking the task. */
  readonly lockWaitTimeoutMs?: number;
  /** Observability callback for lifecycle operations (PCS-025 §18). */
  readonly onTelemetry?: (op: OrchestrationTelemetry) => void;
}

export class WorkflowOrchestrator {
  private readonly projects: ProjectStore;
  private readonly plans: PlanStore;
  private readonly tasks: TaskStore;
  private readonly artifacts: ArtifactStore;
  private readonly locks: FileLockRegistry;
  private readonly events: OrchestrationEventSink;
  private readonly dispatcher: TaskDispatcher;
  private readonly retry: RetryPolicy;
  private readonly approvalPolicy: ApprovalPolicy;
  private readonly budget?: TokenBudgetPolicy;
  private readonly maxParallelTasks: number;
  private readonly lockWaitTimeoutMs: number;
  private readonly onTelemetry?: (op: OrchestrationTelemetry) => void;

  constructor(options: OrchestratorOptions) {
    this.projects = options.projects;
    this.plans = options.plans;
    this.tasks = options.tasks;
    this.artifacts = options.artifacts;
    this.locks = options.locks;
    this.events = options.events;
    this.dispatcher = options.dispatcher;
    this.retry = options.retry ?? DEFAULT_RETRY_POLICY;
    this.approvalPolicy = options.approvalPolicy ?? DEFAULT_APPROVAL_POLICY;
    this.budget = options.budget;
    this.maxParallelTasks = Math.max(1, options.maxParallelTasks ?? 1);
    this.lockWaitTimeoutMs = Math.max(0, options.lockWaitTimeoutMs ?? 2_000);
    this.onTelemetry = options.onTelemetry;
  }

  // ─── Project lifecycle ───────────────────────────────────────

  async createProject(input: CreateProjectInput): Promise<OrchestratedProject> {
    const project = await this.projects.create(input);
    await this.events.append({
      type: 'project.created',
      projectId: project.id,
      name: project.name,
      goal: project.goal,
      at: now(),
    });
    return project;
  }

  async startProject(projectId: string): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    await this.transitionProject(project, 'analyzing');
    return this.snapshot(projectId);
  }

  async completeAnalysis(
    projectId: string,
    input: { readonly analystId: string; readonly report: Readonly<Record<string, unknown>> },
  ): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    const artifact = await this.artifacts.create({
      kind: 'analysis',
      projectId,
      agentId: input.analystId,
      body: input.report,
    });
    await this.events.append({
      type: 'analysis.completed',
      projectId,
      artifactId: artifact.id,
      agentId: input.analystId,
      at: now(),
    });
    await this.transitionProject(project, 'planning');
    return this.snapshot(projectId);
  }

  async generatePlan(
    projectId: string,
    input: {
      readonly plannerId: string;
      readonly title: string;
      readonly goal: string;
      readonly tasks: readonly CreateTaskInput[];
    },
  ): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    const plan = await this.plans.create({ projectId, title: input.title, goal: input.goal });
    await this.plans.updateStatus(plan.id, 'proposed');
    const tasks = await this.tasks.createMany(plan.id, input.tasks);
    await this.artifacts.create({
      kind: 'plan',
      projectId,
      planId: plan.id,
      agentId: input.plannerId,
      body: {
        planId: plan.id,
        title: input.title,
        goal: input.goal,
        tasks: tasks.map((task) => ({
          id: task.id,
          summary: task.summary,
          dependencies: task.dependencies,
          requiredCapabilities: task.requiredCapabilities,
        })),
      },
    });
    await this.events.append({
      type: 'plan.generated',
      projectId,
      planId: plan.id,
      revision: plan.revision,
      at: now(),
    });
    for (const task of tasks) {
      await this.events.append({
        type: 'task.created',
        projectId,
        planId: plan.id,
        taskId: task.id,
        at: now(),
        summary: task.summary,
        description: task.description,
        files: task.files,
        dependencies: task.dependencies,
        requiredCapabilities: task.requiredCapabilities,
        effort: task.effort,
      });
    }
    await this.transitionProject(project, 'architecture');
    return this.snapshot(projectId);
  }

  async reviewArchitecture(
    projectId: string,
    input: {
      readonly architectId: string;
      readonly status: 'approved' | 'violations';
      readonly findings?: readonly Readonly<Record<string, unknown>>[];
    },
  ): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    const plan = (await this.plans.listForProject(projectId))[0];
    if (!plan) throw new Error(`Project ${projectId} has no plan`);
    await this.artifacts.create({
      kind: 'architecture',
      projectId,
      planId: plan.id,
      agentId: input.architectId,
      body: { status: input.status, findings: input.findings ?? [] },
    });
    await this.events.append({
      type: 'architecture.reviewed',
      projectId,
      planId: plan.id,
      status: input.status,
      at: now(),
    });
    if (input.status === 'approved') {
      await this.plans.updateStatus(plan.id, 'reviewed');
      await this.transitionProject(project, 'pending-approval');
    } else {
      await this.plans.updateStatus(plan.id, 'needs-revision');
      await this.transitionProject(project, 'planning');
    }
    return this.snapshot(projectId);
  }

  async approveProject(projectId: string, input?: { readonly approvalId?: string }): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    const plan = (await this.plans.listForProject(projectId))[0];
    if (!plan) throw new Error(`Project ${projectId} has no plan`);
    if (plan.status === 'reviewed') await this.plans.updateStatus(plan.id, 'approved');
    if (input?.approvalId) await this.plans.setApproval(plan.id, input.approvalId);
    await this.events.append({ type: 'plan.approved', projectId, planId: plan.id, at: now() });
    await this.transitionProject(project, 'executing');
    return this.snapshot(projectId);
  }

  async runExecution(projectId: string): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    if (project.phase !== 'executing') {
      throw new Error(`Project ${projectId} is not executing (phase=${project.phase})`);
    }
    // Canonical wave scheduler (PCS-025 §12): partition the task DAG into
    // parallel waves; re-derive waves each pass so retries/failures are
    // picked up. `computeWaves` is cycle-safe and deterministic.
    let guard = 0;
    while (guard < 1_000) {
      guard++;
      const tasks = await this.tasks.listForProject(projectId);
      const runnableTasks = tasks.filter(
        (task) =>
          (task.status === 'pending' || task.status === 'ready' || task.status === 'assigned') &&
          task.dependencies.every((id) => {
            const dependency = tasks.find((candidate) => candidate.id === id);
            return !dependency || dependency.status === 'completed' || dependency.status === 'cancelled';
          }),
      );
      if (runnableTasks.length === 0) break;
      const wave =
        computeWaves(runnableTasks.map((task) => ({ id: task.id, dependencies: task.dependencies })))[0] ?? [];
      const waveTasks = runnableTasks.filter((task) => wave.includes(task.id)).slice(0, this.maxParallelTasks);
      for (const task of waveTasks) {
        if (task.status === 'pending') {
          await this.transitionTask(project.id, task, 'ready');
        }
      }
      await runWithConcurrency(waveTasks, this.maxParallelTasks, (task) => this.runTask(project, { ...task }));
      await this.events.append({ type: 'workflow.checkpoint', projectId, at: now() });
    }
    const after = await this.tasks.listForProject(projectId);
    const pending = after.filter(
      (task) => task.status === 'blocked' || task.status === 'failed' || task.status === 'awaiting-approval',
    );
    if (pending.length > 0) {
      return this.snapshot(projectId);
    }
    await this.transitionProject(project, 'verifying');
    return this.snapshot(projectId);
  }

  async runVerification(
    projectId: string,
    input: {
      readonly verifierId: string;
      readonly report: Readonly<Record<string, unknown>>;
      readonly passed: boolean;
    },
  ): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    const plan = (await this.plans.listForProject(projectId))[0];
    const artifact = await this.artifacts.create({
      kind: 'verification',
      projectId,
      planId: plan?.id,
      agentId: input.verifierId,
      body: input.report,
    });
    if (input.passed) {
      await this.events.append({
        type: 'verification.passed',
        projectId,
        planId: plan?.id ?? '',
        reportId: artifact.id,
        at: now(),
      });
      if (plan) await this.plans.updateStatus(plan.id, 'completed');
      await this.transitionProject(project, 'completed');
      await this.events.append({ type: 'project.completed', projectId, at: now() });
    } else {
      await this.events.append({
        type: 'verification.failed',
        projectId,
        planId: plan?.id ?? '',
        reportId: artifact.id,
        at: now(),
      });
      // PCS-025 §11: at most one automatic re-open to execution; subsequent
      // failures require human approval and leave the project in verifying.
      if (project.phase !== 'executing' && project.verificationReopens < 1) {
        await this.projects.incrementVerificationReopens(projectId);
        await this.transitionProject(project, 'executing');
        await this.events.append({
          type: 'project.verification.reopened',
          projectId,
          reopenCount: project.verificationReopens + 1,
          at: now(),
        });
      } else {
        await this.events.append({
          type: 'verification.awaiting-approval',
          projectId,
          planId: plan?.id ?? '',
          reportId: artifact.id,
          at: now(),
        });
      }
    }
    return this.snapshot(projectId);
  }

  async cancelProject(projectId: string, reason: string): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    if (!canTransitionProject(project.phase, 'cancelled')) {
      throw new Error(`Project ${projectId} cannot be cancelled from phase "${project.phase}"`);
    }
    await this.projects.cancel(projectId, reason);
    await this.events.append({ type: 'project.cancelled', projectId, reason, at: now() });
    const tasks = await this.tasks.listForProject(projectId);
    for (const task of tasks) {
      if (task.status === 'completed' || task.status === 'cancelled') continue;
      await this.tasks.updateStatus(task.id, 'cancelled');
      await this.events.append({ type: 'task.cancelled', projectId, planId: task.planId, taskId: task.id, at: now() });
    }
    return this.snapshot(projectId);
  }

  async archiveProject(projectId: string): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    await this.projects.archive(projectId);
    await this.events.append({
      type: 'project.phase.changed',
      projectId,
      from: project.phase,
      to: 'archived',
      at: now(),
    });
    return this.snapshot(projectId);
  }

  /** Idempotent re-entry: reload persisted state and continue in-progress work. */
  async resume(projectId: string): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    if (project.phase === 'executing') {
      // Continue from the persisted checkpoint: runExecution re-derives which
      // tasks still need work, so completed tasks are never re-executed.
      return this.runExecution(projectId);
    }
    return this.snapshot(projectId);
  }

  // ─── Phase 2: Approval Gateway ───────────────────────────────

  async resolveTaskApproval(projectId: string, taskId: string, approved: boolean): Promise<ProjectSnapshot> {
    await this.mustGetProject(projectId);
    const task = await this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status !== 'awaiting-approval') {
      throw new Error(`Task ${taskId} is not awaiting approval (status=${task.status})`);
    }
    await this.tasks.clearApproval(taskId);
    if (approved) {
      await this.transitionTask(projectId, task, 'assigned');
    } else {
      await this.tasks.updateStatus(taskId, 'blocked', 'approval denied');
    }
    await this.events.append({
      type: 'task.approval-resolved',
      projectId,
      planId: task.planId,
      taskId,
      at: now(),
    });
    this.telemetry({
      projectId,
      taskId,
      agent: 'orchestrator',
      status: approved ? 'completed' : 'failed',
      operation: 'approval',
      task: task.summary,
      phase: approved ? 'approved' : 'denied',
    });
    return this.snapshot(projectId);
  }

  /** Lists tasks currently waiting on a high-risk-change approval. */
  async pendingApprovals(projectId: string): Promise<WorkflowTask[]> {
    const tasks = await this.tasks.listForProject(projectId);
    return tasks.filter((task) => task.status === 'awaiting-approval');
  }

  // ─── Phase 3: event-sourced reconcile ────────────────────────

  /** Rebuild expected task states from the event log and diff against stores. */
  async reconcile(projectId: string, events: readonly OrchestrationEvent[]): Promise<ReconciliationReport> {
    const expectedByTask = new Map<string, TaskStatus>();
    for (const event of events) {
      if (!isTaskEvent(event)) continue;
      const status = taskEventStatus(event);
      if (status) expectedByTask.set(event.taskId, status);
    }
    const tasks = await this.tasks.listForProject(projectId);
    const drifts: ReconciliationDrift[] = [];
    for (const task of tasks) {
      const expected = expectedByTask.get(task.id);
      if (expected && expected !== task.status) drifts.push({ taskId: task.id, expected, actual: task.status });
    }
    return {
      projectId,
      eventsScanned: events.length,
      tasksChecked: tasks.length,
      consistent: drifts.length === 0,
      drifts,
    };
  }

  // ─── Phase 3: event-sourced rebuild ──────────────────────────

  /**
   * Reconstruct a project snapshot purely from the event log (PCS-025 §11, §17
   * Phase 3). Artifacts and locks are not derivable from events and are empty;
   * callers replay them from their own stores. Task content is recoverable
   * because `task.created` carries the task definition.
   */
  async rebuild(
    projectId: string,
    events: readonly OrchestrationEvent[],
    context: { readonly workspaceId: string; readonly repoPath: string },
  ): Promise<ProjectSnapshot> {
    let project: OrchestratedProject | undefined;
    let phase: ProjectPhase = 'draft';
    let cancelReason: string | undefined;
    const planById = new Map<string, WorkflowPlan>();
    const taskById = new Map<string, WorkflowTask>();
    const applyTaskStatus = (event: { taskId: string; planId: string; at: string }, status: TaskStatus): void => {
      const task = taskById.get(event.taskId);
      if (task) taskById.set(event.taskId, { ...task, status, updatedAt: event.at });
    };

    for (const event of events) {
      if (event.projectId !== projectId) continue;
      switch (event.type) {
        case 'project.created':
          project = {
            id: event.projectId,
            name: event.name,
            goal: event.goal,
            repoPath: context.repoPath,
            phase: 'draft',
            workspaceId: context.workspaceId,
            verificationReopens: 0,
            createdAt: event.at,
            updatedAt: event.at,
          };
          break;
        case 'project.phase.changed':
          phase = event.to;
          break;
        case 'project.cancelled':
          phase = 'cancelled';
          cancelReason = event.reason;
          break;
        case 'plan.generated':
          planById.set(event.planId, {
            id: event.planId,
            projectId,
            title: '',
            goal: '',
            revision: event.revision,
            status: 'proposed',
            createdAt: event.at,
            updatedAt: event.at,
          });
          break;
        case 'plan.approved': {
          const plan = planById.get(event.planId);
          if (plan) planById.set(event.planId, { ...plan, status: 'approved', updatedAt: event.at });
          break;
        }
        case 'task.created':
          taskById.set(event.taskId, {
            id: event.taskId,
            planId: event.planId,
            summary: event.summary,
            description: event.description,
            files: event.files,
            dependencies: event.dependencies,
            requiredCapabilities: event.requiredCapabilities,
            effort: event.effort,
            status: 'pending',
            revisionCount: 0,
            attemptCount: 0,
            createdAt: event.at,
            updatedAt: event.at,
          });
          break;
        case 'task.ready':
          applyTaskStatus(event, 'ready');
          break;
        case 'task.assigned':
          applyTaskStatus(event, 'assigned');
          break;
        case 'task.started':
          applyTaskStatus(event, 'in-progress');
          break;
        case 'task.approved':
          applyTaskStatus(event, 'approved');
          break;
        case 'task.failed': {
          const task = taskById.get(event.taskId);
          if (task)
            taskById.set(event.taskId, {
              ...task,
              status: 'failed',
              attemptCount: task.attemptCount + 1,
              updatedAt: event.at,
            });
          break;
        }
        case 'task.retrying':
          applyTaskStatus(event, 'retrying');
          break;
        case 'task.revision': {
          const task = taskById.get(event.taskId);
          if (task)
            taskById.set(event.taskId, {
              ...task,
              status: 'changes-requested',
              revisionCount: task.revisionCount + 1,
              updatedAt: event.at,
            });
          break;
        }
        case 'task.blocked':
          applyTaskStatus(event, 'blocked');
          break;
        case 'task.completed':
          applyTaskStatus(event, 'completed');
          break;
        case 'task.cancelled':
          applyTaskStatus(event, 'cancelled');
          break;
        case 'task.approval-requested':
          applyTaskStatus(event, 'awaiting-approval');
          break;
        case 'task.approval-resolved':
          applyTaskStatus(event, 'assigned');
          break;
        default:
          break;
      }
    }

    if (!project) throw new Error(`No project.created event for ${projectId}`);
    const rebuilt: OrchestratedProject = { ...project, phase, cancelReason };
    return {
      project: rebuilt,
      plan: planById.values().next().value,
      tasks: [...taskById.values()],
      artifacts: [],
      locks: [],
      phase,
      status: deriveProjectStatus(phase),
    };
  }

  async snapshot(projectId: string): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    const plans = await this.plans.listForProject(projectId);
    const tasks = await this.tasks.listForProject(projectId);
    const artifacts = await this.artifacts.listForProject(projectId);
    const locks = await this.locks.listActive();
    return {
      project,
      plan: plans[0],
      tasks,
      artifacts,
      locks,
      phase: project.phase,
      status: deriveProjectStatus(project.phase),
    };
  }

  /** Lightweight project list for a workspace (UI dashboard). */
  async listProjects(workspaceId: string): Promise<
    Array<{
      id: string;
      name: string;
      goal: string;
      phase: ProjectPhase;
      status: ProjectSnapshot['status'];
      createdAt: string;
    }>
  > {
    const projects = await this.projects.list(workspaceId);
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      goal: project.goal,
      phase: project.phase,
      status: deriveProjectStatus(project.phase),
      createdAt: project.createdAt,
    }));
  }

  /** Aggregate observability metrics for a project (PCS-025 §18). */
  async metrics(projectId: string): Promise<ProjectMetrics> {
    const project = await this.mustGetProject(projectId);
    const tasks = await this.tasks.listForProject(projectId);
    const artifacts = await this.artifacts.listForProject(projectId);
    const status = deriveProjectStatus(project.phase);
    const count = (statuses: readonly TaskStatus[]): number =>
      tasks.filter((task) => statuses.includes(task.status)).length;
    return {
      projectId,
      phase: project.phase,
      status,
      tasks: {
        total: tasks.length,
        completed: count(['completed']),
        failed: count(['failed']),
        blocked: count(['blocked']),
        awaitingApproval: count(['awaiting-approval']),
        running: count([
          'pending',
          'ready',
          'assigned',
          'in-progress',
          'retrying',
          'needs-review',
          'reviewing',
          'testing',
        ]),
      },
      retries: tasks.reduce((sum, task) => sum + task.attemptCount, 0),
      revisions: tasks.reduce((sum, task) => sum + task.revisionCount, 0),
      artifacts: artifacts.length,
      elapsedMs: Math.max(0, Date.now() - new Date(project.createdAt).getTime()),
      createdAt: project.createdAt,
      completedAt: project.phase === 'completed' || project.phase === 'archived' ? project.updatedAt : undefined,
    };
  }

  /** Observability metrics for every project in a workspace. */
  async listMetrics(workspaceId: string): Promise<ProjectMetrics[]> {
    const projects = await this.projects.list(workspaceId);
    const metrics: ProjectMetrics[] = [];
    for (const project of projects) {
      metrics.push(await this.metrics(project.id));
    }
    return metrics;
  }

  // ─── Internals ───────────────────────────────────────────────

  private async runTask(project: OrchestratedProject, task: WorkflowTask): Promise<void> {
    let attempt = 0;
    for (let guard = 0; guard < 200; guard++) {
      let current = (await this.tasks.get(task.id)) ?? { ...task };

      // Approval gate + assign (first entry or post-approval).
      if (current.status === 'ready') {
        const decision = await this.evaluateApproval(project, current);
        if (decision.required) {
          await this.tasks.requestApproval(current.id, decision.reason ?? 'high-risk change');
          await this.events.append({
            type: 'task.approval-requested',
            projectId: project.id,
            planId: current.planId,
            taskId: current.id,
            at: now(),
          });
          this.telemetry({
            projectId: project.id,
            taskId: current.id,
            agent: 'orchestrator',
            status: 'working',
            operation: 'approval',
            task: current.summary,
            phase: 'awaiting-approval',
            detail: decision.reason,
          });
          return;
        }
        await this.transitionTask(project.id, current, 'assigned');
        attempt = 0;
      } else if (current.status !== 'assigned' && current.status !== 'retrying') {
        await this.tasks.updateStatus(current.id, 'blocked', `unexpected status ${current.status}`);
        return;
      }

      // Token budget gate.
      if (this.budget) {
        const estimate = this.budget.estimateTokens(current);
        if (!this.budget.canSpend(estimate)) {
          await this.tasks.updateStatus(current.id, 'blocked', 'token budget exceeded');
          await this.events.append({
            type: 'task.blocked',
            projectId: project.id,
            planId: current.planId,
            taskId: current.id,
            at: now(),
          });
          return;
        }
      }

      // Acquire file locks (bounded wait on contention).
      const lock = await this.acquireLocksWithWait(project, current);
      if (!lock.acquired) {
        await this.tasks.updateStatus(current.id, 'blocked', lock.reason ?? 'file lock conflict');
        await this.events.append({
          type: 'task.blocked',
          projectId: project.id,
          planId: current.planId,
          taskId: current.id,
          at: now(),
        });
        return;
      }

      await this.tasks.markStarted(current.id);
      await this.events.append({
        type: 'task.started',
        projectId: project.id,
        planId: current.planId,
        taskId: current.id,
        at: now(),
      });

      attempt++;
      const dispatchStart = Date.now();
      let result: TaskDispatchResult;
      try {
        result = await this.dispatcher.dispatch(current, project);
      } catch (error) {
        result = { status: 'failed', error: error instanceof Error ? error.message : 'dispatch error' };
      }
      const durationMs = Date.now() - dispatchStart;
      await this.releaseLocks(project.id, current.id, lock.paths);
      if (this.budget) this.budget.consume(this.budget.estimateTokens(current));
      // Reload so review/test/complete observe the persisted `in-progress` status.
      current = (await this.tasks.get(task.id)) ?? current;

      this.telemetry({
        projectId: project.id,
        taskId: current.id,
        agent: current.assignedAgentId ?? 'agent',
        status: result.status === 'completed' ? 'completed' : 'failed',
        operation: 'dispatch',
        task: current.summary,
        phase: current.status,
        detail: result.error,
        durationMs,
      });

      if (result.status === 'failed') {
        await this.tasks.recordFailure(current.id, result.error ?? 'dispatch failed', attempt);
        await this.events.append({
          type: 'task.failed',
          projectId: project.id,
          planId: current.planId,
          taskId: current.id,
          at: now(),
        });
        if (canRetryAttempt(this.retry, attempt)) {
          await this.tasks.updateStatus(current.id, 'retrying');
          await this.events.append({
            type: 'task.retrying',
            projectId: project.id,
            planId: current.planId,
            taskId: current.id,
            at: now(),
          });
          const delay = this.retry.backoffMs(attempt);
          if (delay > 0) await sleep(delay);
          continue;
        }
        await this.tasks.updateStatus(current.id, 'blocked', result.error ?? 'max attempts exceeded');
        await this.events.append({
          type: 'task.blocked',
          projectId: project.id,
          planId: current.planId,
          taskId: current.id,
          at: now(),
        });
        return;
      }

      // Record proposed changesets.
      const bodies = result.artifacts && result.artifacts.length > 0 ? result.artifacts : [{}];
      for (const body of bodies) {
        await this.artifacts.create({
          kind: 'changeset',
          projectId: project.id,
          planId: current.planId,
          taskId: current.id,
          agentId: result.agentId ?? current.assignedAgentId ?? 'developer',
          body: { taskId: current.id, summary: current.summary, output: result.output ?? null, ...body },
        });
      }

      // Review stage (bounded revision loop).
      if (this.dispatcher.review) {
        const decision = await this.runReviewStage(project, current, bodies);
        if (decision === 'revise') {
          attempt = 0;
          continue;
        }
        if (decision === 'block') return;
      }

      // Test stage.
      if (this.dispatcher.test) {
        const passed = await this.runTestStage(project, current);
        if (!passed) {
          await this.tasks.recordFailure(current.id, 'tests failed', attempt);
          await this.events.append({
            type: 'task.failed',
            projectId: project.id,
            planId: current.planId,
            taskId: current.id,
            at: now(),
          });
          if (canRetryAttempt(this.retry, attempt)) {
            await this.tasks.updateStatus(current.id, 'retrying');
            await this.events.append({
              type: 'task.retrying',
              projectId: project.id,
              planId: current.planId,
              taskId: current.id,
              at: now(),
            });
            continue;
          }
          await this.tasks.updateStatus(current.id, 'blocked', 'tests failed');
          await this.events.append({
            type: 'task.blocked',
            projectId: project.id,
            planId: current.planId,
            taskId: current.id,
            at: now(),
          });
          return;
        }
      }

      await this.tasks.complete(current.id, result.agentId);
      await this.events.append({
        type: 'task.completed',
        projectId: project.id,
        planId: current.planId,
        taskId: current.id,
        at: now(),
      });
      this.telemetry({
        projectId: project.id,
        taskId: current.id,
        agent: result.agentId ?? current.assignedAgentId ?? 'agent',
        status: 'completed',
        operation: 'task',
        task: current.summary,
        phase: 'completed',
      });
      return;
    }
    await this.tasks.updateStatus(task.id, 'blocked', 'runTask guard exceeded');
  }

  private async evaluateApproval(project: OrchestratedProject, task: WorkflowTask): Promise<ApprovalDecision> {
    try {
      return await this.approvalPolicy.evaluate(task, project);
    } catch {
      return { required: false, risk: 'low' };
    }
  }

  private async runReviewStage(
    project: OrchestratedProject,
    current: WorkflowTask,
    changesets: readonly Readonly<Record<string, unknown>>[],
  ): Promise<'proceed' | 'revise' | 'block'> {
    await this.transitionTask(project.id, current, 'needs-review');
    const reviewing = (await this.tasks.get(current.id)) ?? current;
    await this.transitionTask(project.id, reviewing, 'reviewing');
    const reviewed = (await this.tasks.get(current.id)) ?? reviewing;
    const review = await this.dispatcher.review!(reviewed, project, changesets);
    await this.artifacts.create({
      kind: 'review',
      projectId: project.id,
      planId: reviewed.planId,
      taskId: reviewed.id,
      agentId: review.agentId ?? 'reviewer',
      body: { decision: review.decision, feedback: review.feedback ?? null },
    });
    await this.events.append({
      type: 'task.review.decided',
      projectId: project.id,
      planId: reviewed.planId,
      taskId: reviewed.id,
      decision: review.decision,
      at: now(),
    });
    this.telemetry({
      projectId: project.id,
      taskId: reviewed.id,
      agent: review.agentId ?? 'reviewer',
      status: review.decision === 'approved' ? 'completed' : 'failed',
      operation: 'review',
      task: reviewed.summary,
      phase: review.decision,
      detail: review.feedback,
    });

    switch (review.decision) {
      case 'approved':
        await this.transitionTask(project.id, reviewed, 'approved');
        return 'proceed';
      case 'rejected':
        await this.transitionTask(project.id, reviewed, 'blocked');
        await this.tasks.updateStatus(reviewed.id, 'blocked', review.feedback ?? 'review rejected');
        return 'block';
      case 'changes-requested': {
        await this.tasks.bumpRevision(reviewed.id);
        const fresh = (await this.tasks.get(reviewed.id)) ?? reviewed;
        if (canRevise(this.retry, fresh.revisionCount)) {
          await this.transitionTask(project.id, fresh, 'changes-requested');
          const revised = (await this.tasks.get(reviewed.id)) ?? fresh;
          await this.transitionTask(project.id, revised, 'assigned');
          return 'revise';
        }
        await this.transitionTask(project.id, fresh, 'blocked');
        await this.tasks.updateStatus(reviewed.id, 'blocked', 'revision limit exceeded');
        return 'block';
      }
    }
  }

  private async runTestStage(project: OrchestratedProject, current: WorkflowTask): Promise<boolean> {
    await this.transitionTask(project.id, current, 'testing');
    const testing = (await this.tasks.get(current.id)) ?? current;
    const test = await this.dispatcher.test!(testing, project);
    await this.artifacts.create({
      kind: 'test',
      projectId: project.id,
      planId: testing.planId,
      taskId: testing.id,
      agentId: test.agentId ?? 'verifier',
      body: { status: test.status, report: test.report ?? {} },
    });
    await this.events.append({
      type: 'task.tests.decided',
      projectId: project.id,
      planId: testing.planId,
      taskId: testing.id,
      status: test.status,
      at: now(),
    });
    this.telemetry({
      projectId: project.id,
      taskId: testing.id,
      agent: test.agentId ?? 'verifier',
      status: test.status === 'passed' ? 'completed' : 'failed',
      operation: 'test',
      task: testing.summary,
      phase: test.status,
    });
    if (test.status === 'passed') {
      await this.transitionTask(project.id, testing, 'approved');
      return true;
    }
    return false;
  }

  private async acquireLocksWithWait(
    project: OrchestratedProject,
    task: WorkflowTask,
  ): Promise<{ acquired: boolean; paths: string[]; reason?: string }> {
    const paths: string[] = [];
    const deadline = Date.now() + this.lockWaitTimeoutMs;
    for (const file of task.files) {
      for (;;) {
        const result = await this.locks.acquire({
          path: file,
          holderAgentId: task.assignedAgentId ?? 'unassigned',
          taskId: task.id,
        });
        if (result.acquired) {
          paths.push(file);
          await this.events.append({
            type: 'file.lock.acquired',
            projectId: project.id,
            path: file,
            taskId: task.id,
            holderAgentId: result.holderAgentId,
            at: now(),
          });
          break;
        }
        await this.events.append({
          type: 'file.lock.conflict',
          projectId: project.id,
          path: file,
          taskId: task.id,
          holderAgentId: result.holderAgentId,
          at: now(),
        });
        if (Date.now() >= deadline) {
          await this.releaseLocks(project.id, task.id, paths);
          return {
            acquired: false,
            paths: [],
            reason: `file lock held on "${file}" by ${result.holderTaskId ?? 'another task'}`,
          };
        }
        await sleep(50);
      }
    }
    return { acquired: true, paths };
  }

  private async releaseLocks(projectId: string, taskId: string, paths: readonly string[]): Promise<void> {
    for (const path of paths) {
      await this.locks.release(path, taskId);
      await this.events.append({ type: 'file.lock.released', projectId, path, taskId, at: now() });
    }
  }

  private async transitionTask(projectId: string, task: WorkflowTask, target: TaskStatus): Promise<void> {
    if (!canTransitionTask(task.status, target)) {
      throw new Error(`Invalid task transition "${task.status}" -> "${target}" (${task.id})`);
    }
    await this.tasks.updateStatus(task.id, target);
    await this.events.append({
      type: TASK_EVENT[target],
      projectId,
      planId: task.planId,
      taskId: task.id,
      at: now(),
    });
  }

  private async transitionProject(project: OrchestratedProject, to: ProjectPhase): Promise<void> {
    if (!canTransitionProject(project.phase, to)) {
      throw new Error(`Invalid project transition "${project.phase}" -> "${to}"`);
    }
    const from = project.phase;
    await this.projects.updatePhase(project.id, to);
    await this.events.append({ type: 'project.phase.changed', projectId: project.id, from, to, at: now() });
  }

  private async mustGetProject(projectId: string): Promise<OrchestratedProject> {
    const project = await this.projects.get(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    return project;
  }

  private telemetry(op: OrchestrationTelemetry): void {
    if (this.onTelemetry) {
      try {
        this.onTelemetry(op);
      } catch {
        // observability must never break the workflow
      }
    }
  }
}
