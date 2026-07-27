import type { Scheduler } from '@vestara/scheduler';
import type { Worker } from '@vestara/worker';

export interface WorkerManager {
  register(worker: Worker): void;
  unregister(workerId: string): void;
  get(workerId: string): Worker | undefined;
  list(): Worker[];
  count(): number;
}

export class DefaultWorkerManager implements WorkerManager {
  private _scheduler: Scheduler;

  constructor(scheduler: Scheduler) {
    this._scheduler = scheduler;
  }

  register(worker: Worker): void {
    this._scheduler.registerWorker(worker);
  }

  unregister(workerId: string): void {
    this._scheduler.unregisterWorker(workerId);
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
}
