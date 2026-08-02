/**
 * WorkerCluster — the distributed worker endpoint the orchestrator uses
 * (PCS-027 §6, §7). Selects a node via the scheduler, acquires a lease,
 * dispatches through a RemoteWorkerDispatcher over the configured transport,
 * and releases the lease. Failure recovery (re-dispatch on lease expiry) rides
 * the existing RetryPolicy at the orchestrator level; executionId idempotency
 * is guaranteed by the node runtime.
 */

import { now } from '../db';
import type {
  OrchestratedProject,
  TaskDispatcher,
  TaskDispatchResult,
  TaskReviewResult,
  TaskTestResult,
  WorkflowTask,
} from '../types';
import type { WorkerRegistry } from './registry';
import { RemoteWorkerDispatcher } from './remote-dispatcher';
import type { WorkerScheduler } from './scheduler';
import type { WorkerTransport } from './types';
import type { WorkerStore } from './worker-store';

export interface WorkerClusterOptions {
  readonly registry: WorkerRegistry;
  readonly scheduler: WorkerScheduler;
  /** Lease + node persistence. */
  readonly store: WorkerStore;
  /** Build a transport to a node (WebSocket in production, in-memory in tests). */
  readonly transportFor: (nodeId: string) => WorkerTransport;
  readonly leaseDurationMs?: number;
}

export class WorkerCluster implements TaskDispatcher {
  private readonly registry: WorkerRegistry;
  private readonly scheduler: WorkerScheduler;
  private readonly store: WorkerStore;
  private readonly transportFor: (nodeId: string) => WorkerTransport;
  private readonly leaseDurationMs: number;
  private seq = 0;

  constructor(options: WorkerClusterOptions) {
    this.registry = options.registry;
    this.scheduler = options.scheduler;
    this.store = options.store;
    this.transportFor = options.transportFor;
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
  }

  async dispatch(task: WorkflowTask, project: OrchestratedProject): Promise<TaskDispatchResult> {
    return this.withNode(task, project, (dispatcher) => dispatcher.dispatch(task, project));
  }

  async review(
    task: WorkflowTask,
    project: OrchestratedProject,
    changesets: readonly Readonly<Record<string, unknown>>[],
  ): Promise<TaskReviewResult> {
    return this.withNode(task, project, (dispatcher) => dispatcher.review(task, project, changesets));
  }

  async test(task: WorkflowTask, project: OrchestratedProject): Promise<TaskTestResult> {
    return this.withNode(task, project, (dispatcher) => dispatcher.test(task, project));
  }

  private async withNode<T>(
    task: WorkflowTask,
    project: OrchestratedProject,
    run: (dispatcher: RemoteWorkerDispatcher) => Promise<T>,
  ): Promise<T> {
    const node = await this.scheduler.select(task);
    if (!node) throw new Error(`No online worker satisfies task "${task.id}"`);
    const leaseId = `lease-${Date.now()}-${++this.seq}`;
    const executionId = `exec-${task.id}`;
    await this.store.acquireLease({
      leaseId,
      executionId,
      nodeId: node.id,
      task,
      expiresAt: new Date(Date.now() + this.leaseDurationMs).toISOString(),
    });
    const dispatcher = new RemoteWorkerDispatcher(this.transportFor(node.id), node.id);
    try {
      return await run(dispatcher);
    } finally {
      await this.store.releaseLease(leaseId);
    }
  }
}
