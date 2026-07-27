/**
 * AgentCoordinator — Manages agent worker lifecycle, dispatch, and monitoring.
 *
 * Integrates with AgentRuntime to provide execution isolation via workers.
 * Supports in-process, subprocess, and remote worker types.
 *
 * Architecture Traceability:
 *   PCS: PCS-011 — Remote Agent Execution
 */

import type { AIProvider } from '@vestara/shared';
import { AgentPermissionEngine } from './agent-permission';
import type { AgentStorage } from './agent-storage';
import { createWorker, type WorkerHandle } from './agent-worker';
import type { WorkerConfig, WorkerEvent, WorkerType } from './types';
import type { WorkspaceSession } from './workspace-session';

export interface DispatchResult {
  executionId: string;
  workerType: WorkerType;
  events: WorkerEvent[];
  duration: number;
}

export class AgentCoordinator {
  private storage: AgentStorage;
  private permission: AgentPermissionEngine;
  private provider?: AIProvider;
  private activeWorkers: Map<string, WorkerHandle> = new Map();

  constructor(opts: { storage: AgentStorage; provider?: AIProvider }) {
    this.storage = opts.storage;
    this.permission = new AgentPermissionEngine();
    this.provider = opts.provider;
  }

  /**
   * Dispatch an agent task to a worker. Collects all events and returns the result.
   */
  async dispatch(
    agentId: string,
    task: string,
    workerType: WorkerType = 'subprocess',
    _session?: WorkspaceSession,
  ): Promise<DispatchResult> {
    const startTime = performance.now();
    const agent = await this.storage.getAgent(agentId);
    if (!agent) throw new Error(`Agent "${agentId}" not found.`);

    // Permission check
    const permCheck = this.permission.check(agent, 'repository', 'read');
    if (!permCheck.allowed) throw new Error(permCheck.reason);

    // Create execution record
    const execution = await this.storage.createExecution(agentId, task);
    await this.storage.updateExecutionStatus(execution.id, 'running');

    // Create worker config
    const config: WorkerConfig = {
      type: workerType,
      agentId,
      timeout: 120000,
      allowedCapabilities: agent.capabilities,
    };

    // Create and track the worker
    const worker = createWorker(config, agent, task);
    this.activeWorkers.set(execution.id, worker);

    // Collect events
    const events: WorkerEvent[] = [];
    try {
      for await (const event of worker.events()) {
        events.push(event);
      }
    } catch (err) {
      await this.storage.updateExecutionStatus(execution.id, 'failed', (err as Error).message);
      throw err;
    } finally {
      this.activeWorkers.delete(execution.id);
    }

    // Determine status from events
    const hasError = events.some((e) => e.type === 'error');
    const status = hasError ? 'failed' : 'completed';
    const lastEvent = events.find((e) => e.type === 'complete' || e.type === 'error');
    await this.storage.updateExecutionStatus(execution.id, status, lastEvent?.message);

    return {
      executionId: execution.id,
      workerType,
      events,
      duration: Math.round(performance.now() - startTime),
    };
  }

  /**
   * Cancel a running worker.
   */
  async cancel(executionId: string): Promise<void> {
    const worker = this.activeWorkers.get(executionId);
    if (worker) {
      await worker.cancel();
      await this.storage.updateExecutionStatus(executionId, 'failed', 'Cancelled by user');
      this.activeWorkers.delete(executionId);
    }
  }

  /**
   * List active worker execution IDs.
   */
  listActive(): string[] {
    return Array.from(this.activeWorkers.keys());
  }

  /**
   * Check if a worker is still running.
   */
  isActive(executionId: string): boolean {
    return this.activeWorkers.has(executionId);
  }

  /**
   * Render a dispatch result for terminal display.
   */
  renderResult(result: DispatchResult): string {
    const lines: string[] = [];
    lines.push(`Execution: ${result.executionId}`);
    lines.push(`Worker: ${result.workerType}`);
    lines.push(`Duration: ${result.duration}ms`);
    lines.push(`Events: ${result.events.length}`);
    lines.push('');

    for (const event of result.events) {
      const icon =
        event.type === 'log'
          ? '·'
          : event.type === 'progress'
            ? '→'
            : event.type === 'output'
              ? '✓'
              : event.type === 'error'
                ? '✗'
                : '●';
      lines.push(`  ${icon} [${event.type}] ${event.message}`);
    }

    return lines.join('\n');
  }
}
