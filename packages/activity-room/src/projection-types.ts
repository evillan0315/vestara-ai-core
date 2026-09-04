/**
 * AR-001C: Activity Room Projection Types
 *
 * Read models for the Activity Room UI. Consolidated from @vestara/types.
 * Previously lived in @vestara/types as M10 projection contracts.
 *
 * Ownership: @vestara/activity-room
 */

import type {
  ActivityActor,
  ActivityActorType,
  ExecutionId,
  MembershipState,
  PresenceState,
  WorkflowRunId,
  WorkflowTaskId,
  WorkState,
} from '@vestara/types';
import type { ActivityCursor, ActivityRecord } from './m9-types';

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
  | 'telemetry' // system metrics, performance data
  | 'interaction'; // structured interactions (presented/responded)

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

  /** Interaction presentation data (only when kind === 'interaction'). */
  readonly interaction?: {
    /** Stable identity for the originating StructuredInteraction. */
    readonly interactionId: string;
    /** Whether this is a presented or responded event. */
    readonly lifecycle: 'presented' | 'responded';
    /** Opaque choice options from the presenting producer. */
    readonly choices?: readonly { readonly choiceId: string; readonly label: string; readonly description?: string }[];
    /** Selected choice identity (only when lifecycle === 'responded'). */
    readonly selectedChoiceId?: string;
    /** Responding participant identity (only when lifecycle === 'responded'). */
    readonly respondingParticipantId?: string;
    /** Responding participant display name (only when lifecycle === 'responded'). */
    readonly respondingParticipantName?: string;
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

  /**
   * Canonical display name — participant identity when available.
   * For unnamed agents this is the stable agentId; for named agents
   * it is their chosen name. For humans it is the user name.
   */
  readonly displayName: string;

  /**
   * Presentation-only model display name (e.g. "Mimo", "DeepSeek").
   * Separate from canonical identity. UI uses `modelDisplayName ?? displayName`
   * as a fallback for unnamed AI participants.
   * Undefined for humans.
   */
  readonly modelDisplayName?: string;

  /** Agent role (e.g. 'developer', 'reviewer'). Undefined for humans. */
  readonly role?: string;

  /** Resolved model ID (e.g. 'mimo-v2.5-free'). Undefined for humans. */
  readonly modelId?: string;

  /** Resolved provider ID. Undefined for humans. */
  readonly providerId?: string;

  /**
   * Team membership reference — comes from upstream AgentTeam authority,
   * NOT from Activity Room. Undefined when no team authority is wired.
   * Activity Room does not define or own team membership.
   */
  readonly teamId?: string;

  /**
   * Team display name — denormalized from AgentTeam for presentation.
   * Activity Room consumes this; it does not define it.
   */
  readonly teamName?: string;

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
