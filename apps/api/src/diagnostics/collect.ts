/**
 * System diagnostics collectors.
 *
 * Pure Node.js data collection for the Diagnostic Center. Every collector
 * degrades gracefully: missing binaries, unsupported features, or permission
 * errors yield `null` / empty arrays rather than throwing.
 *
 * Deliberately free of @vestara imports so it can be unit-tested in isolation.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ─── Small helpers ────────────────────────────────────────────

const RUN_TIMEOUT_MS = 4000;

/** Run a command; returns stdout trimmed, or null on any failure. */
export function run(cmd: string, args: string[], timeoutMs = RUN_TIMEOUT_MS): string | null {
  try {
    const res = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return res.trim();
  } catch {
    return null;
  }
}

function readFile(pathname: string): string | null {
  try {
    return fs.readFileSync(pathname, 'utf8');
  } catch {
    return null;
  }
}

function readLines(pathname: string): string[] {
  return readFile(pathname)?.split('\n') ?? [];
}

function clamp(n: number, min = 0, max = 100): number {
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
}

function round(n: number, digits = 1): number {
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : 0;
}

function parseBytesKb(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n * 1024 : 0;
}

/** Parse an `args`-style command line (may contain spaces) given leading fixed columns. */
const PS_LINE_RE = /^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+([0-9.]+)\s+([0-9.]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/;

export function parsePsLine(line: string, _fieldCount: number): string[] {
  const m = line.trim().match(PS_LINE_RE);
  if (!m) return [];
  return [m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11]];
}

// ─── CPU / stat ───────────────────────────────────────────────

export interface CpuSnapshot {
  time: number;
  perCores: Array<{ idle: number; total: number }>;
  totalIdle: number;
  total: number;
  processes: number;
  contextSwitches: number;
  interrupts: number;
}

export function readCpuStat(): CpuSnapshot | null {
  const lines = readLines('/proc/stat');
  if (lines.length === 0) return null;
  const perCores: Array<{ idle: number; total: number }> = [];
  let totalIdle = 0;
  let total = 0;
  let processes = 0;
  let contextSwitches = 0;
  let interrupts = 0;
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts[0].startsWith('cpu')) {
      const nums = parts.slice(1).map(Number);
      if (nums.length < 4) continue;
      const idle = nums[3] + (nums[4] ?? 0); // idle + iowait
      const coreTotal = nums.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
      if (parts[0] === 'cpu') {
        totalIdle = idle;
        total = coreTotal;
      } else if (parts[0].startsWith('cpu')) {
        perCores.push({ idle, total: coreTotal });
      }
    } else if (parts[0] === 'processes') {
      processes = Number(parts[1]);
    } else if (parts[0] === 'ctxt') {
      contextSwitches = Number(parts[1]);
    } else if (parts[0] === 'intr') {
      interrupts = Number(parts[1]);
    }
  }
  return { time: Date.now(), perCores, totalIdle, total, processes, contextSwitches, interrupts };
}

/** Compute utilization percent between two /proc/stat snapshots. */
export function computeCpuUsage(prev: CpuSnapshot, next: CpuSnapshot): { overall: number; perCore: number[] } {
  const dt = next.total - prev.total;
  if (dt <= 0) return { overall: 0, perCore: Array(prev.perCores.length).fill(0) };
  const overall = clamp(((dt - (next.totalIdle - prev.totalIdle)) / dt) * 100);
  const perCore = prev.perCores.map((p, i) => {
    const cur = next.perCores[i];
    if (!cur) return 0;
    const d = cur.total - p.total;
    if (d <= 0) return 0;
    return clamp(((d - (cur.idle - p.idle)) / d) * 100);
  });
  return { overall, perCore };
}

let lastCpuStat: CpuSnapshot | null = null;

/** Read current per-core utilization (delta since the previous call). */
export function collectCpu(): {
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
} {
  const cpus = os.cpus();
  const model = cpus[0]?.model ?? 'unknown';
  const speed = cpus[0]?.speed ?? 0;
  const stat = readCpuStat();
  let usage = 0;
  let perCore: number[] = [];
  let processes = 0;
  let contextSwitches = 0;
  let interrupts = 0;
  if (stat && lastCpuStat) {
    const delta = computeCpuUsage(lastCpuStat, stat);
    usage = delta.overall;
    perCore = delta.perCore;
    processes = stat.processes;
    contextSwitches = stat.contextSwitches;
    interrupts = stat.interrupts;
  }
  if (stat) lastCpuStat = stat;

  let governor: string | null = null;
  const gov = readFile('/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor');
  if (gov) governor = gov.trim();

  // Physical cores: group by unique physical id from /proc/cpuinfo.
  const physicalCores = countPhysicalCores();

  return {
    model,
    physicalCores,
    logicalCores: cpus.length,
    speed,
    loadAvg: os.loadavg().map((n) => round(n, 2)),
    usage,
    perCore,
    processes,
    contextSwitches,
    interrupts,
    governor,
  };
}

