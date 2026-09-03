/**
 * Agent color resolution — presentation logic.
 *
 * Priority: agent.color → role-based fallback → default gray.
 * This is display-only, not domain authority.
 */

const ROLE_COLORS: Record<string, string> = {
  architect: '#8b5cf6',
  developer: '#3b82f6',
  verifier: '#10b981',
  documenter: '#f59e0b',
  analyst: '#a855f7',
  reviewer: '#14b8a6',
  tester: '#84cc16',
  'security-agent': '#ef4444',
  'performance-agent': '#f97316',
  'documentation-agent': '#22c55e',
  'refactoring-agent': '#0ea5e9',
  'release-agent': '#eab308',
  planner: '#d946ef',
  conversation: '#6366f1',
  'dashboard-curator': '#06b6d4',
  frontend: '#ec4899',
};

const DEFAULT_COLOR = '#6b7280';

/**
 * Resolves the display color for an agent.
 *
 * @param agent - Agent with optional explicit color and required role
 * @returns Hex color string
 */
export function getAgentColor(agent: { color?: string; role: string }): string {
  return agent.color || ROLE_COLORS[agent.role] || DEFAULT_COLOR;
}
