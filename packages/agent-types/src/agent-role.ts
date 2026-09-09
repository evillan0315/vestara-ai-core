/**
 * Canonical AgentRole vocabulary.
 *
 * CORE-001 found three incompatible role vocabularies:
 *   - workspace AgentRole (28 values)
 *   - provider-runtime EngineeringAgentRole (6 values)
 *   - agent-performance AgentRole (6 values, with 'engineer' instead of 'developer')
 *
 * This is the single source of truth. All other packages MUST import from here
 * or re-export this type. Legacy vocabularies are normalized via adapters in
 * role-compat.ts.
 *
 * The workspace AgentRole values are preserved in full. The provider-runtime
 * and agent-performance vocabularies are distinct concepts (RoutingRole and
 * PerformanceRole) and are NOT merged into this union.
 *
 * INVARIANT: This union is closed. No `(string & {})` escape hatch.
 * New roles must be added here explicitly.
 */
export type AgentRole =
  | 'architect'
  | 'developer'
  | 'verifier'
  | 'documenter'
  | 'security'
  | 'devops'
  | 'testing'
  | 'ux'
  | 'performance'
  | 'database'
  | 'release'
  | 'governance'
  | 'conversation'
  | 'planning'
  | 'refactoring'
  | 'custom'
  | 'dashboard-curator'
  | 'frontend'
  | 'analyst'
  | 'reviewer'
  | 'tester'
  | 'continuous-tester'
  | 'security-agent'
  | 'performance-agent'
  | 'documentation-agent'
  | 'refactoring-agent'
  | 'release-agent'
  | 'context';

/** All canonical AgentRole values as a runtime array for iteration. */
export const ALL_AGENT_ROLES: readonly AgentRole[] = [
  'architect',
  'developer',
  'verifier',
  'documenter',
  'security',
  'devops',
  'testing',
  'ux',
  'performance',
  'database',
  'release',
  'governance',
  'conversation',
  'planning',
  'refactoring',
  'custom',
  'dashboard-curator',
  'frontend',
  'analyst',
  'reviewer',
  'tester',
  'continuous-tester',
  'security-agent',
  'performance-agent',
  'documentation-agent',
  'refactoring-agent',
  'release-agent',
  'context',
] as const;

/** Runtime type guard for AgentRole. */
export function isAgentRole(value: string): value is AgentRole {
  return (ALL_AGENT_ROLES as readonly string[]).includes(value);
}
