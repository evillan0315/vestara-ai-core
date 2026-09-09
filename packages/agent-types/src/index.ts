/**
 * @vestara/agent-types — Canonical agent identity vocabulary.
 *
 * This package is a dependency-free leaf containing the minimum stable domain
 * contracts for agent identity, role classification, and capability semantics.
 *
 * INVARIANTS:
 *   - Leaf package: no runtime behavior, no services, no persistence
 *   - Zero @vestara/* dependencies
 *   - Runtime-neutral: no OpenCode-specific concepts
 *   - Closed vocabularies: no `(string & {})` escape hatches
 */

export {
  type AgentCapability,
  ALL_AGENT_CAPABILITIES,
  CAPABILITY_DESCRIPTIONS,
  isAgentCapability,
} from './agent-capability.js';
export type {
  AgentDefinition,
  AgentMode,
  AgentPermission,
  AgentType,
} from './agent-definition.js';
export { type AgentRole, ALL_AGENT_ROLES, isAgentRole } from './agent-role.js';

export {
  ALL_ROUTING_ROLES,
  isRoutingRole,
  mapAgentRoleToRoutingRole,
  normalizeLegacyRole,
  type PerformanceRole,
  type RoutingRole,
  routingRoleToAgentRole,
} from './role-compat.js';
