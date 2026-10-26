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
 * Authoritative PresenceState (packages/types/activity.ts):
 *   'online' | 'offline' | 'idle' | 'disconnected'
 * Legacy aliases (active/busy/away) are kept for forward-compat if the
 * contract grows — they must never be treated as authoritative today.
 * Used by M11CParticipantRail and PresenceIndicator.
 */
export const PRESENCE_VARIANT_CONFIG: Record<string, StatusVariant> = {
  online: 'live',
  idle: 'idle',
  offline: 'off',
  disconnected: 'off',
  // Forward-compat aliases (not authoritative):
  active: 'live',
  busy: 'warn',
  away: 'idle',
};

export const PRESENCE_LABEL: Record<string, string> = {
  online: 'Online',
  idle: 'Idle',
  offline: 'Offline',
  disconnected: 'Disconnected',
  // Forward-compat aliases:
  active: 'Active',
  busy: 'Busy',
  away: 'Away',
};

// ─── Work State ───────────────────────────────────────────────

export interface WorkStateConfig {
  readonly variant: StatusVariant;
  readonly label: string;
}

/**
 * Canonical mapping from WorkState to StatusIndicator config.
 * Authoritative WorkState (packages/types/activity.ts):
 *   'available' | 'working' | 'waiting' | 'blocked' | 'attention-required'
 * `available` is presented as Idle so every participant has a scannable
 * status without conflating idle with presence. Legacy execution-phase
 * aliases (building/testing/verifying/idle) are kept so older projections
 * still render instead of dropping their lamp.
 */
export const WORK_STATE_CONFIG: Record<string, WorkStateConfig> = {
  available: { variant: 'idle', label: 'Idle' },
  working: { variant: 'live', label: 'Working' },
  waiting: { variant: 'warn', label: 'Waiting' },
  blocked: { variant: 'error', label: 'Blocked' },
  'attention-required': { variant: 'error', label: 'Needs attention' },
  // Legacy aliases (not authoritative — map to nearest canonical tone):
  idle: { variant: 'idle', label: 'Idle' },
  building: { variant: 'live', label: 'Building' },
  testing: { variant: 'warn', label: 'Testing' },
  verifying: { variant: 'warn', label: 'Verifying' },
};

// ─── Badge Tones (token-driven pill treatment) ────────────────

export type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Canonical work-state → badge-tone mapping. Mirrors WORK_STATE_CONFIG
 * variants so pills and lamps can never disagree: live→success,
 * warn→warning, error→error, idle→neutral.
 */
export const WORK_STATE_TONE: Record<string, BadgeTone> = {
  working: 'success',
  building: 'success',
  waiting: 'warning',
  testing: 'warning',
  verifying: 'warning',
  blocked: 'error',
  'attention-required': 'error',
  available: 'neutral',
  idle: 'neutral',
};

// ─── Stale Work Detection (presentation honesty) ───────────────

/**
 * A run that claims an active work state but has produced no activity for
 * longer than this is almost certainly orphaned (worker died, completion
 * lost — e.g. verifier `agent.started` with no following `agent.completed`).
 * The threshold is PRESENTATION ONLY: it never rewrites workState, it only
 * lets the UI label the badge "Working · stale" and surface the row where
 * attention is paid. 30 minutes is conservative — a truly working agent
 * emits tool/activity records that keep lastActivityAt fresh.
 */
export const STALE_WORK_MS = 30 * 60 * 1000;

const ACTIVE_WORK_STATES: ReadonlySet<string> = new Set(['working', 'building']);

/**
 * True when an actively-working claim outlived its last activity.
 * Never throws and never claims on missing/unparseable timestamps.
 */
export function isWorkStateStale(workState: string, lastActivityAt: string | undefined, now: number = Date.now()): boolean {
  if (!ACTIVE_WORK_STATES.has(String(workState))) return false;
  if (!lastActivityAt) return false;
  const at = new Date(lastActivityAt).getTime();
  if (Number.isNaN(at)) return false;
  return now - at > STALE_WORK_MS;
}

// ─── Participant Membership ───────────────────────────────────

/**
 * Authoritative MembershipState (packages/types/activity.ts):
 *   'joined' | 'left' | 'assigned'
 * Activity Room never invents member/observer/guest — those were a
 * presentation mismatch and are removed.
 */
export const MEMBERSHIP_LABEL: Record<string, string> = {
  joined: '',
  assigned: 'Assigned',
  left: 'Left',
};

/**
 * Scan order for grouped participant presentation. Severity dominates:
 * blocked/needs-attention pin top, then working, then waiting (includes
 * approval holds), then idle, then left/offline.
 */
export const PARTICIPANT_GROUP_ORDER = [
  'attention',
  'working',
  'waiting',
  'idle',
  'left',
] as const;

export type ParticipantGroupKey = (typeof PARTICIPANT_GROUP_ORDER)[number];

export function participantGroupOf(workState: string, membership: string, presence: string): ParticipantGroupKey {
  if (membership === 'left') return 'left';
  if (workState === 'blocked' || workState === 'attention-required') return 'attention';
  if (workState === 'working' || workState === 'building') return 'working';
  if (workState === 'waiting' || workState === 'testing' || workState === 'verifying') return 'waiting';
  if (presence === 'offline' || presence === 'disconnected') return 'left';
  return 'idle';
}
