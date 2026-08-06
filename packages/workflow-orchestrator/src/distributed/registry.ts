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
      if (node.status === 'offline' || node.status === 'draining') return false;
      return new Date(node.lastHeartbeatAt).getTime() >= cutoff;
    });
  }

  /**
   * Enable scheduling for a node — transitions offline/draining → online.
   * If the node is draining, this cancels the drain. Returns the updated node.
   * Throws if the node is not registered or already online.
   */
  async enableScheduling(nodeId: string): Promise<WorkerNode> {
    const node = await this.store.getNode(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (node.status === 'online') throw new Error(`Node is already online: ${nodeId}`);
    await this.store.markStatus(nodeId, 'online');
    return (await this.store.getNode(nodeId))!;
  }

  /**
   * Disable scheduling for a node — transitions online → draining.
   * Once active tasks reach zero, the node transitions to offline via
   * `reconcileDraining()`. Returns the updated node.
   * Throws if the node is not registered, already offline, or already draining.
   */
  async disableScheduling(nodeId: string): Promise<WorkerNode> {
    const node = await this.store.getNode(nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    if (node.status === 'offline') throw new Error(`Node is already offline: ${nodeId}`);
    if (node.status === 'draining') throw new Error(`Node is already draining: ${nodeId}`);
    await this.store.markStatus(nodeId, 'draining');
    return (await this.store.getNode(nodeId))!;
  }

  /**
   * Reconcile draining nodes — transitions draining → offline when the node
   * has no active leases. Called after lease release to complete the drain.
   * Returns the ids of nodes that transitioned to offline.
   */
  async reconcileDraining(store: { listActiveLeases(nodeId?: string): Promise<readonly { nodeId: string }[]> }): Promise<string[]> {
    const nodes = await this.store.listNodes();
    const draining = nodes.filter((node) => node.status === 'draining');
    const reconciled: string[] = [];
    for (const node of draining) {
      const leases = await store.listActiveLeases(node.id);
      if (leases.length === 0) {
        await this.store.markStatus(node.id, 'offline');
        reconciled.push(node.id);
      }
    }
    return reconciled;
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
