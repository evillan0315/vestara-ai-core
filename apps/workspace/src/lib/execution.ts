/**
 * Execution Center API client + helpers.
 *
 * DTOs are owned by @vestara/execution-center (single source of truth) and
 * re-exported here; only the API surface and formatting helpers are local.
 */

import type {
  AgentExecution,
  AgentState,
  ExecutionDashboard,
  ExecutionEvent,
  ExecutionMetrics,
  ExecutionSession,
  FsOperation,
  PendingApproval,
  PipelineStage,
  ProjectWithStats,
  QueueEntry,
  QueueKind,
  QueueSummary,
  TraceEdge,
  TraceGraph,
  TraceNode,
} from '@vestara/execution-center';

export type {
  AgentExecution,
  AgentState,
  ExecutionDashboard,
  ExecutionEvent,
  ExecutionMetrics,
  ExecutionSession,
  FsOperation,
  PendingApproval,
  PipelineStage,
  ProjectWithStats,
  QueueEntry,
  QueueKind,
  QueueSummary,
  TraceEdge,
  TraceGraph,
  TraceNode,
} from '@vestara/execution-center';

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

  start: async (goal: string, workflow: string): Promise<{ id?: string } | null> => {
    try {
      const res = await fetch('/api/sessions/executions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, workflow }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { session?: { id?: string } };
      return data.session ?? null;
    } catch {
      return null;
    }
  },

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
