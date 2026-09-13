/**
 * @vestara/terminal-runtime — process driver abstraction.
 *
 * Two drivers behind `VESTARA_TERMINAL_DRIVER` (default `spawn`):
 * - `spawn`: `node:child_process`, zero native deps, piped stdio.
 * - `pty`: node-pty, true terminal emulation (echo, job control,
 *   full-screen programs, real resize).
 *
 * Honest limits of piped `spawn` stdio (no tty line discipline):
 * - No local echo from the kernel: the client echoes keystrokes and forwards
 *   complete lines. The pty driver echoes in-kernel: clients must NOT echo.
 * - Ctrl-C arrives as a byte, not a signal: the registry maps an explicit
 *   `interrupt` op to SIGINT on the session process group (spawned detached).
 *   The pty driver writes ETX through and the tty raises SIGINT itself.
 * - Full-screen programs (vim, htop) need a pty and will not render on spawn.
 */

import { type ChildProcess, spawn } from 'node:child_process';

export type TerminalDriverKind = 'spawn' | 'pty';

export interface TerminalSpawnOptions {
  /** Absolute cwd, already validated inside the workspace root. */
  cwd: string;
  /** Initial columns/rows (recorded; applied to COLUMNS/LINES at spawn). */
  cols: number;
  rows: number;
  /** Extra env for the session shell (PS1, PROMPT_COMMAND live here). */
  extraEnv: Readonly<Record<string, string>>;
}

export interface TerminalProcessEvents {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onExit?: (code: number | null, signal: string | null) => void;
}

export interface TerminalProcess {
  readonly pid: number | undefined;
  write(data: string): boolean;
  /** End stdin (Ctrl-D at prompt semantics: the shell exits on EOF). */
  endStdin(): void;
  /** SIGINT the session process group (foreground interrupt). */
  interrupt(): boolean;
  resize(cols: number, rows: number): void;
  /** SIGTERM, escalating to SIGKILL after `killGraceMs`. */
  kill(killGraceMs: number): Promise<void>;
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): void;
}

const SECRET_ENV = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|SESSION)/i;

/**
 * Scrubbed session env: inherit the host env minus secret-shaped vars, plus
 * deterministic non-interactive-friendly defaults. Interactive editors are
 * neutered deliberately (no pty backing them); `PAGER=cat` keeps man pages
 * readable as streamed text.
 */
export function buildSessionEnv(extraEnv: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (SECRET_ENV.test(key)) continue;
    env[key] = value;
  }
  env.CI = '1';
  env.NO_COLOR = '1';
  env.CLICOLOR = '0';
  env.TERM = 'xterm-256color';
  env.PAGER = 'cat';
  env.EDITOR = 'true';
  for (const [key, value] of Object.entries(extraEnv)) env[key] = value;
  return env;
}

class SpawnTerminalProcess implements TerminalProcess {
  private readonly child: ChildProcess;

  constructor(child: ChildProcess, events: TerminalProcessEvents) {
    this.child = child;
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => events.onStdout?.(chunk));
    child.stderr?.on('data', (chunk: string) => events.onStderr?.(chunk));
    child.on('exit', (code, signal) => events.onExit?.(code, signal));
    child.on('error', () => events.onExit?.(null, null));
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  write(data: string): boolean {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return false;
    return this.child.stdin?.write(data) ?? false;
  }

  endStdin(): void {
    this.child.stdin?.end();
  }

  interrupt(): boolean {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return false;
    const pid = this.child.pid;
    if (pid === undefined) return false;
    try {
      // Negative pid targets the session process group (spawned detached),
      // so the foreground child — not just the shell — is interrupted.
      process.kill(-pid, 'SIGINT');
      return true;
    } catch {
      return false;
    }
  }

  resize(_cols: number, _rows: number): void {
    // No pty to resize; the registry records dimensions for future drivers.
  }

  kill(killGraceMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.child.exitCode !== null || this.child.signalCode !== null) {
        resolve();
        return;
      }
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(
        () => {
          try {
            if (this.child.pid !== undefined) process.kill(-this.child.pid, 'SIGKILL');
          } catch {
            /* already gone */
          }
          try {
            this.child.kill('SIGKILL');
          } catch {
            /* already gone */
          }
          resolve();
        },
        Math.max(0, killGraceMs),
      );
      timer.unref?.();
      this.child.once('exit', done);
      try {
        this.child.kill('SIGTERM');
      } catch {
        done();
      }
    });
  }

  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): void {
    if (event === 'exit') this.child.once('exit', listener);
  }
}

