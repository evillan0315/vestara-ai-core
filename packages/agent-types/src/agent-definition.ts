/**
 * Agent identity contracts.
 *
 * These are the minimum stable domain vocabulary for agent identity and
 * configuration. Runtime-specific fields (OpenCode permissions, prompts,
 * session state) are NOT included here — they remain in @vestara/workspace.
 */

import type { AgentCapability } from './agent-capability.js';
import type { AgentRole } from './agent-role.js';

/** Agent classification: workspace-local or registry-managed. */
export type AgentType = 'workspace' | 'registry';

/** Agent execution mode in the runtime. */
export type AgentMode = 'primary' | 'subagent' | 'all';

/**
 * Agent permission declaration.
 *
 * Describes what an agent is authorized to access and at what approval level.
 * This is the AGENT-SIDE permission declaration; runtime enforcement is separate.
 */
export interface AgentPermission {
  readonly resource: 'repository' | 'changeset' | 'verification' | 'collaboration' | 'plan' | 'knowledge';
  readonly action: 'read' | 'create' | 'modify' | 'execute';
  readonly approvalRequired: boolean;
}

/**
 * Canonical agent definition interface.
 *
 * Contains the stable domain vocabulary for agent identity and configuration.
 * Runtime-specific fields (opencodePermissions, opencodePrompt, runtimeAgent)
 * are intentionally excluded from this leaf contract — they remain in
 * @vestara/workspace's CanonicalAgent type.
 */
export interface AgentDefinition {
  readonly id: string;
  readonly name: string;
  readonly role: AgentRole;
  readonly agentType: AgentType;
  readonly description?: string;
  readonly capabilities: readonly AgentCapability[];
  readonly permissions: readonly AgentPermission[];
  readonly provider?: string;
  readonly model?: string;
  readonly teamId?: string;
  readonly color?: string;
  readonly status: 'active' | 'disabled';
  readonly createdAt: string;
}
