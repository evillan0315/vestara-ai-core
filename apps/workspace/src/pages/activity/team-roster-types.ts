/**
 * AR-UI-A0: Authoritative Team Roster Types
 *
 * Defines the types for the real agent roster that replaces placeholder data
 * in the Activity Room sidebar. Connects to the canonical agent registry
 * and provides runtime status visualization.
 *
 * Architecture Traceability:
 *   AR-UI-A: Authoritative Team Roster (phases 0-2)
 *   @see packages/workspace/src/agents.registry.ts (canonical agent source)
 *   @see packages/workspace/src/types.ts (AgentDefinition, CanonicalAgent)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { AgentDefinition, AgentOrigin, AgentRole, AgentType } from '@vestara/workspace';

// ─── Roster Entry ──────────────────────────────────────────────

/**
 * AR-UI-A0: A single entry in the authoritative team roster.
 * Combines agent registry data with runtime status.
 */
export interface TeamRosterEntry {
  /** Agent definition from the registry */
  readonly agent: AgentDefinition;

  /** Runtime status of the agent */
  readonly runtimeStatus: AgentRuntimeStatus;

  /** Active work count (number of active tasks/executions) */
  readonly activeWorkCount: number;

  /** Latest activity summary */
  readonly latestActivity?: RosterActivityPreview;

  /** Whether this agent is currently selected in the UI */
  readonly isSelected: boolean;
}

/**
 * AR-UI-A0: Runtime status of an agent.
 */
export type AgentRuntimeStatus =
  | 'idle'          // No active work
  | 'working'       // Currently executing a task
  | 'waiting'       // Waiting for input/approval
  | 'error'         // Encountered an error
  | 'offline';      // Not connected/unavailable

/**
 * AR-UI-A0: Preview of the latest activity for an agent.
 */
export interface RosterActivityPreview {
  /** Brief description of the activity */
  readonly summary: string;

  /** ISO-8601 timestamp of the activity */
  readonly timestamp: string;

  /** Activity type */
  readonly type: 'task' | 'message' | 'verification' | 'error' | 'other';
}

// ─── Roster Configuration ──────────────────────────────────────

/**
 * AR-UI-A0: Configuration for the team roster.
 */
export interface TeamRosterConfig {
  /** Whether to show idle agents */
  readonly showIdle: boolean;

  /** Whether to show offline agents */
  readonly showOffline: boolean;

  /** Sort order for agents */
  readonly sortBy: 'name' | 'status' | 'activity' | 'role';

  /** Filter by agent types */
  readonly filterTypes: readonly AgentType[];

  /** Filter by agent origins */
  readonly filterOrigins: readonly AgentOrigin[];
}

/**
 * AR-UI-A0: Default roster configuration.
 */
export const DEFAULT_ROSTER_CONFIG: TeamRosterConfig = {
  showIdle: true,
  showOffline: false,
  sortBy: 'status',
  filterTypes: [],
  filterOrigins: [],
};

// ─── Roster State ──────────────────────────────────────────────

/**
 * AR-UI-A0: Complete state of the team roster.
 */
export interface TeamRosterState {
  /** All roster entries */
  readonly entries: readonly TeamRosterEntry[];

  /** Number of active agents (working or waiting) */
  readonly activeCount: number;

  /** Number of idle agents */
  readonly idleCount: number;

  /** Number of agents with errors */
  readonly errorCount: number;

  /** Total number of agents */
  readonly totalCount: number;

  /** ISO-8601 timestamp of last roster update */
  readonly lastUpdatedAt: string;
}
