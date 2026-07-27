/**
 * AgentPermission — Permission checking for agent operations.
 *
 * Agents do not inherit human permissions. Each agent has a defined
 * set of (resource, action, approvalRequired) tuples.
 *
 * Architecture Traceability:
 *   PCS: PCS-007 — Agent Runtime
 *   Safety: Agents operate through the Vestara lifecycle, not outside it.
 */

import type { AgentDefinition, AgentPermission } from './types';

export interface PermissionCheck {
  allowed: boolean;
  approvalRequired: boolean;
  reason?: string;
}

export class AgentPermissionEngine {
  /**
   * Check whether an agent is allowed to perform an action on a resource.
   */
  check(
    agent: AgentDefinition,
    resource: AgentPermission['resource'],
    action: AgentPermission['action'],
  ): PermissionCheck {
    if (agent.status === 'disabled') {
      return { allowed: false, approvalRequired: false, reason: `Agent "${agent.name}" is disabled.` };
    }

    const permission = agent.permissions.find((p) => p.resource === resource && p.action === action);
    if (!permission) {
      return {
        allowed: false,
        approvalRequired: false,
        reason: `Agent "${agent.name}" does not have permission to ${action} ${resource}.`,
      };
    }

    return { allowed: true, approvalRequired: permission.approvalRequired };
  }

  /**
   * Check whether the agent has a specific capability.
   */
  hasCapability(agent: AgentDefinition, capability: string): boolean {
    return agent.capabilities.includes(capability as any);
  }
}
