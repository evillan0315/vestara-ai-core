/**
 * agent-browser-backed browser driver.
 *
 * Drives the agent-browser CLI (https://agent-browser.dev — a native Rust
 * browser automation CLI backed by a persistent CDP daemon) behind the
 * `BrowserDriver` boundary. Every driver operation is composed as ONE `batch`
 * invocation (a JSON command array on stdin) so a full step costs a single
 * process spawn (~150ms measured in the Phase 0 spike) instead of one spawn
 * per command.
 *
 * Contract notes from the Phase 0 spike (agent-browser 0.27.0, linux x64):
 * - `--session <key>` sessions are fully isolated browsers (own daemon, own
 *   cookies/storage). Colon characters are accepted, so our `owner:task`
 *   session keys pass through unchanged.
 * - All CLI-level failures (stale ref, missing element, launch failure,
 *   domain block) exit 0 — errors are read from the JSON body only, never the
 *   exit code.
 * - Batch entries unwrap `data` into `result`: `open` → `{title, url}`,
 *   `screenshot <path>` → `{path}`, `snapshot -i` → `{origin, refs,
 *   snapshot}`, `get url` → `{url}`, `get title` → `{title}`.
 * - Refs (`@eN`) go stale the moment the page changes; our observation refs
 *   (`ref-N`) map to them per session key and are invalidated on navigation.
 *   Element state (`level`, `checked`, `disabled`, `expanded`, `selected`)
 *   is parsed from the snapshot text's per-line `[...]` brackets — the JSON
 *   refs only carry `{role, name}`.
 * - `back` can hit a transient daemon CDP race ("Inspected target navigated
 *   or closed") because the evaluation context dies mid-navigation; that is
 *   treated as retryable and confirmed via `wait --load load`.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  abortError,
  type BrowserDriver,
  type BrowserElementRef,
  type BrowserNavigationResult,
  type BrowserObserveResult,
  type BrowserPoint,
  type BrowserScreenshotResult,
  type BrowserSessionOptions,
  type BrowserSnapshotResult,
} from './session';

// ─── CLI client abstraction (injectable for tests) ─────────────

export interface AgentBrowserCliInvocation {
  readonly args: readonly string[];
  /** JSON to write to the CLI's stdin (batch mode). */
  readonly stdin?: string;
  readonly signal?: AbortSignal;
  /** Budget for the whole CLI process invocation. */
  readonly timeoutMs: number;
}

export interface AgentBrowserCliClient {
  run(invocation: AgentBrowserCliInvocation): Promise<{ readonly stdout: string; readonly stderr: string }>;
}

