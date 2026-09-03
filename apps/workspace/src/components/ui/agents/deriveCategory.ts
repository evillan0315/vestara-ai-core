/**
 * Derives a display category from an agent role string.
 *
 * This is PRESENTATION logic, not domain authority.
 * It determines UI grouping only — it does not define agent identity.
 *
 * Unknown roles gracefully fall to "Specialized."
 */

const CATEGORY_MAP: Record<string, string> = {
  // Development
  architect: 'Development',
  developer: 'Development',
  frontend: 'Development',
  planner: 'Development',
  planning: 'Development',
  context: 'Development',

  // Verification
  verifier: 'Verification',
  reviewer: 'Verification',
  tester: 'Verification',
  'security-agent': 'Verification',
  security: 'Verification',

  // Analysis
  analyst: 'Analysis',
  'performance-agent': 'Analysis',
  performance: 'Analysis',
  'documentation-agent': 'Analysis',
  documentation: 'Analysis',
  documenter: 'Analysis',

  // Infrastructure
  'release-agent': 'Infrastructure',
  release: 'Infrastructure',
  'refactoring-agent': 'Infrastructure',
  refactoring: 'Infrastructure',
  devops: 'Infrastructure',
};

/**
 * Derives a display category from an agent role string.
 *
 * @param role - The agent role (e.g., 'developer', 'banana-engineer')
 * @returns The display category (e.g., 'Development', 'Specialized')
 *
 * @example
 * deriveCategory('developer')     // 'Development'
 * deriveCategory('banana-engineer') // 'Specialized'
 * deriveCategory('')               // 'Specialized'
 */
export function deriveCategory(role: string): string {
  const r = role.toLowerCase().trim();
  return CATEGORY_MAP[r] || 'Specialized';
}

/**
 * Category display metadata — presentation constants.
 * These define how categories look, not what agents exist.
 */
export const CATEGORY_ORDER = ['Development', 'Verification', 'Analysis', 'Infrastructure', 'Specialized'] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Development: '#3b82f6',
  Verification: '#10b981',
  Analysis: '#a855f7',
  Infrastructure: '#f59e0b',
  Specialized: '#6366f1',
};

export const CATEGORY_ICONS: Record<string, string> = {
  Development: '\u2318',
  Verification: '\u2713',
  Analysis: '\u25c8',
  Infrastructure: '\u2699',
  Specialized: '\u2605',
};

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  Development: 'Code generation, architecture, planning',
  Verification: 'Testing, review, quality assurance',
  Analysis: 'Metrics, performance, documentation',
  Infrastructure: 'Release, refactoring, deployment',
  Specialized: 'Conversation, dashboard, custom roles',
};
