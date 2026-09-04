/**
 * Execution Center routes.
 *
 * Aggregates every execution-relevant service into one command-and-control
 * API for the Workspace:
 *   GET  /api/execution/dashboard       composed execution snapshot
 *   GET  /api/execution/queue           unified execution queue
 *   GET  /api/execution/timeline        orchestration pipeline (+ per session)
 *   GET  /api/execution/agents          agent states + executions + metrics
 *   GET  /api/execution/artifacts       artifact browser
 *   GET  /api/execution/approvals       pending approvals
 *   GET  /api/execution/filesystem      filesystem capability operations
 *   GET  /api/execution/events          merged event stream
 *   GET  /api/execution/metrics         aggregated metrics
 *   GET  /api/execution/traceability    dependency / traceability graph
 *   POST /api/execution/analyze         AI analysis of execution state
 */

import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

// ─── DTOs ─────────────────────────────────────────────────────

export interface PipelineStage {
  id: string;
  label: string;
  agents: string[];
}

/** Fixed orchestration pipeline (the Vestara multi-agent flow). */
export const EXECUTION_PIPELINE: PipelineStage[] = [
  { id: 'conversation', label: 'Conversation', agents: ['conversation'] },
  { id: 'repository-analysis', label: 'Repository Analysis', agents: ['repository-analyst', 'context'] },
  { id: 'understanding', label: 'Understanding', agents: ['understanding'] },
  { id: 'planner', label: 'Planner', agents: ['planner', 'planning-agent'] },
  { id: 'architect', label: 'Architect', agents: ['architect'] },
  { id: 'approval', label: 'Approval', agents: ['human'] },
  { id: 'developer', label: 'Developer', agents: ['developer', 'implementation-agent'] },
  { id: 'reviewer', label: 'Reviewer', agents: ['reviewer'] },
  { id: 'tester', label: 'Tester', agents: ['tester', 'testing'] },
  { id: 'verifier', label: 'Verifier', agents: ['verifier'] },
  { id: 'learning', label: 'Learning', agents: ['learning', 'memory'] },
  { id: 'completed', label: 'Completed', agents: [] },
];

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

// ─── Aggregation ──────────────────────────────────────────────

async function collectBase(ctx: WorkspaceContext) {
  const fingerprintId = ctx.runtime.getSession().fingerprint.id;
  const [plans, changeSets, verifications, collab, sessions, executions, projects] = await Promise.all([
    ctx.plans.list(fingerprintId).catch(() => [] as any[]),
    ctx.changeSets.listByWorkspace(fingerprintId).catch(() => [] as any[]),
    ctx.verifications.listByWorkspace(fingerprintId).catch(() => [] as any[]),
    ctx.collaboration.listByWorkspace(fingerprintId).catch(() => [] as any[]),
    ctx.agents.listExecutionSessions().catch(() => [] as any[]),
    ctx.agents.listExecutions().catch(() => [] as any[]),
    ctx.projects?.listProjects().catch(() => []) ?? [],
  ]);
  return { plans, changeSets, verifications, collab, sessions, executions, projects };
}

