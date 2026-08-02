/**
 * WorkflowOrchestrator — the single writer of project/plan/task workflow state.
 *
 * The orchestrator validates every transition against the @vestara/state-machine
 * transition tables, persists state, and appends an OrchestrationEvent for
 * every mutation so the workflow is replayable and auditable. Agents are
 * pluggable specialists reached through an injected TaskDispatcher; the
 * orchestrator never executes an agent itself.
 *
 * Phase 1 scope (PCS-025 §17): sequential project lifecycle with retry policy,
 * checkpointing, and idempotent resume. Approval Gateway, reviewer/test agents,
 * parallel wave execution and file-lock contention handling arrive in Phase 2;
 * the machinery (waves, locks, revision counters) is present.
 */

import { now } from './db';
import { canRetryAttempt, DEFAULT_RETRY_POLICY, type RetryPolicy } from './retry-policy';
import { canTransitionProject, canTransitionTask } from './state-machines';
import type { ArtifactStore, FileLockRegistry, PlanStore, ProjectStore, TaskStore } from './stores';
import type { CreateProjectInput } from './stores/project-store';
import type { CreateTaskInput } from './stores/task-store';
import type {
  OrchestratedProject,
  OrchestrationEventSink,
  ProjectPhase,
  ProjectSnapshot,
  TaskDispatcher,
  TaskStatus,
  WorkflowTask,
} from './types';
import { deriveProjectStatus } from './types';

type TaskEventType =
  | 'task.created'
  | 'task.ready'
  | 'task.assigned'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.blocked'
  | 'task.retrying'
  | 'task.revision'
  | 'task.cancelled';

const TASK_EVENT: Record<TaskStatus, TaskEventType> = {
  pending: 'task.created',
  ready: 'task.ready',
  assigned: 'task.assigned',
  'in-progress': 'task.started',
  'needs-review': 'task.started',
  reviewing: 'task.started',
  'changes-requested': 'task.revision',
  testing: 'task.started',
  approved: 'task.completed',
  retrying: 'task.retrying',
  blocked: 'task.blocked',
  failed: 'task.failed',
  cancelled: 'task.cancelled',
  completed: 'task.completed',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  constructor(options: OrchestratorOptions) {
    this.projects = options.projects;
    this.plans = options.plans;
    this.tasks = options.tasks;
    this.artifacts = options.artifacts;
    this.locks = options.locks;
    this.events = options.events;
    this.dispatcher = options.dispatcher;
    this.retry = options.retry ?? DEFAULT_RETRY_POLICY;
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
    let guard = 0;
    while (guard < 1_000) {
      guard++;
      const tasks = await this.tasks.listForProject(projectId);
      const isDone = (id: string): boolean => {
        const dependency = tasks.find((task) => task.id === id);
        return !dependency || dependency.status === 'completed' || dependency.status === 'cancelled';
      };
      const runnable = tasks
        .filter((task) => (task.status === 'pending' || task.status === 'ready') && task.dependencies.every(isDone))
        .map((task) => ({ ...task }));
      if (runnable.length === 0) break;
      for (const task of runnable) {
        if (task.status === 'pending') {
          await this.transitionTask(project.id, task, 'ready');
        }
        await this.runTask(project, { ...task });
      }
      await this.events.append({ type: 'workflow.checkpoint', projectId, at: now() });
    }
    const after = await this.tasks.listForProject(projectId);
    const blocked = after.filter((task) => task.status === 'blocked' || task.status === 'failed');
    if (blocked.length > 0) {
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
      await this.transitionProject(project, 'executing');
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
      await this.events.append({
        type: 'task.cancelled',
        projectId,
        planId: task.planId,
        taskId: task.id,
        at: now(),
      });
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
    if (project.phase === 'executing') return this.runExecution(projectId);
    return this.snapshot(projectId);
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

  // ─── Internals ───────────────────────────────────────────────

  private async runTask(project: OrchestratedProject, task: WorkflowTask): Promise<void> {
    let current = (await this.tasks.get(task.id)) ?? { ...task };
    let attempt = 0;

    for (;;) {
      await this.transitionTask(project.id, current, 'assigned');

      const acquiredPaths: string[] = [];
      let conflict: string | undefined;
      for (const file of current.files) {
        const result = await this.locks.acquire({
          path: file,
          holderAgentId: current.assignedAgentId ?? 'unassigned',
          taskId: current.id,
        });
        if (!result.acquired) {
          conflict = `file lock held on "${file}" by ${result.holderTaskId ?? 'another task'}`;
          await this.events.append({
            type: 'file.lock.conflict',
            projectId: project.id,
            path: file,
            taskId: current.id,
            holderAgentId: result.holderAgentId,
            at: now(),
          });
          break;
        }
        acquiredPaths.push(file);
        await this.events.append({
          type: 'file.lock.acquired',
          projectId: project.id,
          path: file,
          taskId: current.id,
          holderAgentId: result.holderAgentId,
          at: now(),
        });
      }

      if (conflict) {
        await this.releaseLocks(project.id, current.id, acquiredPaths);
        await this.tasks.updateStatus(current.id, 'blocked', conflict);
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
      const result = await this.dispatcher.dispatch(current, project);
      await this.releaseLocks(project.id, current.id, acquiredPaths);

      if (result.status === 'completed') {
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
        await this.tasks.complete(current.id, result.agentId);
        await this.events.append({
          type: 'task.completed',
          projectId: project.id,
          planId: current.planId,
          taskId: current.id,
          at: now(),
        });
        return;
      }

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
        current = (await this.tasks.get(current.id)) ?? current;
      } else {
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
    }
  }

  private async releaseLocks(projectId: string, taskId: string, paths: readonly string[]): Promise<void> {
    for (const path of paths) {
      await this.locks.release(path, taskId);
      await this.events.append({
        type: 'file.lock.released',
        projectId,
        path,
        taskId,
        at: now(),
      });
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
}
