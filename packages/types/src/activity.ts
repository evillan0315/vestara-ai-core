/**
 * ARX-015 M9: Durable Activity Room Types
 *
 * Defines the canonical durable Activity record — a projection of
 * authoritative platform facts. Activity Room is a durable observer,
 * never an orchestration authority.
 *
 * Ownership rules:
 *   WorkflowRunEngine → orchestration state
 *   AiInvocationService → AI provider/model
 *   RuntimeSessionRegistry → runtime continuity
 *   ActivityStore → durable projection of the above
 *
 * Activity records carry M1/M2 canonical lineage. Projection state
 * is reconstructable from durable facts.
 */

import type { Brand } from './common';
import type {
  BindingId,
  ExecutionId,
  RepositoryBindingId,
  RequestId,
  RuntimeSessionId,
  TraceId,
  WorkflowRunId,
  WorkflowTaskId,
} from './ids';

// ─── Activity Record ID ─────────────────────────────────────

/** Unique identity for a durable Activity record. */
export type ActivityRecordId = Brand<string, 'ActivityRecordId'>;

// ─── Activity Types ─────────────────────────────────────────

/**
 * Canonical activity types. Extensible for future domains (browser, etc.)
 * but normalized to prevent provider/OpenCode-specific leakage.
 */
export type ActivityType =
  // Workflow lifecycle (consumed from M8 WorkflowEvents)
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'workflow.cancelled'
  // Task lifecycle (consumed from M8 WorkflowEvents)
  | 'task.runnable'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  // Agent lifecycle (normalized from agent harness)
  | 'agent.assigned'
  | 'agent.started'
  | 'agent.progress'
  | 'agent.waiting'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.cancelled'
  // Human interaction
  | 'human.message'
  // System
  | 'system.event'
  // Interaction (AR-REC-C2)
  | 'interaction.presented'
  | 'interaction.responded';

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

/**
 * Source system that produced the event.
 * Normalized to Vestara concepts, not OpenCode internals.
 */
export type ActivitySource =
  | 'workflow-engine'
  | 'agent-harness'
  | 'human-input'
  | 'runtime-session'
  | 'system'
  | 'interaction-app';

/**
 * Visibility scope for an activity record.
 */
export type ActivityVisibility = 'all' | 'operators' | 'system';

// ─── Activity Record ────────────────────────────────────────

/**
 * Durable Activity record. Carries canonical M1/M2 lineage.
 * Never becomes an orchestration authority.
 *
 * Projection state (UI/API) is reconstructable from these records.
 */
export interface ActivityRecord {
  /** Unique identity for this durable record. */
  readonly activityId: ActivityRecordId;

  /** Idempotency key: canonical event identity. Deduplication anchor. */
  readonly eventId: string;

  /** Monotonic sequence number within the store. Ordering anchor. */
  readonly sequenceNumber: number;

  /** Canonical activity type. */
  readonly type: ActivityType;

  /** When the activity occurred (ISO 8601). */
  readonly timestamp: string;

  // ─── Canonical M1/M2 Lineage ────────────────────────────

  /** Canonical execution identity (M1). */
  readonly executionId?: ExecutionId;

  /** Distributed trace identifier (M1). */
  readonly traceId?: TraceId;

  /** Transport/request identity (M1). */
  readonly requestId?: RequestId;

  /** Workflow run identity (M8). */
  readonly workflowRunId?: WorkflowRunId;

  /** Workflow task identity (M8). */
  readonly taskId?: WorkflowTaskId;

  /** Agent assignment identity. */
  readonly agentAssignmentId?: string;

  /** Repository binding identity (M5). */
  readonly repositoryBindingId?: RepositoryBindingId;

  /** Runtime session binding identity (M7). */
  readonly runtimeSessionBindingId?: RuntimeSessionId;

  /** AI binding identity (M4). */
  readonly aiBindingId?: BindingId;

  // ─── Actor & Source ─────────────────────────────────────

  /** Who generated this activity. */
  readonly actor: ActivityActor;

  /** Specific identity of the actor (agent ID, user ID, etc.) */
  readonly actorId?: string;

  /** Which system produced this event. */
  readonly source: ActivitySource;

  // ─── Content ────────────────────────────────────────────

  /** Normalized payload. Provider/OpenCode-specific details are stripped. */
  readonly payload: ActivityPayload;

  /** Who can see this record. */
  readonly visibility: ActivityVisibility;
}

/**
 * Normalized payload. Structured to avoid provider/OpenCode leakage.
 */
export interface ActivityPayload {
  /** Human-readable message. */
  readonly message?: string;

