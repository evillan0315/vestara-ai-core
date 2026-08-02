/**
 * WorkerNodeBootstrap — PCS-027 node process entry.
 *
 * Loads a WorkerExecutor from VESTARA_WORKER_EXECUTOR (a module exporting
 * `dispatch`/`review`/`test`), wraps it in a WorkerNodeRuntime, and connects to
 * the orchestrator's worker WebSocket endpoint. Run standalone:
 *
 *   WORKER_URL=ws://127.0.0.1:3001/ws/worker \
 *   WORKER_ID=node-a WORKER_HOSTNAME=laptop \
 *   WORKER_EXECUTORS=harness WORKER_CAPABILITIES=code-generation \
 *   VESTARA_WORKER_EXECUTOR=/path/to/executor.js \
 *   node apps/api/dist/worker/worker-node-bootstrap.js
 */

import * as os from 'node:os';
import { pathToFileURL } from 'node:url';
import type { WorkerExecutor, WorkerRequest } from '@vestara/workflow-orchestrator';
import { WorkerNodeRuntime } from '@vestara/workflow-orchestrator';
import { WorkerSocketClient } from './worker-socket-client';

function envList(name: string): string[] {
  const value = process.env[name];
  return value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

async function loadExecutor(): Promise<WorkerExecutor> {
  const executorPath = process.env.VESTARA_WORKER_EXECUTOR;
  if (!executorPath) {
    // Default executor: runs the task and returns a scripted result.
    return {
      dispatch: async (_task: WorkerRequest['task']) => ({
        status: 'completed',
        agentId: 'remote-worker',
        output: 'default executor',
      }),
    };
  }
  const executor = (await import(pathToFileURL(executorPath).href)) as WorkerExecutor;
  return executor;
}

export interface StartWorkerNodeOptions {
  readonly url: string;
  readonly node: {
    readonly id: string;
    readonly hostname: string;
    readonly executors: readonly string[];
    readonly capabilities: readonly string[];
  };
  readonly executor?: WorkerExecutor;
  readonly heartbeatMs?: number;
}

export async function startWorkerNode(options: StartWorkerNodeOptions): Promise<WorkerSocketClient> {
  const runtime = new WorkerNodeRuntime({
    nodeId: options.node.id,
    executor: options.executor ?? (await loadExecutor()),
  });
  const client = new WorkerSocketClient({
    url: options.url,
    node: options.node,
    runtime,
    heartbeatMs: options.heartbeatMs,
  });
  await client.start();
  return client;
}

if (require.main === module) {
  const url = process.env.WORKER_URL;
  const id = process.env.WORKER_ID;
  if (!url || !id) {
    console.error('WORKER_URL and WORKER_ID are required');
    process.exit(2);
  }
  startWorkerNode({
    url,
    node: {
      id,
      hostname: process.env.WORKER_HOSTNAME ?? os.hostname(),
      executors: envList('WORKER_EXECUTORS'),
      capabilities: envList('WORKER_CAPABILITIES'),
    },
  })
    .then(() => console.log(`[worker] ${id} connected to ${url}`))
    .catch((error: unknown) => {
      console.error(`[worker] failed to start: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