export function queueSummary(entries: QueueEntry[]): QueueSummary {
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

export function buildQueue(entries: { sessions: any[]; plans: any[]; executions: any[] }): QueueEntry[] {
  const out: QueueEntry[] = [];
  for (const s of entries.sessions) {
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
  for (const p of entries.plans) {
    out.push({
      id: p.id,
      kind: 'plan',
      title: p.title || p.goal,
      status: p.status,
      started: p.createdAt,
      updated: p.updatedAt,
      priority: 'normal',
    });
    for (const t of p.tasks ?? []) {
      out.push({
        id: `${p.id}:${t.id}`,
        kind: 'task',
        title: t.summary || t.id,
        status: t.status,
        started: p.createdAt,
        updated: p.updatedAt,
        priority: t.effort,
      });
    }
  }
  for (const e of entries.executions) {
    out.push({
      id: e.id,
      kind: 'execution',
      title: e.task || e.id,
      status: e.status,
      agentId: e.agentId,
      started: e.startedAt,
      updated: e.completedAt ?? e.startedAt,
      priority: 'normal',
    });
  }
  out.sort((a, b) => (a.updated && b.updated ? (a.updated < b.updated ? 1 : -1) : 0));
  return out;
}

export function computeMetrics(
  base: Awaited<ReturnType<typeof collectBase>>,
  agents: any[],
  telemetryEvents: any[],
): ExecutionMetrics {
  const sessions = base.sessions as any[];
  const executions = base.executions as any[];
  const plans = base.plans as any[];

  const sessionDone = sessions.filter((s) => s.status === 'completed' || s.status === 'failed');
  const sessionSuccess = sessionDone.filter((s) => s.status === 'completed').length;
  const sessionDurations = sessions
    .filter((s) => s.completedAt)
    .map((s) => {
      const start = new Date(s.createdAt).getTime();
      const end = new Date(s.completedAt).getTime();
      return end - start;
    })
    .filter((d) => Number.isFinite(d) && d > 0);

  const execDone = executions.filter((e) => e.status === 'completed' || e.status === 'failed');
  const execSuccess = execDone.filter((e) => e.status === 'completed').length;
  const execDurations = executions
    .map((e) => {
      const start = new Date(e.startedAt).getTime();
      const end = e.completedAt ? new Date(e.completedAt).getTime() : Date.now();
      return end - start;
    })
    .filter((d) => Number.isFinite(d));

  const taskStates = plans.flatMap((p) => (p.tasks ?? []).map((t: any) => t.status));

  const activeAgents = agents.filter((a) => a.status && a.status !== 'idle' && a.status !== 'completed').length;
  const queueLen =
    sessions.filter((s) => s.status === 'queued' || s.status === 'running').length +
    taskStates.filter((s: string) => s === 'pending' || s === 'in-progress').length;

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
      running: taskStates.filter((s: string) => s === 'in-progress').length,
      completed: taskStates.filter((s: string) => s === 'completed').length,
      blocked: taskStates.filter((s: string) => s === 'blocked').length,
      pending: taskStates.filter((s: string) => s === 'pending').length,
    },
    agents: {
      total: agents.length,
      active: activeAgents,
      utilization: agents.length > 0 ? Math.round((activeAgents / agents.length) * 100) : 0,
    },
    fsOps: countFsOps(telemetryEvents),
    artifacts: base.changeSets.length + base.verifications.length + base.collab.length,
    approvalsPending: countPendingApprovals(base),
    queueLength: queueLen,
  };
}

function ctxTelemetryEvents(ctx: WorkspaceContext): any[] {
  return ctx.telemetry.getEvents(500);
}

function countFsOps(events: any[]): number {
  return events.filter((e) => e.operation?.startsWith('file.') || e.operation?.startsWith('search')).length;
}

function countPendingApprovals(base: Awaited<ReturnType<typeof collectBase>>): number {
  const pending = (base.collab as any[]).filter(
    (r) => r.status === 'submitted' || r.status === 'reviewing' || r.status === 'draft',
  );
  return pending.length;
}

async function collectApprovals(ctx: WorkspaceContext): Promise<PendingApproval[]> {
  const fingerprintId = ctx.runtime.getSession().fingerprint.id;
  const collab = await ctx.collaboration.listByWorkspace(fingerprintId).catch(() => [] as any[]);
  const out: PendingApproval[] = [];
  for (const r of collab) {
    if (r.status === 'submitted' || r.status === 'reviewing' || r.status === 'draft') {
      out.push({
        id: r.id,
        kind: 'collaboration',
        title: `Review: ${r.changeSetId}`,
        status: r.status,
        requestedBy: r.ownership?.owner?.name ?? 'agent',
        createdAt: r.createdAt,
        detail: r.planId,
      });
    }
  }
  const sessions = await ctx.agents.listExecutionSessions().catch(() => [] as any[]);
  for (const s of sessions) {
    for (const a of s.approvals ?? []) {
      if (a.approved === false || a.status === 'pending') {
        out.push({
          id: `${s.id}:${a.agentId}`,
          kind: 'session',
          title: `Approval from ${a.agentId} for ${s.goal}`,
          status: 'pending',
          requestedBy: a.agentId,
          createdAt: a.timestamp ?? s.createdAt,
        });
      }
    }
  }
  return out;
}