export function countPhysicalCores(): number {
  const lines = readLines('/proc/cpuinfo');
  const ids = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^physical id\s*:\s*(.+)$/);
    if (m) ids.add(m[1].trim());
  }
  if (ids.size > 0) return ids.size;
  return os.cpus().length;
}

// ─── Memory ───────────────────────────────────────────────────

export interface MemoryDetail {
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

export function collectMemory(): MemoryDetail {
  const mem = new Map<string, number>();
  for (const line of readLines('/proc/meminfo')) {
    const m = line.match(/^(\w+):\s+(\d+)\s*kB/);
    if (m) mem.set(m[1], Number(m[2]) * 1024);
  }
  const total = mem.get('MemTotal') ?? os.totalmem();
  const free = mem.get('MemFree') ?? 0;
  const available = mem.get('MemAvailable') ?? Math.max(0, total - free);
  const buffers = mem.get('Buffers') ?? 0;
  const cached = mem.get('Cached') ?? 0;
  const used = Math.max(0, total - available);
  return {
    total,
    free,
    available,
    used,
    buffers,
    cached,
    active: mem.get('Active') ?? 0,
    inactive: mem.get('Inactive') ?? 0,
    dirty: mem.get('Dirty') ?? 0,
    swapTotal: mem.get('SwapTotal') ?? 0,
    swapFree: mem.get('SwapFree') ?? 0,
    swapUsed: Math.max(0, (mem.get('SwapTotal') ?? 0) - (mem.get('SwapFree') ?? 0)),
    hugePagesTotal: mem.get('HugePages_Total') ?? 0,
    hugePagesFree: mem.get('HugePages_Free') ?? 0,
  };
}

// ─── Temperature (Linux thermal zones) ────────────────────────

export function collectTemperature(): Array<{ type: string; temp: number }> {
  const out: Array<{ type: string; temp: number }> = [];
  let idx = 0;
  while (true) {
    const zone = `/sys/class/thermal/thermal_zone${idx}`;
    const temp = readFile(`${zone}/temp`);
    const type = readFile(`${zone}/type`);
    if (temp === null && type === null) break;
    if (temp !== null) {
      const millic = Number(temp.trim());
      if (Number.isFinite(millic)) {
        out.push({ type: type?.trim() ?? `zone${idx}`, temp: round(millic / 1000) });
      }
    }
    idx += 1;
  }
  return out;
}

// ─── OS / network ─────────────────────────────────────────────

export interface NetworkInterfaceInfo {
  name: string;
  family: string;
  address: string;
  netmask: string | null;
  mac: string;
  internal: boolean;
}

export function collectNetwork(): { interfaces: NetworkInterfaceInfo[]; gateway: string | null } {
  const interfaces: NetworkInterfaceInfo[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      interfaces.push({
        name,
        family: a.family,
        address: a.address,
        netmask: a.netmask ?? null,
        mac: a.mac ?? '',
        internal: a.internal,
      });
    }
  }
  let gateway: string | null = null;
  const route = run('ip', ['route', 'show', 'default']);
  if (route) {
    const m = route.match(/via\s+([\d.]+)/);
    if (m) gateway = m[1];
  }
  return { interfaces, gateway };
}

export function collectOS() {
  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      return null;
    }
  })();
  const locale = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale ?? null;
    } catch {
      return null;
    }
  })();
  return {
    platform: os.platform(),
    type: os.type(),
    release: os.release(),
    kernel: os.version(),
    arch: os.arch(),
    hostname: os.hostname(),
    user: os.userInfo().username,
    home: os.homedir(),
    uptime: os.uptime(),
    bootTime: Date.now() - os.uptime() * 1000,
    timezone: tz,
    locale,
    cpuModel: os.cpus()[0]?.model ?? null,
  };
}

// ─── Disks ────────────────────────────────────────────────────

export interface DiskUsage {
  filesystem: string;
  type: string | null;
  size: number;
  used: number;
  available: number;
  capacity: number;
  mount: string;
}

