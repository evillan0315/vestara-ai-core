/**
 * Workflow API client + types.
 *
 * Mirrors apps/api/src/routes/workflow.ts and @vestara/workflow-projections.
 * The canonical eight-stage workflow projection is shared by the TUI and the
 * Workspace UI so they always agree on workflow state.
 */

export type WorkflowStageStatus = 'pending' | 'active' | 'completed' | 'blocked' | 'failed' | 'skipped';

export interface WorkflowStage {
  id: string;
  label: string;
  status: WorkflowStageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  agentId?: string;
  activeOperation?: string;
  tools: string[];
  files: string[];
  evidenceCount: number;
  verification?: { status: string; confidence?: number };
  blockingReason?: string;
  childSteps: string[];
}

export interface WorkflowAgent {
  id: string;
  name: string;
  status: string;
  activeStageId?: string;
  activeTool?: string;
  filesChanged: number;
}

export interface WorkflowApproval {
  id: string;
  tool: string;
  risk: string;
  reason: string;
  resources: string[];
  status: 'pending' | 'approved' | 'denied';
}

export interface WorkflowChange {
  path: string;
  operation: string;
  additions: number;
  deletions: number;
}

export interface WorkflowProjection {
  workflowId: string;
  threadId: string;
  runId: string;
  status: string;
  currentStageId?: string;
  stages: WorkflowStage[];
  agents: WorkflowAgent[];
  approvals: WorkflowApproval[];
  changes: { files: WorkflowChange[]; summary: string; additions: number; deletions: number };
  verification?: { status: string; confidence?: number };
  metrics: {
    elapsedMs: number;
    stagesCompleted: number;
    toolsInvoked: number;
    filesChanged: number;
    additions: number;
    deletions: number;
  };
}

export interface WorkflowEnvelope {
  sequence: number;
  workflowId: string;
  threadId: string;
  runId: string;
  timestamp: string;
  event: { type: string } & Record<string, unknown>;
}

async function fetchJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const workflowApi = {
  workflow: (threadId: string) =>
    fetchJSON<{ projection: WorkflowProjection }>(`/api/workflow/${encodeURIComponent(threadId)}`),

  events: (threadId: string, after = 0) =>
    fetchJSON<{ envelopes: WorkflowEnvelope[] }>(
      `/api/workflow/${encodeURIComponent(threadId)}/events?after=${after}`,
    ),
};

export function threadIdFromWorkflow(workflow: WorkflowProjection): string {
  return workflow.threadId;
}
