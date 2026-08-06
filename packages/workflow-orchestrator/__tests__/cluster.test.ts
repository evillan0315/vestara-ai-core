import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { WorkerCluster } from '../src/distributed/cluster';
import { FallbackTaskDispatcher } from '../src/distributed/fallback-dispatcher';
import { MemoryWorkerTransport } from '../src/distributed/memory-transport';
import { WorkerRegistry } from '../src/distributed/registry';
import { WorkerScheduler } from '../src/distributed/scheduler';
import { inlineExecutor, WorkerNodeRuntime } from '../src/distributed/worker-node';
import { WorkerStore } from '../src/distributed/worker-store';
import type { WorkflowTask } from '../src/types';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

function task(overrides?: Partial<WorkflowTask>): WorkflowTask {
  return {
    id: 'task-1',
    planId: 'plan-1',
    summary: 'Implement',
    description: 'Work',
    files: ['a.ts'],
    dependencies: [],
    status: 'pending',
    effort: 'medium',
    requiredCapabilities: ['code-generation'],
    revisionCount: 0,
    attemptCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const PROJECT = { id: 'project-1' } as const;

describe('WorkerRegistry (PCS-027 §4-5)', () => {
  it('registers nodes and reaps stale heartbeats offline', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()), { heartbeatTtlMs: 100 });
    await registry.register({
      id: 'node-a',
      hostname: 'laptop',
      capabilities: ['code-generation'],
      executors: ['harness'],
    });
    await registry.register({ id: 'node-b', hostname: 'server' });
    await registry.heartbeat({ nodeId: 'node-a', load: 0.2 });

    expect((await registry.listOnline()).map((node) => node.id)).toContain('node-a');
    await new Promise((resolve) => setTimeout(resolve, 120));
    const reaped = await registry.reap();
    expect(reaped).toContain('node-a');
    expect((await registry.listOnline()).map((node) => node.id)).not.toContain('node-a');
  });

  it('enableScheduling transitions offline → online', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await registry.register({ id: 'node-c', hostname: 'h' });
    await registry.markOffline('node-c');
    expect((await registry.list()).find((n) => n.id === 'node-c')?.status).toBe('offline');

    const node = await registry.enableScheduling('node-c');
    expect(node.status).toBe('online');
  });

  it('disableScheduling transitions online → draining', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await registry.register({ id: 'node-d', hostname: 'h' });
    await registry.heartbeat({ nodeId: 'node-d', load: 0 });

    const node = await registry.disableScheduling('node-d');
    expect(node.status).toBe('draining');
  });

  it('enableScheduling throws for unknown nodes', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await expect(registry.enableScheduling('nonexistent')).rejects.toThrow(/Node not found/);
  });

  it('disableScheduling throws for unknown nodes', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await expect(registry.disableScheduling('nonexistent')).rejects.toThrow(/Node not found/);
  });

  it('enableScheduling throws when already online', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await registry.register({ id: 'node-e', hostname: 'h' });
    await expect(registry.enableScheduling('node-e')).rejects.toThrow(/already online/);
  });

  it('disableScheduling throws when already offline', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await registry.register({ id: 'node-f', hostname: 'h' });
    await registry.markOffline('node-f');
    await expect(registry.disableScheduling('node-f')).rejects.toThrow(/already offline/);
  });

  it('disableScheduling throws when already draining', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await registry.register({ id: 'node-f2', hostname: 'h' });
    await registry.disableScheduling('node-f2');
    await expect(registry.disableScheduling('node-f2')).rejects.toThrow(/already draining/);
  });

  it('enableScheduling cancels draining → online', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await registry.register({ id: 'node-h', hostname: 'h' });
    await registry.disableScheduling('node-h');
    expect((await registry.list()).find((n) => n.id === 'node-h')?.status).toBe('draining');

    const node = await registry.enableScheduling('node-h');
    expect(node.status).toBe('online');
  });

  it('reconcileDraining transitions draining → offline when no active leases', async () => {
    const store = new WorkerStore(new SQL.Database());
    const registry = new WorkerRegistry(store);
    await registry.register({ id: 'node-i', hostname: 'h' });
    await registry.disableScheduling('node-i');
    expect((await registry.list()).find((n) => n.id === 'node-i')?.status).toBe('draining');

    const reconciled = await registry.reconcileDraining(store);
    expect(reconciled).toEqual(['node-i']);
    expect((await registry.list()).find((n) => n.id === 'node-i')?.status).toBe('offline');
  });

  it('reconcileDraining does not transition draining nodes with active leases', async () => {
    const store = new WorkerStore(new SQL.Database());
    const registry = new WorkerRegistry(store);
    await registry.register({ id: 'node-j', hostname: 'h' });
    await registry.disableScheduling('node-j');
    await store.acquireLease({
      leaseId: 'lease-active',
      executionId: 'exec-1',
      nodeId: 'node-j',
      task: { id: 'task-1', planId: 'p', summary: 'Work', description: '', files: [], dependencies: [], status: 'pending', effort: 'medium', requiredCapabilities: [], revisionCount: 0, attemptCount: 0, createdAt: '', updatedAt: '' },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const reconciled = await registry.reconcileDraining(store);
    expect(reconciled).toEqual([]);
    expect((await registry.list()).find((n) => n.id === 'node-j')?.status).toBe('draining');
  });

  it('listOnline excludes draining nodes', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await registry.register({ id: 'node-g1', hostname: 'h1' });
    await registry.register({ id: 'node-g2', hostname: 'h2' });
    await registry.heartbeat({ nodeId: 'node-g1', load: 0 });
    await registry.heartbeat({ nodeId: 'node-g2', load: 0 });
    await registry.disableScheduling('node-g2');

    const online = await registry.listOnline();
    expect(online.map((n) => n.id)).toEqual(['node-g1']);
  });
});

