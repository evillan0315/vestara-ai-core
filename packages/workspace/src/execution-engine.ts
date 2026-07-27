/**
 * ExecutionEngine — Async job execution with streaming progress and cancellation.
 *
 * All platform services (verification, planning, implementation) become async
 * operations that report progress through typed events.
 *
 * Architecture Traceability:
 *   PCS: PCS-017 — Async Execution Engine
 */

import type { ExecJob, ExecProgressEvent, ExecProgressType } from './types';

let jobCounter = 0;

export class ExecutionEngine {
  private jobs: Map<string, ExecJob> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  /**
   * Submit a new execution job. Returns the job ID and a promise that resolves on completion.
   */
  submit(
    type: string,
    target: string,
    executor: (
      events: (type: ExecProgressType, message: string, progress?: number) => void,
      signal: AbortSignal,
    ) => Promise<void>,
  ): string {
    const id = `exec-${Date.now()}-${++jobCounter}`;
    const events: ExecProgressEvent[] = [];
    const controller = new AbortController();

    const job: ExecJob = {
      id,
      type,
      target,
      status: 'pending',
      events: [],
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(id, job);
    this.abortControllers.set(id, controller);

    const emit = (type: ExecProgressType, message: string, progress?: number) => {
      const event: ExecProgressEvent = {
        id: `evt-${Date.now()}-${events.length}`,
        jobId: id,
        type,
        message,
        progress,
        timestamp: new Date().toISOString(),
      };
      events.push(event);
      job.events = [...events];
    };

    // Run asynchronously
    this.runJob(id, job, executor, emit, controller.signal);

    return id;
  }

  private async runJob(
    id: string,
    job: ExecJob,
    executor: (
      emit: (type: ExecProgressType, message: string, progress?: number) => void,
      signal: AbortSignal,
    ) => Promise<void>,
    emit: (type: ExecProgressType, message: string, progress?: number) => void,
    signal: AbortSignal,
  ): Promise<void> {
    job.status = 'running';

    try {
      await executor(emit, signal);
      if (signal.aborted) {
        job.status = 'cancelled';
        emit('complete', 'Job cancelled', 0);
      } else {
        job.status = 'completed';
        emit('complete', 'Job completed successfully', 100);
      }
    } catch (err) {
      if (signal.aborted) {
        job.status = 'cancelled';
        emit('complete', 'Job cancelled', 0);
      } else {
        job.status = 'failed';
        emit('error', `Job failed: ${(err as Error).message}`);
        emit('complete', 'Job failed', 0);
      }
    }

    job.completedAt = new Date().toISOString();
    this.abortControllers.delete(id);
  }

  /**
   * Cancel a running job.
   */
  cancel(id: string): boolean {
    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      return true;
    }
    return false;
  }

  /**
   * Get a job by ID.
   */
  getJob(id: string): ExecJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * List all jobs.
   */
  listJobs(): ExecJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Wait for a job to complete.
   */
  async waitFor(id: string): Promise<ExecJob> {
    return new Promise((resolve) => {
      const check = () => {
        const job = this.jobs.get(id);
        if (job && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')) {
          resolve(job);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  renderJob(job: ExecJob): string {
    const lines: string[] = [];
    lines.push(`Job: ${job.id}`);
    lines.push(`Type: ${job.type} → ${job.target}`);
    lines.push(`Status: ${job.status}`);
    lines.push(`Created: ${job.createdAt}`);
    if (job.completedAt) lines.push(`Completed: ${job.completedAt}`);
    lines.push('');

    for (const event of job.events) {
      const icon =
        event.type === 'log'
          ? '·'
          : event.type === 'progress'
            ? '→'
            : event.type === 'result'
              ? '✓'
              : event.type === 'error'
                ? '✗'
                : '●';
      const pct = event.progress !== undefined ? ` (${event.progress}%)` : '';
      lines.push(`  ${icon} [${event.type}]${pct} ${event.message}`);
    }

    return lines.join('\n');
  }

  renderJobList(jobs: ExecJob[]): string {
    if (jobs.length === 0) return 'No jobs.';
    const lines: string[] = ['Jobs:'];
    for (const job of jobs) {
      const icon =
        job.status === 'completed'
          ? '✓'
          : job.status === 'running'
            ? '→'
            : job.status === 'failed'
              ? '✗'
              : job.status === 'cancelled'
                ? '−'
                : '·';
      lines.push(`  ${icon} ${job.id.padEnd(25)} ${job.status.padEnd(12)} ${job.type} → ${job.target}`);
    }
    return lines.join('\n');
  }
}
