import type { CapabilityMatcher } from '@vestara/capabilities';
import { createCapabilityProfile, DefaultCapabilityMatcher } from '@vestara/capabilities';
import type { Job, JobId } from '@vestara/job';
import type { Timestamp, WorkerId } from '@vestara/types';
import type { Worker } from '@vestara/worker';

export type { JobId, WorkerId };

export type ScheduleStatus = 'scheduled' | 'queued' | 'rejected' | 'cancelled';

export interface ScheduleResult {
  jobId: JobId;
  status: ScheduleStatus;
  assignedWorker?: string;
  reason?: string;
}

export interface CandidateWorker {
  worker: Worker;
  workerId: string;
  score: number;
  availableCapacity: number;
}

export interface QueuedJob {
  job: Job;
  jobId: JobId;
  submittedAt: Timestamp;
  status: 'pending' | 'assigned' | 'running';
  assignedWorker?: string;
}

export interface SchedulerMetrics {
  totalSubmitted: number;
  totalScheduled: number;
  totalRejected: number;
  totalCancelled: number;
  currentlyQueued: number;
  currentlyRunning: number;
}

export interface SchedulerOptions {
  matcher?: CapabilityMatcher;
}

export class Scheduler {
  private _workers: Map<string, Worker> = new Map();
  private _queue: Map<JobId, QueuedJob> = new Map();
  private _assignments: Map<string, number> = new Map();
  private _matcher: CapabilityMatcher;
  private _metrics: SchedulerMetrics = {
    totalSubmitted: 0,
    totalScheduled: 0,
    totalRejected: 0,
    totalCancelled: 0,
    currentlyQueued: 0,
    currentlyRunning: 0,
  };

  constructor(options?: SchedulerOptions) {
    this._matcher = options?.matcher ?? new DefaultCapabilityMatcher();
  }

  get metrics(): SchedulerMetrics {
    return { ...this._metrics };
  }

  registerWorker(worker: Worker): void {
    if (this._workers.has(worker.id)) {
      throw new Error(`Worker already registered: "${worker.id}"`);
    }
    this._workers.set(worker.id, worker);
  }

  unregisterWorker(workerId: string): void {
    this._workers.delete(workerId);
    this._assignments.delete(workerId);
  }

  getWorker(workerId: string): Worker | undefined {
    return this._workers.get(workerId);
  }

  listWorkers(): Worker[] {
    return Array.from(this._workers.values());
  }

  private assignedCapacity(workerId: string): number {
    return this._assignments.get(workerId) ?? 0;
  }

  getCandidates(job: Job): CandidateWorker[] {
    const candidates: CandidateWorker[] = [];
    const requiredCaps = job.capabilities;
    const jobProfile = requiredCaps.length > 0 ? job.capabilityProfile() : null;

    for (const worker of this._workers.values()) {
      const assigned = this.assignedCapacity(worker.id);
      const available = Math.max(0, worker.definition.maxConcurrency - assigned);
      if (available <= 0) continue;
      if (worker.state !== 'running') continue;

      if (requiredCaps.length === 0) {
        candidates.push({
          worker,
          workerId: worker.id,
          score: 1,
          availableCapacity: available,
        });
        continue;
      }

      if (jobProfile) {
        const workerProfile = createCapabilityProfile(worker.definition.capabilities);
        const match = workerProfile.matchProfile(jobProfile, this._matcher);
        if (match.matched) {
          candidates.push({
            worker,
            workerId: worker.id,
            score: match.score,
            availableCapacity: available,
          });
        }
      }
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.availableCapacity - a.availableCapacity;
    });

    return candidates;
  }

  async submit(job: Job): Promise<ScheduleResult> {
    this._metrics.totalSubmitted++;
    const candidates = this.getCandidates(job);

    if (candidates.length === 0) {
      this._queue.set(job.id, {
        job,
        jobId: job.id,
        submittedAt: new Date().toISOString() as Timestamp,
        status: 'pending',
      });
      this._metrics.currentlyQueued++;
      return {
        jobId: job.id,
        status: 'queued',
        reason: 'No available workers with matching capabilities',
      };
    }

    const best = candidates[0];
    return this.assign(job, best.worker);
  }

  async assign(job: Job, worker: Worker): Promise<ScheduleResult> {
    if (worker.state !== 'running') {
      return {
        jobId: job.id,
        status: 'rejected',
        reason: `Worker "${worker.id}" is not running (state: ${worker.state})`,
      };
    }

    const assigned = this.assignedCapacity(worker.id);
    if (assigned >= worker.definition.maxConcurrency) {
      return {
        jobId: job.id,
        status: 'rejected',
        reason: `Worker "${worker.id}" is at maximum capacity`,
      };
    }

    if (!worker.supportsJob(job)) {
      return {
        jobId: job.id,
        status: 'rejected',
        reason: `Worker "${worker.id}" does not support job ${job.id}`,
      };
    }

    try {
      job.validate();
      job.authorize();
      job.schedule();
      job.assign(worker.id as unknown as WorkerId);
      this._assignments.set(worker.id, (this._assignments.get(worker.id) ?? 0) + 1);
      this._queue.set(job.id, {
        job,
        jobId: job.id,
        submittedAt: new Date().toISOString() as Timestamp,
        status: 'assigned',
        assignedWorker: worker.id as unknown as WorkerId,
      });
      this._metrics.totalScheduled++;
      this._metrics.currentlyRunning++;
      return {
        jobId: job.id,
        status: 'scheduled',
        assignedWorker: worker.id as unknown as WorkerId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        jobId: job.id,
        status: 'rejected',
        reason: message,
      };
    }
  }

  cancel(jobId: JobId): boolean {
    const entry = this._queue.get(jobId);
    if (!entry) return false;

    if (entry.status === 'running' || entry.status === 'assigned') {
      const worker = entry.assignedWorker ? this._workers.get(entry.assignedWorker) : null;
      if (worker) {
        try {
          entry.job.cancel('Cancelled by scheduler');
        } catch {
          // job may already be past cancellable state
        }
      }
    }

    if (entry.assignedWorker) {
      const current = this._assignments.get(entry.assignedWorker) ?? 0;
      if (current > 0) this._assignments.set(entry.assignedWorker, current - 1);
    }
    this._queue.delete(jobId);
    this._metrics.totalCancelled++;
    this._metrics.currentlyQueued = this.countByStatus('pending');
    this._metrics.currentlyRunning = this.countByStatus('assigned') + this.countByStatus('running');
    return true;
  }

  getQueue(): QueuedJob[] {
    return Array.from(this._queue.values());
  }

  getQueuedJobs(): QueuedJob[] {
    return this.getQueue().filter((q) => q.status === 'pending');
  }

  getRunningJobs(): QueuedJob[] {
    return this.getQueue().filter((q) => q.status === 'assigned' || q.status === 'running');
  }

  private countByStatus(status: QueuedJob['status']): number {
    return this.getQueue().filter((q) => q.status === status).length;
  }
}