export function parseDf(output: string): DiskUsage[] {
  const rows: DiskUsage[] = [];
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line || /^Filesystem\s+Type/i.test(line)) continue;
    // df -kPT columns: Filesystem Type 1024-blocks Used Available Capacity% Mounted on
    const m = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
    if (!m) continue;
    const size = Number(m[3]);
    const used = Number(m[4]);
    const available = Number(m[5]);
    const capacity = Number(String(m[6]).replace('%', ''));
    rows.push({
      filesystem: m[1],
      type: m[2],
      size: size * 1024,
      used: used * 1024,
      available: available * 1024,
      capacity: Number.isFinite(capacity) ? capacity : 0,
      mount: m[7],
    });
  }
  return rows;
}

export function collectDisks(): DiskUsage[] {
  const out = run('df', ['-kPT']);
  return out ? parseDf(out) : [];
}

// ─── GPU ──────────────────────────────────────────────────────

export interface GpuInfo {
  available: boolean;
  error?: string;
  gpus: Array<{
    name: string;
    driver: string;
    memoryTotal: number;
    memoryUsed: number;
    memoryFree: number;
    utilization: number;
    temperature: number | null;
    powerDraw: number | null;
    fanSpeed: number | null;
  }>;
  processes: Array<{ pid: number; name: string; usedMemory: number }>;
}

function parseCsv(value: string): string[] {
  return value.split(',').map((s) => s.trim());
}

export function collectGpu(): GpuInfo {
  const probe = run('nvidia-smi', ['--version'], 3000);
  if (probe === null) {
    return { available: false, error: 'NVIDIA driver / nvidia-smi not available', gpus: [], processes: [] };
  }
  const csv = run('nvidia-smi', [
    '--query-gpu=name,driver_version,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,fan.speed',
    '--format=csv,noheader,nounits',
  ]);
  const gpus: GpuInfo['gpus'] = [];
  for (const line of csv?.split('\n') ?? []) {
    if (!line.trim()) continue;
    const f = parseCsv(line);
    if (f.length < 10) continue;
    gpus.push({
      name: f[0],
      driver: f[1],
      memoryTotal: Number(f[2]) * 1024 * 1024,
      memoryUsed: Number(f[3]) * 1024 * 1024,
      memoryFree: Number(f[4]) * 1024 * 1024,
      utilization: clamp(Number(f[5])),
      temperature: Number.isFinite(Number(f[7])) ? Number(f[7]) : null,
      powerDraw: Number.isFinite(Number(f[8])) ? Number(f[8]) : null,
      fanSpeed: Number.isFinite(Number(f[9])) ? Number(f[9]) : null,
    });
  }
  const procCsv = run('nvidia-smi', [
    '--query-compute-apps=pid,process_name,used_memory',
    '--format=csv,noheader,nounits',
  ]);
  const processes: GpuInfo['processes'] = [];
  for (const line of procCsv?.split('\n') ?? []) {
    const f = parseCsv(line);
    if (f.length < 3) continue;
    processes.push({ pid: Number(f[0]), name: f[1], usedMemory: Number(f[2]) * 1024 * 1024 });
  }
  return { available: true, gpus, processes };
}

// ─── Docker ───────────────────────────────────────────────────

export interface DockerContainer {
  id: string;
  names: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  createdAt: string;
}

export interface DockerStat {
  name: string;
  cpuPerc: number;
  memUsed: number;
  memLimit: number;
  memPerc: number;
  netIn: number;
  netOut: number;
}

export function parseDockerStat(line: string): DockerStat | null {
  const parts = line.split('|');
  if (parts.length < 5) return null;
  const name = parts[0].trim();
  const cpu = Number(String(parts[1]).replace('%', ''));
  const mem = parts[2].match(/([\d.]+)([KMG]iB|B)?\s*\/\s*([\d.]+)([KMG]iB|B)?/);
  const net = parts[4].match(/([\d.]+)([KMG]iB|B)\s*\/\s*([\d.]+)([KMG]iB|B)/);
  const memPerc = Number(String(parts[3]).replace('%', ''));
  const toBytes = (v: string | undefined, unit: string | undefined) => {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return 0;
    const mult: Record<string, number> = {
      B: 1,
      KiB: 1024,
      MiB: 1024 ** 2,
      GiB: 1024 ** 3,
      TiB: 1024 ** 4,
    };
    return n * (mult[unit ?? 'B'] ?? 1);
  };
  return {
    name,
    cpuPerc: Number.isFinite(cpu) ? cpu : 0,
    memUsed: mem ? toBytes(mem[1], mem[2]) : 0,
    memLimit: mem ? toBytes(mem[3], mem[4]) : 0,
    memPerc: Number.isFinite(memPerc) ? memPerc : 0,
    netIn: net ? toBytes(net[1], net[2]) : 0,
    netOut: net ? toBytes(net[3], net[4]) : 0,
  };
}

