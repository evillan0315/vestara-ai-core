import type { Job, JobId } from '@vestara/job';
import type { QueuedJob, ScheduleResult, Scheduler } from '@vestara/scheduler';

export interface JobManager {
  submit(job: Job): Promise<ScheduleResult>;
  cancel(jobId: JobId): boolean;
  getQueue(): QueuedJob[];
  getQueued(): QueuedJob[];
  getRunning(): QueuedJob[];
  getMetrics(): { submitted: number; scheduled: number; queued: number; running: number };
}

export class DefaultJobManager implements JobManager {
  private _scheduler: Scheduler;

  constructor(scheduler: Scheduler) {
    this._scheduler = scheduler;
  }

  async submit(job: Job): Promise<ScheduleResult> {
    return this._scheduler.submit(job);
  }

  cancel(jobId: JobId): boolean {
    return this._scheduler.cancel(jobId);
  }

  getQueue(): QueuedJob[] {
    return this._scheduler.getQueue();
  }

  getQueued(): QueuedJob[] {
    return this._scheduler.getQueuedJobs();
  }

  getRunning(): QueuedJob[] {
    return this._scheduler.getRunningJobs();
  }

  getMetrics() {
    const m = this._scheduler.metrics;
    return {
      submitted: m.totalSubmitted,
      scheduled: m.totalScheduled,
      queued: m.currentlyQueued,
      running: m.currentlyRunning,
    };
  }
}
