/**
 * Typed activity model for the Activity Room (AAR-001).
 *
 * Every activity record is an immutable, append-only projection of a subsystem
 * event. Records are discriminated on `kind` so each activity type carries an
 * exhaustive, typed payload instead of a generic `Record<string, unknown>`.
 *
 * Lifecycle changes are expressed as correlated append-only records
 * (`test.started`, `test.completed`, ...), never by mutating an earlier record.
 */

/** The actor responsible for an activity: a human, an agent, or a system subsystem. */
export type ActivityActorType = 'human' | 'agent' | 'system';

export interface ActivityActor {
  readonly type: ActivityActorType;
  readonly id: string;
  readonly displayName: string;
  readonly role?: string;
  readonly modelId?: string;
  readonly providerId?: string;
}

/**
 * The organizational effect an activity has on the organization, beyond its
 * mechanical content. Distinguishes a plain message from a finding,
 * recommendation, decision, authorization, hold, closure, etc. (AAR-001
 * production-readiness: activity meaning).
 */
export type ActivityOrganizationalEffect =
  | 'message'
  | 'finding'
  | 'recommendation'
  | 'decision'
  | 'authorization'
  | 'intervention'
  | 'handoff'
  | 'closure'
  | 'recognition'
  | 'hold';

/** Shared envelope carried by every activity record. */
export interface ActivityBase {
  readonly id: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly actor: ActivityActor;
  readonly workflowId?: string;
  readonly sessionId?: string;
  readonly taskId?: string;
  readonly correlationId?: string;
  readonly evidenceRefs: readonly string[];
  /** Organizational effect (provenance): what kind of organizational change this record represents. */
  readonly effect?: ActivityOrganizationalEffect;
  /** Related record ids (provenance): supersedes, scoped_to, supported_by, disposition, resumed_from, produced, … */
  readonly relatesTo?: readonly string[];
  /** When set, this record is a correction of the referenced activity. The original is never mutated (append-only). */
  readonly correctionOf?: string;
}

export type ActivityKind = 'workflow' | 'task' | 'agent-message' | 'test' | 'verification';

/** Who a human message is addressed to (AAR-001E). Only `all-agents` and a
 * single `agent` are required initially. */
export type MessageTarget = { readonly type: 'all-agents' } | { readonly type: 'agent'; readonly agentId: string };

/** A workflow transition: authoritative phase changes and observer shadow recommendations. */
export interface WorkflowActivity extends ActivityBase {
  readonly kind: 'workflow';
  readonly workflowId: string;
  readonly previousState: string;
  readonly currentState: string;
  readonly reason: string;
  /** True when the transition was applied by the workflow; false for shadow recommendations. */
  readonly authoritative: boolean;
  /** True when the record originates from the workflow observer, not the orchestrator. */
  readonly observed: boolean;
}

export type TaskActivityStatus =
  | 'pending'
  | 'ready'
  | 'assigned'
  | 'in-progress'
  | 'awaiting-approval'
  | 'reviewing'
  | 'changes-requested'
  | 'testing'
  | 'approved'
  | 'retrying'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'completed';

export interface TaskActivity extends ActivityBase {
  readonly kind: 'task';
  readonly taskId: string;
  readonly planId?: string;
  readonly previousStatus: TaskActivityStatus;
  readonly status: TaskActivityStatus;
  readonly summary?: string;
}

export type AgentMessageKind =
  | 'message'
  | 'steering'
  | 'invocation'
  | 'model-response'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'approval-decision';

export interface AgentMessageActivity extends ActivityBase {
  readonly kind: 'agent-message';
  readonly agentId: string;
  readonly threadId?: string;
  readonly turnId?: string;
  readonly messageKind: AgentMessageKind;
  readonly content: string;
  readonly toolName?: string;
  readonly risk?: 'low' | 'medium' | 'high' | 'critical';
  readonly status?: string;
  /** Human-attached activity records (see AAR-001E "Referencing Activity Records"). */
  readonly referencedActivityIds?: readonly string[];
}

export interface VerificationCheck {
  readonly name: string;
  readonly status: 'passed' | 'failed' | 'skipped' | 'blocked';
  readonly summary?: string;
}

export type VerificationOutcome = 'passed' | 'failed' | 'inconclusive' | 'blocked';

export interface VerificationActivity extends ActivityBase {
  readonly kind: 'verification';
  readonly verificationRunId?: string;
  readonly taskId?: string;
  readonly outcome: VerificationOutcome;
  readonly confidence?: number;
  readonly checks: readonly VerificationCheck[];
  readonly reason?: string;
}

export interface TestActivity extends ActivityBase {
  readonly kind: 'test';
  readonly taskId?: string;
  readonly command: string;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly durationMs?: number;
  readonly failureFingerprints: readonly string[];
  readonly outputExcerpt?: string;
}

export type ActivityRecord =
  | WorkflowActivity
  | TaskActivity
  | AgentMessageActivity
  | TestActivity
  | VerificationActivity;

/** All activity kinds currently supported by the projection layer. */
export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  'workflow',
  'task',
  'agent-message',
  'test',
  'verification',
] as const;
