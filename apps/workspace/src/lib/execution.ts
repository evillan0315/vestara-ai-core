/**
 * Execution Center API client + types.
 *
 * Mirrors apps/api/src/routes/execution.ts DTOs.
 */

export interface PipelineStage {
  id: string;
  label: string;
  agents: string[];
}

export type QueueKind = 'session' | 'plan' | 'task' | 'execution';

export interface QueueEntry {
  id: string;
  kind: QueueKind;
  title: string;
  status: string;
  agentId?: string;
  project?: string;
  started?: string;
  updated?: string;
  priority?: string;
}

export interface QueueSummary {
  total: number;
  pending: number;
  running: number;
  blocked: number;
  waitingApproval: number;
  retrying: number;
  cancelled: number;
  completed: number;
  failed: number;
}

export interface PendingApproval {
  id: string;
  kind: 'collaboration' | 'session';
  title: string;
  status: string;
  requestedBy: string;
  createdAt: string;
  risk?: string;
  detail?: string;
}

export interface FsOperation {
  id: string;
  agent: string;
  operation: string;
  target: string;
  timestamp: string;
  status: string;
  detail: string;
}

export interface ExecutionEvent {
  id: string;
  timestamp: string;
  category: string;
  type: string;
  actor: string;
  message: string;
  status?: string;
}

export interface TraceNode {
  id: string;
  kind:
    | 'request'
    | 'project'
    | 'plan'
    | 'task'
    | 'execution'
    | 'agent'
    | 'capability'
    | 'artifact'
    | 'review'
    | 'verification';
  label: string;
  status?: string;
  meta?: string;
}

export interface TraceEdge {
  from: string;
  to: string;
  label?: string;
}

export interface TraceGraph {
  nodes: TraceNode[];
  edges: TraceEdge[];
}

export interface ExecutionMetrics {
  sessions: {
    total: number;
    running: number;
    queued: number;
    completed: number;
    failed: number;
    cancelled: number;
    successRate: number;
    avgDurationMs: number;
  };
  executions: {
    total: number;
    running: number;
    completed: number;
    failed: number;
    successRate: number;
    avgDurationMs: number;
  };
  plans: { total: number; approved: number; executing: number; completed: number; cancelled: number };
  tasks: { total: number; running: number; completed: number; blocked: number; pending: number };
  agents: { total: number; active: number; utilization: number };
  fsOps: number;
  artifacts: number;
  approvalsPending: number;
  queueLength: number;
}

export interface ExecutionSession {
  id: string;
  goal: string;
  workflowId?: string;
  assignedAgentIds: string[];
  planIds: string[];
  changeSetIds: string[];
  verificationIds: string[];
  logs: string[];
  timeline: Array<{ step: string; agentId: string; status: string; timestamp: string }>;
  approvals: Array<{ agentId: string; approved: boolean; reason?: string; timestamp: string }>;
  metrics: { duration: number; totalSteps: number; completedSteps: number; artifactCount: number };
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
}

export interface AgentExecution {
  id: string;
  agentId: string;
  task: string;
  inputArtifacts: string[];
  outputArtifacts: string[];
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  result?: string;
}

export interface AgentState {
  id: string;
  name: string;
  status: string;
  currentTask: string;
  currentOperation: string;
  activeFilePath?: string;
  progress: number;
  elapsedMs: number;
  phase: string;
  detail: string;
  updatedAt: string;
}

export interface ProjectWithStats {
  id: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  stats?: Record<string, unknown>;
}

export interface ExecutionDashboard {
  ts: number;
  projects: ProjectWithStats[];
  plans: Array<Record<string, unknown>>;
  changeSets: Array<Record<string, unknown>>;
  verifications: Array<Record<string, unknown>>;
  collaboration: Array<Record<string, unknown>>;
  sessions: ExecutionSession[];
  executions: AgentExecution[];
  agents: AgentState[];
  approvals: PendingApproval[];
  queue: QueueEntry[];
  queueSummary: QueueSummary;
  metrics: ExecutionMetrics;
  pipeline: PipelineStage[];
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const executionApi = {
  dashboard: () => fetchJSON<ExecutionDashboard>('/api/execution/dashboard'),

  queue: () => fetchJSON<{ entries: QueueEntry[]; summary: QueueSummary }>('/api/execution/queue'),

  timeline: (sessionId?: string) =>
    fetchJSON<{ pipeline: PipelineStage[]; session: ExecutionSession | null }>(
      `/api/execution/timeline${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`,
    ),

  traceability: (target?: string) =>
    fetchJSON<TraceGraph>(`/api/execution/traceability${target ? `?target=${encodeURIComponent(target)}` : ''}`),

  approvals: () => fetchJSON<{ approvals: PendingApproval[] }>('/api/execution/approvals'),

  filesystem: (limit = 200) =>
    fetchJSON<{ operations: FsOperation[]; total: number }>(`/api/execution/filesystem?limit=${limit}`),

  events: (opts?: { q?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set('q', opts.q);
    if (opts?.limit) params.set('limit', String(opts.limit ?? 200));
    return fetchJSON<{ events: ExecutionEvent[]; total: number }>(`/api/execution/events?${params.toString()}`);
  },

  analyze: async (snapshot: unknown, question?: string): Promise<{ answer?: string; error?: string } | null> => {
    try {
      const res = await fetch('/api/execution/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot, question }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        return { error: err.error || res.statusText };
      }
      return await res.json();
    } catch (err: any) {
      return { error: err.message };
    }
  },
};

// ─── Formatting helpers ───────────────────────────────────────

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

export function tone(status?: string): 'pass' | 'warn' | 'fail' | 'unknown' {
  const s = (status ?? '').toLowerCase();
  if (s.includes('fail') || s.includes('error') || s.includes('cancel') || s.includes('reject')) return 'fail';
  if (
    s.includes('warn') ||
    s.includes('block') ||
    s.includes('wait') ||
    s.includes('propos') ||
    s.includes('draft') ||
    s.includes('review')
  )
    return 'warn';
  if (s.includes('complete') || s.includes('pass') || s.includes('approved') || s.includes('ok')) return 'pass';
  if (s.includes('run') || s.includes('execut') || s.includes('progress') || s.includes('queued')) return 'pass';
  return 'unknown';
}