export function collectDocker(): {
  available: boolean;
  error?: string;
  version?: string;
  containers: DockerContainer[];
  imageCount: number;
  stats: DockerStat[];
} {
  const version = run('docker', ['version', '--format', '{{.Server.Version}}'], 5000);
  if (version === null) {
    return {
      available: false,
      error: 'Docker not available (CLI missing or daemon not running)',
      containers: [],
      imageCount: 0,
      stats: [],
    };
  }
  const containers: DockerContainer[] = [];
  const ps = run(
    'docker',
    [
      'ps',
      '-a',
      '--no-trunc',
      '--format',
      '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.Ports}}|{{.CreatedAt}}',
    ],
    6000,
  );
  for (const line of ps?.split('\n') ?? []) {
    const parts = line.split('|');
    if (parts.length < 7) continue;
    containers.push({
      id: parts[0],
      names: parts[1],
      image: parts[2],
      status: parts[3],
      state: parts[4],
      ports: parts[5],
      createdAt: parts[6],
    });
  }
  const images = run('docker', ['images', '-q']);
  const imageCount = images ? images.split('\n').filter((l) => l.trim()).length : 0;
  const stats: DockerStat[] = [];
  const statOut = run(
    'docker',
    ['stats', '--no-stream', '--format', '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}'],
    8000,
  );
  for (const line of statOut?.split('\n') ?? []) {
    const stat = parseDockerStat(line);
    if (stat) stats.push(stat);
  }
  return { available: true, version, containers, imageCount, stats };
}

// ─── Git ──────────────────────────────────────────────────────

export interface GitStatus {
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

export function collectGit(repoPath: string): GitStatus {
  const git = (args: string[], timeout = 4000) => run('git', ['-C', repoPath, ...args], timeout);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === null) {
    return {
      available: false,
      error: 'Not a git repository',
      branch: null,
      head: null,
      lastCommit: null,
      modified: 0,
      staged: 0,
      untracked: 0,
      conflicts: 0,
      ahead: null,
      behind: null,
      dirty: false,
    };
  }
  const head = git(['rev-parse', '--short', 'HEAD']);
  const lastCommit = git(['log', '-1', '--format=%h %an %ad %s', '--date=short']);
  let modified = 0;
  let staged = 0;
  let untracked = 0;
  let conflicts = 0;
  const porcelain = git(['status', '--porcelain']);
  for (const line of porcelain?.split('\n') ?? []) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    if (code === '??') untracked += 1;
    else if (code.startsWith('U') || code.includes('U')) conflicts += 1;
    if (code[1] === 'M' || code[1] === 'A' || code[1] === 'D' || code[1] === 'R') staged += 1;
    if (code[0] === 'M' || code[0] === 'A' || code[0] === 'D' || code[0] === 'R' || code === '??') modified += 1;
  }
  let ahead: number | null = null;
  let behind: number | null = null;
  const counts = git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']);
  if (counts) {
    const [a, b] = counts.split(/\s+/);
    ahead = Number.isFinite(Number(a)) ? Number(a) : null;
    behind = Number.isFinite(Number(b)) ? Number(b) : null;
  }
  return {
    available: true,
    branch,
    head,
    lastCommit,
    modified,
    staged,
    untracked,
    conflicts,
    ahead,
    behind,
    dirty: modified + staged + untracked > 0,
  };
}

// ─── Tool versions (cached) ───────────────────────────────────

const VERSION_CACHE_TTL_MS = 60_000;
let versionCache: { at: number; versions: Record<string, string | null> } | null = null;

