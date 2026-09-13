/**
 * @vestara/terminal-runtime — governed session registry.
 *
 * One registry per API process. Each session is a session-scoped interactive
 * `bash` under the workspace root with:
 * - cwd containment (escape throws; same rule as `shell.execute` T-003)
 * - bounded transcript ring (redacted at append) for reconnect replay
 * - idle reaper + max-lifetime deadline + max-sessions cap (all env-driven)
 * - targeted kill only (SIGTERM → SIGKILL escalation per session process)
 * - lifecycle events (created/exited/killed/timeout) — never output content
 *
 * Execution governance honored:
 * - An agent owns only processes it creates: sessions are created explicitly
 *   via `create()` and destroyed via `kill()`/`dispose()` — never broadly.
 * - UI lifecycle ≠ execution lifecycle: closing the WS detaches the viewer;
 *   the session survives until killed, timed out, or server shutdown.
 */

import { isAbsolute, relative, resolve } from 'node:path';
import {
  resolveTerminalDriverKind,
  spawnPtyTerminalProcess,
  spawnTerminalProcess,
  type TerminalDriverKind,
  type TerminalProcess,
} from './driver';
import { redactSecrets } from './redact';
import type { TerminalStreamState } from './stream';
import { createTerminalStreamState, flushTerminalStream, processTerminalChunk } from './stream';

export interface TerminalRegistryOptions {
  /** Absolute workspace root — the only permitted cwd ancestor. */
  workspaceRoot: string;
  /** Explicit driver; defaults to `VESTARA_TERMINAL_DRIVER` resolution. */
  driver?: TerminalDriverKind;
  maxSessions?: number;
  idleTimeoutMs?: number;
  maxLifetimeMs?: number;
  killGraceMs?: number;
  /** Bounded transcript chars retained per session (redacted). */
  transcriptCap?: number;
  /** Bounded bytes forwarded per output chunk. */
  chunkCap?: number;
}

export type TerminalSessionState = 'running' | 'exited' | 'killed';

export interface TerminalSessionInfo {
  readonly id: string;
  readonly cwd: string;
  /** Driver actually backing this session (pty requests can fall back). */
  readonly driver: TerminalDriverKind;
  readonly state: TerminalSessionState;
  readonly pid: number | undefined;
  readonly cols: number;
  readonly rows: number;
  readonly createdAt: number;
  readonly lastActivityAt: number;
  readonly exitCode: number | null;
}

export type TerminalKillReason = 'client' | 'idle' | 'lifetime' | 'shutdown';

export type TerminalRegistryEvent =
  | { type: 'created'; sessionId: string; cwd: string; pid: number | undefined }
  | { type: 'exited'; sessionId: string; code: number | null; signal: string | null }
  | { type: 'killed'; sessionId: string; reason: TerminalKillReason };

export interface TerminalOutputListener {
  onStdout?: (sessionId: string, text: string) => void;
  onStderr?: (sessionId: string, text: string) => void;
}

const DEFAULTS = {
  maxSessions: 8,
  idleTimeoutMs: 10 * 60 * 1000,
  maxLifetimeMs: 2 * 60 * 60 * 1000,
  killGraceMs: 2000,
  transcriptCap: 64 * 1024,
  chunkCap: 64 * 1024,
} as const;

/** `PROMPT_COMMAND` marker protocol: US + `CWD:<pwd>` + RS framing per prompt. Parsed by `stream.ts`. */
const CWD_PROMPT_COMMAND = 'printf "\\x1fCWD:%s\\x1e\\n" "$PWD"';
/**
 * Green `$` prompt. Prompts print on stderr (interactive bash), where the UI
 * tints red — the prompt carries its own color so it reads as chrome, while
 * genuine errors stay red. Shared by both drivers (xterm renders SGR).
 */
const SHELL_PS1 = '[\\e[32m\\]$ \\[\\e[0m\\] ';

/**
 * Resolve a requested cwd under the workspace root. Mirrors the
 * `shell.execute` containment rule (T-003) locally so the security boundary
 * is explicit and auditable in this package: absolute or root-relative,
 * escape throws.
 */
