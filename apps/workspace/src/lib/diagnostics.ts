/**
 * Diagnostic Center API client + types.
 *
 * Mirrors apps/api/src/routes/diagnostics.ts and
 * apps/api/src/diagnostics/collect.ts response shapes.
 */

export interface DiagOS {
  platform: string;
  type: string;
  release: string;
  kernel: string;
  arch: string;
  hostname: string;
  user: string;
  home: string;
  uptime: number;
  bootTime: number;
  timezone: string | null;
  locale: string | null;
  cpuModel: string | null;
}

export interface DiagCpu {
  model: string;
  physicalCores: number;
  logicalCores: number;
  speed: number;
  loadAvg: number[];
  usage: number;
  perCore: number[];
  processes: number;
  contextSwitches: number;
  interrupts: number;
  governor: string | null;
}

export interface DiagMemory {
  total: number;
  free: number;
  available: number;
  used: number;
  buffers: number;
  cached: number;
  active: number;
  inactive: number;
  dirty: number;
  swapTotal: number;
  swapFree: number;
  swapUsed: number;
  hugePagesTotal: number;
  hugePagesFree: number;
}

export interface DiagDisk {
  filesystem: string;
  type: string | null;
  size: number;
  used: number;
  available: number;
  capacity: number;
  mount: string;
}

export interface DiagNetworkInterface {
  name: string;
  family: string;
  address: string;
  netmask: string | null;
  mac: string;
  internal: boolean;
}

export interface DiagNetwork {
  interfaces: DiagNetworkInterface[];
  gateway: string | null;
}

export interface DiagGpuDevice {
  name: string;
  driver: string;
  memoryTotal: number;
  memoryUsed: number;
  memoryFree: number;
  utilization: number;
  temperature: number | null;
  powerDraw: number | null;
  fanSpeed: number | null;
}

export interface DiagGpu {
  available: boolean;
  error?: string;
  gpus: DiagGpuDevice[];
  processes: Array<{ pid: number; name: string; usedMemory: number }>;
}

export interface DiagDockerContainer {
  id: string;
  names: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  createdAt: string;
}

export interface DiagDockerStat {
  name: string;
  cpuPerc: number;
  memUsed: number;
  memLimit: number;
  memPerc: number;
  netIn: number;
  netOut: number;
}

export interface DiagDocker {
  available: boolean;
  error?: string;
  version?: string;
  containers: DiagDockerContainer[];
  imageCount: number;
  stats: DiagDockerStat[];
}

export interface DiagGit {
  available: boolean;
  error?: string;
  branch: string | null;
  head: string | null;
  lastCommit: string | null;
  modified: number;
  staged: number;
  untracked: number;
  conflicts: number;
  ahead: number | null;
  behind: number | null;
  dirty: boolean;
}

export type DiagVersions = Record<string, string | null>;

export interface DiagWorkspace {
  name: string;
  path: string;
  status: string;
  files: number;
  packages: number;
  dependencies: number;
  language: string;
  framework: string | null;
  isMonorepo: boolean;
  workspaceDir: string;
}

export interface DiagHealthCheck {
  id: string;
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'unknown';
  detail: string;
}

export interface DiagAlert {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  source: string;
}

export interface DiagTemperature {
  type: string;
  temp: number;
}

export interface DiagSummary {
  ts: number;
  os: DiagOS;
  network: DiagNetwork;
  cpu: DiagCpu;
  memory: DiagMemory;
  disks: DiagDisk[];
  gpu: DiagGpu;
  docker: DiagDocker;
  git: DiagGit;
  versions: DiagVersions;
  temperature: DiagTemperature[];
  processes: { total: number; threads: number };
  workspace: DiagWorkspace;
  health: DiagHealthCheck[];
  readiness: number;
  alerts: DiagAlert[];
}

export interface DiagProcess {
  pid: number;
  ppid: number;
  user: string;
  status: string;
  cpu: number;
  mem: number;
  rss: number;
  vsz: number;
  threads: number;
  etime: string;
  command: string;
}

export interface DiagEvent {
  id: string;
  timestamp: string;
  category: string;
  type: string;
  actor: string;
  message: string;
  status?: string;
}

export interface DiagAgentState {
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

export interface DiagExecution {
  id: string;
  agentId: string;
  task: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  result?: string;
}

export interface FsScan {
  dirSizes: Array<{ dir: string; size: number }>;
  largeFiles: Array<{ file: string; size: number }>;
  recentlyModified: Array<{ file: string; mtime: string }>;
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

export const diagnosticsApi = {
  summary: () => fetchJSON<DiagSummary>('/api/diagnostics/summary'),

  cpu: () =>
    fetchJSON<{ ts: number; usage: number; perCore: number[]; loadAvg: number[]; temperature: DiagTemperature[] }>(
      '/api/diagnostics/cpu',
    ),

  memory: () => fetchJSON<{ ts: number; memory: DiagMemory }>('/api/diagnostics/memory'),

  processes: (opts?: { q?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set('q', opts.q);
    if (opts?.limit) params.set('limit', String(opts.limit));
    return fetchJSON<{ processes: DiagProcess[]; total: number; threads: number; filtered: number }>(
      `/api/diagnostics/processes?${params.toString()}`,
    );
  },

  disks: () => fetchJSON<{ ts: number; disks: DiagDisk[] }>('/api/diagnostics/disks'),

  gpu: () => fetchJSON<{ ts: number } & DiagGpu>('/api/diagnostics/gpu'),

  docker: () => fetchJSON<{ ts: number } & DiagDocker>('/api/diagnostics/docker'),

  git: () => fetchJSON<{ ts: number } & DiagGit>('/api/diagnostics/git'),

  versions: () => fetchJSON<{ ts: number; versions: DiagVersions }>('/api/diagnostics/versions'),

  filesystem: () => fetchJSON<{ ts: number } & FsScan>('/api/diagnostics/filesystem'),

  health: () => fetchJSON<{ ts: number; checks: DiagHealthCheck[]; readiness: number }>('/api/diagnostics/health'),

  events: (opts?: { q?: string; category?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.q) params.set('q', opts.q);
    if (opts?.category) params.set('category', opts.category);
    if (opts?.limit) params.set('limit', String(opts.limit ?? 100));
    return fetchJSON<{ events: DiagEvent[]; total: number }>(`/api/diagnostics/events?${params.toString()}`);
  },

  agents: () =>
    fetchJSON<{ agents: DiagAgentState[]; executions: DiagExecution[]; eventCount: number; startedAt: string }>(
      '/api/diagnostics/agents',
    ),

  kill: async (pid: number): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/diagnostics/processes/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid }),
      });
      return await res.json();
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  },

  analyze: async (snapshot: unknown, question?: string): Promise<{ answer?: string; error?: string } | null> => {
    try {
      const res = await fetch('/api/diagnostics/analyze', {
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

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

export function statusTone(status: string): 'pass' | 'warn' | 'fail' | 'unknown' {
  const s = status.toLowerCase();
  if (s.includes('fail') || s.includes('error') || s.includes('critical') || s.includes('exited') || s === 'failed')
    return 'fail';
  if (s.includes('warn') || s.includes('degraded') || s.includes('waiting') || s.includes('unknown')) return 'warn';
  if (
    s.includes('pass') ||
    s.includes('ok') ||
    s.includes('running') ||
    s.includes('healthy') ||
    s.includes('active') ||
    s === 'ready' ||
    s === 'completed' ||
    s === 'idle'
  )
    return 'pass';
  return 'unknown';
}
