/**
 * Diagnostic Center routes.
 *
 * Host observability + Vestara runtime diagnostics:
 *   GET  /api/diagnostics/summary      → composed one-shot snapshot
 *   GET  /api/diagnostics/cpu          → per-core utilization (delta)
 *   GET  /api/diagnostics/memory       → detailed memory
 *   GET  /api/diagnostics/processes    → process list
 *   GET  /api/diagnostics/disks        → mounted filesystems
 *   GET  /api/diagnostics/gpu          → NVIDIA GPU (best-effort)
 *   GET  /api/diagnostics/docker       → containers/images/stats (best-effort)
 *   GET  /api/diagnostics/git          → repository status
 *   GET  /api/diagnostics/versions     → toolchain versions
 *   GET  /api/diagnostics/filesystem   → dir sizes / large files / recent files
 *   GET  /api/diagnostics/health       → health checks + readiness score
 *   GET  /api/diagnostics/events       → activity + agent event timeline
 *   GET  /api/diagnostics/agents       → agent states + executions
 *   POST /api/diagnostics/analyze      → AI analysis of a diagnostic snapshot
 *   POST /api/diagnostics/processes/kill → SIGTERM a process
 */

import type * as http from 'node:http';
import * as collect from '../diagnostics/collect';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

export async function handleDiagnosticsRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  const url = new URL(req.url || '', 'http://127.0.0.1');

  if (method === 'GET' && p === '/api/diagnostics/summary') {
    const session = ctx.runtime.getSession();
    const profile = session.profile;
    const fp = session.fingerprint;
    const memory = collect.collectMemory();
    const disks = collect.collectDisks();
    const gpu = collect.collectGpu();
    const docker = collect.collectDocker();
    const git = collect.collectGit(ctx.repoPath);
    const cpu = collect.collectCpu();
    const versions = collect.collectVersions();
    const health = collect.collectHealth({
      repoPath: ctx.repoPath,
      workspaceStatus: ctx.runtime.currentStatus,
      memAvailableBytes: memory.available,
      memTotalBytes: memory.total,
      diskFreeBytes: disks[0]?.available ?? 0,
      diskTotalBytes: disks[0]?.size ?? 0,
      gpuAvailable: gpu.available,
      dockerAvailable: docker.available,
      gitAvailable: git.available,
      pythonAvailable: !!versions.python,
      nodeVersion: versions.node,
    });

    const proc = collect.collectProcesses(500);
    const alerts = deriveAlerts({ cpu, memory, disks, docker, git, health, gpu });

    json(res, 200, {
      ts: Date.now(),
      os: collect.collectOS(),
      network: collect.collectNetwork(),
      cpu,
      memory,
      disks: disks.slice(0, 24),
      gpu,
      docker,
      git,
      versions,
      temperature: collect.collectTemperature(),
      processes: { total: proc.total, threads: proc.threads },
      workspace: {
        name: fp.name ?? 'unknown',
        path: ctx.repoPath,
        status: ctx.runtime.currentStatus,
        files: profile.fileCount,
        packages: profile.packageCount,
        dependencies: profile.dependencyCount,
        language: profile.language,
        framework: profile.framework,
        isMonorepo: profile.isMonorepo,
        workspaceDir: ctx.workspaceDir,
      },
      health,
      readiness: collect.readinessScore(health),
      alerts,
    });
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/cpu') {
    json(res, 200, { ts: Date.now(), ...collect.collectCpu(), temperature: collect.collectTemperature() });
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/memory') {
    json(res, 200, { ts: Date.now(), memory: collect.collectMemory() });
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/processes') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 1500), 3000);
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const { processes, total, threads } = collect.collectProcesses(limit);
    const filtered = q
      ? processes.filter(
          (pr) =>
            pr.command.toLowerCase().includes(q) || pr.user.toLowerCase().includes(q) || String(pr.pid).includes(q),
        )
      : processes;
    json(res, 200, { processes: filtered, total, threads, filtered: filtered.length });
    return true;
  }

  if (method === 'POST' && p === '/api/diagnostics/processes/kill') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const pid = Number(body.pid);
    if (!Number.isFinite(pid) || pid <= 1) {
      json(res, 400, { error: 'invalid pid' });
      return true;
    }
    json(res, 200, collect.killProcess(pid));
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/disks') {
    json(res, 200, { ts: Date.now(), disks: collect.collectDisks() });
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/gpu') {
    json(res, 200, { ts: Date.now(), ...collect.collectGpu() });
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/docker') {
    json(res, 200, { ts: Date.now(), ...collect.collectDocker() });
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/git') {
    json(res, 200, { ts: Date.now(), ...collect.collectGit(ctx.repoPath) });
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/versions') {
    json(res, 200, { ts: Date.now(), versions: collect.collectVersions() });
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/filesystem') {
    const scan = collect.scanWorkspace(ctx.repoPath);
    json(res, 200, { ts: Date.now(), ...scan });
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/health') {
    const memory = collect.collectMemory();
    const disks = collect.collectDisks();
    const gpu = collect.collectGpu();
    const docker = collect.collectDocker();
    const git = collect.collectGit(ctx.repoPath);
    const versions = collect.collectVersions();
    const checks = collect.collectHealth({
      repoPath: ctx.repoPath,
      workspaceStatus: ctx.runtime.currentStatus,
      memAvailableBytes: memory.available,
      memTotalBytes: memory.total,
      diskFreeBytes: disks[0]?.available ?? 0,
      diskTotalBytes: disks[0]?.size ?? 0,
      gpuAvailable: gpu.available,
      dockerAvailable: docker.available,
      gitAvailable: git.available,
      pythonAvailable: !!versions.python,
      nodeVersion: versions.node,
    });
    json(res, 200, { ts: Date.now(), checks, readiness: collect.readinessScore(checks) });
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/events') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
    const category = url.searchParams.get('category');
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const events = await collectEvents(ctx, limit);
    let filtered = events;
    if (category && category !== 'all') filtered = filtered.filter((e) => e.category === category);
    if (q) {
      filtered = filtered.filter(
        (e) =>
          e.message.toLowerCase().includes(q) || e.type.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q),
      );
    }
    json(res, 200, { events: filtered, total: filtered.length });
    return true;
  }

  if (method === 'GET' && p === '/api/diagnostics/agents') {
    const states = ctx.telemetry.getAllAgents();
    const executions = await ctx.agents.listExecutions().catch(() => []);
    const snapshot = ctx.telemetry.snapshot();
    json(res, 200, { agents: states, executions, eventCount: snapshot.eventCount, startedAt: snapshot.startedAt });
    return true;
  }

  if (method === 'POST' && p === '/api/diagnostics/analyze') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const snapshot = body.snapshot;
    const question = (body.question ?? 'Diagnose the current state of this development environment.').trim();
    if (!snapshot) {
      json(res, 400, { error: 'snapshot is required' });
      return true;
    }
    const provider = ctx.kernel.providerManager?.getProvider('opencode') ?? null;
    if (!provider) {
      json(res, 503, { error: 'AI provider not available' });
      return true;
    }
    const brief = summarizeSnapshot(snapshot);
    const systemPrompt = [
      'You are Vestara, an observability engineer.',
      'Diagnose the following development environment diagnostic snapshot.',
      'Identify problems, their likely causes, and concrete fixes.',
      'Be specific and actionable. Use short markdown.',
    ].join('\n');
    try {
      const result = await provider.complete({
        model: body.model || 'nemotron-3-ultra-free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Diagnostic snapshot:\n"""\n${brief}\n"""\n\nQuestion: ${question}` },
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

// ─── Shared helpers ───────────────────────────────────────────

interface DiagEvent {
  id: string;
  timestamp: string;
  category: string;
  type: string;
  actor: string;
  message: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

async function collectEvents(ctx: WorkspaceContext, limit: number): Promise<DiagEvent[]> {
  const out: DiagEvent[] = [];

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
      metadata: e.metadata,
    });
  }

  try {
    const act = ctx.activityStore ? await ctx.activityStore.query({ limit }) : [];
    for (const a of act as any[]) {
      out.push({
        id: a.id ?? `act-${out.length}`,
        timestamp: a.timestamp ?? new Date().toISOString(),
        category: a.category ?? 'system',
        type: a.type ?? 'event',
        actor: a.actor?.name ?? 'system',
        message: a.message ?? a.type ?? '',
        metadata: a.metadata,
      });
    }
  } catch {
    /* activity store unavailable */
  }

  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, limit);
}

