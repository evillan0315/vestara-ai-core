/**
 * Agent Control presentation constants.
 *
 * These are display-only — they define how categories look, not what agents exist.
 * The authoritative agent list comes from GET /api/agents.
 *
 * Category derivation: use deriveCategory() from components/ui/agents/deriveCategory.
 * Agent colors: use getAgentColor() from components/ui/agents/agentColors.
 * Shared form classes: import from components/ui/agents/formClasses.
 */

// Re-export from shared module for backward compatibility
export {
  CATEGORY_ORDER,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_DESCRIPTIONS,
} from '../../components/ui/agents/deriveCategory';

export { getAgentColor } from '../../components/ui/agents/agentColors';

// Role-based color fallback (presentation only — agents override via color field)
export const ROLE_COLORS: Record<string, string> = {
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
