/**
 * ARX-015 M8: Workflow Run & DAG Types
 *
 * Defines the workflow execution model:
 *   WorkflowDefinition / WorkflowPlan (immutable WHAT)
 *       ↓
 *   WorkflowRun (mutable execution state)
 *       ↓
 *   Workflow DAG (task dependencies)
 *       ↓
 *   WorkflowTask instances (bounded executable units)
 *       ↓
 *   AgentAssignment
 *       ↓
 *   execution/runtime
 *
 * Ownership separation:
 *   WorkflowRun     = orchestration state
 *   RuntimeSessionBinding (M7) = runtime continuity
 *   ExecutionSession = execution/evidence
 *   ResolvedAiBinding (M4) = AI provider/model authority
 *   RepositoryBinding (M5) = repository authority
 */

import type {
  BindingId,
  ExecutionId,
  RepositoryBindingId,
  RequestId,
  RuntimeSessionId,
  TraceId,
  WorkflowPlanId,
  WorkflowRunId,
  WorkflowTaskId,
} from './ids';
import type { RuntimeSessionBinding } from './runtime-session';

// ─── Task Lifecycle ─────────────────────────────────────────

/**
 * Deterministic task lifecycle states.
 *
 * Valid transitions:
 *   pending → runnable  (all dependencies satisfied)
 *   runnable → running  (agent assignment started)
 *   running → completed (agent returned success)
 *   running → failed    (agent returned failure)
 *   running → waiting   (blocked on external input)
 *   waiting → running   (external input received)
 *   pending/runnable/running/failed → cancelled (operator or DAG cancellation)
 */
export type WorkflowTaskStatus = 'pending' | 'runnable' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled';

// ─── Task Definition ────────────────────────────────────────

/**
 * Immutable task definition within a workflow plan.
 * Defines WHAT must happen, not HOW.
 */
export interface WorkflowTaskDefinition {
  /** Unique task identity within the plan. */
  readonly taskId: string;

  /** Human-readable task title. */
  readonly title: string;

  /** Task role (maps to agent assignment role). */
  readonly role: string;

  /** Task IDs that must reach a terminal state before this task becomes runnable. */
  readonly dependencies: readonly string[];

  /** Terminal dependency condition: 'completed' means deps must be completed, 'any' means any terminal state. */
  readonly dependencyCondition: 'completed' | 'any';

  /** Agent ID to assign (if known statically). */
  readonly agentId?: string;

  /** Estimated duration in ms (for planning). */
  readonly estimatedDuration?: number;

  /** Task-level metadata. */
  readonly metadata: Readonly<Record<string, unknown>>;
}

// ─── Task Instance ──────────────────────────────────────────

/**
 * Mutable task instance within a workflow run.
 * Tracks the runtime state of a specific task execution.
 */
export interface WorkflowTaskInstance {
  /** Unique task instance identity. */
  readonly taskInstanceId: WorkflowTaskId;

  /** Reference to the task definition. */
  readonly taskId: string;

  /** The workflow run this task belongs to. */
  readonly workflowRunId: WorkflowRunId;

  /** Current lifecycle status. */
  readonly status: WorkflowTaskStatus;

  /** Agent assignment ID (set when running). */
  readonly agentAssignmentId?: string;

  /** AI binding ID (set when AI invocation is resolved). */
  readonly aiBindingId?: BindingId;

  /** Task output (set when completed). */
  readonly output?: string;

  /** Error message (set when failed). */
  readonly error?: string;

  /** Terminal state (set when completed/failed/cancelled). */
  readonly terminalState?: 'completed' | 'failed' | 'cancelled';

  /** Start time (set when running). */
  readonly startedAt?: string;

  /** End time (set when terminal). */
  readonly completedAt?: string;

  /** Retry count. */
  readonly retryCount: number;

  /** Timestamps. */
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── Workflow Plan ──────────────────────────────────────────

/**
 * Immutable workflow plan definition.
 * Defines WHAT the workflow does, not HOW it executes.
 */
export interface WorkflowPlan {
  /** Unique plan identity. */
  readonly planId: WorkflowPlanId;

  /** Human-readable plan name. */
  readonly name: string;

  /** Plan description. */
  readonly description: string;

  /** Task definitions (the DAG). */
  readonly tasks: WorkflowTaskDefinition[];

  /** Default agent assignments (role → agent ID). */
  readonly defaultAssignments: Readonly<Record<string, string>>;

  /** Plan-level metadata. */
  readonly metadata: Readonly<Record<string, unknown>>;

