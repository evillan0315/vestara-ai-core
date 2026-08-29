/**
 * WorkerScheduler — routes a task to the best online node (PCS-027 §6).
 *
 * 1. Capability match: the node's capabilities satisfy the task's
 *    requiredCapabilities (subset match; a node advertising a matching executor
 *    also counts).
 * 2. Least load: among candidates, pick the lowest load.
 */

import type { WorkflowTask } from '../types';
import type { WorkerRegistry } from './registry';
import type { WorkerNode } from './types';

export interface WorkerSchedulerOptions {
  /** Nodes advertising one of these executors satisfy any task. */
  readonly wildcardExecutors?: readonly string[];
}

export class WorkerScheduler {
  private readonly registry: WorkerRegistry;
  private readonly wildcardExecutors: readonly string[];

  constructor(registry: WorkerRegistry, options: WorkerSchedulerOptions = {}) {
    this.registry = registry;
    // Wildcard matching is opt-in; by default a node must advertise a matching
    // executor or satisfy the task's required capabilities (PCS-027 §6).
    this.wildcardExecutors = options.wildcardExecutors ?? [];
  }

  async select(task: WorkflowTask): Promise<WorkerNode | undefined> {
    const online = await this.registry.listOnline();
    const candidates = online.filter((node) => this.matches(task, node));
    if (candidates.length === 0) return undefined;
    return candidates.sort((a, b) => a.load - b.load)[0];
  }

  private matches(task: WorkflowTask, node: WorkerNode): boolean {
    if (this.wildcardExecutors.includes('*') && node.executors.length > 0) return true;
    if (node.executors.some((executor) => this.wildcardExecutors.includes(executor))) return true;
    const required = task.requiredCapabilities;
    if (required.length === 0) return true;
    return required.every((capability) => node.capabilities.includes(capability));
  }
}
