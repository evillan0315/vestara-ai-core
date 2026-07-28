/**
 * @vestara/understanding — PlanningContext
 *
 * A task-specific projection of workspace understanding.
 *
 * Does not invent information — it selects from
 * WorkspaceUnderstanding and combines it with the
 * current user request and planning constraints.
 *
 * Invariants:
 *   1. All fields derive from WorkspaceUnderstanding.
 *   2. PlanningContext contains no information that
 *      could not be explained by pointing at an
 *      Understanding field.
 */

import type { WorkspaceUnderstanding } from './understanding';

// ─── User Request ────────────────────────────────────────────

export interface UserRequest {
  readonly text: string;
  readonly timestamp: string;
  readonly source: 'chat' | 'voice' | 'api' | 'cli';
  readonly workspaceId: string;
}

// ─── Constraints ────────────────────────────────────────────

export interface PlanningConstraints {
  readonly maxTasks?: number;
  readonly maxEffort?: string;
  readonly preferredAgents?: readonly string[];
  readonly requireApproval: boolean;
  readonly allowedModules?: readonly string[];
  readonly excludedModules?: readonly string[];
}

// ─── Intent ─────────────────────────────────────────────────

export type IntentKind =
  | 'explore'
  | 'understand'
  | 'plan'
  | 'implement'
  | 'fix'
  | 'refactor'
  | 'test'
  | 'document'
  | 'unknown';

export interface Intent {
  readonly kind: IntentKind;
  readonly confidence: number;
  readonly scope: readonly string[];
}

// ─── Recommended Action ─────────────────────────────────────

export interface RecommendedAction {
  readonly description: string;
  readonly confidence: number;
  readonly rationale: string;
  readonly understandingSource: string;
}

// ─── Root Model ─────────────────────────────────────────────

export interface PlanningContext {
  readonly request: UserRequest;
  readonly understanding: WorkspaceUnderstanding;
  readonly intent: Intent;
  readonly constraints: PlanningConstraints;
  readonly recommendations: readonly RecommendedAction[];
}
