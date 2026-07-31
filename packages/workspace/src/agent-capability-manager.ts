/**
 * AgentCapabilityManager — resolves agent requests for filesystem capabilities
 * against the agent's permissions and executes them through the FilesystemRuntime.
 *
 * This is the ONLY way an agent reaches the filesystem. The manager:
 *   1. Resolves the requested capability to a (resource, action) permission gate.
 *   2. Denies agents without the mapped permission — no bypass.
 *   3. Executes through FilesystemRuntime, which enforces the workspace sandbox,
 *      approval gates, dry-run, and operation logging.
 *   4. Returns a structured observation for the Understanding layer.
 *
 * Architecture Traceability:
 *   PCS: PCS-007 — Agent Runtime
 *   Safety: Agents request capabilities. Managers authorize. Runtimes execute.
 */

import type { FilesystemRuntime, FsPatch, FsResult } from '@vestara/filesystem-runtime';
import type {
  AgentCapabilityDefinition,
  AgentCapabilityInput,
  AgentCapabilityName,
  AgentCapabilityResult,
} from './agent-capability';
import { AgentPermissionEngine } from './agent-permission';
import type { AgentDefinition } from './types';

interface PermissionRequirement {
  resource: 'repository';
  action: 'read' | 'modify';
}

const CAPABILITY_PERMISSION: Record<AgentCapabilityName, PermissionRequirement> = {
  'filesystem.read': { resource: 'repository', action: 'read' },
  'filesystem.list': { resource: 'repository', action: 'read' },
  'filesystem.stat': { resource: 'repository', action: 'read' },
  'filesystem.exists': { resource: 'repository', action: 'read' },
  'filesystem.search': { resource: 'repository', action: 'read' },
  'filesystem.references': { resource: 'repository', action: 'read' },
  'filesystem.write': { resource: 'repository', action: 'modify' },
  'filesystem.create': { resource: 'repository', action: 'modify' },
  'filesystem.update': { resource: 'repository', action: 'modify' },
  'filesystem.rename': { resource: 'repository', action: 'modify' },
  'filesystem.copy': { resource: 'repository', action: 'modify' },
  'filesystem.delete': { resource: 'repository', action: 'modify' },
};

export function capabilityDefinitions(): AgentCapabilityDefinition[] {
  return [
    {
      name: 'filesystem.read',
      description: 'Read the contents of a file within the workspace.',
      risk: 'low',
      requiresApproval: false,
      requiresReason: false,
    },
    {
      name: 'filesystem.list',
      description: 'List files and directories in a workspace path.',
      risk: 'low',
      requiresApproval: false,
      requiresReason: false,
    },
    {
      name: 'filesystem.stat',
      description: 'Get metadata (size, timestamps, type) for a workspace path.',
      risk: 'low',
      requiresApproval: false,
      requiresReason: false,
    },
    {
      name: 'filesystem.exists',
      description: 'Check whether a workspace path exists.',
      risk: 'low',
      requiresApproval: false,
      requiresReason: false,
    },
    {
      name: 'filesystem.search',
      description: 'Search file names and contents for a pattern.',
      risk: 'low',
      requiresApproval: false,
      requiresReason: false,
    },
    {
      name: 'filesystem.references',
      description: 'Find imports and usages of a file across the workspace.',
      risk: 'low',
      requiresApproval: false,
      requiresReason: false,
    },
    {
      name: 'filesystem.write',
      description: 'Create or overwrite a file with full content.',
      risk: 'medium',
      requiresApproval: false,
      requiresReason: true,
    },
    {
      name: 'filesystem.create',
      description: 'Create a new file or directory.',
      risk: 'medium',
      requiresApproval: false,
      requiresReason: true,
    },
    {
      name: 'filesystem.update',
      description: 'Apply a patch (replace/insert/remove lines) to an existing file.',
      risk: 'medium',
      requiresApproval: false,
      requiresReason: true,
    },
    {
      name: 'filesystem.rename',
      description: 'Rename or move a file or directory.',
      risk: 'medium',
      requiresApproval: false,
      requiresReason: true,
    },
    {
      name: 'filesystem.copy',
      description: 'Copy a file or directory to a new workspace path.',
      risk: 'medium',
      requiresApproval: false,
      requiresReason: true,
    },
    {
      name: 'filesystem.delete',
      description: 'Delete a file or directory. Requires explicit approval.',
      risk: 'high',
      requiresApproval: true,
      requiresReason: true,
    },
  ];
}

export class AgentCapabilityManager {
  private filesystem: FilesystemRuntime;
  private permission: AgentPermissionEngine;
  private definitions: Map<AgentCapabilityName, AgentCapabilityDefinition>;

  constructor(opts: { filesystem: FilesystemRuntime; permission?: AgentPermissionEngine }) {
    this.filesystem = opts.filesystem;
    this.permission = opts.permission ?? new AgentPermissionEngine();
    this.definitions = new Map(capabilityDefinitions().map((d) => [d.name, d]));
  }

  get runtime(): FilesystemRuntime {
    return this.filesystem;
  }

  listCapabilities(): AgentCapabilityDefinition[] {
    return [...this.definitions.values()];
  }

  getDefinition(name: AgentCapabilityName): AgentCapabilityDefinition | undefined {
    return this.definitions.get(name);
  }