function deriveAlerts(input: {
  cpu: ReturnType<typeof collect.collectCpu>;
  memory: ReturnType<typeof collect.collectMemory>;
  disks: ReturnType<typeof collect.collectDisks>;
  docker: ReturnType<typeof collect.collectDocker>;
  git: ReturnType<typeof collect.collectGit>;
  health: ReturnType<typeof collect.collectHealth>;
  gpu: ReturnType<typeof collect.collectGpu>;
}): Array<{ severity: 'info' | 'warning' | 'critical'; message: string; source: string }> {
  const alerts: Array<{ severity: 'info' | 'warning' | 'critical'; message: string; source: string }> = [];

  if (input.cpu.usage > 90)
    alerts.push({ severity: 'critical', message: `CPU usage at ${Math.round(input.cpu.usage)}%`, source: 'cpu' });
  else if (input.cpu.usage > 75)
    alerts.push({ severity: 'warning', message: `High CPU usage: ${Math.round(input.cpu.usage)}%`, source: 'cpu' });

  const memPct = input.memory.total > 0 ? (input.memory.used / input.memory.total) * 100 : 0;
  if (memPct > 90)
    alerts.push({ severity: 'critical', message: `Memory usage at ${Math.round(memPct)}%`, source: 'memory' });
  else if (memPct > 80)
    alerts.push({ severity: 'warning', message: `High memory usage: ${Math.round(memPct)}%`, source: 'memory' });

  for (const d of input.disks) {
    if (d.capacity > 90) {
      alerts.push({
        severity: 'warning',
        message: `Disk nearly full: ${d.mount} at ${Math.round(d.capacity)}%`,
        source: 'disk',
      });
    }
  }

  for (const c of input.docker.containers) {
    if (c.state === 'exited' && c.status.toLowerCase().includes('error')) {
      alerts.push({ severity: 'warning', message: `Container ${c.names} exited with error`, source: 'docker' });
    }
  }

  if (input.git.conflicts > 0)
    alerts.push({
      severity: 'warning',
      message: `${input.git.conflicts} git conflict(s) on ${input.git.branch}`,
      source: 'git',
    });

  for (const h of input.health) {
    if (h.status === 'fail')
      alerts.push({ severity: 'critical', message: `Health check failed: ${h.name} — ${h.detail}`, source: 'health' });
    else if (h.status === 'warn')
      alerts.push({ severity: 'warning', message: `Health check warning: ${h.name} — ${h.detail}`, source: 'health' });
  }

  if (input.gpu.available && input.gpu.gpus.some((g) => g.utilization > 95)) {
    alerts.push({ severity: 'warning', message: 'GPU utilization > 95%', source: 'gpu' });
  }

  return alerts.slice(0, 30);
}

/** Compact, bounded JSON representation of a snapshot for the AI prompt. */
function summarizeSnapshot(snapshot: unknown): string {
  const json = JSON.stringify(snapshot);
  return json.length > 16000 ? json.slice(0, 16000) : json;
}
