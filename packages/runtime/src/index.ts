import type { EventBus } from '@vestara/events';
import { createEvent, RuntimeEventTypes } from '@vestara/events';
import type { PermissionManager } from '@vestara/permissions';
import { getRuntimeDefinition } from '@vestara/registry';
import type { StateMachine } from '@vestara/state-machine';
import { createStateMachine } from '@vestara/state-machine';
import type {
  HealthDependency,
  HealthStatus,
  RuntimeHealth,
  RuntimeId,
  RuntimeInfo,
  RuntimeLifecycleConfig,
  RuntimeMetadata,
  RuntimeState,
  RuntimeType,
  Timestamp,
} from '@vestara/types';

export type {
  HealthDependency,
  HealthStatus,
  RuntimeHealth,
  RuntimeId,
  RuntimeInfo,
  RuntimeLifecycleConfig,
  RuntimeMetadata,
  RuntimeState,
  RuntimeType,
};

const RUNTIME_TRANSITIONS: Record<RuntimeState, readonly RuntimeState[]> = {
  created: ['initializing'],
  initializing: ['running', 'failed', 'degraded'],
  running: ['suspended', 'degraded', 'stopping', 'failed'],
  suspended: ['running', 'recovering', 'stopping'],
  degraded: ['running', 'recovering', 'quarantined', 'stopping', 'failed'],
  recovering: ['running', 'degraded', 'quarantined', 'failed', 'stopping'],
  quarantined: ['recovering', 'stopping', 'destroyed'],
  stopping: ['stopped', 'failed'],
  stopped: ['initializing', 'destroyed', 'failed'],
  failed: ['destroyed', 'initializing'],
  destroyed: [],
};

export interface RuntimeConfig {
  id: RuntimeId;
  type: RuntimeType;
  name?: string;
  description?: string;
  metadata?: RuntimeMetadata;
  eventBus?: EventBus;
  permissionManager?: PermissionManager;
  lifecycleConfig?: RuntimeLifecycleConfig;
  initialState?: RuntimeState;
  capabilities?: string[];
}

export interface RuntimeHooks {
  onInitialize?: () => Promise<void> | void;
  onStart?: () => Promise<void> | void;
  onSuspend?: () => Promise<void> | void;
  onResume?: () => Promise<void> | void;
  onDegrade?: (checks: string[]) => Promise<void> | void;
  onRecover?: () => Promise<void> | void;
  onQuarantine?: (reason: string) => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  onDestroy?: () => Promise<void> | void;
}

export class Runtime {
  readonly id: RuntimeId;
  readonly type: RuntimeType;
  readonly createdAt: Timestamp;

  private _runtimeDefinition: ReturnType<typeof getRuntimeDefinition>;
  private _stateMachine: StateMachine<RuntimeState>;
  private _health: RuntimeHealth;
  private _metadata: RuntimeMetadata;
  private _lifecycleConfig: RuntimeLifecycleConfig;
  private _capabilities: string[];
  private _hooks: RuntimeHooks;
  private _eventBus?: EventBus;
  private _permissionManager?: PermissionManager;
  private _startedAt: Timestamp | null = null;
  private _error: string | null = null;
  private _dependencies: HealthDependency[] = [];
  private _checkpointData: Map<string, unknown> = new Map();
  private _healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _disposed = false;

  constructor(config: RuntimeConfig, hooks?: RuntimeHooks) {
    this.id = config.id;
    this.type = config.type;
    this.createdAt = new Date().toISOString() as Timestamp;
    this._runtimeDefinition = getRuntimeDefinition(this.type);
    this._metadata = config.metadata ?? {};
    this._lifecycleConfig = config.lifecycleConfig ?? this._runtimeDefinition.lifecycle;
    this._capabilities = config.capabilities ?? [...this._runtimeDefinition.capabilities];
    this._eventBus = config.eventBus;
    this._permissionManager = config.permissionManager;
    this._hooks = hooks ?? {};

    const initialState = config.initialState ?? 'created';
    this._stateMachine = createStateMachine<RuntimeState>({
      initial: initialState,
      states: RUNTIME_TRANSITIONS,
    });

    this._health = {
      status: 'healthy',
      serviceId: this.id,
      runtimeType: this.type,
      version: this._runtimeDefinition.version,
      uptime: 0,
      lastHealthCheck: new Date().toISOString() as Timestamp,
      dependencies: [],
    };

    this._stateMachine.subscribe((t) => {
      this._health.uptime = this._startedAt ? Date.now() - new Date(this._startedAt).getTime() : 0;
      this._health.lastHealthCheck = new Date().toISOString() as Timestamp;
      this.emitRuntimeEvent(RuntimeEventTypes.HealthChanged, {
        runtimeId: this.id,
        runtimeType: this.type,
        previous: t.from,
        current: t.to,
      });
    });
  }

