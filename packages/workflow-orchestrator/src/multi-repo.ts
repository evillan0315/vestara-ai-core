/**
 * MultiRepoOrchestrator — multi-repo parent orchestration (PCS-025 §16).
 *
 * One WorkflowOrchestrator owns the workflow state of each repository; a parent
 * project aggregates the per-repo sub-projects. Each repo's plan is driven
 * through its own orchestrator (analyze → plan → architecture → approve →
 * execute → verify) and linked to the parent for aggregate status and metrics.
 */

import { now } from './db';
import type { WorkflowOrchestrator } from './orchestrator';
import type { ParentProject, ParentProjectChild, ParentProjectStore } from './stores/parent-project-store';
import type { CreateTaskInput } from './stores/task-store';
import type { OrchestrationEventSink, ProjectMetrics } from './types';

export interface RepoBinding {
  readonly repoPath: string;
  readonly orchestrator: WorkflowOrchestrator;
}

export interface RepoPlan {
  readonly title: string;
  readonly goal: string;
  readonly tasks: readonly CreateTaskInput[];
}

export interface MultiRepoOptions {
  readonly bindings: readonly RepoBinding[];
  readonly parents: ParentProjectStore;
  readonly workspaceId: string;
  readonly events?: OrchestrationEventSink;
}

export interface ParentRunResult {
  readonly parent: ParentProject;
  readonly subProjects: Readonly<Record<string, string>>;
  readonly completed: boolean;
}

export class MultiRepoOrchestrator {
  private readonly bindings: readonly RepoBinding[];
  private readonly parents: ParentProjectStore;
  private readonly workspaceId: string;
  private readonly events?: OrchestrationEventSink;

  constructor(options: MultiRepoOptions) {
    this.bindings = options.bindings;
    this.parents = options.parents;
    this.workspaceId = options.workspaceId;
    this.events = options.events;
  }

  /** Create a parent project record (children not yet linked). */
  async createParentProject(input: {
    readonly name: string;
    readonly goal: string;
    readonly repoPath: string;
  }): Promise<ParentProject> {
    const parent = await this.parents.createParent({ ...input, workspaceId: this.workspaceId });
    await this.events?.append({
      type: 'parent.created',
      projectId: parent.id,
      name: parent.name,
      goal: parent.goal,
      at: now(),
    });
    return parent;
  }

  /**
   * Drive a per-repo plan through each bound orchestrator to completion and
   * link the sub-projects to the parent.
   */
  async runParentProject(
    input: { readonly name: string; readonly goal: string; readonly repoPath: string },
    plansByRepo: Readonly<Record<string, RepoPlan>>,
  ): Promise<ParentRunResult> {
    const parent = await this.createParentProject(input);
    const subProjects: Record<string, string> = {};

    for (const [repoPath, plan] of Object.entries(plansByRepo)) {
      const binding = this.bindingFor(repoPath);
      if (!binding) throw new Error(`No orchestrator bound to repo "${repoPath}"`);
      const childProjectId = await this.runRepo(binding, parent.id, plan);
      await this.parents.linkChild({ parentId: parent.id, repoPath, childProjectId });
      subProjects[repoPath] = childProjectId;
    }

    const completed = await this.isComplete(parent.id);
    await this.parents.updateStatus(parent.id, completed ? 'completed' : 'running');
    if (completed) {
      await this.events?.append({ type: 'parent.completed', projectId: parent.id, at: now() });
    }
    return { parent: (await this.parents.getParent(parent.id)) ?? parent, subProjects, completed };
  }

  /** Aggregate metrics across all child sub-projects of a parent. */
  async aggregateMetrics(parentId: string): Promise<ProjectMetrics[]> {
    const children = await this.parents.listChildren(parentId);
    const metrics: ProjectMetrics[] = [];
    for (const child of children) {
      const binding = this.bindingFor(child.repoPath);
      if (binding) metrics.push(await binding.orchestrator.metrics(child.childProjectId));
    }
    return metrics;
  }

  /** Derived parent status from its child projects' terminal states. */
  async parentStatus(parentId: string): Promise<ParentProject['status']> {
    const children = await this.parents.listChildren(parentId);
    if (children.length === 0) return 'running';
    const terminal: ParentProject['status'][] = [];
    for (const child of children) {
      const binding = this.bindingFor(child.repoPath);
      if (!binding) continue;
      const snapshot = await binding.orchestrator.snapshot(child.childProjectId);
      if (snapshot.status === 'completed' || snapshot.status === 'archived') terminal.push('completed');
      else if (snapshot.status === 'cancelled') terminal.push('cancelled');
      else terminal.push('running');
    }
    if (terminal.every((status) => status === 'completed')) return 'completed';
    if (terminal.some((status) => status === 'cancelled')) return 'cancelled';
    return 'running';
  }

  async children(parentId: string): Promise<ParentProjectChild[]> {
    return this.parents.listChildren(parentId);
  }

  private async runRepo(binding: RepoBinding, parentId: string, plan: RepoPlan): Promise<string> {
    const o = binding.orchestrator;
    const project = await o.createProject({
      name: plan.title,
      goal: plan.goal,
      repoPath: binding.repoPath,
      workspaceId: this.workspaceId,
    });
    await o.startProject(project.id);
    await o.completeAnalysis(project.id, { analystId: 'analyst', report: {} });
    await o.generatePlan(project.id, { plannerId: 'planner', title: plan.title, goal: plan.goal, tasks: plan.tasks });
    await o.reviewArchitecture(project.id, { architectId: 'architect', status: 'approved' });
    await o.approveProject(project.id, { approvalId: `parent:${parentId}` });
    await o.runExecution(project.id);
    const snapshot = await o.snapshot(project.id);
    const passed = snapshot.tasks.every((task) => task.status === 'completed' || task.status === 'cancelled');
    await o.runVerification(project.id, { verifierId: 'verifier', report: {}, passed });
    return project.id;
  }

  private async isComplete(parentId: string): Promise<boolean> {
    const children = await this.parents.listChildren(parentId);
    if (children.length === 0) return false;
    for (const child of children) {
      const binding = this.bindingFor(child.repoPath);
      if (!binding) return false;
      const snapshot = await binding.orchestrator.snapshot(child.childProjectId);
      if (snapshot.status !== 'completed' && snapshot.status !== 'archived') return false;
    }
    return true;
  }

  private bindingFor(repoPath: string): RepoBinding | undefined {
    return this.bindings.find((binding) => binding.repoPath === repoPath);
  }
}
