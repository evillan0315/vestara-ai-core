import { type ChildProcess, spawn } from 'node:child_process';
import { Runtime, type RuntimeConfig, type RuntimeHooks } from '../index';

// ─── State machine ────────────────────────────────────────────────

export type TuiRuntimeState =
  | 'created'
  | 'resolving'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'unavailable';

export type TuiRuntimeEventType =
  | 'tui.runtime.resolving'
  | 'tui.runtime.starting'
  | 'tui.runtime.started'
  | 'tui.runtime.stopping'
  | 'tui.runtime.stopped'
  | 'tui.runtime.failed'
  | 'tui.runtime.unavailable';

export interface TuiRuntimeFailure {
  readonly code: string;
  readonly message: string;
}

export interface TuiProcessSnapshot {
  readonly runtimeId: string;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly executablePath: string;
  readonly pid?: number;
  readonly state: TuiRuntimeState;
  readonly startedAt?: string;
  readonly stoppedAt?: string;
  readonly exitCode?: number;
  readonly signal?: NodeJS.Signals;
  readonly failure?: TuiRuntimeFailure;
}

export interface TuiSpawnOptions {
  readonly packageId: string;
  readonly packageVersion: string;
  readonly executablePath: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
  /** Graceful-shutdown wait in ms before forced termination. */
  readonly shutdownTimeoutMs?: number;
  readonly restart?: boolean;
}

export interface TuiRuntimeHooks extends RuntimeHooks {
  onEvent?: (type: TuiRuntimeEventType, snapshot: TuiProcessSnapshot) => void;
  onSpawned?: (snapshot: TuiProcessSnapshot) => void;
  onExited?: (snapshot: TuiProcessSnapshot) => void;
}

// ─── Runtime ──────────────────────────────────────────────────────

export class TuiRuntime extends Runtime {
  private readonly _tuiHooks: TuiRuntimeHooks;
  private _packageId = '';
  private _packageVersion = '';
  private _executablePath = '';
  private _pid: number | undefined;
  private _processStartedAt: string | undefined;
  private _stoppedAt: string | undefined;
  private _exitCode: number | undefined;
  private _signal: NodeJS.Signals | undefined;
  private _failure: TuiRuntimeFailure | undefined;
  private _process: ChildProcess | undefined;
  private _restart = false;
  private _spawnCount = 0;
  private readonly _shutdownTimeoutMs: number;

  constructor(config: RuntimeConfig, hooks?: TuiRuntimeHooks, options: { shutdownTimeoutMs?: number } = {}) {
    super(config, {
      onInitialize: async () => {
        if (hooks?.onInitialize) await hooks.onInitialize();
      },
      onStop: async () => {
        await this.stopProcess();
        if (hooks?.onStop) await hooks.onStop();
      },
      onDestroy: hooks?.onDestroy,
    });
    this._tuiHooks = hooks ?? {};
    this._shutdownTimeoutMs = options.shutdownTimeoutMs ?? 5000;
  }

  get processSnapshot(): TuiProcessSnapshot {
    return {
      runtimeId: this.id,
      packageId: this._packageId,
      packageVersion: this._packageVersion,
      executablePath: this._executablePath,
      pid: this._pid,
      state: this.clientState,
      startedAt: this._processStartedAt,
      stoppedAt: this._stoppedAt,
      exitCode: this._exitCode,
      signal: this._signal,
      failure: this._failure,
    };
  }

  get clientState(): TuiRuntimeState {
    if (this.state === 'created') return 'created';
    if (this.state === 'running') {
      if (this._process && this._process.exitCode === null) return 'running';
      return this._restart ? 'starting' : 'stopped';
    }
    if (this.state === 'degraded') return 'failed';
    return this.state as TuiRuntimeState;
  }

  get spawnCount(): number {
    return this._spawnCount;
  }

  get hasActiveProcess(): boolean {
    return Boolean(this._process && this._pid !== undefined && this._process.exitCode === null);
  }

  // ─── Launch ─────────────────────────────────────────────────────

  async launch(options: TuiSpawnOptions): Promise<TuiProcessSnapshot> {
    if (this.state !== 'running') throw new Error(`TuiRuntime must be running to launch (state: ${this.state})`);
    this.stopProcess();
    this._packageId = options.packageId;
    this._packageVersion = options.packageVersion;
    this._executablePath = options.executablePath;
    this._restart = options.restart ?? false;
    this._spawnCount += 1;
    this._pid = undefined;
    this._failure = undefined;
    this._signal = undefined;
    this._exitCode = undefined;

    this.emitLifecycle('tui.runtime.resolving');
    const processHandle = spawn(options.executablePath, [...(options.args ?? [])], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
    });
    this._process = processHandle;
    this._pid = processHandle.pid;
    this._processStartedAt = new Date().toISOString();
    this.emitLifecycle('tui.runtime.starting');
    this._tuiHooks.onSpawned?.(this.processSnapshot);
    this.emitLifecycle('tui.runtime.started');

    processHandle.once('exit', (code, signal) => {
      this._exitCode = code ?? undefined;
      this._signal = signal ?? undefined;
      this._stoppedAt = new Date().toISOString();
      this._pid = undefined;
      const snapshot = this.processSnapshot;
      if (this._restart && this.state === 'running' && !this._stopping) {
        void this.launch(options).catch(() => {});
        return;
      }
      this.emitLifecycle('tui.runtime.stopped');
      this._tuiHooks.onExited?.(snapshot);
    });

    processHandle.once('error', (error) => {
      this._failure = { code: 'spawn-failed', message: error.message };
      this.emitLifecycle('tui.runtime.failed');
    });

    return this.processSnapshot;
  }

  private _stopping = false;

  async stopProcess(): Promise<TuiProcessSnapshot> {
    const processHandle = this._process;
    if (!processHandle || this._stopping) return this.processSnapshot;
    this._stopping = true;
    this.emitLifecycle('tui.runtime.stopping');
    const exitPromise = new Promise<void>((resolve) => {
      processHandle.once('exit', () => resolve());
    });
    try {
      processHandle.kill('SIGTERM');
      await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, this._shutdownTimeoutMs))]);
      if (processHandle.exitCode === null) {
        processHandle.kill('SIGKILL');
        await Promise.race([exitPromise, new Promise((resolve) => setTimeout(resolve, 1000))]);
      }
    } catch {
      // Process already gone.
    }
    this._process = undefined;
    this._stopping = false;
    return this.processSnapshot;
  }

  forceTerminate(): void {
    if (this._process && this._process.exitCode === null) {
      this._process.kill('SIGKILL');
    }
  }

  markUnavailable(reason: string): void {
    this._failure = { code: 'unavailable', message: reason };
    this.emitLifecycle('tui.runtime.unavailable');
  }

  private emitLifecycle(type: TuiRuntimeEventType): void {
    this._tuiHooks.onEvent?.(type, this.processSnapshot);
  }
}
