/**
 * CloudService — Cloud execution environment orchestration.
 *
 * Job queues, worker pools, and remote execution for
 * large repository analysis, parallel agents, and enterprise workloads.
 *
 * Architecture Traceability:
 *   PCS: PCS-015 — Cloud Execution Environment
 */

import type { CloudStorage } from './cloud-storage';
import type { CloudJob, CloudWorker } from './types';

export class CloudService {
  private storage: CloudStorage;

  constructor(opts: { storage: CloudStorage }) {
    this.storage = opts.storage;
  }

  async submitJob(type: string, target: string, workerType: string = 'remote'): Promise<CloudJob> {
    const job = await this.storage.submitJob(type, target, workerType);
    // Simulate async execution
    this.executeJob(job.id).catch(() => {});
    return job;
  }

  private async executeJob(jobId: string): Promise<void> {
    await this.storage.updateJobStatus(jobId, 'running', 'Execution started...');
    await new Promise((r) => setTimeout(r, 500));
    await this.storage.updateJobStatus(jobId, 'completed', `Job ${jobId} completed successfully.`);
  }

  async listJobs(status?: string): Promise<CloudJob[]> {
    return this.storage.listJobs(status);
  }

  async getJob(id: string): Promise<CloudJob | null> {
    return this.storage.getJob(id);
  }

  async listWorkers(): Promise<CloudWorker[]> {
    return this.storage.listWorkers();
  }

  async getOverview(): Promise<{ activeJobs: number; workers: number; idleWorkers: number }> {
    const jobs = await this.storage.listJobs('running');
    const workers = await this.storage.listWorkers();
    return {
      activeJobs: jobs.length,
      workers: workers.length,
      idleWorkers: workers.filter((w) => w.status === 'idle').length,
    };
  }

  renderJob(job: CloudJob): string {
    return [
      `Job: ${job.id}`,
      `Type: ${job.type} → ${job.target}`,
      `Status: ${job.status}`,
      `Worker: ${job.workerType}`,
      `Submitted: ${job.submittedAt}`,
      job.completedAt ? `Completed: ${job.completedAt}` : '',
      job.result ? `Result: ${job.result.slice(0, 200)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  renderJobs(jobs: CloudJob[]): string {
    if (jobs.length === 0) return 'No jobs.';
    return `Jobs:\n${jobs.map((j) => `  ${j.id.padEnd(25)} ${j.status.padEnd(12)} ${j.type} → ${j.target}`).join('\n')}`;
  }

  renderWorkers(workers: CloudWorker[]): string {
    if (workers.length === 0) return 'No workers.';
    const lines = ['Workers:'];
    for (const w of workers) {
      const icon = w.status === 'idle' ? '○' : w.status === 'working' ? '●' : '✗';
      lines.push(
        `  ${icon} ${w.name.padEnd(20)} ${w.type.padEnd(12)} ${w.status} (${w.resources.cpu}c / ${w.resources.memory}mb)`,
      );
    }
    return lines.join('\n');
  }
}
