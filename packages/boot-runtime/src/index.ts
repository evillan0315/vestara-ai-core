import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { EventBus } from '@vestara/event-bus';
import { Runtime } from '@vestara/runtime';
import type { RuntimeId } from '@vestara/types';

export const BOOT_STAGES = [
  'firmware-complete',
  'host-started',
  'storage-mounted',
  'identity-loaded',
  'services-started',
  'runtime-composed',
  'health-verified',
  'workspace-ready',
] as const;

export type BootStage = (typeof BOOT_STAGES)[number] | 'recovery';
export type BootStateStatus = 'booting' | 'ready' | 'recovery' | 'failed';

export interface BootTransition {
  readonly stage: BootStage;
  readonly timestamp: string;
  readonly detail?: string;
}

export interface BootState {
  readonly bootId: string;
  readonly status: BootStateStatus;
  readonly currentStage: BootStage;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
  readonly transitions: readonly BootTransition[];
  readonly failure?: string;
}

export interface BootStateStore {
  load(): Promise<BootState | undefined>;
  save(state: BootState): Promise<void>;
}

export class FileBootStateStore implements BootStateStore {
  constructor(private readonly file: string) {}

  async load(): Promise<BootState | undefined> {
    try {
      return JSON.parse(await fs.readFile(this.file, 'utf8')) as BootState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async save(state: BootState): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, this.file);
  }
}

export class MemoryBootStateStore implements BootStateStore {
  private state?: BootState;
  async load(): Promise<BootState | undefined> {
    return this.state;
  }
  async save(state: BootState): Promise<void> {
    this.state = structuredClone(state);
  }
}

export interface BootRuntimeOptions {
  readonly store: BootStateStore;
  readonly eventBus?: EventBus;
  readonly now?: () => Date;
  readonly bootId?: string;
}

export class BootRuntime extends Runtime {
  private readonly store: BootStateStore;
  private readonly now: () => Date;
  private readonly bootId: string;
  private bootState?: BootState;
  private previousBoot?: BootState;

  constructor(options: BootRuntimeOptions) {
    super({
      id: 'boot-runtime' as RuntimeId,
      type: 'boot',
      eventBus: options.eventBus,
      capabilities: ['boot:observe', 'boot:transition', 'boot:recover'],
      metadata: { displayName: 'Boot Runtime', description: 'Durable Vestara host-mode boot coordinator' },
    });
    this.store = options.store;
    this.now = options.now ?? (() => new Date());
    this.bootId = options.bootId ?? `boot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  override async initialize(): Promise<void> {
    this.previousBoot = await this.store.load();
    await super.initialize();
    const now = this.now().toISOString();
    this.bootState = {
      bootId: this.bootId,
      status: 'booting',
      currentStage: 'firmware-complete',
      startedAt: now,
      updatedAt: now,
      transitions: [{ stage: 'firmware-complete', timestamp: now }],
    };
    await this.persistAndEmit('boot.stage.changed');
  }

  current(): BootState {
    if (!this.bootState) throw new Error('Boot Runtime is not initialized');
    return structuredClone(this.bootState);
  }

  lastBoot(): BootState | undefined {
    return this.previousBoot ? structuredClone(this.previousBoot) : undefined;
  }

  async advance(stage: Exclude<BootStage, 'recovery'>, detail?: string): Promise<BootState> {
    const current = this.current();
    if (current.status !== 'booting') throw new Error(`Cannot advance boot in ${current.status} state`);
    const from = BOOT_STAGES.indexOf(current.currentStage as (typeof BOOT_STAGES)[number]);
    const to = BOOT_STAGES.indexOf(stage);
    if (to < 0 || to !== from + 1) throw new Error(`Invalid boot transition: ${current.currentStage} -> ${stage}`);
    const timestamp = this.now().toISOString();
    this.bootState = {
      ...current,
      currentStage: stage,
      status: stage === 'workspace-ready' ? 'ready' : 'booting',
      updatedAt: timestamp,
      completedAt: stage === 'workspace-ready' ? timestamp : undefined,
      transitions: [...current.transitions, { stage, timestamp, detail }],
    };
    await this.persistAndEmit(stage === 'workspace-ready' ? 'boot.completed' : 'boot.stage.changed');
    return this.current();
  }

  async enterRecovery(reason: string): Promise<BootState> {
    const current = this.current();
    const timestamp = this.now().toISOString();
    this.bootState = {
      ...current,
      status: 'recovery',
      currentStage: 'recovery',
      updatedAt: timestamp,
      failure: reason,
      transitions: [...current.transitions, { stage: 'recovery', timestamp, detail: reason }],
    };
    this.updateHealthStatus('degraded');
    await this.persistAndEmit('boot.recovery.entered', 'warning');
    return this.current();
  }

  async fail(reason: string): Promise<BootState> {
    const current = this.current();
    const timestamp = this.now().toISOString();
    this.bootState = { ...current, status: 'failed', updatedAt: timestamp, failure: reason };
    this.updateHealthStatus('unhealthy');
    await this.persistAndEmit('boot.failed', 'error');
    return this.current();
  }

  private async persistAndEmit(type: string, severity: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
    const state = this.current();
    await this.store.save(state);
    this.emitRuntimeEvent(type, { bootId: state.bootId, stage: state.currentStage, status: state.status }, severity);
  }
}
