/**
 * Role compatibility adapters.
 *
 * CORE-001 identified three incompatible role vocabularies:
 *   - workspace AgentRole (28 values): 'planning', 'documenter', 'developer'
 *   - provider-runtime EngineeringAgentRole (6 values): 'planner', 'documentation', 'developer'
 *   - agent-performance AgentRole (6 values): 'planner', 'documentation', 'engineer'
 *
 * This module provides explicit normalization functions. The canonical AgentRole
 * uses workspace values ('planning', 'documenter', 'developer'). Legacy/routing
 * values are mapped via these adapters.
 *
 * INVARIANT: Normalization is pure and deterministic. No side effects.
 * INVARIANT: Unknown input returns undefined — never silently discards.
 */

import type { AgentRole } from './agent-role.js';

/**
 * Routing bucket vocabulary.
 *
 * This is a SEPARATE concept from AgentRole. RoutingRole represents the
 * task-category bucket used for provider/model selection. It is deliberately
 * NOT merged with AgentRole because:
 *   - AgentRole classifies the agent's identity (28 values)
 *   - RoutingRole classifies the routing task (6 values)
 *   - The mapping is many-to-one (multiple agent roles map to one routing bucket)
 *
 * CORE-002 owns this type. Do NOT move it to @vestara/routing-types — the
 * mapping function needs both AgentRole and RoutingRole, and routing-types
 * must not depend on agent-types.
 */
export type RoutingRole = 'planner' | 'architect' | 'developer' | 'reviewer' | 'verifier' | 'documentation';

/** All RoutingRole values as a runtime array. */
export const ALL_ROUTING_ROLES: readonly RoutingRole[] = [
  'planner',
  'architect',
  'developer',
  'reviewer',
  'verifier',
  'documentation',
] as const;

/** Runtime type guard for RoutingRole. */
export function isRoutingRole(value: string): value is RoutingRole {
  return (ALL_ROUTING_ROLES as readonly string[]).includes(value);
}

/**
 * Performance evaluation role vocabulary.
 *
 * A SEPARATE concept from both AgentRole and RoutingRole.
 * Used by @vestara/agent-performance for evaluation buckets.
 * Kept here for documentation and normalization purposes.
 */
export type PerformanceRole = 'architect' | 'planner' | 'engineer' | 'reviewer' | 'verifier' | 'documentation';

/**
 * Map a canonical AgentRole to its corresponding RoutingRole.
 *
 * The mapping is many-to-one: several agent roles may map to the same
 * routing bucket. Returns undefined when no routing mapping exists.
 *
 * @example
 * mapAgentRoleToRoutingRole('planning')    // → 'planner'
 * mapAgentRoleToRoutingRole('documenter')  // → 'documentation'
 * mapAgentRoleToRoutingRole('developer')   // → 'developer'
 * mapAgentRoleToRoutingRole('custom')      // → undefined
 */
export function mapAgentRoleToRoutingRole(role: AgentRole): RoutingRole | undefined {
  switch (role) {
    case 'planning':
      return 'planner';
    case 'documenter':
    case 'documentation-agent':
      return 'documentation';
    case 'architect':
      return 'architect';
    case 'developer':
    case 'frontend':
    case 'refactoring':
    case 'refactoring-agent':
      return 'developer';
    case 'reviewer':
      return 'reviewer';
    case 'verifier':
      return 'verifier';
    default:
      return undefined;
  }
}

/**
 * Map a RoutingRole back to a representative AgentRole.
 *
 * This is the inverse of mapAgentRoleToRoutingRole, choosing the most
 * representative agent role for each routing bucket.
 */
export function routingRoleToAgentRole(role: RoutingRole): AgentRole {
  switch (role) {
    case 'planner':
      return 'planning';
    case 'documentation':
      return 'documenter';
    case 'architect':
      return 'architect';
    case 'developer':
      return 'developer';
    case 'reviewer':
      return 'reviewer';
    case 'verifier':
      return 'verifier';
  }
}

/**
 * Normalize a legacy role string to a canonical AgentRole.
 *
 * Handles known divergences:
 *   - 'engineer' → 'developer' (agent-performance legacy)
 *   - 'planner' → 'planning' (provider-runtime routing bucket)
 *   - 'documentation' → 'documenter' (provider-runtime routing bucket)
 *
 * Returns undefined for unknown values — never silently discards.
 *
 * @example
 * normalizeLegacyRole('engineer')       // → 'developer'
 * normalizeLegacyRole('planner')        // → 'planning'
 * normalizeLegacyRole('documentation')  // → 'documenter'
 * normalizeLegacyRole('developer')      // → 'developer'
 * normalizeLegacyRole('unknown')        // → undefined
 */
export function normalizeLegacyRole(role: string): AgentRole | undefined {
  // Already canonical
  if (role === 'developer') return 'developer';
  if (role === 'architect') return 'architect';
  if (role === 'reviewer') return 'reviewer';
  if (role === 'verifier') return 'verifier';

  // Known legacy divergences
  if (role === 'engineer') return 'developer';
  if (role === 'planner') return 'planning';
  if (role === 'documentation') return 'documenter';

  // Check if it's already a valid canonical role
  const canonical: Record<string, AgentRole> = {
    architect: 'architect',
    developer: 'developer',
    verifier: 'verifier',
    documenter: 'documenter',
    security: 'security',
    devops: 'devops',
    testing: 'testing',
    ux: 'ux',
    performance: 'performance',
    database: 'database',
    release: 'release',
    governance: 'governance',
    conversation: 'conversation',
    planning: 'planning',
    refactoring: 'refactoring',
    custom: 'custom',
    'dashboard-curator': 'dashboard-curator',
    frontend: 'frontend',
    analyst: 'analyst',
    tester: 'tester',
    'continuous-tester': 'continuous-tester',
    'security-agent': 'security-agent',
    'performance-agent': 'performance-agent',
    'documentation-agent': 'documentation-agent',
    'refactoring-agent': 'refactoring-agent',
    'release-agent': 'release-agent',
    context: 'context',
  };

  return canonical[role];
}
