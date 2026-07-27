import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { ServiceRegistry } from '@vestara/service-registry';
import type { HealthStatus, ServiceStatus } from '@vestara/shared';

export interface SubsystemOptions {
  eventBus: EventBus;
  logger: Logger;
  registry: ServiceRegistry;
}

export interface SubsystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  metrics?: Record<string, number>;
}

export type SubsystemLifecycleHook =
  | 'pre-init'
  | 'post-init'
  | 'pre-start'
  | 'post-start'
  | 'pre-stop'
  | 'post-stop'
  | 'pre-dispose';

export interface SubsystemDefinition {
  id: string;
  version: string;
  name: string;
  description: string;
  capabilities: string[];
  dependencies: string[];
  permissions: string[];
}

export abstract class Subsystem {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: string[];
  readonly dependencies: string[];
  readonly permissions: string[];

  protected _status: ServiceStatus = 'uninitialized';
  protected eventBus: EventBus;
  protected logger: Logger;
  protected registry: ServiceRegistry;
  protected hooks: Map<SubsystemLifecycleHook, () => Promise<void>> = new Map();
  private _startTime = 0;

  constructor(def: SubsystemDefinition, opts: SubsystemOptions) {
    this.id = def.id;
    this.version = def.version;
    this.name = def.name;
    this.description = def.description;
    this.capabilities = def.capabilities;
    this.dependencies = def.dependencies;
    this.permissions = def.permissions;
    this.eventBus = opts.eventBus;
    this.logger = opts.logger.child({ component: `subsystem:${def.id}` });
    this.registry = opts.registry;
  }

  get status(): ServiceStatus {
    return this._status;
  }

  get uptime(): number {
    return this._startTime > 0 ? Math.floor((Date.now() - this._startTime) / 1000) : 0;
  }

  on(hook: SubsystemLifecycleHook, fn: () => Promise<void>): void {
    this.hooks.set(hook, fn);
  }

  async initialize(config?: Record<string, unknown>): Promise<void> {
    this._status = 'initializing';
    await this.runHook('pre-init');
    await this.onInitialize(config);
    await this.runHook('post-init');
    this._status = 'initialized';
  }

  async start(): Promise<void> {
    this._status = 'starting';
    this._startTime = Date.now();
    await this.runHook('pre-start');
    await this.onStart();
    await this.runHook('post-start');
    this._status = 'running';
    this.logger.info('Subsystem started');
  }

  async stop(): Promise<void> {
    this._status = 'stopping';
    await this.runHook('pre-stop');
    await this.onStop();
    await this.runHook('post-stop');
    this._status = 'stopped';
  }

  async dispose(): Promise<void> {
    await this.runHook('pre-dispose');
    await this.onDispose();
    this._status = 'disposed';
  }

  async health(): Promise<HealthStatus> {
    const h = await this.onHealth();
    return {
      status: h.status,
      serviceId: this.id,
      version: this.version,
      uptime: this.uptime,
      lastHealthCheck: new Date().toISOString(),
      dependencies: [],
      message: h.message,
    };
  }

  protected abstract onInitialize(config?: Record<string, unknown>): Promise<void>;
  protected abstract onStart(): Promise<void>;
  protected abstract onStop(): Promise<void>;
  protected abstract onDispose(): Promise<void>;
  protected abstract onHealth(): Promise<SubsystemHealth>;

  protected async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.eventBus.emit({
      type: `subsystem:${this.id}:${type}`,
      source: `subsystem:${this.id}`,
      payload,
    });
  }

  private async runHook(hook: SubsystemLifecycleHook): Promise<void> {
    const fn = this.hooks.get(hook);
    if (fn) await fn();
  }
}
