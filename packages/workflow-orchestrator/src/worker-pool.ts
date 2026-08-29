/**
 * Worker pool + bounded concurrency (PCS-025 §12).
 *
 * Tasks execute through pluggable workers (each a `TaskDispatcher`). A remote
 * worker — subprocess, network, container — implements the same contract, so
 * the orchestrator is agnostic to where a task runs. `runWithConcurrency`
 * bounds how many tasks run at once across the pool.
 */

import type { OrchestratedProject, TaskDispatcher, TaskDispatchResult, WorkflowTask } from './types';

/** Run `items` with at most `limit` concurrent invocations. */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const active = Array.from({ length: Math.max(1, limit) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      await run(item);
    }
  });
  await Promise.all(active);
}

export interface WorkerPoolOptions {
  /** At least one worker must be provided. */
  readonly workers: readonly TaskDispatcher[];
  /** Global dispatch concurrency cap (defaults to the worker count). */
  readonly maxConcurrent?: number;
}

/** Round-robins dispatch across a pool of workers (in-process or remote). */
export class WorkerPool {
  private readonly workers: readonly TaskDispatcher[];
  private readonly maxConcurrent: number;
  private next = 0;

  constructor(options: WorkerPoolOptions) {
    if (!options.workers || options.workers.length === 0) {
      throw new Error('WorkerPool requires at least one worker');
    }
    this.workers = options.workers;
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? options.workers.length);
  }

  get size(): number {
    return this.workers.length;
  }

  get concurrency(): number {
    return this.maxConcurrent;
  }

  async dispatch(task: WorkflowTask, project: OrchestratedProject): Promise<TaskDispatchResult> {
    const worker = this.workers[this.next % this.workers.length];
    this.next += 1;
    return worker.dispatch(task, project);
  }

  /** Dispatch a set of tasks with bounded concurrency across the pool. */
  async dispatchAll(tasks: readonly WorkflowTask[], project: OrchestratedProject): Promise<void> {
    await runWithConcurrency(tasks, this.maxConcurrent, (task) => this.dispatch(task, project).then(() => undefined));
  }
}
