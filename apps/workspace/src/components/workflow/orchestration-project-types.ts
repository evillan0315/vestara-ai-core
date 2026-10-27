/**
 * Orchestration project types — shared shape for the projects rail.
 *
 * Extracted from OrchestrationPage so rail sub-components (ProjectList,
 * NextLane, approval actions) and the page share one definition instead of
 * structural duplicates. No runtime, no fetching — types only.
 */

export interface OrchestrationProjectSummary {
  id: string;
  name: string;
  goal: string;
  phase: string;
  status: string;
  createdAt: string;
}

export interface OrchestrationProjectMetrics {
  projectId: string;
  status: string;
  tasks: { total: number; completed: number; failed: number; blocked: number; awaitingApproval: number; running: number };
  retries: number;
  revisions: number;
  artifacts: number;
  elapsedMs: number;
}

export interface OrchestrationApprovalTask {
  id: string;
  summary: string;
  approvalReason?: string;
  files: string[];
  /** Pending-since timestamp (full WorkflowTask payload carries it; used for why-now age). */
  updatedAt?: string;
  createdAt?: string;
  requestedAt?: string;
}
