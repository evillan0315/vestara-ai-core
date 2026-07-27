import type { HealthDependency, RuntimeId } from '@vestara/types';
import { Runtime, type RuntimeConfig, type RuntimeHooks } from '../index';

export interface LockState {
  held: boolean;
  holder: string | null;
  acquiredAt: string | null;
}

export interface FileChange {
  path: string;
  type: 'create' | 'modify' | 'delete';
  timestamp: string;
}

export class RepositoryRuntime extends Runtime {
  private _lock: LockState = { held: false, holder: null, acquiredAt: null };
  private _gitRuntimeId: RuntimeId | null = null;
  private _memoryRuntimeId: RuntimeId | null = null;
  private _pendingChanges: FileChange[] = [];

  constructor(config: RuntimeConfig, gitRuntimeId?: RuntimeId, memoryRuntimeId?: RuntimeId, hooks?: RuntimeHooks) {
    super(config, {
      onInitialize: async () => {
        this._gitRuntimeId = gitRuntimeId ?? null;
        this._memoryRuntimeId = memoryRuntimeId ?? null;
        if (this._gitRuntimeId) {
          this.addDependency({
            id: this._gitRuntimeId,
            status: 'healthy',
            latency: 0,
            lastChecked: new Date().toISOString(),
          });
        }
        if (this._memoryRuntimeId) {
          this.addDependency({
            id: this._memoryRuntimeId,
            status: 'healthy',
            latency: 0,
            lastChecked: new Date().toISOString(),
          });
        }
        if (hooks?.onInitialize) await hooks.onInitialize();
      },
      onStop: async () => {
        if (this._lock.held) await this.unlock();
        this._pendingChanges = [];
        if (hooks?.onStop) await hooks.onStop();
      },
      onSuspend: hooks?.onSuspend,
      onResume: hooks?.onResume,
      onDestroy: hooks?.onDestroy,
    });
  }

  get isLocked(): boolean {
    return this._lock.held;
  }

  get lockHolder(): string | null {
    return this._lock.holder;
  }

  get pendingChanges(): readonly FileChange[] {
    return [...this._pendingChanges];
  }

  async lock(holder: string, ttlMs = 30_000): Promise<boolean> {
    if (this._lock.held) return false;
    this._lock = { held: true, holder, acquiredAt: new Date().toISOString() };
    setTimeout(() => {
      if (this._lock.holder === holder) {
        void this.unlock();
      }
    }, ttlMs);
    return true;
  }

  async unlock(): Promise<void> {
    this._lock = { held: false, holder: null, acquiredAt: null };
  }

  recordChange(path: string, type: FileChange['type']): void {
    this._pendingChanges.push({ path, type, timestamp: new Date().toISOString() });
    this.checkpoint('last-change', { path, type });
  }

  flushChanges(): FileChange[] {
    const changes = [...this._pendingChanges];
    this._pendingChanges = [];
    return changes;
  }

  updateDependencyHealth(id: RuntimeId, status: HealthDependency['status'], latency: number): void {
    this.addDependency({ id, status, latency, lastChecked: new Date().toISOString() });
  }
}
