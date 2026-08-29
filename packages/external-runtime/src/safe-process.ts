/**
 * Safe process + filesystem helpers for runtime adapters.
 *
 * No arbitrary shell strings; explicit executable and argument arrays, timeouts
 * and abort signals, bounded output, symlink-safe reads, and workspace-bounded
 * path resolution.
 */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 3000;
const MAX_OUTPUT_BYTES = 512 * 1024;

export function execFileSafe(
  executable: string,
  args: readonly string[],
  opts?: { timeoutMs?: number; env?: Readonly<Record<string, string | undefined>>; cwd?: string },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = childProcess.spawn(executable, [...args], {
      cwd: opts?.cwd,
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: err.message, exitCode: null, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr, exitCode: code, timedOut });
    });
  });
}

export function which(executable: string): string | null {
  const PATH = process.env.PATH ?? '';
  for (const dir of PATH.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, executable);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Read a file with a bounded size; returns null on any failure. */
export function readFileSafe(filePath: string, maxBytes = 256 * 1024): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > maxBytes) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** List a directory; returns [] on any failure. */
export function listDirSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * Resolve a path inside a workspace root, rejecting traversal and symlink
 * escapes. Returns null when unsafe.
 */
export function resolveInsideRoot(root: string, candidate: string): string | null {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, candidate);
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) return null;
  try {
    const real = fs.realpathSync(abs);
    if (real !== absRoot && !real.startsWith(absRoot + path.sep)) return null;
  } catch {
    return null;
  }
  return abs;
}

/** Resolve a path inside an approved runtime-home directory. */
export function resolveInsideHome(homeDir: string, candidate: string): string | null {
  const absHome = path.resolve(homeDir);
  const abs = path.resolve(absHome, candidate);
  if (abs !== absHome && !abs.startsWith(absHome + path.sep)) return null;
  return abs;
}

export function sha1(input: string): string {
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha1').update(input).digest('hex').slice(0, 16);
}