export function resolveSessionCwd(workspaceRoot: string, requested?: string): string {
  const root = resolve(workspaceRoot);
  if (!requested || requested === '~') return root;
  const absolute = isAbsolute(requested) ? requested : resolve(root, requested);
  const rel = relative(root, absolute);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Terminal cwd escapes workspace: ${requested}`);
  return absolute;
}

interface SessionRecord {
  id: string;
  cwd: string;
  driver: TerminalDriverKind;
  process: TerminalProcess;
  state: TerminalSessionState;
  cols: number;
  rows: number;
  createdAt: number;
  lastActivityAt: number;
  exitCode: number | null;
  transcript: string;
  stream: TerminalStreamState;
  listeners: TerminalOutputListener[];
}

let sessionCounter = 0;

export class TerminalSessionRegistry {
  private readonly workspaceRoot: string;
  private readonly driver: TerminalDriverKind;
  private readonly maxSessions: number;
  private readonly idleTimeoutMs: number;
  private readonly maxLifetimeMs: number;
  private readonly killGraceMs: number;
  private readonly transcriptCap: number;
  private readonly chunkCap: number;
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly events: Array<(event: TerminalRegistryEvent) => void> = [];
  private sweeper: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor(options: TerminalRegistryOptions) {
    const env = process.env;
    this.workspaceRoot = resolve(options.workspaceRoot);
    this.driver = options.driver ?? resolveTerminalDriverKind(env);
    this.maxSessions = options.maxSessions ?? (Number(env.VESTARA_TERMINAL_MAX_SESSIONS ?? 0) || DEFAULTS.maxSessions);
    this.idleTimeoutMs =
      options.idleTimeoutMs ?? (Number(env.VESTARA_TERMINAL_IDLE_TIMEOUT_MS ?? 0) || DEFAULTS.idleTimeoutMs);
    this.maxLifetimeMs =
      options.maxLifetimeMs ?? (Number(env.VESTARA_TERMINAL_MAX_LIFETIME_MS ?? 0) || DEFAULTS.maxLifetimeMs);
    this.killGraceMs = options.killGraceMs ?? DEFAULTS.killGraceMs;
    this.transcriptCap = options.transcriptCap ?? DEFAULTS.transcriptCap;
    this.chunkCap = options.chunkCap ?? DEFAULTS.chunkCap;
    resolveTerminalDriverKind(env); // warn-once on unknown driver values
  }

  onEvent(listener: (event: TerminalRegistryEvent) => void): () => void {
    this.events.push(listener);
    return () => {
      const idx = this.events.indexOf(listener);
      if (idx >= 0) this.events.splice(idx, 1);
    };
  }

  private emit(event: TerminalRegistryEvent): void {
    for (const listener of [...this.events]) {
      try {
        listener(event);
      } catch {
        /* listener failures must not break session management */
      }
    }
  }

  /** Start the idle/lifetime sweeper. Idempotent; unref'd so it never holds the loop. */
  start(): void {
    if (this.sweeper || this.disposed) return;
    this.sweeper = setInterval(() => {
      void this.sweep();
    }, 30_000);
    this.sweeper.unref?.();
  }

  list(): TerminalSessionInfo[] {
    return [...this.sessions.values()].map((s) => this.infoOf(s));
  }

  get(id: string): TerminalSessionInfo | undefined {
    const record = this.sessions.get(id);
    return record ? this.infoOf(record) : undefined;
  }

  /** Redacted transcript tail for reconnect replay (bounded, never secrets verbatim). */
  transcript(id: string, maxChars?: number): string | undefined {
    const record = this.sessions.get(id);
    if (!record) return undefined;
    const cap = Math.min(maxChars ?? this.transcriptCap, this.transcriptCap);
    return record.transcript.slice(-cap);
  }

  create(options?: { cwd?: string; cols?: number; rows?: number }): TerminalSessionInfo {
    if (this.disposed) throw new Error('Terminal registry is disposed');
    if (this.sessions.size >= this.maxSessions) throw new Error(`Terminal session limit reached (${this.maxSessions})`);
    const cwd = resolveSessionCwd(this.workspaceRoot, options?.cwd);
    const cols = clampInt(options?.cols, 20, 500, 80);
    const rows = clampInt(options?.rows, 5, 200, 24);
    const id = `tsess-${Date.now().toString(36)}-${(sessionCounter++).toString(36)}`;
    const now = Date.now();
    // Handlers close over `record` via definite assignment: child_process
    // events always fire asynchronously, after the assignment below.
    let record!: SessionRecord;
    const spawnOptions = {
      cwd,
      cols,
      rows,
      extraEnv: { PS1: SHELL_PS1, PROMPT_COMMAND: CWD_PROMPT_COMMAND },
    };
    const events = {
      onStdout: (chunk: string) => this.handleOutput(record, 'stdout', chunk),
      onStderr: (chunk: string) => this.handleOutput(record, 'stderr', chunk),
      onExit: (code: number | null, signal: string | null) => this.handleExit(record, code, signal),
    };
    // Pty falls back closed to spawn per session; the actual driver is recorded.
    let proc = this.driver === 'pty' ? spawnPtyTerminalProcess(spawnOptions, events) : undefined;
    const actualDriver: TerminalDriverKind = proc ? 'pty' : 'spawn';
    if (!proc) {
      if (this.driver === 'pty') console.warn('[terminal-runtime] pty unavailable — session using spawn');
      proc = spawnTerminalProcess(spawnOptions, events);
    }
    record = {
      id,
      cwd,
      driver: actualDriver,
      process: proc,
      state: 'running',
      cols,
      rows,
      createdAt: now,
      lastActivityAt: now,
      exitCode: null,
      transcript: '',
      stream: createTerminalStreamState(),
      listeners: [],
    };
    this.sessions.set(id, record);
    this.emit({ type: 'created', sessionId: id, cwd, pid: proc.pid });
    return this.infoOf(record);
  }

  /** Attach a live output listener (WS fan-out lives in the API layer). */
  attach(id: string, listener: TerminalOutputListener): () => void {
    const record = this.sessions.get(id);
    if (!record) throw new Error(`Unknown terminal session: ${id}`);
    record.listeners.push(listener);
    record.lastActivityAt = Date.now();
    return () => {
      const idx = record.listeners.indexOf(listener);
      if (idx >= 0) record.listeners.splice(idx, 1);
    };
  }

  write(id: string, data: string): void {
    const record = this.sessions.get(id);
    if (!record) throw new Error(`Unknown terminal session: ${id}`);
    if (record.state !== 'running') throw new Error(`Terminal session ${id} is not running`);
    const bounded = data.slice(0, this.chunkCap);
    // Ctrl-D at the wire level ends stdin (shell exits on EOF at prompt).
    if (bounded === '\x04') {
      record.process.endStdin();
    } else {
      if (!record.process.write(bounded)) throw new Error(`Terminal session ${id} is not writable`);
    }
    record.lastActivityAt = Date.now();
  }

  /** Foreground interrupt (Ctrl-C semantics): SIGINT the session process group. */
  interrupt(id: string): void {
    const record = this.sessions.get(id);
    if (!record) throw new Error(`Unknown terminal session: ${id}`);
    if (record.state !== 'running') return;
    record.process.interrupt();
    record.lastActivityAt = Date.now();
  }

  resize(id: string, cols: number, rows: number): void {
    const record = this.sessions.get(id);
    if (!record) throw new Error(`Unknown terminal session: ${id}`);
    record.cols = clampInt(cols, 20, 500, record.cols);
    record.rows = clampInt(rows, 5, 200, record.rows);
    record.process.resize(record.cols, record.rows);
    record.lastActivityAt = Date.now();
  }

  async kill(id: string, reason: TerminalKillReason = 'client'): Promise<boolean> {
    const record = this.sessions.get(id);
    if (!record) return false;
    this.sessions.delete(id);
    if (record.state === 'running') {
      record.state = 'killed';
      await record.process.kill(this.killGraceMs);
    }
    this.emit({ type: 'killed', sessionId: id, reason });
    return true;
  }

  /** Kill every session (server shutdown path). Targeted per-session kills only. */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = undefined;
    }
    for (const id of [...this.sessions.keys()]) {
      await this.kill(id, 'shutdown');
    }
  }

  private infoOf(record: SessionRecord): TerminalSessionInfo {
    return {
      id: record.id,
      cwd: record.cwd,
      driver: record.driver,
      state: record.state,
      pid: record.process.pid,
      cols: record.cols,
      rows: record.rows,
      createdAt: record.createdAt,
      lastActivityAt: record.lastActivityAt,
      exitCode: record.exitCode,
    };
  }

  private appendTranscript(record: SessionRecord, text: string): void {
    record.transcript = (record.transcript + redactSecrets(text)).slice(-this.transcriptCap);
  }

  private handleOutput(record: SessionRecord, stream: 'stdout' | 'stderr', chunk: string): void {
    if (record.state !== 'running') return;
    record.lastActivityAt = Date.now();
    const bounded = chunk.slice(0, this.chunkCap);
    // Streaming parse: startup-noise stripping (PID-tolerant), cwd-marker
    // projection with cross-chunk reassembly — see `stream.ts`.
    const { forward, cwd } = processTerminalChunk(record.stream, bounded);
    if (cwd) record.cwd = cwd;
    if (forward) {
      this.appendTranscript(record, forward);
      for (const listener of [...record.listeners]) {
        try {
          if (stream === 'stdout') listener.onStdout?.(record.id, forward);
          else listener.onStderr?.(record.id, forward);
        } catch {
          /* listener failures must not break the session */
        }
      }
    }
  }

  private handleExit(record: SessionRecord, code: number | null, signal: string | null): void {
    if (record.state !== 'running') return;
    record.state = 'exited';
    record.exitCode = code;
    // Flush any held marker tail verbatim — never silently dropped.
    const tail = flushTerminalStream(record.stream);
    if (tail) this.appendTranscript(record, tail);
    this.emit({ type: 'exited', sessionId: record.id, code, signal });
  }

  private async sweep(): Promise<void> {
    const now = Date.now();
    for (const record of [...this.sessions.values()]) {
      if (record.listeners.length > 0) {
        // Viewed sessions are alive by definition; still enforce max lifetime.
        if (now - record.createdAt > this.maxLifetimeMs) await this.kill(record.id, 'lifetime');
        continue;
      }
      if (now - record.createdAt > this.maxLifetimeMs) {
        await this.kill(record.id, 'lifetime');
      } else if (now - record.lastActivityAt > this.idleTimeoutMs) {
        await this.kill(record.id, 'idle');
      }
    }
  }
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
