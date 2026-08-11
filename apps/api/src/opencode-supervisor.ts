/**
 * OpenCode server supervisor — idle-based stop + on-demand restart.
 *
 * The `opencode serve` headless runtime is auto-started at login by a systemd
 * user unit and is the largest Vestara-owned resident (~526 MB). This
 * supervisor releases that cost when the server is idle: it stops the server
 * after `VESTARA_OPENCODE_IDLE_STOP_MS` (default 30 min) of no API-driven
 * usage, and restarts it on demand the next time the OpenCode runtime service
 * needs it. Disable entirely with `VESTARA_OPENCODE_SUPERVISOR=0`.
 *
 * Principle: durable organization, disposable compute — the runtime is a
 * capability granted when needed and released when idle.
 */

import { execFileSync, spawn } from 'node:child_process';

const HEALTH_URL = 'http://127.0.0.1:4096/api/health';

const state = {
  lastUsed: 0,
  /** Pids the supervisor itself spawned via ensure(); only these are reclaimable. */
  ownedPids: new Set<number>(),
};

/** Marks that the OpenCode runtime was used by the API (bumps the idle clock). */
export function noteOpencodeUsed(): void {
  state.lastUsed = Date.now();
}

/** Find the `opencode serve` process pid, if any. */
export function findOpencodeServePid(): number | null {
  try {
    const out = execFileSync('pgrep', ['-f', 'opencode serve'], { encoding: 'utf8', timeout: 2000 });
    const pids = out
      .trim()
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    return pids[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Execution-lease guard: is `candidatePid` an ancestor of `descendantPid`?
 * A runtime that hosts an active participant's execution must never be
 * reclaimed — disposing of it disposes of the execution controlling it.
 */
export function isProcessAncestor(candidatePid: number, descendantPid: number): boolean {
  let pid = descendantPid;
  for (let depth = 0; depth < 32; depth += 1) {
    if (pid === candidatePid) return true;
    let parent: string;
    try {
      parent = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8', timeout: 1000 }).trim();
    } catch {
      return false;
    }
    if (!parent) return false;
    const next = Number(parent);
    if (next === candidatePid) return true; // parent IS the candidate
    if (!Number.isFinite(next) || next <= 1) return false;
    pid = next;
  }
  return false;
}

/**
 * Reachable = the server responds on HTTP at all (any status, including 401 —
 * auth is a separate layer from "is the process up").
 */
async function opencodeReachable(): Promise<boolean> {
  try {
    await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

/** Graceful SIGTERM (the systemd unit uses Restart=on-failure, so a clean stop is not resurrected). */
export async function stopOpencodeServe(): Promise<boolean> {
  const pid = findOpencodeServePid();
  if (pid === null) return false;
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the runtime is up, starting it on demand (same command as the systemd
 * unit). Returns true when reachable. Never starts a second instance.
 */
export async function ensureOpencodeServer(): Promise<boolean> {
  if (await opencodeReachable()) return true;
  if (findOpencodeServePid() !== null) return false; // running but unhealthy — do not double-start
  const child = spawn('opencode', ['serve', '--hostname', '127.0.0.1', '--port', '4096'], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  const deadline = Date.now() + 15_000;
  let up = false;
  while (Date.now() < deadline) {
    if (await opencodeReachable()) {
      up = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (up && child.pid !== undefined) state.ownedPids.add(child.pid);
  return up;
}

/** Start the idle-stop loop. Returns a stop function. */
export function startOpencodeSupervisor(): () => void {
  const idleMs = Number(process.env.VESTARA_OPENCODE_IDLE_STOP_MS ?? 1_800_000);
  const checkIntervalMs = 30_000;
  // The idle window counts from boot: if the API never uses OpenCode (e.g. the
  // proxy gate is off), the server is idle and gets released after the window.
  state.lastUsed = Date.now();
  const timer = setInterval(() => {
    void (async () => {
      const pid = findOpencodeServePid();
      if (pid === null) return; // not running — nothing to stop
      const idleMsActual = Date.now() - state.lastUsed;
      if (idleMsActual < idleMs) return;

      // Execution-lease guard: never reclaim a runtime that hosts an active
      // participant's execution (this API's own process tree — and, by the
      // same rule, any runtime we did not spawn and cannot prove lease-free).
      if (isProcessAncestor(pid, process.pid)) {
        console.log(`[api] opencode serve (pid ${pid}) skipped: it hosts this process's execution`);
        return;
      }
      if (!state.ownedPids.has(pid)) {
        console.log(
          `[api] opencode serve (pid ${pid}) skipped: not spawned by this supervisor (external/systemd-managed)`,
        );
        return;
      }

      console.log(`[api] stopping idle opencode serve (idle ${Math.round(idleMsActual / 60_000)}m, pid ${pid})`);
      await stopOpencodeServe();
      state.ownedPids.delete(pid);
    })();
  }, checkIntervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