  /** When this plan was created. */
  readonly createdAt: string;
}

// ─── Workflow Run ───────────────────────────────────────────

/**
 * Workflow run lifecycle states.
 *
 * Valid transitions:
 *   pending → running   (first task becomes runnable)
 *   running → completed (all tasks terminal)
 *   running → failed    (critical task failed, no retry)
 *   running → cancelled (operator cancellation)
 *   pending/running/failed → running (retry/resume)
 */
export type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Mutable workflow run state.
 * Owns orchestration state. Does NOT own runtime session, AI binding, or repository.
 */
export interface WorkflowRun {
  /** Unique workflow run identity. */
  readonly workflowRunId: WorkflowRunId;

  /** Reference to the plan this run executes. */
  readonly planId: WorkflowPlanId;

  /** Idempotency key: derived from execution identity (M1). Prevents duplicate runs. */
  readonly idempotencyKey: string;

  /** Canonical identity lineage (M1). */
  readonly executionId?: ExecutionId;
  readonly traceId?: TraceId;
  readonly requestId?: RequestId;

  /** M5: Authoritative repository binding for this run. */
  readonly repositoryBindingId: RepositoryBindingId;

  /** M7: Runtime session binding for this run. */
  readonly runtimeSessionBindingId?: RuntimeSessionId;

  /** Current workflow run status. */
  readonly status: WorkflowRunStatus;

  /** Task instances (the DAG state). */
  readonly tasks: WorkflowTaskInstance[];

  /** Workflow-level output (set when completed). */
  readonly output?: string;

  /** Error message (set when failed). */
  readonly error?: string;

  /** Start time (set when running). */
  readonly startedAt?: string;

  /** End time (set when terminal). */
  readonly completedAt?: string;

  /** Timestamps. */
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── M9 Event Readiness ─────────────────────────────────────

/** Event types emitted by WorkflowRunEngine for M9 consumption. */
export type WorkflowEventType =
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'workflow.cancelled'
  | 'task.runnable'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled';

/** Canonical event payload carrying M1/M2 lineage. */
export interface WorkflowEvent {
  /** Event type. */
  readonly type: WorkflowEventType;

  /** M1 canonical identity lineage. */
  readonly workflowRunId: WorkflowRunId;
  readonly executionId?: ExecutionId;
  readonly traceId?: TraceId;
  readonly requestId?: RequestId;

  /** Task identity (for task.* events). */
  readonly taskInstanceId?: WorkflowTaskId;
  readonly taskId?: string;

  /** Agent assignment (for task.started). */
  readonly agentAssignmentId?: string;

  /** Task output/error (for task.completed/task.failed). */
  readonly output?: string;
  readonly error?: string;

  /** Timestamp. */
  readonly timestamp: string;
}

/** Callback for workflow events. */
export type WorkflowEventCallback = (event: WorkflowEvent) => void;

// ─── Engine Input/Output Types ──────────────────────────────

/** Input for starting a workflow run. */
export interface WorkflowRunStartInput {
  /** The plan to execute. */
  readonly plan: WorkflowPlan;

  /** Canonical identity lineage (M1). */
  readonly executionId?: ExecutionId;
  readonly traceId?: TraceId;
  readonly requestId?: RequestId;

  /** M5: Repository binding for execution directory. */
  readonly repositoryBindingId: RepositoryBindingId;

  /** M7: Runtime session binding (shared under current policy). */
  readonly runtimeSessionBindingId?: RuntimeSessionId;

  /** Idempotency key (derived from executionId if not provided). */
  readonly idempotencyKey?: string;
}

/** Result of starting a workflow run. */
export interface WorkflowRunStartResult {
  /** The workflow run (may be existing if idempotent). */
  readonly run: WorkflowRun;

  /** Whether this call created a new run (false = reused existing). */
  readonly created: boolean;

  /** Tasks that became runnable as a result of this start. */
  readonly runnableTasks: readonly WorkflowTaskInstance[];
}

/** Input for completing a task. */
export interface WorkflowTaskCompleteInput {
  /** The workflow run ID. */
  readonly workflowRunId: WorkflowRunId;

  /** The task instance ID to complete. */
  readonly taskInstanceId: WorkflowTaskId;

  /** Whether the task succeeded. */
  readonly success: boolean;

  /** Task output (if success). */
  readonly output?: string;

  /** Error message (if failure). */
  readonly error?: string;
}

/** Result of completing a task. */
export interface WorkflowTaskCompleteResult {
  /** The updated task instance. */
  readonly task: WorkflowTaskInstance;

  /** The updated workflow run. */
  readonly run: WorkflowRun;

  /** Tasks that became runnable as a result of this completion. */
  readonly newlyRunnable: readonly WorkflowTaskInstance[];

  /** Whether the workflow run reached a terminal state. */
  readonly workflowTerminal: boolean;
}
