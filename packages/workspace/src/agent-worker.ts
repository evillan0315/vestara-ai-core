/**
 * AgentWorker — Execution abstraction for agent tasks.
 *
 * Supports three worker types:
 *   in-process  — synchronous, direct memory access (existing behavior)
 *   subprocess  — isolated Node.js child process, pipe communication
 *   remote      — network-based execution (future)
 *
 * Architecture Traceability:
 *   PCS: PCS-011 — Remote Agent Execution
 */

import * as cp from 'node:child_process';
import * as path from 'node:path';
import { AgentPermissionEngine } from './agent-permission';
import type { AgentDefinition, WorkerConfig, WorkerEvent, WorkerEventType, WorkerType } from './types';

export interface WorkerHandle {
  executionId: string;
  workerType: WorkerType;
  cancel(): Promise<void>;
  events(): AsyncIterable<WorkerEvent>;
}

const COUNTER = { w: 0 };

export function createWorker(config: WorkerConfig, agent: AgentDefinition, task: string): WorkerHandle {
  const executionId = `exec-${Date.now()}-${++COUNTER.w}`;

  switch (config.type) {
    case 'in-process':
      return createInProcessWorker(executionId, config, agent, task);
    case 'subprocess':
      return createSubprocessWorker(executionId, config, agent, task);
    case 'remote':
      throw new Error('Remote workers not yet implemented');
  }
}

/**
 * In-process worker — runs the agent task synchronously in the current process.
 */
function createInProcessWorker(
  executionId: string,
  config: WorkerConfig,
  agent: AgentDefinition,
  task: string,
): WorkerHandle {
  const eventBuffer: WorkerEvent[] = [];
  const listeners: Array<(event: WorkerEvent) => void> = [];
  let cancelled = false;

  const emit = (type: WorkerEventType, message: string, data?: unknown) => {
    const event: WorkerEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      executionId,
      type,
      message,
      timestamp: new Date().toISOString(),
      data,
    };
    eventBuffer.push(event);
    for (const listener of listeners) listener(event);
  };

  // Start execution asynchronously (fire-and-forget within the handle)
  const runTask = async () => {
    if (cancelled) return;
    emit('log', `Worker started (in-process) for agent ${config.agentId}`);
    emit('log', `Task: ${task}`);

    const perm = new AgentPermissionEngine();
    const permissionCheck = perm.check(agent, 'repository', 'read');
    if (!permissionCheck.allowed) {
      emit('error', `Permission denied: ${permissionCheck.reason}`);
      emit('complete', 'Execution failed');
      return;
    }

    if (cancelled) return;

    // Simulate task execution with progress events
    const steps = ['Analyzing', 'Generating', 'Validating'];
    for (const step of steps) {
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 100));
      emit('progress', `${step}...`, { step, progress: Math.round(((steps.indexOf(step) + 1) / steps.length) * 100) });
    }

    emit('output', `[${agent.role}] Completed task: ${task}`);
    emit('complete', 'Execution finished');
  };

  runTask().catch((err) => emit('error', err.message));

  return {
    executionId,
    workerType: 'in-process',
    cancel: async () => {
      cancelled = true;
    },
    events: () => ({
      [Symbol.asyncIterator]: async function* () {
        let idx = 0;
        while (idx < eventBuffer.length || !eventBuffer.some((e) => e.type === 'complete' || e.type === 'error')) {
          while (idx < eventBuffer.length) yield eventBuffer[idx++];
          if (eventBuffer.some((e) => e.type === 'complete' || e.type === 'error')) break;
          await new Promise((r) => setTimeout(r, 50));
        }
        while (idx < eventBuffer.length) yield eventBuffer[idx++];
      },
    }),
  };
}

/**
 * Subprocess worker — runs the agent task in an isolated Node.js child process.
 */
function createSubprocessWorker(
  executionId: string,
  config: WorkerConfig,
  agent: AgentDefinition,
  task: string,
): WorkerHandle {
  const eventBuffer: WorkerEvent[] = [];
  const listeners: Array<(event: WorkerEvent) => void> = [];
  let child: cp.ChildProcess | null = null;

  const emit = (type: WorkerEventType, message: string, data?: unknown) => {
    const event: WorkerEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      executionId,
      type,
      message,
      timestamp: new Date().toISOString(),
      data,
    };
    eventBuffer.push(event);
    for (const listener of listeners) listener(event);
  };

  // Spawn a child process that runs a worker script
  const _workerScript = `
    const task = ${JSON.stringify(task)};
    const steps = ['Analyzing', 'Generating', 'Validating'];
    async function run() {
      for (const step of steps) {
        process.send({ type: 'progress', message: step + '...' });
        await new Promise(r => setTimeout(r, 50));
      }
      process.send({ type: 'output', message: '[${agent.role}] Completed task: ' + task });
      process.send({ type: 'complete', message: 'Execution finished' });
    }
    run().catch(err => process.send({ type: 'error', message: err.message }));
  `;

  try {
    child = cp.fork(path.join(__dirname, '..', 'dist', 'worker-bootstrap.js'), [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      timeout: config.timeout,
      env: { ...process.env, VESTARA_AGENT_ID: config.agentId, VESTARA_EXECUTION_ID: executionId },
    });

    emit('log', `Worker started (subprocess, pid ${child.pid}) for agent ${config.agentId}`);
    emit('log', `Task: ${task}`);

    let procCancelled = false;
    child.on('message', (msg: any) => {
      if (procCancelled) return;
      if (msg.type) emit(msg.type, msg.message || '', msg.data);
    });
    child.on('error', (err) => emit('error', err.message));
    child.on('exit', (code) => {
      if (!eventBuffer.some((e) => e.type === 'complete')) {
        emit('complete', `Process exited with code ${code}`);
      }
    });

    // Send the task to the child process
    child.send({ task, agentId: config.agentId, executionId });

    return {
      executionId,
      workerType: 'subprocess',
      cancel: async () => {
        procCancelled = true;
        if (child) {
          try {
            child.kill();
          } catch {}
        }
      },
      events: () => ({
        [Symbol.asyncIterator]: async function* () {
          let idx = 0;
          while (idx < eventBuffer.length || !eventBuffer.some((e) => e.type === 'complete' || e.type === 'error')) {
            while (idx < eventBuffer.length) yield eventBuffer[idx++];
            if (eventBuffer.some((e) => e.type === 'complete' || e.type === 'error')) break;
            await new Promise((r) => setTimeout(r, 50));
          }
          while (idx < eventBuffer.length) yield eventBuffer[idx++];
        },
      }),
    };
  } catch (err) {
    emit('error', `Failed to spawn worker: ${(err as Error).message}`);
    emit('complete', 'Execution failed');
    return {
      executionId,
      workerType: 'subprocess',
      cancel: async () => {},
      events: () => ({
        [Symbol.asyncIterator]: async function* () {
          yield* eventBuffer;
        },
      }),
    };
  }
}
