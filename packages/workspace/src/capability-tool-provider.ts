/**
 * FilesystemCapabilityTools — exposes the agent filesystem capabilities as
 * ActionRuntime tools so the LLM tool-calling loop (conversation, planners)
 * can request the same controlled operations agents use.
 *
 * Tool IDs match the capability names (e.g. `filesystem.write`), so LLM tool
 * output maps 1:1 into executable capabilities. The ActionRuntime permission
 * engine gates by tool.definition.permissions; execution still flows through
 * FilesystemRuntime (workspace sandbox, approval gates, dry-run, logging).
 *
 * Architecture Traceability:
 *   PCS: PCS-007 — Agent Runtime
 *   Safety: Capabilities, not raw fs calls, are the only path to the filesystem.
 */

import type { Tool } from '@vestara/action';
import type { ActionRequest, PermissionLevel, ToolDefinition, ToolResult } from '@vestara/shared';
import type { AgentCapabilityDefinition, AgentCapabilityInput, AgentCapabilityName } from './agent-capability';
import type { AgentCapabilityManager } from './agent-capability-manager';

const RISK_TO_PERMISSION: Record<AgentCapabilityDefinition['risk'], PermissionLevel> = {
  low: 'read-only',
  medium: 'user-confirm',
  high: 'admin-only',
};

function buildToolDefinition(def: AgentCapabilityDefinition): ToolDefinition {
  return {
    id: def.name,
    name: def.name.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: `${def.description} ${def.requiresReason ? 'A reason is required.' : ''}`,
    version: '1.0.0',
    permissions: RISK_TO_PERMISSION[def.risk],
    requires: ['filesystem'],
    timeout: 10000,
    sandbox: true,
    streaming: false,
    idempotent: def.risk === 'low',
    destructive: def.risk === 'high',
    category: 'filesystem',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, reason: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  };
}

export function createFilesystemCapabilityTools(manager: AgentCapabilityManager): Tool[] {
  return manager.listCapabilities().map((def) => {
    const definition = buildToolDefinition(def);
    const name = def.name;
    return {
      definition,
      async execute(request: ActionRequest): Promise<ToolResult> {
        const parameters = (request.parameters ?? {}) as AgentCapabilityInput;
        const result = await manager.executeAsTool(name as AgentCapabilityName, parameters);
        return {
          success: result.ok,
          data: result.ok ? (result.data ?? result.observation) : result.observation,
          error: result.error,
          duration: 0,
        };
      },
    };
  });
}