describe('WorkerScheduler (PCS-027 §6)', () => {
  it('routes a task to a node satisfying its capabilities', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await registry.register({ id: 'node-fs', hostname: 'h1', capabilities: ['filesystem.write'] });
    await registry.register({ id: 'node-dev', hostname: 'h2', capabilities: ['code-generation'] });
    await registry.heartbeat({ nodeId: 'node-fs', load: 0 });
    await registry.heartbeat({ nodeId: 'node-dev', load: 0 });

    const scheduler = new WorkerScheduler(registry);
    const selected = await scheduler.select(task());
    expect(selected?.id).toBe('node-dev');
  });

  it('breaks ties by least load', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await registry.register({ id: 'busy', hostname: 'h1', capabilities: ['code-generation'] });
    await registry.register({ id: 'idle', hostname: 'h2', capabilities: ['code-generation'] });
    await registry.heartbeat({ nodeId: 'busy', load: 0.9 });
    await registry.heartbeat({ nodeId: 'idle', load: 0.1 });

    const scheduler = new WorkerScheduler(registry);
    expect((await scheduler.select(task()))?.id).toBe('idle');
  });
});

describe('WorkerCluster over an in-memory transport', () => {
  function makeCluster(onDispatch: () => void) {
    const store = new WorkerStore(new SQL.Database());
    const registry = new WorkerRegistry(store);
    const devNode = new WorkerNodeRuntime({
      nodeId: 'node-dev',
      executor: inlineExecutor({
        dispatch: async () => {
          onDispatch();
          return { status: 'completed', agentId: 'remote-dev', output: 'done remotely' };
        },
      }),
    });
    const cluster = new WorkerCluster({
      registry,
      scheduler: new WorkerScheduler(registry),
      store,
      transportFor: (nodeId) => new MemoryWorkerTransport(nodeId === 'node-dev' ? devNode : devNode),
    });
    return { cluster, devNode, registry };
  }

  it('dispatches a task to a remote node executor and returns the result', async () => {
    let calls = 0;
    const { cluster, registry } = makeCluster(() => (calls += 1));
    await registry.register({
      id: 'node-dev',
      hostname: 'server',
      capabilities: ['code-generation'],
      executors: ['harness'],
    });
    await registry.heartbeat({ nodeId: 'node-dev', load: 0 });

    const result = await cluster.dispatch(task(), PROJECT);
    expect(result.status).toBe('completed');
    expect(result.output).toBe('done remotely');
    expect(result.agentId).toBe('remote-dev');
    expect(calls).toBe(1);
  });

  it('is idempotent — a re-dispatched executionId does not re-execute', async () => {
    let calls = 0;
    const { cluster, registry } = makeCluster(() => (calls += 1));
    await registry.register({
      id: 'node-dev',
      hostname: 'server',
      capabilities: ['code-generation'],
      executors: ['harness'],
    });
    await registry.heartbeat({ nodeId: 'node-dev', load: 0 });

    await cluster.dispatch(task(), PROJECT);
    await cluster.dispatch(task(), PROJECT); // same task.id → same executionId
    expect(calls).toBe(1);
  });

  it('supports review and test through the cluster', async () => {
    const store = new WorkerStore(new SQL.Database());
    const registry = new WorkerRegistry(store);
    const node = new WorkerNodeRuntime({
      nodeId: 'node-r',
      executor: inlineExecutor({
        review: async () => ({ decision: 'changes-requested', feedback: 'from remote' }),
        test: async () => ({ status: 'passed' }),
      }),
    });
    const cluster = new WorkerCluster({
      registry,
      scheduler: new WorkerScheduler(registry),
      store,
      transportFor: () => new MemoryWorkerTransport(node),
    });
    await registry.register({ id: 'node-r', hostname: 'h', capabilities: ['code-generation'], executors: ['harness'] });
    await registry.heartbeat({ nodeId: 'node-r', load: 0 });

    const review = await cluster.review(task(), PROJECT, [{ taskId: 't' }]);
    expect(review.decision).toBe('changes-requested');
    expect(review.feedback).toBe('from remote');
    expect((await cluster.test(task(), PROJECT)).status).toBe('passed');
  });

  it('throws when no online node satisfies the task', async () => {
    const { cluster } = makeCluster(() => {});
    await expect(cluster.dispatch(task(), PROJECT)).rejects.toThrow(/No online worker/);
  });
});

