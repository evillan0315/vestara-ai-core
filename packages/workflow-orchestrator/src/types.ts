/**
 * Domain types for multi-agent workflow orchestration.
 *
 * The orchestrator owns project/plan/task state machines and persists workflow
 * state through sql.js stores; agents are pluggable specialists reached through
 * a TaskDispatcher. Every transition is also appended as an OrchestrationEvent
 * so the workflow is replayable and auditable.
 *
 * Architecture Traceability:
 *   ADR-004 (implementation) / ADR-118 (blueprint)
 *   PCS-025 — Multi-Agent Project Management (§4, §5, §6, §7, §9)
 */

// ─── Project lifecycle (PCS-025 §6, §7.1) ─────────────────────

export const PROJECT_PHASES = [
  'draft',
  'analyzing',
  'planning',
  'architecture',
  'pending-approval',
  'executing',
  'testing',
  'verifying',
  'completed',
  'archived',
  'cancelled',
] as const;

export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export interface OrchestratedProject {
  readonly id: string;
  readonly name: string;
  readonly goal: string;
  readonly repoPath: string;
  readonly phase: ProjectPhase;
  readonly workspaceId: string;
  readonly cancelReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── Plan lifecycle (PCS-025 §7.2) ────────────────────────────

export type PlanStatus =
  | 'draft'
  | 'proposed'
  | 'reviewed'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'cancelled'
  | 'needs-revision';

export interface WorkflowPlan {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly goal: string;
  readonly revision: number;
  readonly status: PlanStatus;
  readonly approvalId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── Task lifecycle (PCS-025 §5) ──────────────────────────────

export const TASK_STATUSES = [
  'pending',
  'ready',
  'assigned',
  'in-progress',
  'needs-review',
  'reviewing',
  'changes-requested',
  'testing',
  'approved',
  'retrying',
  'blocked',
  'failed',
  'cancelled',
  'completed',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type TaskEffort = 'small' | 'medium' | 'large';

/** Orchestrated task — extends the workspace Task model with workflow fields. */
export interface WorkflowTask {
  readonly id: string;
  readonly planId: string;
  readonly summary: string;
  readonly description: string;
  readonly files: readonly string[];
  readonly dependencies: readonly string[];
  readonly status: TaskStatus;
  readonly effort: TaskEffort;
  readonly requiredCapabilities: readonly string[];
  readonly assignedAgentId?: string;
  readonly revisionCount: number;
  readonly attemptCount: number;
  readonly lastError?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ─── Artifacts (PCS-025 §10) ──────────────────────────────────

export const ARTIFACT_KINDS = [
  'analysis',
  'plan',
  'architecture',
  'changeset',
  'review',
  'test',
  'verification',
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export interface WorkflowArtifact {
  readonly id: string;
  readonly kind: ArtifactKind;
  readonly projectId: string;
  readonly planId?: string;
  readonly taskId?: string;
  readonly agentId: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly version: number;
  readonly createdAt: string;
}

// ─── File locks (PCS-025 §12) ─────────────────────────────────

export interface FileLock {
  readonly path: string;
  readonly holderAgentId: string;
  readonly taskId: string;
  readonly acquiredAt: string;
  readonly releasedAt?: string;
}

// ─── Orchestration events (PCS-025 §8) ────────────────────────

export type OrchestrationEvent =
  | {
      readonly type: 'project.created';
      readonly projectId: string;
      readonly name: string;
      readonly goal: string;
      readonly at: string;
    }
  | {
      readonly type: 'project.phase.changed';
      readonly projectId: string;
      readonly from: ProjectPhase;
      readonly to: ProjectPhase;
      readonly at: string;
    }
  | { readonly type: 'project.cancelled'; readonly projectId: string; readonly reason: string; readonly at: string }
  | { readonly type: 'project.completed'; readonly projectId: string; readonly at: string }
  | {
      readonly type: 'analysis.completed';
      readonly projectId: string;
      readonly artifactId: string;
      readonly agentId: string;
      readonly at: string;
    }
  | {
      readonly type: 'plan.generated';
      readonly projectId: string;
      readonly planId: string;
      readonly revision: number;
      readonly at: string;
    }
  | {
      readonly type: 'architecture.reviewed';
      readonly projectId: string;
      readonly planId: string;
      readonly status: 'approved' | 'violations';
      readonly at: string;
    }
  | { readonly type: 'plan.approved'; readonly projectId: string; readonly planId: string; readonly at: string }
  | {
      readonly type:
        | 'task.created'
        | 'task.ready'
        | 'task.assigned'
        | 'task.started'
        | 'task.completed'
        | 'task.failed'
        | 'task.blocked'
        | 'task.retrying'
        | 'task.revision'
        | 'task.cancelled';
      readonly projectId: string;
      readonly planId: string;
      readonly taskId: string;
      readonly at: string;
    }
  | {
      readonly type: 'file.lock.acquired' | 'file.lock.released' | 'file.lock.conflict';
      readonly projectId: string;
      readonly path: string;
      readonly taskId: string;
      readonly holderAgentId?: string;
      readonly at: string;
    }
  | {
      readonly type: 'verification.passed' | 'verification.failed';
      readonly projectId: string;
      readonly planId: string;
      readonly reportId: string;
      readonly at: string;
    }
  | { readonly type: 'workflow.checkpoint'; readonly projectId: string; readonly at: string };

export interface OrchestrationEventSink {
  append(event: OrchestrationEvent): Promise<void> | void;
}

// ─── Execution boundary ───────────────────────────────────────

export interface TaskDispatchResult {
  readonly status: 'completed' | 'failed';
  readonly agentId?: string;
  readonly output?: string;
  readonly error?: string;
  /** Proposed change artifacts produced by the task run (Phase 1: recorded only). */
  readonly artifacts?: readonly Readonly<Record<string, unknown>>[];
}

/** The orchestrator never executes agents itself; a dispatcher runs each task. */
export interface TaskDispatcher {
  dispatch(task: WorkflowTask, project: OrchestratedProject): Promise<TaskDispatchResult>;
}

// ─── Snapshots ────────────────────────────────────────────────

export interface ProjectSnapshot {
  readonly project: OrchestratedProject;
  readonly plan?: WorkflowPlan;
  readonly tasks: readonly WorkflowTask[];
  readonly artifacts: readonly WorkflowArtifact[];
  readonly locks: readonly FileLock[];
  readonly phase: ProjectPhase;
  readonly status: 'running' | 'awaiting-approval' | 'completed' | 'cancelled' | 'archived';
}

export function deriveProjectStatus(phase: ProjectPhase): ProjectSnapshot['status'] {
  switch (phase) {
    case 'pending-approval':
      return 'awaiting-approval';
    case 'completed':
      return 'completed';
    case 'archived':
      return 'archived';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'running';
  }
}
