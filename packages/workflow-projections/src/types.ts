/**
 * Canonical renderer-independent agent workflow model.
 *
 * The TUI and the Workspace UI both consume this projection so they always
 * agree on workflow state. It is derived deterministically from thread items
 * and engineering events — never from parsing model text.
 */

import type { TaskFileChange, VerificationProjection } from '@vestara/tui-protocol';

export type WorkflowStatus =
  | 'idle'
  | 'running'
  | 'awaiting-approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowStageId =
  | 'intent'
  | 'context'
  | 'investigation'
  | 'planning'
  | 'execution'
  | 'verification'
  | 'review'
  | 'complete';

export type WorkflowStageStatus = 'pending' | 'active' | 'completed' | 'blocked' | 'failed' | 'skipped';

export const WORKFLOW_STAGES: readonly WorkflowStageId[] = [
  'intent',
  'context',
  'investigation',
  'planning',
  'execution',
  'verification',
  'review',
  'complete',
];

export interface WorkflowStageProjection {
  readonly id: WorkflowStageId;
  readonly label: string;
  readonly status: WorkflowStageStatus;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly agentId?: string;
  readonly activeOperation?: string;
  readonly tools: readonly string[];
  readonly files: readonly string[];
  readonly evidenceCount: number;
  readonly verification?: { readonly status: string; readonly confidence?: number };
  readonly blockingReason?: string;
  readonly childSteps: readonly string[];
}

export interface WorkflowAgentProjection {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly activeStageId?: WorkflowStageId;
  readonly activeTool?: string;
  readonly task?: string;
  readonly filesChanged: number;
  readonly worktree?: string;
  readonly blockedDependency?: string;
}

export interface WorkflowApprovalProjection {
  readonly id: string;
  readonly tool: string;
  readonly risk: string;
  readonly reason: string;
  readonly resources: readonly string[];
  readonly status: 'pending' | 'approved' | 'denied';
}

export interface ChangeProjection {
  readonly files: readonly TaskFileChange[];
  readonly summary: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface WorkflowMetrics {
  readonly elapsedMs: number;
  readonly stagesCompleted: number;
  readonly toolsInvoked: number;
  readonly filesChanged: number;
  readonly additions: number;
  readonly deletions: number;
  readonly evidenceCount: number;
  readonly tokens?: { readonly prompt: number; readonly completion: number; readonly total: number };
}

export interface AgentWorkflowProjection {
  readonly workflowId: string;
  readonly threadId: string;
  readonly runId: string;
  readonly status: WorkflowStatus;
  readonly currentStageId?: WorkflowStageId;
  readonly stages: readonly WorkflowStageProjection[];
  readonly agents: readonly WorkflowAgentProjection[];
  readonly approvals: readonly WorkflowApprovalProjection[];
  readonly changes: ChangeProjection;
  readonly verification?: VerificationProjection;
  readonly metrics: WorkflowMetrics;
}

// ─── Incremental event protocol ───────────────────────────────

export type WorkflowEvent =
  | { readonly type: 'snapshot'; readonly projection: AgentWorkflowProjection }
  | { readonly type: 'stage.started'; readonly stageId: WorkflowStageId; readonly stage: WorkflowStageProjection }
  | { readonly type: 'stage.updated'; readonly stageId: WorkflowStageId; readonly stage: WorkflowStageProjection }
  | { readonly type: 'stage.completed'; readonly stageId: WorkflowStageId; readonly stage: WorkflowStageProjection }
  | { readonly type: 'agent.updated'; readonly agent: WorkflowAgentProjection }
  | { readonly type: 'tool.started'; readonly tool: string }
  | { readonly type: 'tool.completed'; readonly tool: string }
  | { readonly type: 'change.updated'; readonly changes: ChangeProjection }
  | { readonly type: 'approval.requested'; readonly approval: WorkflowApprovalProjection }
  | { readonly type: 'approval.resolved'; readonly approval: WorkflowApprovalProjection }
  | { readonly type: 'verification.updated'; readonly verification: VerificationProjection }
  | { readonly type: 'completed'; readonly projection: AgentWorkflowProjection };

export interface WorkflowEventEnvelope<TEvent extends WorkflowEvent = WorkflowEvent> {
  readonly sequence: number;
  readonly workflowId: string;
  readonly threadId: string;
  readonly runId: string;
  readonly timestamp: string;
  readonly event: TEvent;
}
