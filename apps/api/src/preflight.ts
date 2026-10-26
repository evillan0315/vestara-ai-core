import * as fs from 'node:fs';
import * as os from 'node:os';

const MB = 1024 * 1024;

export interface ResourceSnapshot {
  readonly availableBytes: number;
  readonly totalBytes: number;
  /**
   * `null` when the workspace volume cannot be inspected (for example a
   * `VESTARA_REPO` path that does not exist). Unknown is not healthy: the disk
   * gate is skipped and the startup report says so instead of inventing a
   * free-space figure.
   */
  readonly diskFreeBytes: number | null;
  readonly diskTotalBytes: number | null;
  readonly liveBoot: boolean;
  readonly toram: boolean;
}

export interface PreflightResult {
  readonly ok: boolean;
  readonly snapshot: ResourceSnapshot;
  readonly reasons: readonly string[];
  readonly notes: readonly string[];
  readonly applied: readonly string[];
}

function envMb(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function readMemory(): { availableBytes: number; totalBytes: number } {
  try {
    const values = new Map<string, number>();
    for (const line of fs.readFileSync('/proc/meminfo', 'utf8').split('\n')) {
      const match = /^([A-Za-z_()]+):\s+(\d+)\s+kB/.exec(line);
      if (match) values.set(match[1], Number(match[2]) * 1024);
    }
    return {
      totalBytes: values.get('MemTotal') ?? os.totalmem(),
      availableBytes: values.get('MemAvailable') ?? os.freemem(),
    };
  } catch {
    return { totalBytes: os.totalmem(), availableBytes: os.freemem() };
  }
}

function readDisk(repoPath: string): { freeBytes: number; totalBytes: number } | null {
  try {
    const stats = fs.statfsSync(repoPath);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    if (!Number.isFinite(freeBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return null;
    return { freeBytes, totalBytes };
  } catch {
    return null;
  }
}

function readCmdline(): string {
  try {
    return fs.readFileSync('/proc/cmdline', 'utf8');
  } catch {
    return '';
  }
}

function formatGiB(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GiB`;
}

export function applyLiveSafeDefaults(env: NodeJS.ProcessEnv, snapshot: ResourceSnapshot): string[] {
  if (env.VESTARA_LIVE_SAFE === '0') return [];

  const livePressure =
    snapshot.liveBoot &&
    (snapshot.toram || snapshot.availableBytes < envMb(env, 'VESTARA_LIVE_SAFE_MEMORY_MB', 2048) * MB);
  const lowMemory = snapshot.availableBytes < envMb(env, 'VESTARA_LOW_MEMORY_MB', 2048) * MB;
  if (!livePressure && !lowMemory) return [];

  const applied: string[] = [];
  const setDefault = (key: string, value: string): void => {
    if (env[key] !== undefined) return;
    env[key] = value;
    applied.push(`${key}=${value}`);
  };

  setDefault('VESTARA_SKIP_MEMORY_INDEX', '1');
  setDefault('VESTARA_EVENT_PERSIST_DEBOUNCE_MS', '2000');
  setDefault('VESTARA_BROWSER_MAX_SESSIONS', '1');
  return applied;
}

export function runPreflight(env: NodeJS.ProcessEnv, repoPath: string): PreflightResult {
  const memory = readMemory();
  const disk = readDisk(repoPath);
  const cmdline = readCmdline();
  const snapshot: ResourceSnapshot = {
    availableBytes: memory.availableBytes,
    totalBytes: memory.totalBytes,
    diskFreeBytes: disk?.freeBytes ?? null,
    diskTotalBytes: disk?.totalBytes ?? null,
    liveBoot: fs.existsSync('/run/live') || fs.existsSync('/lib/live/mount'),
    toram: /(?:^|\s)toram(?:\s|$)/.test(cmdline),
  };

  const reasons: string[] = [];
  if (env.VESTARA_SKIP_PREFLIGHT !== '1') {
    const minAvailableBytes = envMb(env, 'VESTARA_MIN_AVAILABLE_MB', 768) * MB;
    const minDiskFreeBytes = envMb(env, 'VESTARA_MIN_DISK_FREE_MB', 1024) * MB;
    if (snapshot.availableBytes < minAvailableBytes) {
      reasons.push(
        `only ${formatGiB(snapshot.availableBytes)} RAM available; need at least ${formatGiB(minAvailableBytes)}`,
      );
    }
    if (snapshot.diskFreeBytes !== null && snapshot.diskFreeBytes < minDiskFreeBytes) {
      reasons.push(
        `only ${formatGiB(snapshot.diskFreeBytes)} disk free on the workspace volume; need at least ${formatGiB(minDiskFreeBytes)}`,
      );
    }
  }

  const applied = applyLiveSafeDefaults(env, snapshot);
  const notes = [
    `memory: ${formatGiB(snapshot.availableBytes)} available of ${formatGiB(snapshot.totalBytes)}`,
    snapshot.diskFreeBytes === null || snapshot.diskTotalBytes === null
      ? `workspace volume: unavailable at ${repoPath} (disk gate skipped)`
      : `workspace volume: ${formatGiB(snapshot.diskFreeBytes)} free of ${formatGiB(snapshot.diskTotalBytes)}`,
    `live boot: ${snapshot.liveBoot ? 'yes' : 'no'}${snapshot.toram ? ' (toram)' : ''}`,
  ];

  return { ok: reasons.length === 0, snapshot, reasons, notes, applied };
}

export function describePreflight(result: PreflightResult): string[] {
  const lines = [...result.notes];
  for (const reason of result.reasons) lines.push(`FAIL: ${reason}`);
  for (const applied of result.applied) lines.push(`safe default applied: ${applied}`);
  return lines;
}
