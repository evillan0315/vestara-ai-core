import type { Brand } from './common';

export type RuntimeId = Brand<string, 'RuntimeId'>;
export type JobId = Brand<string, 'JobId'>;
export type WorkerId = Brand<string, 'WorkerId'>;
export type IntentId = Brand<string, 'IntentId'>;
export type EventId = Brand<string, 'EventId'>;
export type ResourceId = Brand<string, 'ResourceId'>;
export type PlanId = Brand<string, 'PlanId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type CheckpointId = Brand<string, 'CheckpointId'>;
export type LockId = Brand<string, 'LockId'>;
export type PermissionId = Brand<string, 'PermissionId'>;
export type RoleId = Brand<string, 'RoleId'>;
export type RegistryId = Brand<string, 'RegistryId'>;
export type CapabilityId = Brand<string, 'CapabilityId'>;
export type WorkerGroupId = Brand<string, 'WorkerGroupId'>;
export type FailureBudgetId = Brand<string, 'FailureBudgetId'>;
export type RecoveryId = Brand<string, 'RecoveryId'>;
export type VerificationId = Brand<string, 'VerificationId'>;
export type TrustRecordId = Brand<string, 'TrustRecordId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;
export type CausationId = Brand<string, 'CausationId'>;
export type TaskThreadId = Brand<string, 'TaskThreadId'>;
export type AgentTurnId = Brand<string, 'AgentTurnId'>;
export type ThreadItemId = Brand<string, 'ThreadItemId'>;
export type AgentEnvironmentId = Brand<string, 'AgentEnvironmentId'>;
export type ToolCallId = Brand<string, 'ToolCallId'>;
export type ApprovalRequestId = Brand<string, 'ApprovalRequestId'>;

// ─── ARX-015 Canonical Identity Types ────────────────────────

/** Canonical execution identity. Source of truth for correlationId derivation. */
export type ExecutionId = Brand<string, 'ExecutionId'>;

/** Transport/request identity. Single HTTP/WS request lifecycle. */
export type RequestId = Brand<string, 'RequestId'>;

/** Distributed trace identifier. Created at top-level entry points. Survives process restarts. */
export type TraceId = Brand<string, 'TraceId'>;

/** Single execution attempt of a workflow project. Multiple runs possible per project. */
export type WorkflowRunId = Brand<string, 'WorkflowRunId'>;

/** Immutable AI resolution binding at invocation/assignment scope. */
export type BindingId = Brand<string, 'BindingId'>;

/** Authoritative repository binding identity. Source of truth for execution directory. */
export type RepositoryBindingId = Brand<string, 'RepositoryBindingId'>;

/** Runtime session binding identity. Source of truth for session continuity. */
export type RuntimeSessionId = Brand<string, 'RuntimeSessionId'>;

// ─── ARX-015 M8: Workflow Run & DAG Identity Types ──────────

/** Workflow plan identity. Immutable definition of a workflow. */
export type WorkflowPlanId = Brand<string, 'WorkflowPlanId'>;

/** Workflow task identity. Bounded executable unit within a run. */
export type WorkflowTaskId = Brand<string, 'WorkflowTaskId'>;
