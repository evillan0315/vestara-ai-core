import type { Scheduler } from '@vestara/scheduler';
import type { Worker } from '@vestara/worker';
import { FailureBudget } from './failure-budget';

export interface QuarantinedWorker {
  readonly workerId: string;
  readonly worker: Worker;
  readonly quarantinedAt: string;
  readonly reason: string;
  readonly releaseAfterMs: number;
}

export interface WorkerQuarantineOptions {
  readonly releaseAfterMs?: number;
}

export interface WorkerManager {
  register(worker: Worker): void;
  unregister(workerId: string): void;
  get(workerId: string): Worker | undefined;
  list(): Worker[];
  count(): number;
  /** Quarantine a worker: remove from scheduling until released or expiry. */
  quarantine(workerId: string, reason: string, options?: WorkerQuarantineOptions): boolean;
  /** Release a quarantined worker back to scheduling. */
  release(workerId: string): boolean;
  /** Quarantined worker metadata. */
  quarantined(workerId: string): QuarantinedWorker | undefined;
  /** Workers currently quarantined (expired entries auto-released). */
  listQuarantined(): QuarantinedWorker[];
  /** Failure budget for a worker (created on first access). */
  failureBudgetFor(workerId: string): FailureBudget;
}

const DEFAULT_RELEASE_AFTER_MS = 30_000;

export class DefaultWorkerManager implements WorkerManager {
  private readonly _scheduler: Scheduler;
  private readonly _quarantined = new Map<string, QuarantinedWorker>();
  private readonly _budgets = new Map<string, FailureBudget>();
  private readonly _defaultReleaseAfterMs: number;

  constructor(scheduler: Scheduler, options?: WorkerQuarantineOptions) {
    this._scheduler = scheduler;
    this._defaultReleaseAfterMs = options?.releaseAfterMs ?? DEFAULT_RELEASE_AFTER_MS;
  }

  register(worker: Worker): void {
    this._scheduler.registerWorker(worker);
  }

  unregister(workerId: string): void {
    this._scheduler.unregisterWorker(workerId);
    this._budgets.delete(workerId);
  }

  get(workerId: string): Worker | undefined {
    return this._scheduler.getWorker(workerId);
  }

  list(): Worker[] {
    return this._scheduler.listWorkers();
  }

  count(): number {
    return this._scheduler.listWorkers().length;
  }

  quarantine(workerId: string, reason: string, options?: WorkerQuarantineOptions): boolean {
    this.sweepExpired();
    const worker = this._scheduler.getWorker(workerId);
    if (!worker) return false;
    if (this._quarantined.has(workerId)) return false;
    this._scheduler.unregisterWorker(workerId);
    this._quarantined.set(workerId, {
      workerId,
      worker,
      quarantinedAt: new Date().toISOString(),
      reason,
      releaseAfterMs: options?.releaseAfterMs ?? this._defaultReleaseAfterMs,
    });
    return true;
  }

  release(workerId: string): boolean {
    const entry = this._quarantined.get(workerId);
    if (!entry) return false;
    this._quarantined.delete(workerId);
    this._budgets.get(workerId)?.reset();
    this._scheduler.registerWorker(entry.worker);
    return true;
  }

  quarantined(workerId: string): QuarantinedWorker | undefined {
    this.sweepExpired();
    return this._quarantined.get(workerId);
  }

  listQuarantined(): QuarantinedWorker[] {
    this.sweepExpired();
    return [...this._quarantined.values()];
  }

  failureBudgetFor(workerId: string): FailureBudget {
    let budget = this._budgets.get(workerId);
    if (!budget) {
      budget = new FailureBudget(undefined, { componentId: `worker:${workerId}` });
      this._budgets.set(workerId, budget);
    }
    return budget;
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [workerId, entry] of this._quarantined) {
      const expiresAt = new Date(entry.quarantinedAt).getTime() + entry.releaseAfterMs;
      if (now >= expiresAt) {
        this._quarantined.delete(workerId);
        this._budgets.get(workerId)?.reset();
        this._scheduler.registerWorker(entry.worker);
      }
    }
  }
}