export function collectVersions(): Record<string, string | null> {
  const now = Date.now();
  if (versionCache && now - versionCache.at < VERSION_CACHE_TTL_MS) {
    return versionCache.versions;
  }
  const probe = (cmd: string, args: string[] = ['--version']) => {
    const out = run(cmd, args, 3000);
    if (out === null) return null;
    const first = out.split('\n')[0];
    return first.length > 80 ? first.slice(0, 80) : first;
  };
  const versions: Record<string, string | null> = {
    node: probe('node', ['-v']),
    npm: probe('npm', ['-v']),
    pnpm: probe('pnpm', ['-v']),
    yarn: probe('yarn', ['-v']),
    tsc: probe('tsc', ['--version']),
    python: probe('python3', ['--version']),
    git: probe('git', ['--version']),
    docker: probe('docker', ['--version']),
    'docker-compose': probe('docker-compose', ['version']),
    kubernetes: probe('kubectl', ['version', '--client', '-o', 'json']),
    'github-cli': probe('gh', ['--version']),
    openssl: probe('openssl', ['version']),
    sqlite: probe('sqlite3', ['--version']),
  };
  versionCache = { at: now, versions };
  return versions;
}

// ─── Processes ────────────────────────────────────────────────

export interface ProcessInfo {
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

export function parsePs(output: string): ProcessInfo[] {
  const rows: ProcessInfo[] = [];
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields = parsePsLine(line, 11);
    if (fields.length < 11) continue;
    const pid = Number(fields[0]);
    if (!Number.isFinite(pid)) continue;
    rows.push({
      pid,
      ppid: Number(fields[1]),
      user: fields[2],
      status: fields[3],
      cpu: Number.isFinite(Number(fields[4])) ? Number(fields[4]) : 0,
      mem: Number.isFinite(Number(fields[5])) ? Number(fields[5]) : 0,
      rss: parseBytesKb(fields[6]),
      vsz: parseBytesKb(fields[7]),
      threads: Number.isFinite(Number(fields[8])) ? Number(fields[8]) : 0,
      etime: fields[9],
      command: fields[10],
    });
  }
  return rows;
}

export function collectProcesses(limit = 1500): { processes: ProcessInfo[]; total: number; threads: number } {
  const out = run('ps', ['-eo', 'pid=,ppid=,user=,stat=,pcpu=,pmem=,rss=,vsz=,nlwp=,etime=,args=']);
  const all = out ? parsePs(out) : [];
  const total = all.length;
  const threads = all.reduce((a, p) => a + p.threads, 0);
  const processes = all.sort((a, b) => b.cpu - a.cpu).slice(0, limit);
  return { processes, total, threads };
}

