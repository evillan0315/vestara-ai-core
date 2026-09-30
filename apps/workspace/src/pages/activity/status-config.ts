/**
 * GA-STATE-001: Shared Activity Room Status Configuration
 *
 * Canonical mapping from Activity Room states to StatusIndicator variants.
 * Single source of truth — deduplicates STATUS_CONFIG in M11CConnectionStatus
 * and CONNECTION_STATUS in ActivityRoomContextPanel.
 *
 * Architecture Traceability:
 *   GA-STATE-001: Runtime State Projection
 *   Reuses StatusIndicator from @vestara/ui with canonical status tokens.
 */

import type { StatusVariant } from '@vestara/ui';
import type { M11CConnectionState } from '../../hooks/useM11CActivityRoom';

// ─── Connection Status ────────────────────────────────────────

export interface ConnectionStatusConfig {
  readonly label: string;
  readonly variant: StatusVariant;
}

export type ActivityDataStatus = 'available' | 'incomplete' | 'unavailable';

export interface ActivityDataStatusConfig {
  readonly label: string;
  readonly variant: StatusVariant;
}

/**
 * Presentation-only projection of the two authoritative Activity Room
 * dimensions. M11B owns live transport state; M11A owns snapshot availability
 * and completeness. No aggregate state is stored or inferred elsewhere.
 */
export function activityDataStatus(available: boolean, snapshotComplete: boolean): ActivityDataStatus {
  if (!available) return 'unavailable';
  return snapshotComplete ? 'available' : 'incomplete';
}

export const ACTIVITY_DATA_STATUS_CONFIG: Record<ActivityDataStatus, ActivityDataStatusConfig> = {
  available: { label: 'Available', variant: 'live' },
  incomplete: { label: 'Available · snapshot incomplete', variant: 'warn' },
  unavailable: { label: 'Unavailable', variant: 'off' },
};

export const LIVE_STREAM_RECONNECT_LABEL = 'Reconnect live stream';
export const LIVE_STREAM_STATUS_PREFIX = 'Live updates';

/**
 * Canonical mapping from M11CConnectionState to StatusIndicator config.
 * Components may override the label for presentation-specific wording.
 */
export const CONNECTION_STATUS_CONFIG: Record<M11CConnectionState, ConnectionStatusConfig> = {
  connecting: { label: 'Connecting', variant: 'warn' },
  live: { label: 'Live', variant: 'live' },
  reconnecting: { label: 'Reconnecting', variant: 'warn' },
  offline: { label: 'Disconnected', variant: 'off' },
  paused: { label: 'Paused', variant: 'idle' },
  error: { label: 'Disconnected', variant: 'error' },
};

// ─── Workflow Summary Status ──────────────────────────────────

export interface WorkflowStatusConfig {
  readonly variant: StatusVariant;
  readonly pulse: boolean;
}

/**
 * Canonical mapping from WorkflowSummary.status to StatusIndicator config.
 * Used by M11CActivityRoomPage workflow status strip.
 */
export const WORKFLOW_STATUS_CONFIG: Record<string, WorkflowStatusConfig> = {
  running: { variant: 'live', pulse: true },
  completed: { variant: 'live', pulse: false },
  failed: { variant: 'error', pulse: false },
  cancelled: { variant: 'off', pulse: false },
  pending: { variant: 'idle', pulse: false },
};

// ─── Participant Presence ─────────────────────────────────────

/**
 * Canonical mapping from PresenceState to StatusIndicator variant.
 * Used by M11CParticipantRail and PresenceIndicator.
 */
export const PRESENCE_VARIANT_CONFIG: Record<string, StatusVariant> = {
  online: 'live',
  active: 'live',
  busy: 'warn',
  away: 'idle',
  offline: 'off',
};

// ─── Work State ───────────────────────────────────────────────

export interface WorkStateConfig {
  readonly variant: StatusVariant;
  readonly label: string;
}

/**
 * Canonical mapping from WorkState to StatusIndicator config.
 * Covers the current WorkState vocabulary plus execution-phase labels
 * accepted by newer participant projections. `available` is presented as
 * Idle so every participant has a scannable status without conflating idle
 * with presence.
 */
export const WORK_STATE_CONFIG: Record<string, WorkStateConfig> = {
  available: { variant: 'idle', label: 'Idle' },
  idle: { variant: 'idle', label: 'Idle' },
  working: { variant: 'live', label: 'Working' },
  building: { variant: 'live', label: 'Building' },
  testing: { variant: 'warn', label: 'Testing' },
  verifying: { variant: 'warn', label: 'Verifying' },
  waiting: { variant: 'warn', label: 'Waiting' },
  blocked: { variant: 'error', label: 'Blocked' },
  'attention-required': { variant: 'error', label: 'Needs attention' },
};