function collectFsOps(ctx: WorkspaceContext): FsOperation[] {
  const events = ctxTelemetryEvents(ctx);
  const out: FsOperation[] = [];
  for (const e of events) {
    const op = e.operation ?? '';
    if (!op.startsWith('file.') && op !== 'search' && op !== 'list') continue;
    out.push({
      id: `${e.timestamp}-${e.agent}-${out.length}`,
      agent: e.agent,
      operation: op,
      target: e.filePath ?? e.task ?? '',
      timestamp: e.timestamp,
      status: e.status ?? 'unknown',
      detail: e.detail ?? e.task ?? '',
    });
  }
  return out;
}

async function collectEvents(ctx: WorkspaceContext, limit: number): Promise<ExecutionEvent[]> {
  const out: ExecutionEvent[] = [];
  const tel = ctx.telemetry.getEvents(limit);
  for (const e of tel) {
    out.push({
      id: `tel-${e.timestamp}-${e.agent}-${out.length}`,
      timestamp: e.timestamp,
      category: 'agent',
      type: `${e.status}.${e.operation}`,
      actor: e.agent,
      message: e.task || e.detail || `${e.agent} ${e.operation}`,
      status: e.status,
    });
  }
  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, limit);
}

function fileChangePath(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { path?: unknown }).path === 'string')
    return (value as { path: string }).path;
  return String(value);
}

