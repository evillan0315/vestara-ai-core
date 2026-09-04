/**
 * ARX-015: Shared Cross-Domain Primitives
 *
 * These types are genuinely shared across multiple Vestara subsystems.
 * Activity Room-specific contracts (ActivityRecord, ActivityStore, ActivityQuery,
 * ActivityCursor, ActivityEvent, etc.) have been migrated to @vestara/activity-room.
 *
 * Ownership rules:
 *   ActivityActorType, ActivityActor → shared across subsystems
 *   MembershipState, PresenceState, WorkState → shared across subsystems
 *   Participant, MembershipEvent → shared across subsystems
 */

import type { WorkflowRunId, WorkflowTaskId } from './ids';

// ─── Shared Activity Primitives ──────────────────────────────

/**
 * Actor who generated the activity.
 * Human vs agent vs system — not provider-specific.
 */
export type ActivityActorType = 'human' | 'agent' | 'system';

/**
 * Actor identity. Structured to carry actor details without provider leakage.
 */
export interface ActivityActor {
  readonly type: ActivityActorType;
  readonly id: string;
  readonly displayName: string;
}

// ─── Dynamic Participant / Membership ───────────────────────

/**
 * Participant identity in the collaborative Activity Room.
 * ActivityActor tells us who produced an activity.
 * Participant represents membership in the room.
 *
 * No Planner/Developer/Reviewer/Verifier identities are hardcoded.
 */
export interface Participant {
  /** Unique participant identity. */
  readonly participantId: string;

  /** Participant type. */
  readonly type: ActivityActorType;

  /** Display name. */
  readonly displayName: string;

  /** Current membership state. */
  readonly membership: MembershipState;

  /** Current presence state (transient, not durable authority). */
  readonly presence: PresenceState;

  /** Current work state. */
  readonly workState: WorkState;
}

/**
 * Membership state — durable across restarts.
 */
export type MembershipState = 'joined' | 'left' | 'assigned';

/**
 * Presence state — transient, not durable authority.
 * M10 owns presence/attention projection semantics.
 */
export type PresenceState = 'online' | 'offline' | 'idle' | 'disconnected';

/**
 * Work state — meaningful work facts that M9 can durably store.
 */
export type WorkState = 'available' | 'working' | 'waiting' | 'blocked' | 'attention-required';

/**
 * Membership event — durable record of participant join/leave/assign.
 */
export interface MembershipEvent {
  /** Unique event identity. */
  readonly eventId: string;

  /** Participant identity. */
  readonly participantId: string;

  /** Membership change. */
  readonly state: MembershipState;

  /** When this occurred. */
  readonly timestamp: string;

  /** Optional context (which workflow, which task). */
  readonly workflowRunId?: WorkflowRunId;
  readonly taskId?: WorkflowTaskId;
}