export function killProcess(pid: number): { ok: boolean; error?: string } {
  try {
    process.kill(pid, 'SIGTERM');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ─── Filesystem scan ──────────────────────────────────────────

export interface FsScan {
  dirSizes: Array<{ dir: string; size: number }>;
  largeFiles: Array<{ file: string; size: number }>;
  recentlyModified: Array<{ file: string; mtime: string }>;
}

/** Best-effort directory sizes + large files for a repo (bounded). */
export function scanWorkspace(repoPath: string, timeoutMs = 12000): FsScan {
  const dirSizes: Array<{ dir: string; size: number }> = [];
  const largeFiles: Array<{ file: string; size: number }> = [];
  const recentlyModified: Array<{ file: string; mtime: string }> = [];
  if (!fs.existsSync(repoPath)) return { dirSizes, largeFiles, recentlyModified };

  // Top-level directory sizes via du (bounded, best-effort, one filesystem).
  const duOut = spawnSync('du', ['-skx', '--max-depth=1', repoPath], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (!duOut.error && duOut.stdout) {
    for (const line of duOut.stdout.split('\n')) {
      const m = line.match(/^(\d+)\s+(.+)$/);
      if (m) {
        const size = Number(m[1]) * 1024;
        const dir = m[2];
        if (dir === repoPath) continue;
        dirSizes.push({ dir: dir.slice(repoPath.length).replace(/^\/+/, '') || '/', size });
      }
    }
    dirSizes.sort((a, b) => b.size - a.size);
  }

  // Large files (>= 5 MB), bounded output.
  const findOut = spawnSync(
    'find',
    [repoPath, '-type', 'f', '-size', '+5M', '-not', '-path', '*/node_modules/*', '-printf', '%s %p\n'],
    { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
  );
  if (!findOut.error && findOut.stdout) {
    for (const line of findOut.stdout.split('\n').slice(0, 100)) {
      const m = line.match(/^(\d+)\s+(.+)$/);
      if (m) largeFiles.push({ file: m[2], size: Number(m[1]) });
    }
    largeFiles.sort((a, b) => b.size - a.size);
  }

  // Recently modified files (last 24h), bounded output.
  const recentOut = spawnSync(
    'find',
    [repoPath, '-type', 'f', '-mtime', '-1', '-not', '-path', '*/node_modules/*', '-printf', '%T@ %p\n'],
    { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
  );
  if (!recentOut.error && recentOut.stdout) {
    for (const line of recentOut.stdout.split('\n').slice(0, 60)) {
      const m = line.match(/^([\d.]+)\s+(.+)$/);
      if (m) recentlyModified.push({ file: m[2], mtime: new Date(Number(m[1]) * 1000).toISOString() });
    }
    recentlyModified.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  }

  return { dirSizes, largeFiles, recentlyModified };
}

// ─── Health checks ────────────────────────────────────────────

export interface HealthCheck {
  id: string;
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'unknown';
  detail: string;
}

export interface HealthInput {
  repoPath: string;
  workspaceStatus: string;
  memAvailableBytes: number;
  memTotalBytes: number;
  diskFreeBytes: number;
  diskTotalBytes: number;
  gpuAvailable: boolean;
  dockerAvailable: boolean;
  gitAvailable: boolean;
  pythonAvailable: boolean;
  nodeVersion: string | null;
}

export function collectHealth(input: HealthInput): HealthCheck[] {
  const checks: HealthCheck[] = [];

  const workspaceOk = input.workspaceStatus === 'ready' || input.workspaceStatus === 'running';
  checks.push({
    id: 'workspace',
    name: 'Workspace',
    status: workspaceOk ? 'pass' : 'warn',
    detail: workspaceOk ? `Status: ${input.workspaceStatus}` : `Status: ${input.workspaceStatus}`,
  });

  const repoOk = fs.existsSync(input.repoPath);
  let writable = false;
  if (repoOk) {
    try {
      fs.accessSync(input.repoPath, fs.constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
  }
  checks.push({
    id: 'filesystem',
    name: 'Filesystem',
    status: repoOk && writable ? 'pass' : 'fail',
    detail: repoOk
      ? writable
        ? 'Repository readable and writable'
        : 'Repository not writable'
      : 'Repository path missing',
  });

  checks.push({
    id: 'node',
    name: 'Node.js',
    status: input.nodeVersion ? 'pass' : 'fail',
    detail: input.nodeVersion ? `Node ${input.nodeVersion}` : 'Node.js not found',
  });

  checks.push({
    id: 'python',
    name: 'Python',
    status: input.pythonAvailable ? 'pass' : 'warn',
    detail: input.pythonAvailable ? 'Python available' : 'python3 not found (optional)',
  });

  checks.push({
    id: 'git',
    name: 'Git',
    status: input.gitAvailable ? 'pass' : 'fail',
    detail: input.gitAvailable ? 'Git available' : 'Git not found',
  });

  checks.push({
    id: 'docker',
    name: 'Docker',
    status: input.dockerAvailable ? 'pass' : 'warn',
    detail: input.dockerAvailable ? 'Docker available' : 'Docker not available (optional)',
  });

  checks.push({
    id: 'gpu',
    name: 'GPU',
    status: input.gpuAvailable ? 'pass' : 'unknown',
    detail: input.gpuAvailable ? 'NVIDIA GPU available' : 'No NVIDIA GPU detected (optional)',
  });

  const memPct = input.memTotalBytes > 0 ? (input.memAvailableBytes / input.memTotalBytes) * 100 : 100;
  checks.push({
    id: 'memory',
    name: 'Memory',
    status: memPct < 10 ? 'fail' : memPct < 20 ? 'warn' : 'pass',
    detail: `${Math.round(memPct)}% memory available`,
  });

  const diskPct = input.diskTotalBytes > 0 ? (input.diskFreeBytes / input.diskTotalBytes) * 100 : 100;
  checks.push({
    id: 'disk',
    name: 'Disk',
    status: diskPct < 5 ? 'fail' : diskPct < 15 ? 'warn' : 'pass',
    detail: `${Math.round(diskPct)}% disk free`,
  });

  const depsOk = fs.existsSync(path.join(input.repoPath, 'node_modules'));
  checks.push({
    id: 'dependencies',
    name: 'Dependencies',
    status: depsOk ? 'pass' : 'warn',
    detail: depsOk ? 'node_modules present' : 'node_modules not found (run pnpm install)',
  });

  return checks;
}

export function readinessScore(checks: HealthCheck[]): number {
  if (checks.length === 0) return 0;
  const weights: Record<string, number> = { pass: 1, warn: 0.5, unknown: 0.5, fail: 0 };
  const total = checks.reduce((a, c) => a + weights[c.status], 0);
  return round((total / checks.length) * 100);
}
