/**
 * Execution Center projections — pure functions that turn source records into
 * the Execution Center DTOs (queue, metrics, approvals, filesystem ops).
 *
 * These are ports of the aggregation previously inline in
 * apps/api/src/routes/execution.ts, moved into the package so they are
 * testable and reusable without an API context.
 */

import type {
  AgentExecutionRecord,
  AgentStateRecord,
  ChangeSetRecord,
  CollaborationRecord,
  ExecutionMetrics,
  ExecutionSessionRecord,
  PlanRecord,
  QueueEntry,
  QueueSummary,
  TelemetryEventRecord,
  VerificationRecord,
} from './types';

// ─── Queue ────────────────────────────────────────────────────

export function queueSummary(entries: readonly QueueEntry[]): QueueSummary {
  const summary: QueueSummary = {
    total: entries.length,
    pending: 0,
    running: 0,
    blocked: 0,
    waitingApproval: 0,
    retrying: 0,
    cancelled: 0,
    completed: 0,
    failed: 0,
  };
  for (const e of entries) {
    const s = e.status.toLowerCase();
    if (s.includes('fail')) summary.failed += 1;
    else if (s.includes('cancel')) summary.cancelled += 1;
    else if (s.includes('block')) summary.blocked += 1;
    else if (s.includes('approv') || s === 'draft' || s === 'proposed') summary.waitingApproval += 1;
    else if (s.includes('retry')) summary.retrying += 1;
    else if (s.includes('run') || s.includes('progress') || s.includes('execut')) summary.running += 1;
    else if (s.includes('complete')) summary.completed += 1;
    else summary.pending += 1;
  }
  return summary;
}

export interface QueueSource {
  sessions: readonly ExecutionSessionRecord[];
  plans: readonly PlanRecord[];
  executions: readonly AgentExecutionRecord[];
}

export function buildQueue(source: QueueSource): QueueEntry[] {
  const out: QueueEntry[] = [];
  for (const s of source.sessions) {
    out.push({
      id: s.id,
      kind: 'session',
      title: s.goal || s.id,
      status: s.status,
      started: s.createdAt,
      updated: s.completedAt ?? s.createdAt,
      priority: 'normal',
    });
  }
  for (const p of source.plans) {
    out.push({
      id: p.id,
      kind: 'plan',
      title: p.title || p.goal || p.id,
      status: p.status ?? 'unknown',
      started: p.createdAt,
      updated: p.updatedAt ?? p.createdAt,
      priority: 'normal',
    });
    for (const t of p.tasks ?? []) {
      out.push({
        id: `${p.id}:${t.id}`,
        kind: 'task',
        title: t.summary || t.id,
        status: t.status ?? 'unknown',
        started: p.createdAt,
        updated: p.updatedAt ?? p.createdAt,
        priority: t.effort,
      });
    }
  }
  for (const e of source.executions) {
    out.push({
      id: e.id,
      kind: 'execution',
      title: e.task || e.id,
      status: e.status ?? 'unknown',
      agentId: e.agentId,
      started: e.startedAt,
      updated: e.completedAt ?? e.startedAt,
      priority: 'normal',
    });
  }
  out.sort((a, b) => (a.updated && b.updated ? (a.updated < b.updated ? 1 : -1) : 0));
  return out;
}

// ─── Metrics ──────────────────────────────────────────────────

export interface MetricsSource {
  plans: readonly PlanRecord[];
  changeSets: readonly ChangeSetRecord[];
  verifications: readonly VerificationRecord[];
  collab: readonly CollaborationRecord[];
  sessions: readonly ExecutionSessionRecord[];
  executions: readonly AgentExecutionRecord[];
}

export function countFsOps(events: readonly TelemetryEventRecord[]): number {
  return events.filter((e) => e.operation?.startsWith('file.') || e.operation?.startsWith('search')).length;
}