  get state(): RuntimeState {
    return this._stateMachine.state;
  }

  get health(): RuntimeHealth {
    return { ...this._health, uptime: this._health.uptime };
  }

  get metadata(): RuntimeMetadata {
    return { ...this._metadata };
  }

  get capabilities(): readonly string[] {
    return [...this._capabilities];
  }

  get error(): string | null {
    return this._error;
  }

  get startedAt(): Timestamp | null {
    return this._startedAt;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  get info(): RuntimeInfo {
    return {
      id: this.id,
      type: this.type,
      state: this.state,
      health: this.health,
      metadata: this.metadata,
      startedAt: this._startedAt,
    };
  }

  setEventBus(bus: EventBus): void {
    this._eventBus = bus;
  }

  setPermissionManager(pm: PermissionManager): void {
    this._permissionManager = pm;
  }

  protected emitRuntimeEvent(
    type: string,
    payload: Record<string, unknown>,
    severity: 'debug' | 'info' | 'warning' | 'error' | 'critical' = 'info',
  ): void {
    if (!this._eventBus) return;
    const event = createEvent(type, 1, payload, `runtime:${this.type}`, {
      runtimeId: this.id,
      severity,
    });
    void this._eventBus.emit(event);
  }

  private async transition(target: RuntimeState, error?: string): Promise<void> {
    if (this._disposed) return;
    if (!this._stateMachine.canTransition(target)) return;
    if (error) this._error = error;
    this._stateMachine.transition(target);
  }

  async initialize(): Promise<void> {
    if (this._disposed) throw new Error(`Runtime ${this.id} is disposed`);
    if (this.state !== 'created') throw new Error(`Runtime ${this.id} is in state ${this.state}, expected 'created'`);

    await this.transition('initializing');
    this.emitRuntimeEvent(RuntimeEventTypes.Initializing, {
      runtimeId: this.id,
      previousState: 'created',
      currentState: 'initializing',
    });

    try {
      if (this._hooks.onInitialize) await this._hooks.onInitialize();
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
      this.emitRuntimeEvent(RuntimeEventTypes.Failed, {
        runtimeId: this.id,
        runtimeType: this.type,
        error: this._error,
        previousState: 'initializing',
      });
      await this.transition('failed', this._error);
      return;
    }

    this._startedAt = new Date().toISOString() as Timestamp;
    await this.transition('running');
    this.emitRuntimeEvent(RuntimeEventTypes.Started, {
      runtimeId: this.id,
      runtimeType: this.type,
      health: this._health,
    });
  }

  async start(): Promise<void> {
    if (this.state === 'created') return this.initialize();
    if (this.state === 'stopped') return this.initialize();
    throw new Error(`Runtime ${this.id} cannot be started from state ${this.state}`);
  }

  async suspend(): Promise<void> {
    if (this.state !== 'running' && this.state !== 'degraded') {
      throw new Error(`Runtime ${this.id} cannot be suspended from state ${this.state}`);
    }

    await this.transition('suspended');
    this.emitRuntimeEvent(RuntimeEventTypes.Suspended, {
      runtimeId: this.id,
      previousState: this.state,
      currentState: 'suspended',
    });

    if (this._hooks.onSuspend) await this._hooks.onSuspend();
  }

  async resume(): Promise<void> {
    if (this.state !== 'suspended') {
      throw new Error(`Runtime ${this.id} cannot be resumed from state ${this.state}`);
    }

    await this.transition('running');
    this.emitRuntimeEvent(RuntimeEventTypes.Resumed, {
      runtimeId: this.id,
      previousState: 'suspended',
      currentState: 'running',
    });

    if (this._hooks.onResume) await this._hooks.onResume();
  }

  async degrade(checks: string[]): Promise<void> {
    if (this.state !== 'running') return;

    this._health = { ...this._health, status: 'degraded' };
    await this.transition('degraded');
    this.emitRuntimeEvent(RuntimeEventTypes.Degraded, {
      runtimeId: this.id,
      runtimeType: this.type,
      checks,
      severity: 'warning',
    });

    if (this._hooks.onDegrade) await this._hooks.onDegrade(checks);
  }

  async recover(): Promise<void> {
    if (this.state !== 'degraded' && this.state !== 'suspended' && this.state !== 'quarantined') {
      throw new Error(`Runtime ${this.id} cannot recover from state ${this.state}`);
    }

    await this.transition('recovering');
    this.emitRuntimeEvent(RuntimeEventTypes.Recovering, {
      runtimeId: this.id,
      runtimeType: this.type,
      attempt: 1,
      maxAttempts: this._lifecycleConfig.maxRecoveryAttempts,
    });

    try {
      if (this._hooks.onRecover) await this._hooks.onRecover();
      await this.transition('running');
      this._health = { ...this._health, status: 'healthy' };
    } catch {
      await this.transition('degraded');
    }
  }

  async quarantine(reason: string): Promise<void> {
    if (this.state !== 'degraded' && this.state !== 'recovering') {
      throw new Error(`Runtime ${this.id} cannot be quarantined from state ${this.state}`);
    }

    await this.transition('quarantined');
    this.emitRuntimeEvent(RuntimeEventTypes.Quarantined, {
      runtimeId: this.id,
      runtimeType: this.type,
      failureCount: this._lifecycleConfig.maxRecoveryAttempts,
      reason,
    });

    if (this._hooks.onQuarantine) await this._hooks.onQuarantine(reason);
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped' || this.state === 'destroyed') return;

    const validStates: RuntimeState[] = ['running', 'suspended', 'degraded', 'recovering', 'quarantined', 'stopped'];
    if (!validStates.includes(this.state)) {
      throw new Error(`Runtime ${this.id} cannot be stopped from state ${this.state}`);
    }

    const prevState = this.state;
    await this.transition('stopping');
    this.emitRuntimeEvent(RuntimeEventTypes.Stopping, {
      runtimeId: this.id,
      previousState: prevState,
      currentState: 'stopping',
    });

    try {
      if (this._hooks.onStop) await this._hooks.onStop();
      await this.transition('stopped');
      this.emitRuntimeEvent(RuntimeEventTypes.Stopped, {
        runtimeId: this.id,
        previousState: 'stopping',
        currentState: 'stopped',
      });
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
      this.emitRuntimeEvent(RuntimeEventTypes.Failed, {
        runtimeId: this.id,
        runtimeType: this.type,
        error: this._error,
        previousState: 'stopping',
      });
      await this.transition('failed', this._error);
    }
  }

  async destroy(): Promise<void> {
    if (this._disposed) return;

    if (this.state !== 'stopped' && this.state !== 'failed' && this.state !== 'quarantined') {
      await this.stop();
    }

    const uptime = this._startedAt ? Date.now() - new Date(this._startedAt).getTime() : 0;
    await this.transition('destroyed');
    this.emitRuntimeEvent(RuntimeEventTypes.Destroyed, {
      runtimeId: this.id,
      runtimeType: this.type,
      uptime,
    });

    if (this._hooks.onDestroy) await this._hooks.onDestroy();
    this._disposed = true;
  }

  checkPermission(operation: string, targetType: string, targetId: string): boolean {
    if (!this._permissionManager) return true;
    return this._permissionManager.check({
      actor: this.id,
      operation: operation as any,
      targetType,
      targetId,
    });
  }

  checkpoint(key: string, data: unknown): void {
    this._checkpointData.set(key, data);
  }

  getCheckpoint(key: string): unknown | undefined {
    return this._checkpointData.get(key);
  }

  clearCheckpoints(): void {
    this._checkpointData.clear();
  }

  addDependency(dep: HealthDependency): void {
    const idx = this._dependencies.findIndex((d) => d.id === dep.id);
    if (idx >= 0) {
      this._dependencies[idx] = dep;
    } else {
      this._dependencies.push(dep);
    }
    this._health = { ...this._health, dependencies: [...this._dependencies] };
  }

  removeDependency(id: RuntimeId): void {
    this._dependencies = this._dependencies.filter((d) => d.id !== id);
    this._health = { ...this._health, dependencies: [...this._dependencies] };
  }

  updateHealthStatus(status: HealthStatus): void {
    this._health = { ...this._health, status };
  }

  protected startPeriodicHealthCheck(checkFn: () => Promise<void> | void, intervalMs = 30_000): void {
    this.stopPeriodicHealthCheck();
    this._healthCheckTimer = setInterval(() => {
      void checkFn();
    }, intervalMs);
  }

  protected stopPeriodicHealthCheck(): void {
    if (this._healthCheckTimer) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }
  }
}
