/**
 * FallbackTaskDispatcher — PCS-027 orchestrator integration.
 *
 * Prefers a primary dispatcher (e.g. the WorkerCluster) when its readiness
 * predicate is true (online worker nodes registered), otherwise falls back to a
 * local dispatcher (the harness). Lets the orchestrator dispatch through the
 * distributed cluster when available without changing when nodes are offline.
 */

import type {
  OrchestratedProject,
  TaskDispatcher,
  TaskDispatchResult,
  TaskReviewResult,
  TaskTestResult,
  WorkflowTask,
} from '../types';

export class FallbackTaskDispatcher implements TaskDispatcher {
  private readonly primary: TaskDispatcher;
  private readonly fallback: TaskDispatcher;
  private readonly primaryReady: () => Promise<boolean>;

  constructor(options: {
    readonly primary: TaskDispatcher;
    readonly fallback: TaskDispatcher;
    readonly primaryReady: () => Promise<boolean>;
  }) {
    this.primary = options.primary;
    this.fallback = options.fallback;
    this.primaryReady = options.primaryReady;
  }

  private async pick(): Promise<TaskDispatcher> {
    try {
      return (await this.primaryReady()) ? this.primary : this.fallback;
    } catch {
      return this.fallback;
    }
  }

  async dispatch(task: WorkflowTask, project: OrchestratedProject): Promise<TaskDispatchResult> {
    return (await this.pick()).dispatch(task, project);
  }

  async review(
    task: WorkflowTask,
    project: OrchestratedProject,
    changesets: readonly Readonly<Record<string, unknown>>[],
  ): Promise<TaskReviewResult> {
    const dispatcher = await this.pick();
    if (dispatcher.review) return dispatcher.review(task, project, changesets);
    return { decision: 'approved' };
  }

  async test(task: WorkflowTask, project: OrchestratedProject): Promise<TaskTestResult> {
    const dispatcher = await this.pick();
    if (dispatcher.test) return dispatcher.test(task, project);
    return { status: 'passed' };
  }
}