  /** Activity-specific structured data. */
  readonly data?: Readonly<Record<string, unknown>>;

  /** Error details (for failed activities). */
  readonly error?: {
    readonly message: string;
    readonly code?: string;
  };

  /** Output details (for completed activities). */
  readonly output?: string;

  /** Task dependency condition (for task.runnable). */
  readonly dependencyCondition?: 'completed' | 'any';
}

// ─── Activity Event (Input) ────────────────────────────────

/**
 * Canonical event that arrives at the Activity Store.
 * Can come from M8 WorkflowEvents, human messages, agent lifecycle, etc.
 * The store normalizes these into durable ActivityRecords.
 */
export interface ActivityEvent {
  /** Canonical event identity for deduplication. */
  readonly eventId: string;

  /** Activity type. */
  readonly type: ActivityType;

  /** When the event occurred. */
  readonly timestamp: string;

  // ─── Lineage (same fields as ActivityRecord) ────────────

  readonly executionId?: ExecutionId;
  readonly traceId?: TraceId;
  readonly requestId?: RequestId;
  readonly workflowRunId?: WorkflowRunId;
  readonly taskId?: WorkflowTaskId;
  readonly agentAssignmentId?: string;
  readonly repositoryBindingId?: RepositoryBindingId;
  readonly runtimeSessionBindingId?: RuntimeSessionId;
  readonly aiBindingId?: BindingId;

  // ─── Actor & Source ─────────────────────────────────────

  readonly actor: ActivityActor;
  readonly actorId?: string;
  readonly source: ActivitySource;

  // ─── Content ────────────────────────────────────────────

  readonly payload: ActivityPayload;
  readonly visibility?: ActivityVisibility;
}

// ─── Query Surface ──────────────────────────────────────────

/**
 * Cursor for pagination and replay.
 * Event identity + sequence number, not timestamp alone.
 */
export interface ActivityCursor {
  /** Sequence number for cursor-based pagination. */
  readonly sequenceNumber: number;

  /** Event identity for deduplication verification. */
  readonly eventId: string;

  /** Timestamp for time-based filtering. */
  readonly timestamp: string;
}

/**
 * Query filters for the Activity Store.
 * Supports M10/M11 data requirements without overbuilding.
 */
export interface ActivityQuery {
  /** Filter by workflow run. */
  readonly workflowRunId?: WorkflowRunId;

  /** Filter by execution identity. */
  readonly executionId?: ExecutionId;

  /** Filter by task identity. */
  readonly taskId?: WorkflowTaskId;

  /** Filter by actor type. */
  readonly actor?: ActivityActorType;

  /** Filter by actor identity. */
  readonly actorId?: string;

  /** Filter by activity type. */
  readonly type?: ActivityType | ActivityType[];

  /** Filter by source system. */
  readonly source?: ActivitySource;

  /** Only records after this cursor (exclusive). */
  readonly after?: ActivityCursor;

  /** Only records before this timestamp. */
  readonly before?: string;

  /** Only records after this timestamp. */
  readonly afterTimestamp?: string;

  /** Maximum number of results. */
  readonly limit?: number;
}

// ─── Store Interface ────────────────────────────────────────

/**
 * Durable Activity Store interface.
 * Idempotent ingestion: same eventId → exactly one ActivityRecord.
 * Deterministic ordering via sequenceNumber.
 */
export interface ActivityStore {
  /**
   * Append a canonical event. Idempotent: same eventId returns existing record.
   * Returns the durable ActivityRecord with assigned sequenceNumber.
   */
  append(event: ActivityEvent): Promise<ActivityRecord>;

  /**
   * Query activities with filters. Returns results in deterministic order.
   */
  query(q: ActivityQuery): Promise<readonly ActivityRecord[]>;

  /**
   * Get activities after a cursor (exclusive). For pagination/replay.
   */
  getAfter(cursor: ActivityCursor): Promise<readonly ActivityRecord[]>;

  /**
   * Get a single record by event ID. For deduplication verification.
   */
  getByEventId(eventId: string): Promise<ActivityRecord | undefined>;

  /**
   * Replay a range of records. For rebuild/verification.
   */
  replay(from?: ActivityCursor, to?: ActivityCursor): Promise<readonly ActivityRecord[]>;

  /**
   * Rebuild projection from all durable facts. Returns all records in order.
   */
  rebuild(): Promise<readonly ActivityRecord[]>;

  /**
   * Get current cursor (last appended record). For reconnect/resume.
   */
  getCursor(): Promise<ActivityCursor | null>;

  /**
   * Get the last sequence number. For polling/recovery.
   */
  lastSequence(): Promise<number>;
}
