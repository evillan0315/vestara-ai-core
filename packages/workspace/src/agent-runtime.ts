/**
 * AgentRuntime — the harness execution path for Vestara agents.
 *
 * The durable agent loop is `AgentHarnessRuntime` (@vestara/agent-harness).
 * This class is now a thin adapter: `run()` creates a durable harness thread
 * and ExecutionSession via HarnessSession and converts the outcome to the
 * existing AgentRunResult / AgentExecution contract. The duplicate legacy
 * capability orchestrator loop has been removed.
 *
 * AgentRuntime still owns agent identity/role, capability execution
 * (`executeCapability`), and agent-level query methods.
 *
 * Architecture Traceability:
 *   PCS: PCS-007 — Agent Runtime
 *   Safety: Agents can act. Artifacts provide accountability. Humans retain authority.
 */

import type { AIProvider } from '@vestara/shared';
import type { AgentCapabilityInput, AgentCapabilityName, AgentCapabilityResult } from './agent-capability';
import type { AgentCapabilityManager } from './agent-capability-manager';
import { AgentPermissionEngine } from './agent-permission';
import type { AgentStorage } from './agent-storage';
import { HarnessExecutionAdapter, type HarnessSession } from './harness-session';
import type { AgentDefinition, AgentExecution, AgentExecutionStatus } from './types';
import type { WorkspaceSession } from './workspace-session';

export interface AgentRunResult {
  execution: AgentExecution;
  agent: AgentDefinition;
  message: string;
}

export interface CapabilityExecutionResult {
  capability: AgentCapabilityName;
  result: AgentCapabilityResult;
}

export class AgentRuntime {
  private storage: AgentStorage;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: permission engine is constructed eagerly and reserved for capability gating.
  private permission: AgentPermissionEngine;
  private provider?: AIProvider;
  private capabilities?: AgentCapabilityManager;
  private onEngineUsed?: (engine: 'harness') => void;
  private harnessSession?: HarnessSession;

  constructor(opts: {
    storage: AgentStorage;
    provider?: AIProvider;
    filesystem?: AgentCapabilityManager;
    capabilities?: AgentCapabilityManager;
    onEngineUsed?: (engine: 'harness') => void;
    harnessSession?: HarnessSession;
  }) {
    this.storage = opts.storage;
    this.permission = new AgentPermissionEngine();
    this.provider = opts.provider;
    this.capabilities = opts.capabilities ?? opts.filesystem;
    this.onEngineUsed = opts.onEngineUsed;
    this.harnessSession = opts.harnessSession;
  }

  /**
   * Run an agent with a given task in a workspace session.
   *
   * Always executes through AgentHarnessRuntime: a durable harness thread and
   * linked ExecutionSession are created, and the terminal outcome is converted
   * to the AgentRunResult contract. `session` is retained for caller
   * compatibility; the harness uses its own environment + context assembly.
   */
  async run(agentId: string, task: string, _session: WorkspaceSession): Promise<AgentRunResult> {
    const agent = await this.storage.getAgent(agentId);
    if (!agent) throw new Error(`Agent "${agentId}" not found.`);
    this.onEngineUsed?.('harness');
    const execution = await this.storage.createExecution(agentId, task);
    return await this.runViaHarness(agent, execution, task);
  }

  /**
   * Delegate to AgentHarnessRuntime through the HarnessSession adapter and
   * convert the durable outcome to the AgentRunResult contract. A harness
   * thread + ExecutionSession are created for every run.
   */
  private async runViaHarness(
    agent: AgentDefinition,
    execution: AgentExecution,
    task: string,
  ): Promise<AgentRunResult> {
    if (!this.harnessSession) {
      const message = 'AgentRuntime is not wired to a HarnessSession';
      await this.storage.updateExecutionStatus(execution.id, 'failed', message);
      return { execution: (await this.storage.getExecution(execution.id)) as AgentExecution, agent, message };
    }
    try {
      await this.storage.updateExecutionStatus(execution.id, 'running');
      const adapter = new HarnessExecutionAdapter(this.harnessSession);
      const result = await adapter.execute({ agentId: agent.id, instruction: task, goal: task });
      // AgentExecutionStatus has no 'cancelled'; map non-completed to 'failed'.
      const status: AgentExecutionStatus = result.status === 'completed' ? 'completed' : 'failed';
      const message = `Harness ${result.status}${result.output ? ` — ${result.output}` : ''} · thread ${result.threadId.slice(0, 12)}…`;
      execution.status = status;
      execution.completedAt = new Date().toISOString();
      execution.result = message;
      await this.storage.updateExecutionStatus(execution.id, status, message);
      return {
        execution: (await this.storage.getExecution(execution.id)) as AgentExecution,
        agent,
        message,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.storage.updateExecutionStatus(execution.id, 'failed', message);
      return {
        execution: (await this.storage.getExecution(execution.id)) as AgentExecution,
        agent,
        message: `Agent execution failed: ${message}`,
      };
    }
  }

  /**
   * Execute a filesystem capability on behalf of an agent.
   * Routes through the AgentCapabilityManager (permission gate + FilesystemRuntime
   * sandbox/approval) and records the observation into session memory so the
   * Understanding Runtime sees updated workspace knowledge.
   */
  async executeCapability(
    agentId: string,
    capability: AgentCapabilityName,
    input: AgentCapabilityInput,
    session?: WorkspaceSession,
  ): Promise<CapabilityExecutionResult> {
    const agent = await this.storage.getAgent(agentId);
    if (!agent) throw new Error(`Agent "${agentId}" not found.`);
    if (!this.capabilities) {
      return {
        capability,
        result: { ok: false, error: 'Agent runtime has no capability manager wired' },
      };
    }

    const result = await this.capabilities.execute(agent, capability, input);

    if (session) {
      try {
        await session.storeMemory(
          'event',
          JSON.stringify(
            result.observation ?? {
              operation: capability,
              file: String(input.path ?? input.oldPath ?? ''),
              status: result.ok ? 'success' : 'failed',
              error: result.error,
              timestamp: new Date().toISOString(),
            },
          ),
        );
      } catch {
        // Memory may be unavailable in lightweight sessions
      }
    }

    return { capability, result };
  }

  /**
   * The filesystem capabilities available to a given agent.
   */
  getCapabilitiesForAgent(agentId: string): Promise<ReturnType<AgentCapabilityManager['getCapabilitiesForAgent']>> {
    return this.storage.getAgent(agentId).then((agent) => {
      if (!agent || !this.capabilities) return [];
      return this.capabilities.getCapabilitiesForAgent(agent);
    });
  }

  async listAgents(): Promise<AgentDefinition[]> {
    return this.storage.listAgents();
  }

  /**
   * Get an agent definition.
   */
  async getAgent(id: string): Promise<AgentDefinition | null> {
    return this.storage.getAgent(id);
  }

  /**
   * List executions for an agent (or all).
   */
  async listExecutions(agentId?: string): Promise<AgentExecution[]> {
    return this.storage.listExecutions(agentId);
  }

  /**
   * Get an execution by ID.
   */
  async getExecution(id: string): Promise<AgentExecution | null> {
    return this.storage.getExecution(id);
  }
}
