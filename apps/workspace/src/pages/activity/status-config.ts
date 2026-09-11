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

/**
 * Canonical mapping from M11CConnectionState to StatusIndicator config.
 * Components may override the label for presentation-specific wording.
 */
export const CONNECTION_STATUS_CONFIG: Record<M11CConnectionState, ConnectionStatusConfig> = {
  connecting: { label: 'Connecting', variant: 'warn' },
  live: { label: 'Live', variant: 'live' },
  reconnecting: { label: 'Reconnecting', variant: 'warn' },
  offline: { label: 'Offline', variant: 'off' },
  paused: { label: 'Paused', variant: 'idle' },
  error: { label: 'Offline', variant: 'error' },
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
 * Used by WorkTab and M11CParticipantRail.
 */
export const WORK_STATE_CONFIG: Record<string, WorkStateConfig> = {
  idle: { variant: 'idle', label: 'Idle' },
  working: { variant: 'live', label: 'Working' },
  blocked: { variant: 'error', label: 'Blocked' },
  waiting: { variant: 'warn', label: 'Waiting' },
  completed: { variant: 'live', label: 'Completed' },
  failed: { variant: 'error', label: 'Failed' },
};
