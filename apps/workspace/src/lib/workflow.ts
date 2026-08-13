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
  verification?: { status: string; confidence?: number; retryCount?: number };
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

export interface WorkflowSwimlaneSegment {
  stageId: string;
  status: WorkflowStageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  tools: string[];
  files: string[];
  evidenceCount: number;
}

export interface WorkflowSwimlane {
  agentId: string;
  agentName: string;
  segments: WorkflowSwimlaneSegment[];
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

export type WorkflowOutcome = 'succeeded' | 'failed' | 'cancelled' | 'aborted';

export interface WorkflowProjection {
  workflowId: string;
  threadId: string;
  runId: string;
  status: string;
  outcome: WorkflowOutcome;
  currentStageId?: string;
  stages: WorkflowStage[];
  agents: WorkflowAgent[];
  swimlanes: WorkflowSwimlane[];
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

async function postJSON<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface WorkflowStartResult {
  workflowId: string;
  goal: string;
  stages: Array<{ role: string; agentId: string; threadId: string }>;
}

export type MultiAgentWorkflowTemplateId =
  | 'default'
  | 'agent-control-restructure'
  | 'activity-room-premium-redesign';

export const workflowApi = {
  workflow: (threadId: string) =>
    fetchJSON<{ projection: WorkflowProjection }>(`/api/workflow/${encodeURIComponent(threadId)}`),

  at: (threadId: string, sequence: number) =>
    fetchJSON<{ projection: WorkflowProjection; maxSequence: number; sequence: number }>(
      `/api/workflow/${encodeURIComponent(threadId)}/at?seq=${sequence}`,
    ),

  events: (threadId: string, after = 0) =>
    fetchJSON<{ envelopes: WorkflowEnvelope[] }>(
      `/api/workflow/${encodeURIComponent(threadId)}/events?after=${after}`,
    ),

  start: (goal: string, agentIds?: Record<string, string>, workflow?: MultiAgentWorkflowTemplateId) =>
    postJSON<WorkflowStartResult>('/api/workflows', { goal, agentIds, workflow }),
};

export function threadIdFromWorkflow(workflow: WorkflowProjection): string {
  return workflow.threadId;
}
