import { Job } from '@vestara/job';
import type { JobId, JobPriority, JobResult, JobType, RuntimeConfig, RuntimeId } from '@vestara/types';
import { Worker } from '@vestara/worker';
import { beforeEach, describe, expect, it } from 'vitest';
import { Scheduler } from '../src/index';

function testConfig(overrides?: Partial<RuntimeConfig>): RuntimeConfig {
  return {
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides?.type ?? 'runtime',
    displayName: overrides?.displayName ?? 'Test',
    ...overrides,
  } as RuntimeConfig;
}

class TestWorker extends Worker {
  constructor(config: Parameters<typeof Worker>[0], hooks?: Parameters<typeof Worker>[1]) {
    super(config, hooks);
  }
  protected async run(_job: Job): Promise<JobResult> {
    return { status: 'success', summary: 'test' };
  }
}

class TestJob extends Job {
  // all logic inherited
}

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let worker: TestWorker;
  let job: TestJob;

  beforeEach(() => {
    scheduler = new Scheduler();

    worker = new TestWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['repository.commit', 'docker.build', 'agent.implement'],
        maxConcurrency: 5,
      },
      runtime: testConfig({ type: 'service' }),
    });

    job = new TestJob({
      id: 'job-001' as JobId,
      spec: {
        type: 'generic' as JobType,
        priority: 'normal' as JobPriority,
        capabilities: ['repository.commit'],
      },
      owner: 'system' as RuntimeId,
      runtime: 'system' as RuntimeId,
    });
  });

  describe('worker registration', () => {
    it('registers and retrieves workers', () => {
      scheduler.registerWorker(worker);
      expect(scheduler.getWorker(worker.id)).toBe(worker);
      expect(scheduler.listWorkers()).toHaveLength(1);
    });

    it('prevents duplicate worker registration', () => {
      scheduler.registerWorker(worker);
      expect(() => scheduler.registerWorker(worker)).toThrow('already registered');
    });

    it('unregisters workers', () => {
      scheduler.registerWorker(worker);
      scheduler.unregisterWorker(worker.id);
      expect(scheduler.getWorker(worker.id)).toBeUndefined();
    });
  });

  describe('getCandidates', () => {
    it('returns candidates when capabilities match', async () => {
      scheduler.registerWorker(worker);
      await worker.start();
      const candidates = scheduler.getCandidates(job);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].workerId).toBe(worker.id);
      expect(candidates[0].score).toBeGreaterThan(0);
    });

    it('filters workers at capacity', async () => {
      const capped = new TestWorker({
        definition: {
          workerType: 'ai',
          capabilities: ['repository.commit'],
          maxConcurrency: 0,
        },
        runtime: testConfig({ type: 'service' }),
      });
      scheduler.registerWorker(capped);
      await capped.start();
      const candidates = scheduler.getCandidates(job);
      expect(candidates).toHaveLength(0);
    });

    it('filters workers not in running state', () => {
      scheduler.registerWorker(worker);
      const candidates = scheduler.getCandidates(job);
      expect(candidates).toHaveLength(0);
    });

    it('returns empty when no workers match capabilities', async () => {
      const specializedWorker = new TestWorker({
        definition: {
          workerType: 'ai',
          capabilities: ['ai.chat'],
          maxConcurrency: 3,
        },
        runtime: testConfig({ type: 'service' }),
      });
      scheduler.registerWorker(specializedWorker);
      await specializedWorker.start();
      const candidates = scheduler.getCandidates(job);
      expect(candidates).toHaveLength(0);
    });

    it('sorts by score then capacity descending', async () => {
      const w1 = new TestWorker({
        definition: {
          workerType: 'ai',
          capabilities: ['repository.commit'],
          maxConcurrency: 2,
        },
        runtime: testConfig({ type: 'service', id: 'w1' }),
      });
      const w2 = new TestWorker({
        definition: {
          workerType: 'ai',
          capabilities: ['repository.*'],
          maxConcurrency: 5,
        },
        runtime: testConfig({ type: 'service', id: 'w2' }),
      });
      scheduler.registerWorker(w1);
      scheduler.registerWorker(w2);
      await w1.start();
      await w2.start();
      const candidates = scheduler.getCandidates(job);
      expect(candidates).toHaveLength(2);
    });
  });

  describe('submit', () => {
    it('schedules job to best matching worker', async () => {
      scheduler.registerWorker(worker);
      await worker.start();
      const result = await scheduler.submit(job);
      expect(result.status).toBe('scheduled');
      expect(result.assignedWorker).toBe(worker.id);
    });

    it('queues job when no workers available', async () => {
      const result = await scheduler.submit(job);
      expect(result.status).toBe('queued');
    });

    it('tracks metrics on submit', async () => {
      scheduler.registerWorker(worker);
      await worker.start();
      await scheduler.submit(job);
      expect(scheduler.metrics.totalSubmitted).toBe(1);
      expect(scheduler.metrics.totalScheduled).toBe(1);
    });
  });

  describe('assign', () => {
    it('assigns job to capable worker', async () => {
      scheduler.registerWorker(worker);
      await worker.start();
      const result = await scheduler.assign(job, worker);
      expect(result.status).toBe('scheduled');
      expect(result.assignedWorker).toBe(worker.id);
    });

    it('rejects assignment to non-running worker', async () => {
      scheduler.registerWorker(worker);
      // worker not started — should be in 'created' state
      const result = await scheduler.assign(job, worker);
      expect(result.status).toBe('rejected');
      expect(result.reason).toContain('not running');
    });

    it('rejects assignment to worker at capacity', async () => {
      const cappedWorker = new TestWorker({
        definition: {
          workerType: 'ai',
          capabilities: ['repository.commit'],
          maxConcurrency: 1,
        },
        runtime: testConfig({ type: 'service' }),
      });
      scheduler.registerWorker(cappedWorker);
      await cappedWorker.start();

      // Fill capacity by assigning to the worker
      const job1 = new TestJob({
        id: 'job-001' as JobId,
        spec: {
          type: 'generic' as JobType,
          priority: 'normal' as JobPriority,
          capabilities: ['repository.commit'],
        },
        owner: 'system' as RuntimeId,
        runtime: 'system' as RuntimeId,
      });
      await scheduler.assign(job1, cappedWorker);

      const job2 = new TestJob({
        id: 'job-002' as JobId,
        spec: {
          type: 'generic' as JobType,
          priority: 'normal' as JobPriority,
          capabilities: ['repository.commit'],
        },
        owner: 'system' as RuntimeId,
        runtime: 'system' as RuntimeId,
      });
      const result = await scheduler.assign(job2, cappedWorker);
      expect(result.status).toBe('rejected');
    });
  });

  describe('queue management', () => {
    it('returns queued jobs', async () => {
      const result = await scheduler.submit(job);
      expect(result.status).toBe('queued');
      const queue = scheduler.getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].jobId).toBe('job-001');
    });

    it('cancels queued jobs', async () => {
      await scheduler.submit(job);
      const cancelled = scheduler.cancel('job-001' as JobId);
      expect(cancelled).toBe(true);
      expect(scheduler.getQueue()).toHaveLength(0);
    });

    it('returns false when cancelling non-existent job', () => {
      const cancelled = scheduler.cancel('nonexistent' as JobId);
      expect(cancelled).toBe(false);
    });
  });

  describe('metrics', () => {
    it('tracks submission metrics', async () => {
      scheduler.registerWorker(worker);
      await worker.start();
      await scheduler.submit(job);
      expect(scheduler.metrics).toMatchObject({
        totalSubmitted: 1,
        totalScheduled: 1,
        totalRejected: 0,
        totalCancelled: 0,
      });
    });
  });
});
