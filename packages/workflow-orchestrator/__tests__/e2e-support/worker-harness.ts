/**
 * WFO-E2E-001D worker scenario harness.
 *
 * Wires a WorkerCluster with scripted in-memory worker nodes so execution
 * leasing, draining, recovery, and attempt authority can be exercised
 * deterministically.
 */

import { migrate } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import { WorkerCluster } from '../../src/distributed/cluster';
import { MemoryWorkerTransport } from '../../src/distributed/memory-transport';
import { WorkerRegistry } from '../../src/distributed/registry';
import { WorkerScheduler } from '../../src/distributed/scheduler';
import type { WorkerTransport } from '../../src/distributed/types';
import { type WorkerExecutor, WorkerNodeRuntime } from '../../src/distributed/worker-node';
import { WorkerStore } from '../../src/distributed/worker-store';
import { ORCHESTRATION_MANIFEST } from '../../src/orchestration-migrations';

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export class WorkerScenarioHarness {
  readonly store: WorkerStore;
  readonly registry: WorkerRegistry;
  readonly cluster: WorkerCluster;
  private readonly transports = new Map<string, WorkerTransport>();

  constructor(
    readonly db: Database,
    leaseDurationMs = 30_000,
  ) {
    migrate(db, ORCHESTRATION_MANIFEST, {});
    this.store = new WorkerStore(db);
    this.registry = new WorkerRegistry(this.store, { heartbeatTtlMs: 10_000 });
    const scheduler = new WorkerScheduler(this.registry);
    this.cluster = new WorkerCluster({
      registry: this.registry,
      scheduler,
      store: this.store,
      leaseDurationMs,
      transportFor: (nodeId) => {
        const transport = this.transports.get(nodeId);
        if (!transport) throw new Error(`no transport for node ${nodeId}`);
        return transport;
      },
    });
  }

  async addNode(id: string, executor: WorkerExecutor): Promise<void> {
    const node = new WorkerNodeRuntime({ nodeId: id, executor });
    this.transports.set(id, new MemoryWorkerTransport(node));
    await this.registry.register({ id, hostname: id, capabilities: ['code-generation'], executors: ['harness'] });
    await this.registry.heartbeat({ nodeId: id, load: 0 });
  }
}
