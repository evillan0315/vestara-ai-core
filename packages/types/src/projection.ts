/**
 * ARX-015 M10: Projection & Attention Types
 *
 * Transforms durable M9 ActivityRecords into a live, reconstructable
 * collaboration projection. M10 is a projection layer — never an
 * orchestration authority.
 *
 * Ownership rules:
 *   M9 ActivityStore → durable facts
 *   M10 ProjectionRuntime → live projection state
 *   M11 UI → rendering and user interaction
 *
 * Commands flow: UI → owning service → policy → mutation → event → M9 → M10 → UI
 */

import type {
  ActivityActor,
  ActivityActorType,
  ActivityCursor,
  ActivityRecord,
  ActivityType,
  MembershipState,
  PresenceState,
  WorkState,
} from './activity';
import type { ExecutionId, WorkflowRunId, WorkflowTaskId } from './ids';

// ─── Stream Item ────────────────────────────────────────────

/**
 * Classification of stream item content.
 * Determines visual treatment in M11.
 */
export type StreamItemKind =
  | 'conversation' // human messages
  | 'activity' // meaningful workflow/task/agent events
  | 'progress' // incremental progress updates
  | 'log' // detailed runtime logs
  | 'diagnostic' // error/failure details
  | 'evidence' // test results, verification output
  | 'telemetry'; // system metrics, performance data

/**
 * Projection importance for visual muting in M11.
 */
export type StreamImportance = 'primary' | 'secondary' | 'muted';

/**
 * A projected stream item for the Activity Room.
 * Derived from M9 ActivityRecords with importance classification.
 */
export interface StreamItem {
  /** Stable identity for this projected item. */
  readonly streamItemId: string;

  /** Reference to the source M9 ActivityRecord. */
  readonly activityId: string;

  /** M9 sequence number for ordering. */
  readonly sequenceNumber: number;

  /** Content classification. */
  readonly kind: StreamItemKind;

  /** Visual importance. */
  readonly importance: StreamImportance;

  /** Who produced this. */
  readonly actor: ActivityActor;

  /** Human-readable content. */
  readonly content: string;

  /** Timestamp. */
  readonly timestamp: string;

  /** M1 lineage. */
  readonly workflowRunId?: WorkflowRunId;
  readonly executionId?: ExecutionId;
  readonly taskId?: WorkflowTaskId;

  /** Aggregation context (for muted items). */
  readonly aggregated?: {
    readonly count: number;
    readonly kind: StreamItemKind;
    readonly summary: string;
    /** Deterministic references to underlying M9 record activity IDs for drill-down. */
    readonly referencedActivityIds: readonly string[];
    /** Sequence range [first, last] for M9 cursor-based retrieval. */
    readonly sequenceRange: { readonly first: number; readonly last: number };
  };
}

// ─── Participant Projection ─────────────────────────────────

/**
 * Projected participant state in the Activity Room.
 * Combines durable membership with transient presence and work state.
 */
export interface ParticipantProjection {
  /** Unique participant identity. */
  readonly participantId: string;

  /** Participant type. */
  readonly type: ActivityActorType;

  /** Display name. */
  readonly displayName: string;

  /** Durable membership state. */
  readonly membership: MembershipState;

  /** Transient presence state (resolved independently, not from history). */
  readonly presence: PresenceState;

  /** Current work state (derived from authoritative facts). */
  readonly workState: WorkState;

  /** Current task assignment, if any. */
  readonly currentAssignment?: {
    readonly workflowRunId: WorkflowRunId;
    readonly taskId: WorkflowTaskId;
    readonly taskTitle?: string;
  };

  /** When this participant joined. */
  readonly joinedAt: string;

  /** Last activity timestamp. */
  readonly lastActivityAt: string;
}

// ─── Attention ──────────────────────────────────────────────

/**
 * Typed attention reasons. Not a generic boolean.
 */
export type AttentionReason =
  | 'task-failed'
  | 'task-blocked'
  | 'workflow-failed'
  | 'attention-required'
  | 'waiting-for-human'
  | 'dependency-unavailable'
  | 'retry-needed'
  | 'material-change';

/**
 * Attention severity levels.
 */
export type AttentionSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * An attention entry — something that needs human awareness.
 */
export interface AttentionEntry {
  /** Stable identity. */
  readonly attentionId: string;

  /** Why attention is needed. */
  readonly reason: AttentionReason;

  /** Severity level. */
  readonly severity: AttentionSeverity;

  /** Human-readable description. */
  readonly message: string;

  /** Which actor/task/workflow is involved. */
  readonly actor?: ActivityActor;
  readonly workflowRunId?: WorkflowRunId;
  readonly taskId?: WorkflowTaskId;

  /** When this was generated. */
  readonly timestamp: string;

  /** Whether this has been acknowledged. */
  readonly acknowledged: boolean;
}

// ─── Workflow Summary ───────────────────────────────────────

/**
 * Projected workflow summary for the Activity Room.
 */
export interface WorkflowSummary {
  readonly workflowRunId: WorkflowRunId;
  readonly executionId?: ExecutionId;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  readonly taskCount: number;
  readonly completedTasks: number;
  readonly failedTasks: number;
  readonly currentTask?: string;
  readonly startedAt: string;
  readonly lastActivityAt: string;
}

// ─── Contextual Capabilities ────────────────────────────────

/**
 * M11 composer discovery context.
 * Structured information for @ mentions, / commands, # references.
 */
export interface ContextualCapabilities {
  /** Mentionable participants (from dynamic room membership). */
  readonly mentionableParticipants: ReadonlyArray<{
    readonly participantId: string;
    readonly displayName: string;
    readonly type: ActivityActorType;
  }>;

  /** Available slash commands (from module contributions). */
  readonly availableCommands: ReadonlyArray<{
    readonly command: string;
    readonly description: string;
  }>;

  /** Referenceable entities (workflows, tasks, artifacts). */
  readonly referenceableEntities: ReadonlyArray<{
    readonly entityId: string;
    readonly entityType: 'workflow' | 'task' | 'artifact';
    readonly displayName: string;
  }>;
}

// ─── Activity Room Projection ───────────────────────────────

/**
 * Complete Activity Room projection state.
 * Suitable for M11's production Activity Room API/UI.
 *
 * Reconstructable from M9 durable storage.
 * No critical state exists only inside M10 process.
 */
export interface ActivityRoomProjection {
  /** Room metadata. */
  readonly room: {
    readonly roomId: string;
    readonly name: string;
    readonly cursor: ActivityCursor;
    readonly rebuiltAt: string;
  };

  /** Current participants. */
  readonly participants: readonly ParticipantProjection[];

  /** Activity stream items. */
  readonly stream: readonly StreamItem[];

  /** Current workflow summary, if active. */
  readonly workflowSummary?: WorkflowSummary;

  /** Attention entries requiring human awareness. */
  readonly attention: readonly AttentionEntry[];

  /** Contextual capabilities for M11 composer. */
  readonly contextualCapabilities: ContextualCapabilities;
}