  /**
   * The filesystem capabilities an agent is permitted to request.
   */
  getCapabilitiesForAgent(agent: AgentDefinition): AgentCapabilityDefinition[] {
    return this.listCapabilities().filter((def) => this.isPermitted(agent, def.name));
  }

  /**
   * Permission gate. Disabled agents and agents without the mapped
   * (resource, action) grant are denied.
   */
  isPermitted(agent: AgentDefinition, name: AgentCapabilityName): boolean {
    if (agent.status === 'disabled') return false;
    const requirement = CAPABILITY_PERMISSION[name];
    if (!requirement) return false;
    const check = this.permission.check(agent, requirement.resource, requirement.action);
    return check.allowed;
  }

  /**
   * Execute a filesystem capability on behalf of an agent.
   */
  async execute(
    agent: AgentDefinition,
    name: AgentCapabilityName,
    input: AgentCapabilityInput,
  ): Promise<AgentCapabilityResult> {
    const definition = this.definitions.get(name);
    if (!definition) return { ok: false, error: `Unknown capability: ${name}` };
    if (agent.status === 'disabled') {
      return { ok: false, error: `Agent "${agent.name}" is disabled and cannot use ${name}` };
    }
    if (!this.isPermitted(agent, name)) {
      return { ok: false, error: `Agent "${agent.name}" is not permitted to use ${name}` };
    }

    if (definition.requiresReason && !input.reason) {
      return { ok: false, error: `Capability ${name} requires a reason so the operation is auditable` };
    }

    return this.executeOp(name, input, agent.id);
  }

  /**
   * Execute a capability without an agent identity. Used by the ActionRuntime
   * tool path, where the ActionRuntime permission engine gates the call
   * instead of the agent (resource, action) model. All FilesystemRuntime
   * safety still applies: workspace sandbox, approval gates, dry-run, logging.
   */
  async executeAsTool(name: AgentCapabilityName, input: AgentCapabilityInput): Promise<AgentCapabilityResult> {
    const definition = this.definitions.get(name);
    if (!definition) return { ok: false, error: `Unknown capability: ${name}` };
    if (definition.requiresReason && !input.reason) {
      return { ok: false, error: `Capability ${name} requires a reason so the operation is auditable` };
    }
    return this.executeOp(name, input, 'tool');
  }

  private async executeOp(
    name: AgentCapabilityName,
    input: AgentCapabilityInput,
    agentId: string,
  ): Promise<AgentCapabilityResult> {
    const opts = { agentId, reason: input.reason, dryRun: input.dryRun, approvalId: input.approvalId };

    try {
      switch (name) {
        case 'filesystem.read':
          return this.fromResult(await this.filesystem.read(requireString(input, 'path'), agentId));
        case 'filesystem.write':
          return this.fromResult(await this.filesystem.write(requireString(input, 'path'), input.content ?? '', opts));
        case 'filesystem.update':
          return this.fromResult(
            await this.filesystem.update(requireString(input, 'path'), (input.patch ?? {}) as FsPatch, opts),
          );
        case 'filesystem.delete':
          return this.fromResult(await this.filesystem.delete(requireString(input, 'path'), opts));
        case 'filesystem.create':
          return this.fromResult(await this.filesystem.create(requireString(input, 'path'), input.content, opts));
        case 'filesystem.rename':
          return this.fromResult(
            await this.filesystem.rename(requireString(input, 'oldPath'), requireString(input, 'newPath'), opts),
          );
        case 'filesystem.copy':
          return this.fromResult(
            await this.filesystem.copy(requireString(input, 'source'), requireString(input, 'destination'), opts),
          );
        case 'filesystem.list':
          return this.fromResult(await this.filesystem.list(typeof input.dir === 'string' ? input.dir : '.', agentId));
        case 'filesystem.stat':
          return this.fromResult(await this.filesystem.stat(requireString(input, 'path'), agentId));
        case 'filesystem.exists':
          return this.fromResult(await this.filesystem.exists(requireString(input, 'path'), agentId));
        case 'filesystem.search':
          return this.fromResult(
            await this.filesystem.search(
              requireString(input, 'pattern'),
              typeof input.dir === 'string' ? input.dir : undefined,
              agentId,
            ),
          );
        case 'filesystem.references':
          return this.fromResult(await this.filesystem.references(requireString(input, 'path'), agentId));
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Capability execution failed' };
    }

    return { ok: false, error: `Unknown capability: ${name}` };
  }

  approve(approvalId: string): boolean {
    return this.filesystem.approve(approvalId);
  }

  reject(approvalId: string): boolean {
    return this.filesystem.reject(approvalId);
  }

  getPendingApprovals() {
    return this.filesystem.getPendingApprovals();
  }

  getOperationHistory() {
    return this.filesystem.getHistory();
  }

  private fromResult<T>(result: FsResult<T>): AgentCapabilityResult {
    if (result.ok) {
      return { ok: true, observation: result.observation, data: result.data };
    }
    return {
      ok: false,
      observation: result.observation,
      error: result.error,
      ...(result.requiresApproval && result.approvalId ? { approvalId: result.approvalId } : {}),
    };
  }
}

function requireString(input: AgentCapabilityInput, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Capability input is missing required field: ${key}`);
  }
  return value;
}