async function buildTraceability(ctx: WorkspaceContext, target?: string): Promise<TraceGraph> {
  const base = await collectBase(ctx);
  const nodes: TraceNode[] = [];
  const edges: TraceEdge[] = [];
  const addNode = (n: TraceNode) => {
    if (!nodes.some((x) => x.id === n.id)) nodes.push(n);
  };

  // User request root
  addNode({ id: 'request', kind: 'request', label: 'User Request', status: 'completed' });

  for (const project of base.projects as any[]) {
    addNode({ id: `project:${project.id}`, kind: 'project', label: project.name, status: project.status });
    edges.push({ from: 'request', to: `project:${project.id}`, label: 'spawns' });
  }

  for (const plan of base.plans as any[]) {
    addNode({
      id: `plan:${plan.id}`,
      kind: 'plan',
      label: plan.title || plan.goal,
      status: plan.status,
      meta: plan.id,
    });
    edges.push({ from: 'request', to: `plan:${plan.id}`, label: 'derived from' });
    for (const t of plan.tasks ?? []) {
      addNode({ id: `task:${plan.id}:${t.id}`, kind: 'task', label: t.summary || t.id, status: t.status });
      edges.push({ from: `plan:${plan.id}`, to: `task:${plan.id}:${t.id}`, label: 'contains' });
      for (const dep of t.dependencies ?? []) {
        addNode({ id: `task:${plan.id}:${dep}`, kind: 'task', label: dep, status: 'pending' });
        edges.push({ from: `task:${plan.id}:${dep}`, to: `task:${plan.id}:${t.id}`, label: 'depends on' });
      }
    }
  }

  for (const ex of base.executions as any[]) {
    addNode({ id: `exec:${ex.id}`, kind: 'execution', label: ex.task || ex.id, status: ex.status, meta: ex.agentId });
    edges.push({ from: 'request', to: `exec:${ex.id}`, label: 'runs' });
    addNode({ id: `agent:${ex.agentId}`, kind: 'agent', label: ex.agentId, status: 'working' });
    edges.push({ from: `exec:${ex.id}`, to: `agent:${ex.agentId}`, label: 'assigned to' });
  }

  // Capability layer from telemetry (bounded, most recent per agent).
  const seenAgents = new Set<string>();
  for (const e of ctxTelemetryEvents(ctx)) {
    if (seenAgents.has(e.agent)) continue;
    seenAgents.add(e.agent);
    const op = e.operation ?? 'unknown';
    addNode({
      id: `cap:${e.agent}:${op}`,
      kind: 'capability',
      label: `${e.agent} · ${op}`,
      status: e.status,
      meta: e.filePath,
    });
    edges.push({ from: `agent:${e.agent}`, to: `cap:${e.agent}:${op}`, label: 'invokes' });
  }

  for (const cs of base.changeSets as any[]) {
    addNode({
      id: `artifact:${cs.id}`,
      kind: 'artifact',
      label: `ChangeSet ${cs.id}`,
      status: cs.status,
      meta: cs.planId,
    });
    if (cs.planId) edges.push({ from: `plan:${cs.planId}`, to: `artifact:${cs.id}`, label: 'produces' });
    for (const rawFile of cs.files ?? []) {
      const file = fileChangePath(rawFile);
      addNode({ id: `file:${cs.id}:${file}`, kind: 'artifact', label: file, status: 'changed' });
      edges.push({ from: `artifact:${cs.id}`, to: `file:${cs.id}:${file}`, label: 'touches' });
    }
  }

  for (const v of base.verifications as any[]) {
    addNode({
      id: `verification:${v.id}`,
      kind: 'verification',
      label: `Verification ${v.id}`,
      status: v.status,
      meta: v.changeSetId,
    });
    if (v.changeSetId)
      edges.push({ from: `artifact:${v.changeSetId}`, to: `verification:${v.id}`, label: 'verified by' });
    for (const c of v.checks ?? []) {
      addNode({
        id: `check:${v.id}:${c.type}`,
        kind: 'verification',
        label: `${c.type} · ${c.status}`,
        status: c.status,
      });
      edges.push({ from: `verification:${v.id}`, to: `check:${v.id}:${c.type}`, label: 'check' });
    }
  }

  for (const r of base.collab as any[]) {
    addNode({
      id: `review:${r.id}`,
      kind: 'review',
      label: `Review ${r.changeSetId}`,
      status: r.status,
      meta: r.planId,
    });
    if (r.planId) edges.push({ from: `plan:${r.planId}`, to: `review:${r.id}`, label: 'reviewed' });
    if (r.changeSetId) edges.push({ from: `artifact:${r.changeSetId}`, to: `review:${r.id}`, label: 'for' });
  }

  if (target) {
    // Highlight the subgraph reachable from the target.
    const reachable = new Set<string>([target]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of edges) {
        if (reachable.has(e.from) && !reachable.has(e.to)) {
          reachable.add(e.to);
          changed = true;
        }
        if (reachable.has(e.to) && !reachable.has(e.from)) {
          reachable.add(e.from);
          changed = true;
        }
      }
    }
    return {
      nodes: nodes.filter((n) => reachable.has(n.id)),
      edges: edges.filter((e) => reachable.has(e.from) && reachable.has(e.to)),
    };
  }

  return { nodes, edges };
}

// ─── Route ────────────────────────────────────────────────────