/** Default CLI client — spawns the resolved agent-browser binary. */
export class SpawnAgentBrowserCli implements AgentBrowserCliClient {
  constructor(
    private readonly binaryPath: string,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {}

  run(invocation: AgentBrowserCliInvocation): Promise<{ readonly stdout: string; readonly stderr: string }> {
    return new Promise((resolve, reject) => {
      let child: ChildProcess;
      try {
        child = spawn(this.binaryPath, [...invocation.args], {
          env: this.environment,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        reject(new Error(`agent-browser: failed to spawn ${this.binaryPath}: ${String(error)}`));
        return;
      }
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };
      const timer = setTimeout(() => {
        settle(() => {
          child.kill('SIGKILL');
          reject(new Error(`agent-browser: CLI timed out after ${invocation.timeoutMs}ms`));
        });
      }, invocation.timeoutMs);
      const onAbort = () => {
        settle(() => {
          child.kill('SIGKILL');
          reject(abortError());
        });
      };
      if (invocation.signal) {
        if (invocation.signal.aborted) {
          onAbort();
          return;
        }
        invocation.signal.addEventListener('abort', onAbort, { once: true });
      }
      const stdoutStream = child.stdout!;
      const stderrStream = child.stderr!;
      const stdinStream = child.stdin!;
      stdoutStream.on('data', (chunk) => stdout.push(chunk as Buffer));
      stderrStream.on('data', (chunk) => stderr.push(chunk as Buffer));
      child.on('error', (error) => {
        settle(() =>
          reject(
            new Error(
              `agent-browser: binary failed: ${error.message} — install it with 'pnpm add agent-browser' or set AgentBrowserDriverOptions.binaryPath`,
            ),
          ),
        );
      });
      child.on('close', (code) => {
        settle(() => {
          clearTimeout(timer);
          invocation.signal?.removeEventListener('abort', onAbort);
          if (code !== 0 && stdout.length === 0) {
            reject(
              new Error(
                `agent-browser: command failed (exit ${code}): ${Buffer.concat(stderr).toString('utf8').trim()}`,
              ),
            );
            return;
          }
          resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
        });
      });
      if (invocation.stdin !== undefined) stdinStream.write(invocation.stdin);
      stdinStream.end();
    });
  }
}

// ─── Binary resolution ────────────────────────────────────────

/**
 * Resolve the agent-browser executable. Prefers an explicit path, then the
 * platform-specific binary shipped inside the npm package (`bin/`), then the
 * package's node launcher shim, and finally a PATH lookup at spawn time.
 */
export function resolveAgentBrowserBinary(explicitPath?: string): string {
  if (explicitPath) return explicitPath;
  try {
    const packageJsonPath = require.resolve('agent-browser/package.json');
    const packageDir = dirname(packageJsonPath);
    const binDir = join(packageDir, 'bin');
    const candidates: string[] = [];
    const os = process.platform;
    const cpu = process.arch;
    if (os === 'linux') {
      candidates.push(join(binDir, `agent-browser-linux-${cpu}`));
      candidates.push(join(binDir, cpu === 'x64' ? 'agent-browser-linux-musl-x64' : 'agent-browser-linux-musl-arm64'));
    } else if (os === 'darwin') {
      candidates.push(join(binDir, `agent-browser-darwin-${cpu}`));
    } else if (os === 'win32') {
      candidates.push(join(binDir, 'agent-browser-win32-x64.exe'));
    }
    candidates.push(join(binDir, 'agent-browser.js'));
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // Package not installed — fall through to PATH lookup at spawn time.
  }
  return 'agent-browser';
}

// ─── Output parsing ───────────────────────────────────────────

interface AgentBrowserBatchEntry {
  readonly command: readonly string[];
  readonly result: Record<string, unknown> | null;
  readonly error: string | null;
  readonly success: boolean;
}

const TRANSIENT_NAVIGATION_ERROR =
  /navigated or closed|target closed|execution context was destroyed|cannot find context|no target|session closed/i;

/**
 * `wait --load load` never resolves on pages restored from the back-forward cache
 * (no new `load` event fires). The navigation still committed — verify the landed
 * URL instead of failing. Also covers pages that are simply slow to settle.
 */
const NAV_WAIT_TIMEOUT = /operation timed out/i;

/** Classify a `wait --load load` batch entry outcome. */
function classifyNavWait(entry: AgentBrowserBatchEntry | undefined): 'ok' | 'suppressed' | 'transient' | 'error' {
  if (entry?.success === true) return 'ok';
  const error = entry?.error ?? '';
  if (NAV_WAIT_TIMEOUT.test(error)) return 'suppressed';
  if (TRANSIENT_NAVIGATION_ERROR.test(error)) return 'transient';
  return 'error';
}

function mapCliError(message: string): Error {
  if (/^unknown ref:/i.test(message)) {
    const error = new Error(`STALE_ELEMENT_REFERENCE: the page changed after observe — observe again (${message})`);
    error.name = 'StaleElementReferenceError';
    return error;
  }
  if (/^element not found/i.test(message)) {
    const error = new Error(message);
    error.name = 'NoSuchElementError';
    return error;
  }
  return new Error(message);
}

function parseBatchOutput(stdout: string, context: string): AgentBrowserBatchEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`agent-browser: unexpected CLI output for ${context}: ${stdout.slice(0, 200)}`);
  }
  if (Array.isArray(parsed)) {
    return parsed.map((entry) => {
      const e = entry as Record<string, unknown>;
      return {
        command: Array.isArray(e.command) ? (e.command as string[]) : [],
        result: e.result && typeof e.result === 'object' ? (e.result as Record<string, unknown>) : null,
        error: typeof e.error === 'string' ? e.error : null,
        success: e.success === true,
      };
    });
  }
  if (parsed && typeof parsed === 'object') {
    const e = parsed as Record<string, unknown>;
    if (e.success === false && typeof e.error === 'string') throw mapCliError(e.error);
    throw new Error(`agent-browser: unexpected CLI response for ${context}: ${stdout.slice(0, 200)}`);
  }
  throw new Error(`agent-browser: unexpected CLI output for ${context}`);
}

