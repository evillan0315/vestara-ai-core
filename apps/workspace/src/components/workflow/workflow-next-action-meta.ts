/**
 * Workflow next-action metadata — shared glyph + precedence copy.
 *
 * Single source for the queue glyphs and the short precedence explanations
 * rendered as "#n of N · reason" across NextLane, NextActionsPanel, and the
 * projects rail badges. Extracted from OrchestrationPage so every surface
 * reads the same copy by construction.
 */

import type { NextActionKind } from '../../lib/orchestration-next-action';

export const NEXT_ACTION_GLYPHS: Record<NextActionKind, string> = {
  'task-approval': '!',
  'task-failure': '⚡',
  'architecture-review': '◇',
  'plan-approval': '✓',
  resume: '▶',
  progress: '◉',
  start: '✚',
};

// Short precedence explanation per kind so the queue order is legible
// rather than implicit in KIND_PRIORITY. Rendered as "#n of N · reason".
export const NEXT_ACTION_PRECEDENCE: Record<NextActionKind, string> = {
  'task-approval': 'Approvals block downstream tasks, so they outrank everything else.',
  'task-failure': 'Failed or blocked tasks stall execution, so they come before reviews.',
  'architecture-review': 'Architecture gate must pass before director approval.',
  'plan-approval': 'Plan approval unlocks execution, so it comes before resume.',
  resume: 'Paused work resumes before routine progress checks.',
  progress: 'Active work to monitor — no blocker, so it follows actionable items.',
  start: 'Untouched work with no urgency, so it ranks last.',
};