export async function handleExecutionRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  const url = new URL(req.url || '', 'http://127.0.0.1');

  if (method === 'GET' && p === '/api/execution/dashboard') {
    const base = await collectBase(ctx);
    const agents = ctx.telemetry.getAllAgents();
    const queue = buildQueue(base);
    const approvals = await collectApprovals(ctx);
    const metrics = computeMetrics(base, agents, ctxTelemetryEvents(ctx));
    json(res, 200, {
      ts: Date.now(),
      projects: base.projects,
      plans: base.plans,
      changeSets: base.changeSets,
      verifications: base.verifications,
      collaboration: base.collab,
      sessions: base.sessions,
      executions: base.executions,
      agents,
      approvals,
      queue,
      queueSummary: queueSummary(queue),
      metrics,
      pipeline: EXECUTION_PIPELINE,
    });
    return true;
  }

  if (method === 'GET' && p === '/api/execution/queue') {
    const base = await collectBase(ctx);
    const entries = buildQueue(base);
    json(res, 200, { entries, summary: queueSummary(entries) });
    return true;
  }

  if (method === 'GET' && p === '/api/execution/timeline') {
    const sessionId = url.searchParams.get('sessionId');
    let session = null;
    if (sessionId) session = await ctx.agents.getExecutionSession(sessionId).catch(() => null);
    json(res, 200, { pipeline: EXECUTION_PIPELINE, session: session ?? null });
    return true;
  }

  if (method === 'GET' && p === '/api/execution/agents') {
    const agents = ctx.telemetry.getAllAgents();
    const executions = await ctx.agents.listExecutions().catch(() => []);
    json(res, 200, { agents, executions });
    return true;
  }

  if (method === 'GET' && p === '/api/execution/artifacts') {
    const base = await collectBase(ctx);
    json(res, 200, {
      chain: ['explanation', 'plan', 'changeset', 'verification', 'approval'],
      plans: base.plans,
      changeSets: base.changeSets,
      verifications: base.verifications,
      collaboration: base.collab,
      executions: base.executions,
    });
    return true;
  }

  if (method === 'GET' && p === '/api/execution/approvals') {
    const approvals = await collectApprovals(ctx);
    json(res, 200, { approvals });
    return true;
  }

  if (method === 'GET' && p === '/api/execution/filesystem') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 500);
    const ops = collectFsOps(ctx);
    json(res, 200, { operations: ops.slice(0, limit), total: ops.length });
    return true;
  }

  if (method === 'GET' && p === '/api/execution/events') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 500);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    let events = await collectEvents(ctx, limit);
    if (q) {
      events = events.filter(
        (e) =>
          e.message.toLowerCase().includes(q) || e.type.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q),
      );
    }
    json(res, 200, { events, total: events.length });
    return true;
  }

  if (method === 'GET' && p === '/api/execution/metrics') {
    const base = await collectBase(ctx);
    const agents = ctx.telemetry.getAllAgents();
    json(res, 200, { ts: Date.now(), metrics: computeMetrics(base, agents, ctxTelemetryEvents(ctx)) });
    return true;
  }

  if (method === 'GET' && p === '/api/execution/traceability') {
    const target = url.searchParams.get('target') ?? undefined;
    json(res, 200, await buildTraceability(ctx, target));
    return true;
  }

  if (method === 'POST' && p === '/api/execution/analyze') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const snapshot = body.snapshot;
    const question = (body.question ?? 'Explain the current state of AI execution.').trim();
    if (!snapshot) {
      json(res, 400, { error: 'snapshot is required' });
      return true;
    }
    const provider = ctx.kernel.providerManager?.getProvider('opencode') ?? null;
    if (!provider) {
      json(res, 503, { error: 'AI provider not available' });
      return true;
    }
    const brief = JSON.stringify(snapshot);
    const systemPrompt = [
      'You are Vestara, an AI execution engineer.',
      'Analyze the following AI execution dashboard snapshot.',
      'Explain progress, failures, bottlenecks, and retries. Suggest concrete improvements.',
      'Do not expose or fabricate internal reasoning; reason about observable state only.',
      'Use short markdown.',
    ].join('\n');
    try {
      const result = await provider.complete({
        model: body.model || 'nemotron-3-ultra-free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Execution snapshot:\n"""\n${brief.slice(0, 16000)}\n"""\n\nQuestion: ${question}` },
        ],
        temperature: 0.3,
        maxTokens: 2048,
      });
      json(res, 200, { answer: result.content || 'No response.' });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  return false;
}
