import type { WorkflowTask } from '@vestara/workflow-orchestrator';
import { inlineExecutor, WorkerNodeRuntime, WorkerRegistry, WorkerStore } from '@vestara/workflow-orchestrator';
import type { Database } from 'sql.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { WorkerSocketClient } from '../src/worker/worker-socket-client';
import { WorkerSocketServer } from '../src/worker/worker-socket-server';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

function task(overrides?: Partial<WorkflowTask>): WorkflowTask {
  return {
    id: 'task-ws',
    planId: 'plan-1',
    summary: 'Remote work',
    description: 'Do it remotely',
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

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('timed out waiting for condition');
}

describe('Worker WebSocket transport (PCS-027 slice 2)', () => {
  let wss: WebSocketServer;
  let server: WorkerSocketServer;
  let client: WorkerSocketClient;
  let events: Array<{ type: string; nodeId: string }>;
  let executions = 0;

  beforeAll(async () => {
    const registry = new WorkerRegistry(new WorkerStore(new SQL.Database()), { heartbeatTtlMs: 60_000 });
    events = [];
    server = new WorkerSocketServer(registry, { append: (event) => events.push(event) });
    wss = new WebSocketServer({ port: 0 });
    server.attach(wss);
    const address = wss.address() as { port: number };

    const runtime = new WorkerNodeRuntime({
      nodeId: 'node-ws',
      executor: inlineExecutor({
        dispatch: async () => {
          executions += 1;
          return { status: 'completed', agentId: 'ws-node', output: 'done over websocket' };
        },
      }),
    });
    client = new WorkerSocketClient({
      url: `ws://127.0.0.1:${address.port}/ws/worker`,
      node: { id: 'node-ws', hostname: 'laptop', executors: ['harness'], capabilities: ['code-generation'] },
      runtime,
    });
    await client.start();
    await waitFor(async () => (await registry.list()).some((node) => node.id === 'node-ws'));
  });

  afterAll(() => {
    client.stop();
    wss.close();
  });

  it('registers the node and emits worker.registered', async () => {
    expect(events.some((event) => event.type === 'worker.registered' && event.nodeId === 'node-ws')).toBe(true);
  });

  it('routes a dispatch request over WebSocket and returns the result', async () => {
    const transport = server.transportFor('node-ws');
    const response = await transport.send({
      kind: 'dispatch',
      requestId: 'req-1',
      executionId: `exec-${task().id}`,
      task: task(),
      projectId: 'p1',
    });
    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.result).toMatchObject({ status: 'completed', agentId: 'ws-node' });
    }
    expect(executions).toBe(1);
  });

  it('is idempotent across WebSocket requests (same executionId cached)', async () => {
    const transport = server.transportFor('node-ws');
    await transport.send({
      kind: 'dispatch',
      requestId: 'req-2',
      executionId: 'exec-task-ws',
      task: task(),
      projectId: 'p1',
    });
    await transport.send({
      kind: 'dispatch',
      requestId: 'req-3',
      executionId: 'exec-task-ws',
      task: task(),
      projectId: 'p1',
    });
    expect(executions).toBe(1);
  });

  it('rejects a request to an unknown node', async () => {
    const transport = server.transportFor('missing-node');
    await expect(
      transport.send({ kind: 'dispatch', requestId: 'req-4', executionId: 'e', task: task(), projectId: 'p1' }),
    ).rejects.toThrow(/not connected/);
  });
});