// ─── Snapshot text → element-state parsing ────────────────────

/**
 * Line grammar (from live snapshots): `- <role> ["<name>"] [k=v, k, ...][: <value>]`
 * e.g. `- heading "Test" [level=1, ref=e1]`, `- checkbox [checked=true, disabled, ref=e3]`,
 * `- combobox [expanded=false, ref=e4]: B`.
 */
const SNAPSHOT_LINE = /^\s*- ([^\s[]+?)(?:\s+"((?:[^"\\]|\\.)*)")?(?:\s+\[([^\]]*)\])?(?::\s*(.*))?$/;

interface SnapshotTextLine {
  readonly role?: string;
  readonly name?: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly value?: string;
}

function parseSnapshotLine(line: string): SnapshotTextLine | undefined {
  const match = SNAPSHOT_LINE.exec(line);
  if (!match) return undefined;
  const [, role, rawName, attrsRaw, value] = match;
  const attrs: Record<string, string> = {};
  for (const part of (attrsRaw ?? '').split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      attrs[trimmed] = 'true';
    } else {
      attrs[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
  return {
    role,
    name: rawName === undefined ? undefined : rawName.replace(/\\(["\\])/g, '$1'),
    attrs,
    value,
  };
}

// ─── Options ──────────────────────────────────────────────────

export interface AgentBrowserDriverOptions extends BrowserSessionOptions {
  /** Explicit path to the agent-browser executable (default: resolved from the npm package). */
  readonly binaryPath?: string;
  /** CLI client — injectable for tests (default: spawns the real binary). */
  readonly cli?: AgentBrowserCliClient;
  /** Action timeout — mirrored to AGENT_BROWSER_DEFAULT_TIMEOUT (default 10_000). */
  readonly defaultTimeoutMs?: number;
  /** Budget for the whole CLI process invocation (default: options.timeoutMs ?? 15_000). */
  readonly processTimeoutMs?: number;
  /** Stability delay after navigation (default 300ms). */
  readonly stabilityDelayMs?: number;
  /** Allowed domains mirrored to AGENT_BROWSER_ALLOWED_DOMAINS. Defaults to a derivation from session options; '*' disables. */
  readonly allowedDomains?: readonly string[];
  /** Browser executable — mirrored to AGENT_BROWSER_EXECUTABLE_PATH. */
  readonly executablePath?: string;
  /** Daemon idle shutdown — mirrored to AGENT_BROWSER_IDLE_TIMEOUT_MS. */
  readonly idleTimeoutMs?: number;
  /** Extra environment merged into every CLI invocation. */
  readonly environment?: NodeJS.ProcessEnv;
}

function hostnameOf(entry: string): string {
  try {
    return new URL(entry.includes('://') ? entry : `https://${entry}`).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Mirror the session's origin allow-list into AGENT_BROWSER_ALLOWED_DOMAINS as
 * defense-in-depth behind `resolveBrowserUrl`. Returns undefined when the
 * allow-list is open ('*') or nothing concrete is configured, which leaves the
 * daemon unrestricted (matching the Playwright driver's behavior).
 */
function deriveAllowedDomains(options: BrowserSessionOptions): readonly string[] | undefined {
  if (options.allowedOrigins?.includes('*')) return undefined;
  const hosts = new Set<string>();
  const push = (value: string) => {
    const host = hostnameOf(value);
    if (host) hosts.add(host);
  };
  if (options.baseUrl) push(options.baseUrl);
  for (const origin of options.allowedOrigins ?? []) push(origin);
  for (const policy of options.originPolicies ?? []) push(policy.origin);
  return hosts.size > 0 ? [...hosts] : undefined;
}

function pngDimensions(bytes: Uint8Array): { readonly width: number; readonly height: number } | undefined {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

// ─── Driver ───────────────────────────────────────────────────

/**
 * agent-browser-backed BrowserDriver. One persistent daemon per `--session`
 * key keeps Chrome alive between operations; each operation ships as a single
 * `batch` invocation so latency stays at ~150ms per driver call.
 */
export class AgentBrowserDriver implements BrowserDriver {
  readonly id = 'agent-browser';

  private readonly binaryPath: string;
  private readonly cli: AgentBrowserCliClient;
  private readonly defaultTimeoutMs: number;
  private readonly processTimeoutMs: number;
  private readonly stabilityDelayMs: number;
  private readonly environment: NodeJS.ProcessEnv;
  /** Per-session-key map of driver ref (`ref-N`) → agent-browser ref (`eN`). */
  private readonly agentRefsByKey = new Map<string, Map<string, string>>();
  private readonly screenshotDir: string;
  private screenshotCounter = 0;

  constructor(options: AgentBrowserDriverOptions) {
    this.binaryPath = resolveAgentBrowserBinary(options.binaryPath);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
    this.processTimeoutMs = options.processTimeoutMs ?? options.timeoutMs ?? 15_000;
    this.stabilityDelayMs = options.stabilityDelayMs ?? 300;
    const allowedDomains = options.allowedDomains ?? deriveAllowedDomains(options);
    const environment = { ...process.env, ...options.environment };
    environment.AGENT_BROWSER_DEFAULT_TIMEOUT = String(this.defaultTimeoutMs);
    if (allowedDomains && allowedDomains.length > 0) {
      environment.AGENT_BROWSER_ALLOWED_DOMAINS = allowedDomains.join(',');
    }
    if (options.executablePath) environment.AGENT_BROWSER_EXECUTABLE_PATH = options.executablePath;
    if (options.idleTimeoutMs && options.idleTimeoutMs > 0) {
      environment.AGENT_BROWSER_IDLE_TIMEOUT_MS = String(options.idleTimeoutMs);
    }
    this.environment = environment;
    this.cli = options.cli ?? new SpawnAgentBrowserCli(this.binaryPath, this.environment);
    this.screenshotDir = mkdtempSync(join(tmpdir(), 'vestara-agb-'));
  }

  async navigate(url: string, key: string, signal?: AbortSignal): Promise<BrowserNavigationResult> {
    const entries = await this.runBatch(key, [['open', url]], signal);
    this.expectSuccess(entries[0], `navigate ${url}`);
    await this.waitForStability(signal);
    this.agentRefsByKey.delete(key);
    return this.readNavResult(entries[0], url);
  }

  async snapshot(key: string, signal?: AbortSignal): Promise<BrowserSnapshotResult> {
    const entries = await this.runBatch(
      key,
      [
        ['snapshot', '-c'],
        ['get', 'title'],
        ['get', 'url'],
      ],
      signal,
    );
    this.expectSuccess(entries[0], 'snapshot');
    const result = entries[0]?.result ?? {};
    const url =
      typeof entries[2]?.result?.url === 'string'
        ? entries[2].result.url
        : typeof result.origin === 'string'
          ? result.origin
          : '';
    const title = typeof entries[1]?.result?.title === 'string' ? entries[1].result.title : '';
    const text = typeof result.snapshot === 'string' ? result.snapshot : '';
    return { url, title, text };
  }

  async screenshot(
    key: string,
    signal?: AbortSignal,
    options?: { readonly fullPage?: boolean },
  ): Promise<BrowserScreenshotResult> {
    const path = join(this.screenshotDir, `shot-${Date.now()}-${++this.screenshotCounter}.png`);
    const commands: readonly (readonly string[])[] = [
      ['get', 'url'],
      ['screenshot', ...((options?.fullPage ?? true) ? ['--full'] : []), path],
    ];
    const entries = await this.runBatch(key, commands, signal);
    this.expectSuccess(entries[0], 'screenshot (url)');
    this.expectSuccess(entries[1], 'screenshot');
    const url = typeof entries[0]?.result?.url === 'string' ? entries[0].result.url : '';
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(path));
    } catch (error) {
      throw new Error(`agent-browser: screenshot file was not produced: ${String(error)}`);
    } finally {
      rmSync(path, { force: true });
    }
    const dims = pngDimensions(bytes);
    return {
      url,
      width: dims?.width ?? 1280,
      height: dims?.height ?? 720,
      bytes,
    };
  }

  async click(selector: string, point: BrowserPoint | undefined, key: string, signal?: AbortSignal): Promise<void> {
    if (point) {
      const entries = await this.runBatch(
        key,
        [
          ['mouse', 'move', String(point.x), String(point.y)],
          ['mouse', 'down'],
          ['mouse', 'up'],
        ],
        signal,
      );
      for (const entry of entries) this.expectSuccess(entry, 'click (point)');
      return;
    }
    const entries = await this.runBatch(key, [['click', selector]], signal);
    this.expectSuccess(entries[0], `click ${selector}`);
  }

  async type(selector: string, text: string, submit: boolean, key: string, signal?: AbortSignal): Promise<void> {
    const commands: (readonly string[])[] = [['fill', selector, text]];
    if (submit) commands.push(['press', 'Enter']);
    const entries = await this.runBatch(key, commands, signal);
    this.expectSuccess(entries[0], `type ${selector}`);
    if (submit) this.expectSuccess(entries[1], 'type (submit)');
  }

  async close(key?: string): Promise<void> {
    if (key) {
      this.agentRefsByKey.delete(key);
      try {
        await this.runBatch(key, [['close']], undefined);
      } catch {
        // Session may already be closed — closing is best-effort.
      }
      return;
    }
    this.agentRefsByKey.clear();
    try {
      await this.cli.run({ args: ['close', '--all'], timeoutMs: this.processTimeoutMs });
    } catch {
      // No daemons to close — best-effort.
    }
    rmSync(this.screenshotDir, { recursive: true, force: true });
  }

  async observe(key: string, signal?: AbortSignal): Promise<BrowserObserveResult> {
    const entries = await this.runBatch(
      key,
      [
        ['get', 'title'],
        ['snapshot', '-i'],
      ],
      signal,
    );
    this.expectSuccess(entries[0], 'observe (title)');
    this.expectSuccess(entries[1], 'observe');
    const result = entries[1]?.result ?? {};
    const title = typeof entries[0]?.result?.title === 'string' ? entries[0].result.title : '';
    const url = typeof result.origin === 'string' ? result.origin : '';
    const refs =
      result.refs && typeof result.refs === 'object'
        ? (result.refs as Record<string, { readonly name?: string; readonly role?: string }>)
        : {};
    const text = typeof result.snapshot === 'string' ? result.snapshot : '';
    const { elements, agentRefs } = this.buildElements(refs, text);
    this.agentRefsByKey.set(key, agentRefs);
    return {
      url,
      title,
      observationId: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      elements,
    };
  }

  async clickRef(ref: string, key: string, signal?: AbortSignal): Promise<void> {
    const agentRef = this.agentRefsByKey.get(key)?.get(ref);
    if (!agentRef) throw this.staleRefError(ref);
    const entries = await this.runBatch(key, [['click', `@${agentRef}`]], signal);
    this.expectSuccess(entries[0], `clickRef ${ref}`);
  }

  async typeRef(ref: string, text: string, submit: boolean, key: string, signal?: AbortSignal): Promise<void> {
    const agentRef = this.agentRefsByKey.get(key)?.get(ref);
    if (!agentRef) throw this.staleRefError(ref);
    const commands: (readonly string[])[] = [['fill', `@${agentRef}`, text]];
    if (submit) commands.push(['press', 'Enter']);
    const entries = await this.runBatch(key, commands, signal);
    this.expectSuccess(entries[0], `typeRef ${ref}`);
    if (submit) this.expectSuccess(entries[1], 'typeRef (submit)');
  }

  async scroll(direction: 'up' | 'down', amount: number, key: string, signal?: AbortSignal): Promise<void> {
    const entries = await this.runBatch(key, [['scroll', direction, String(amount)]], signal);
    this.expectSuccess(entries[0], 'scroll');
  }

  async back(key: string, signal?: AbortSignal): Promise<void> {
    await this.historyNavigation('back', key, signal);
  }

  async forward(key: string, signal?: AbortSignal): Promise<void> {
    await this.historyNavigation('forward', key, signal);
  }

  async reload(key: string, signal?: AbortSignal): Promise<void> {
    const entries = await this.runBatch(key, [['reload'], ['wait', '--load', 'load']], signal);
    this.expectSuccess(entries[0], 'reload');
    const waitState = classifyNavWait(entries[1]);
    if (waitState === 'error') {
      throw mapCliError(entries[1]?.error ?? 'reload (settle) failed');
    }
    if (waitState === 'suppressed' || waitState === 'transient') {
      await this.runBatch(
        key,
        [
          ['get', 'url'],
          ['get', 'title'],
        ],
        signal,
      );
    }
    this.agentRefsByKey.delete(key);
  }

  async waitForNavigation(key: string, signal?: AbortSignal): Promise<BrowserNavigationResult> {
    const entries = await this.runBatch(
      key,
      [
        ['wait', '--load', 'load'],
        ['get', 'url'],
        ['get', 'title'],
      ],
      signal,
    );
    const wait = entries[0];
    const url = typeof entries[1]?.result?.url === 'string' ? entries[1].result.url : '';
    const title = typeof entries[2]?.result?.title === 'string' ? entries[2].result.title : '';
    if (wait?.success !== true) {
      const waitState = classifyNavWait(wait);
      // bfcache restores (and committed navigations) may never fire `load`;
      // the URL/title entries in this same batch confirm the page landed.
      if (waitState === 'error') {
        throw mapCliError(wait?.error ?? 'wait for load failed without an error message');
      }
    }
    this.agentRefsByKey.delete(key);
    return { url, title };
  }

  // ─── Private helpers ────────────────────────────────────────

  private async runBatch(
    key: string,
    commands: readonly (readonly string[])[],
    signal?: AbortSignal,
  ): Promise<readonly AgentBrowserBatchEntry[]> {
    if (signal?.aborted) throw abortError();
    const output = await this.cli.run({
      args: ['--session', key, '--json', 'batch'],
      stdin: JSON.stringify(commands),
      signal,
      timeoutMs: this.processTimeoutMs,
    });
    return parseBatchOutput(output.stdout, commands[0]?.[0] ?? 'batch');
  }

  private expectSuccess(entry: AgentBrowserBatchEntry | undefined, description: string): void {
    if (!entry?.success) {
      throw mapCliError(entry?.error ?? `${description} failed without an error message`);
    }
  }

  private readNavResult(entry: AgentBrowserBatchEntry, fallbackUrl: string): BrowserNavigationResult {
    const result = entry.result ?? {};
    return {
      url: typeof result.url === 'string' ? result.url : fallbackUrl,
      title: typeof result.title === 'string' ? result.title : '',
    };
  }

  private async historyNavigation(direction: 'back' | 'forward', key: string, signal?: AbortSignal): Promise<void> {
    const entries = await this.runBatch(key, [[direction], ['wait', '--load', 'load']], signal);
    const first = entries[0];
    const wait = entries[1];
    if (first?.success === true) {
      // The navigation committed. The settle-wait may time out when the page was
      // restored from the back-forward cache (no load event) — still a success.
      const waitState = classifyNavWait(wait);
      if (waitState === 'error') {
        throw mapCliError(wait?.error ?? `${direction} failed`);
      }
      if (waitState === 'suppressed' || waitState === 'transient') {
        // Confirm the daemon still owns a live page before returning.
        await this.runBatch(
          key,
          [
            ['get', 'url'],
            ['get', 'title'],
          ],
          signal,
        );
      }
      this.agentRefsByKey.delete(key);
      return;
    }
    if (TRANSIENT_NAVIGATION_ERROR.test(first?.error ?? '')) {
      // The navigation itself proceeded — the daemon just lost its evaluation
      // context mid-navigation. Confirm the page settled instead of failing.
      await this.runBatch(
        key,
        [
          ['get', 'url'],
          ['get', 'title'],
        ],
        signal,
      );
      this.agentRefsByKey.delete(key);
      return;
    }
    throw mapCliError(first?.error ?? `${direction} failed`);
  }

  private buildElements(
    refs: Readonly<Record<string, { readonly name?: string; readonly role?: string }>>,
    textSnapshot: string,
  ): { readonly elements: BrowserElementRef[]; readonly agentRefs: Map<string, string> } {
    const lineByRef = new Map<string, SnapshotTextLine>();
    for (const line of textSnapshot.split('\n')) {
      const parsed = parseSnapshotLine(line);
      const ref = parsed?.attrs.ref;
      if (!ref) continue;
      lineByRef.set(ref, parsed);
    }

    const elements: BrowserElementRef[] = [];
    const agentRefs = new Map<string, string>();
    const keys = Object.keys(refs).sort((a, b) => Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10));

    keys.forEach((agentKey, index) => {
      const spec = refs[agentKey] ?? {};
      const line = lineByRef.get(agentKey);
      const attrs = line?.attrs ?? {};
      const role = spec.role ?? line?.role ?? '';
      const name = spec.name ?? line?.name ?? '';
      const ref = `ref-${index}`;
      agentRefs.set(ref, agentKey);

      let level: number | undefined;
      const levelRaw = attrs.level;
      if (levelRaw !== undefined) {
        const parsedLevel = Number.parseInt(levelRaw, 10);
        if (!Number.isNaN(parsedLevel)) level = parsedLevel;
      }
      let checked: boolean | undefined;
      if (attrs.checked === 'true') checked = true;
      else if (attrs.checked === 'false') checked = false;
      const disabled = attrs.disabled !== undefined;
      let expanded: boolean | undefined;
      if (attrs.expanded === 'true') expanded = true;
      else if (attrs.expanded === 'false') expanded = false;
      const value =
        (role === 'combobox' ||
          role === 'searchbox' ||
          role === 'textbox' ||
          role === 'spinbutton' ||
          role === 'slider') &&
        line?.value !== undefined
          ? line.value
          : undefined;

      const element: BrowserElementRef = {
        ref,
        role,
        name,
        ...(level !== undefined ? { level } : {}),
        ...(checked !== undefined ? { checked } : {}),
        ...(disabled ? { disabled } : {}),
        ...(expanded !== undefined ? { expanded } : {}),
        ...(value !== undefined ? { value } : {}),
      };
      elements.push(element);
    });

    return { elements, agentRefs };
  }

  private staleRefError(ref: string): Error {
    const error = new Error(`STALE_ELEMENT_REFERENCE: ref "${ref}" is not bound to a live element — observe again`);
    error.name = 'StaleElementReferenceError';
    return error;
  }

  private async waitForStability(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw abortError();
    if (!signal) {
      await new Promise((resolve) => setTimeout(resolve, this.stabilityDelayMs));
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, this.stabilityDelayMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