export function countPendingApprovals(source: MetricsSource): number {
  return source.collab.filter((r) => r.status === 'submitted' || r.status === 'reviewing' || r.status === 'draft')
    .length;
}

export function computeMetrics(
  source: MetricsSource,
  agents: readonly AgentStateRecord[],
  telemetryEvents: readonly TelemetryEventRecord[],
): ExecutionMetrics {
  const sessions = source.sessions;
  const executions = source.executions;
  const plans = source.plans;

  const sessionDone = sessions.filter((s) => s.status === 'completed' || s.status === 'failed');
  const sessionSuccess = sessionDone.filter((s) => s.status === 'completed').length;
  const sessionDurations = sessions
    .map((s) => {
      if (!s.createdAt || !s.completedAt) return Number.NaN;
      const start = new Date(s.createdAt).getTime();
      const end = new Date(s.completedAt).getTime();
      return end - start;
    })
    .filter((d) => Number.isFinite(d) && d > 0);

  const execDone = executions.filter((e) => e.status === 'completed' || e.status === 'failed');
  const execSuccess = execDone.filter((e) => e.status === 'completed').length;
  const execDurations = executions
    .map((e) => {
      const start = new Date(e.startedAt ?? '').getTime();
      const end = e.completedAt ? new Date(e.completedAt).getTime() : Date.now();
      return end - start;
    })
    .filter((d) => Number.isFinite(d));

  const taskStates = plans.flatMap((p) => (p.tasks ?? []).map((t) => t.status ?? ''));

  const activeAgents = agents.filter((a) => a.status && a.status !== 'idle' && a.status !== 'completed').length;
  const queueLen =
    sessions.filter((s) => s.status === 'queued' || s.status === 'running').length +
    taskStates.filter((s) => s === 'pending' || s === 'in-progress').length;

  return {
    sessions: {
      total: sessions.length,
      running: sessions.filter((s) => s.status === 'running').length,
      queued: sessions.filter((s) => s.status === 'queued').length,
      completed: sessions.filter((s) => s.status === 'completed').length,
      failed: sessions.filter((s) => s.status === 'failed').length,
      cancelled: sessions.filter((s) => s.status === 'cancelled').length,
      successRate: sessionDone.length > 0 ? Math.round((sessionSuccess / sessionDone.length) * 100) : 0,
      avgDurationMs:
        sessionDurations.length > 0
          ? Math.round(sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length)
          : 0,
    },
    executions: {
      total: executions.length,
      running: executions.filter((e) => e.status === 'running').length,
      completed: executions.filter((e) => e.status === 'completed').length,
      failed: executions.filter((e) => e.status === 'failed').length,
      successRate: execDone.length > 0 ? Math.round((execSuccess / execDone.length) * 100) : 0,
      avgDurationMs:
        execDurations.length > 0 ? Math.round(execDurations.reduce((a, b) => a + b, 0) / execDurations.length) : 0,
    },
    plans: {
      total: plans.length,
      approved: plans.filter((p) => p.status === 'approved').length,
      executing: plans.filter((p) => p.status === 'executing').length,
      completed: plans.filter((p) => p.status === 'completed').length,
      cancelled: plans.filter((p) => p.status === 'cancelled').length,
    },
    tasks: {
      total: taskStates.length,
      running: taskStates.filter((s) => s === 'in-progress').length,
      completed: taskStates.filter((s) => s === 'completed').length,
      blocked: taskStates.filter((s) => s === 'blocked').length,
      pending: taskStates.filter((s) => s === 'pending').length,
    },
    agents: {
      total: agents.length,
      active: activeAgents,
      utilization: agents.length > 0 ? Math.round((activeAgents / agents.length) * 100) : 0,
    },
    fsOps: countFsOps(telemetryEvents),
    artifacts: source.changeSets.length + source.verifications.length + source.collab.length,
    approvalsPending: countPendingApprovals(source),
    queueLength: queueLen,
  };
}
