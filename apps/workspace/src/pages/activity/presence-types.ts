/**
 * AR-UI-B0: Presence Data Layer Types
 *
 * Defines the types for real-time presence tracking in the Activity Room.
 * Builds on the AR-UI-A team roster with heartbeat, connection status,
 * and workspace-level presence aggregation.
 *
 * Architecture Traceability:
 *   AR-UI-B: Presence Layer (phases 3-6)
 *   @see AR-UI-A: Authoritative Team Roster (phases 0-2)
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Presence Entry ────────────────────────────────────────────

/**
 * AR-UI-B0: A single presence entry for an agent.
 * Tracks real-time connection status and heartbeat.
 */
export interface PresenceEntry {
  /** Agent ID */
  readonly agentId: string;

  /** Current presence state */
  readonly state: PresenceState;

  /** ISO-8601 timestamp of last heartbeat */
  readonly lastHeartbeatAt: string;

  /** ISO-8601 timestamp of connection */
  readonly connectedAt: string;

  /** Connection duration in milliseconds */
  readonly connectionDurationMs: number;

  /** Optional: current task/work being performed */
  readonly currentTask?: PresenceTask;

  /** Optional: last activity summary */
  readonly lastActivity?: PresenceActivity;
}

/**
 * AR-UI-B0: Presence states.
 */
export type PresenceState =
  | 'online'       // Connected and responsive
  | 'idle'         // Connected but no recent activity
  | 'away'         // Temporarily disconnected
  | 'busy'         // Connected, performing work
  | 'offline';     // Not connected

/**
 * AR-UI-B0: Current task being performed.
 */
export interface PresenceTask {
  /** Task identifier */
  readonly id: string;

  /** Task description */
  readonly description: string;

  /** Task progress (0-100) */
  readonly progress: number;

  /** ISO-8601 timestamp when task started */
  readonly startedAt: string;

  /** Estimated completion time in milliseconds */
  readonly estimatedMs?: number;
}

/**
 * AR-UI-B0: Last activity summary.
 */
export interface PresenceActivity {
  /** Activity type */
  readonly type: 'message' | 'task' | 'verification' | 'error' | 'other';

  /** Brief description */
  readonly summary: string;

  /** ISO-8601 timestamp */
  readonly timestamp: string;
}

// ─── Presence Configuration ────────────────────────────────────

/**
 * AR-UI-B0: Configuration for presence tracking.
 */
export interface PresenceConfig {
  /** Heartbeat interval in milliseconds */
  readonly heartbeatIntervalMs: number;

  /** Timeout before marking agent as idle (ms) */
  readonly idleTimeoutMs: number;

  /** Timeout before marking agent as away (ms) */
  readonly awayTimeoutMs: number;

  /** Timeout before marking agent as offline (ms) */
  readonly offlineTimeoutMs: number;

  /** Whether to show presence indicators */
  readonly showPresence: boolean;

  /** Whether to show heartbeat timestamps */
  readonly showHeartbeats: boolean;
}

/**
 * AR-UI-B0: Default presence configuration.
 */
export const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  heartbeatIntervalMs: 5_000,    // 5 seconds
  idleTimeoutMs: 30_000,         // 30 seconds
  awayTimeoutMs: 300_000,        // 5 minutes
  offlineTimeoutMs: 600_000,     // 10 minutes
  showPresence: true,
  showHeartbeats: false,
};

// ─── Presence State ────────────────────────────────────────────

/**
 * AR-UI-B0: Complete presence state for the workspace.
 * Renamed from PresenceState to avoid conflict with the PresenceState type alias.
 */
export interface PresenceStateData {
  /** All presence entries */
  readonly entries: readonly PresenceEntry[];

  /** Number of agents online */
  readonly onlineCount: number;

  /** Number of agents idle */
  readonly idleCount: number;

  /** Number of agents busy */
  readonly busyCount: number;

  /** Number of agents offline */
  readonly offlineCount: number;

  /** Total agents tracked */
  readonly totalCount: number;

  /** ISO-8601 timestamp of last presence update */
  readonly lastUpdatedAt: string;
}

// ─── Presence Event ────────────────────────────────────────────

/**
 * AR-UI-B0: Real-time presence event (from WebSocket).
 */
export interface PresenceEvent {
  /** Event type */
  readonly type: 'heartbeat' | 'state-change' | 'task-start' | 'task-complete' | 'activity';

  /** Agent ID */
  readonly agentId: string;

  /** Event timestamp */
  readonly timestamp: string;

  /** Event payload */
  readonly payload: unknown;
}
