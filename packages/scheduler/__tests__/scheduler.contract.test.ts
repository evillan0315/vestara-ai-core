import { describe, expect, it } from 'vitest';
import { Scheduler } from '../src/index';

describe('Scheduler contract', () => {
  it('rejects duplicate worker registration', () => {
    const scheduler = new Scheduler();
    const worker = { id: 'w1' } as never;
    scheduler.registerWorker(worker);
    expect(scheduler.listWorkers()).toHaveLength(1);
    expect(() => scheduler.registerWorker(worker)).toThrow();
    scheduler.unregisterWorker('w1');
    expect(scheduler.getWorker('w1')).toBeUndefined();
  });

  it('queues jobs when no capable worker exists and tracks metrics', async () => {
    const scheduler = new Scheduler();
    const result = await scheduler.submit({ id: 'job-1', capabilities: [] } as never);
    expect(result.status).toBe('queued');
    expect(result.jobId).toBe('job-1');
    const metrics = scheduler.metrics;
    expect(metrics.totalSubmitted).toBe(1);
    expect(metrics.currentlyQueued).toBe(1);
  });
});
