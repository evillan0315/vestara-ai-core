/**
 * WorkerRegistry — durable registration + liveness over WorkerStore
 * (PCS-027 §4, §5).
 */

import { now } from '../db';
import type { WorkerNode, WorkerNodeStatus } from './types';
import type { WorkerStore } from './worker-store';

export interface WorkerRegistryOptions {
  /** Node liveness TTL — a node whose heartbeat is older is treated offline. */
  readonly heartbeatTtlMs?: number;
}

export class WorkerRegistry {
  private readonly store: WorkerStore;
  private readonly heartbeatTtlMs: number;

  constructor(store: WorkerStore, options: WorkerRegistryOptions = {}) {
    this.store = store;
    this.heartbeatTtlMs = options.heartbeatTtlMs ?? 15_000;
  }

  async register(input: {
    readonly id: string;
    readonly hostname: string;
    readonly executors?: readonly string[];
    readonly capabilities?: readonly string[];
  }): Promise<WorkerNode> {
    return this.store.registerNode(input);
  }

  async heartbeat(input: {
    readonly nodeId: string;
    readonly load: number;
    readonly status?: 'ok' | 'draining' | 'overloaded';
  }): Promise<void> {
    const status: WorkerNodeStatus = input.status === 'draining' ? 'draining' : 'online';
    await this.store.updateHeartbeat(input.nodeId, input.load, status);
  }

  async markOffline(nodeId: string): Promise<void> {
    await this.store.markStatus(nodeId, 'offline');
  }

  async list(): Promise<WorkerNode[]> {
    return this.store.listNodes();
  }

  async listOnline(): Promise<WorkerNode[]> {
    const nodes = await this.store.listNodes();
    const cutoff = Date.now() - this.heartbeatTtlMs;
    return nodes.filter((node) => {
      if (node.status === 'offline' || node.status === 'draining') return node.status === 'draining';
      return new Date(node.lastHeartbeatAt).getTime() >= cutoff;
    });
  }

  /** Mark nodes whose heartbeat lapsed as offline. Returns the ids. */
  async reap(): Promise<string[]> {
    const nodes = await this.store.listNodes();
    const cutoff = Date.now() - this.heartbeatTtlMs;
    const stale = nodes.filter(
      (node) => node.status !== 'offline' && new Date(node.lastHeartbeatAt).getTime() < cutoff,
    );
    for (const node of stale) await this.store.markStatus(node.id, 'offline');
    return stale.map((node) => node.id);
  }

  currentTime(): string {
    return now();
  }
}