describe('FallbackTaskDispatcher (PCS-027 orchestrator integration)', () => {
  class RecordingDispatcher {
    calls: string[] = [];
    async dispatch() {
      this.calls.push('dispatch');
      return { status: 'completed' as const };
    }
    async review() {
      this.calls.push('review');
      return { decision: 'approved' as const };
    }
    async test() {
      this.calls.push('test');
      return { status: 'passed' as const };
    }
  }

  it('prefers the primary dispatcher when it is ready', async () => {
    const primary = new RecordingDispatcher();
    const fallback = new RecordingDispatcher();
    const dispatcher = new FallbackTaskDispatcher({
      primary,
      fallback,
      primaryReady: async () => true,
    });
    await dispatcher.dispatch(task(), PROJECT);
    await dispatcher.review(task(), PROJECT, []);
    await dispatcher.test(task(), PROJECT);
    expect(primary.calls).toEqual(['dispatch', 'review', 'test']);
    expect(fallback.calls).toHaveLength(0);
  });

  it('falls back when the primary is not ready', async () => {
    const primary = new RecordingDispatcher();
    const fallback = new RecordingDispatcher();
    const dispatcher = new FallbackTaskDispatcher({
      primary,
      fallback,
      primaryReady: async () => false,
    });
    await dispatcher.dispatch(task(), PROJECT);
    expect(fallback.calls).toEqual(['dispatch']);
    expect(primary.calls).toHaveLength(0);
  });
});

describe('PCS-027 §6-8 — capability matching, lease reaping, evidence', () => {
  it('does not route to a node without matching capabilities when wildcard is off (default)', async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()));
    await registry.register({ id: 'node-empty', hostname: 'h', capabilities: [] });
    await registry.heartbeat({ nodeId: 'node-empty', load: 0 });

    const scheduler = new WorkerScheduler(registry); // default: no wildcard
    expect(await scheduler.select(task())).toBeUndefined();
  });

  it('reaps expired leases', async () => {
    const store = new WorkerStore(new SQL.Database());
    await store.acquireLease({
      leaseId: 'lease-expired',
      executionId: 'exec-1',
      nodeId: 'node-a',
      task: task(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await store.acquireLease({
      leaseId: 'lease-live',
      executionId: 'exec-2',
      nodeId: 'node-a',
      task: task(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const reaped = await store.reapExpiredLeases();
    expect(reaped).toEqual(['lease-expired']);
    const remaining = await store.listActiveLeases();
    expect(remaining.map((lease) => lease.leaseId)).toEqual(['lease-live']);
  });

  it('records evidence for a completed remote dispatch via onRemoteResult', async () => {
    const store = new WorkerStore(new SQL.Database());
    const registry = new WorkerRegistry(store);
    const node = new WorkerNodeRuntime({
      nodeId: 'node-ev',
      executor: inlineExecutor({ dispatch: async () => ({ status: 'completed', agentId: 'remote' }) }),
    });
    const evidence: string[] = [];
    const cluster = new WorkerCluster({
      registry,
      scheduler: new WorkerScheduler(registry),
      store,
      transportFor: () => new MemoryWorkerTransport(node),
      onRemoteResult: async ({ task: t, result }) => {
        evidence.push(`${t.id}:${result.status}`);
      },
    });
    await registry.register({ id: 'node-ev', hostname: 'h', capabilities: ['code-generation'] });
    await registry.heartbeat({ nodeId: 'node-ev', load: 0 });

    const result = await cluster.dispatch(task(), PROJECT);
    expect(result.status).toBe('completed');
    expect(evidence).toEqual(['task-1:completed']);
  });
});