export function spawnTerminalProcess(options: TerminalSpawnOptions, events: TerminalProcessEvents): TerminalProcess {
  // NOTE: GNU long options must precede `-i` — `bash -i --noprofile`
  // misparses (`--: invalid option`). Verified against bash 5.2.
  // `--noediting`: readline is unusable on piped stdio and its fallback
  // echoes every input line to stderr (double typing with client echo).
  // Without it, prompts stay on stderr but input is never echoed.
  const child = spawn('bash', ['--noprofile', '--norc', '--noediting', '-i'], {
    cwd: options.cwd,
    env: {
      ...buildSessionEnv(options.extraEnv),
      COLUMNS: String(options.cols),
      LINES: String(options.rows),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });
  return new SpawnTerminalProcess(child, events);
}

/**
 * True-pty process via node-pty: the kernel tty driver owns echo, signals,
 * and window size, so control bytes (`\x03`, `\x04`) are written through
 * rather than interpreted, and `resize` really resizes. The merged
 * terminal stream is projected as stdout (documented at the call site).
 */
class PtyTerminalProcess implements TerminalProcess {
  private readonly handle: import('node-pty').IPty;
  private exited = false;

  constructor(handle: import('node-pty').IPty, events: TerminalProcessEvents) {
    this.handle = handle;
    handle.onData((chunk) => events.onStdout?.(chunk));
    handle.onExit(({ exitCode, signal }) => {
      this.exited = true;
      events.onExit?.(exitCode, typeof signal === 'number' ? String(signal) : (signal ?? null));
    });
  }

  get pid(): number | undefined {
    return this.handle.pid;
  }

  write(data: string): boolean {
    if (this.exited) return false;
    this.handle.write(data);
    return true;
  }

  endStdin(): void {
    if (!this.exited) this.handle.write('\x04');
  }

  interrupt(): boolean {
    if (this.exited) return false;
    // The tty driver translates ETX into SIGINT for the foreground group.
    this.handle.write('\x03');
    return true;
  }

  resize(cols: number, rows: number): void {
    if (!this.exited) {
      try {
        this.handle.resize(cols, rows);
      } catch {
        /* already gone */
      }
    }
  }

  kill(killGraceMs: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.exited) {
        resolve();
        return;
      }
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(
        () => {
          try {
            process.kill(this.handle.pid, 'SIGKILL');
          } catch {
            /* already gone */
          }
          resolve();
        },
        Math.max(0, killGraceMs),
      );
      timer.unref?.();
      this.handle.onExit(() => done());
      try {
        this.handle.kill('SIGTERM');
      } catch {
        done();
      }
    });
  }

  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): void {
    if (event === 'exit') {
      this.handle.onExit(({ exitCode, signal }) =>
        listener(exitCode, typeof signal === 'number' ? String(signal) : (signal ?? null)),
      );
    }
  }
}

export function spawnPtyTerminalProcess(
  options: TerminalSpawnOptions,
  events: TerminalProcessEvents,
): TerminalProcess | undefined {
  const pty = loadNodePty();
  if (!pty) return undefined;
  const handle = pty.spawn('bash', ['--noprofile', '--norc', '-i'], {
    name: 'xterm-256color',
    cwd: options.cwd,
    env: {
      ...(buildSessionEnv(options.extraEnv) as Record<string, string>),
      COLUMNS: String(options.cols),
      LINES: String(options.rows),
    },
    cols: options.cols,
    rows: options.rows,
  });
  return new PtyTerminalProcess(handle, events);
}

/** Driver-selected process creation (pty falls back closed to spawn). */
export function createTerminalProcess(
  kind: TerminalDriverKind,
  options: TerminalSpawnOptions,
  events: TerminalProcessEvents,
): TerminalProcess {
  if (kind === 'pty') {
    const proc = spawnPtyTerminalProcess(options, events);
    if (proc) return proc;
    console.warn('[terminal-runtime] pty requested but unavailable — using spawn for this session');
  }
  return spawnTerminalProcess(options, events);
}

/**
 * Resolve the terminal driver. `spawn` (default) is zero-native-dep piped
 * stdio; `pty` selects node-pty (true terminal emulation: echo, job
 * control, full-screen programs). Unknown values warn and fall back to
 * `spawn` — boot must never fail over a typo. A `pty` request that cannot
 * load the native module also falls back closed with a warning.
 */
export function resolveTerminalDriverKind(env: NodeJS.ProcessEnv = process.env): TerminalDriverKind {
  const raw = (env.VESTARA_TERMINAL_DRIVER ?? 'spawn').trim().toLowerCase();
  if (raw === 'pty') {
    if (loadNodePty() === undefined) {
      console.warn(
        '[terminal-runtime] VESTARA_TERMINAL_DRIVER=pty but node-pty failed to load — falling back to spawn',
      );
      return 'spawn';
    }
    return 'pty';
  }
  if (raw !== 'spawn') {
    console.warn(`[terminal-runtime] unknown VESTARA_TERMINAL_DRIVER "${raw}" — falling back to spawn`);
  }
  return 'spawn';
}

/** Lazy node-pty load (fail-closed): never break spawn-only installs. */
function loadNodePty(): typeof import('node-pty') | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node-pty') as typeof import('node-pty');
  } catch {
    return undefined;
  }
}
