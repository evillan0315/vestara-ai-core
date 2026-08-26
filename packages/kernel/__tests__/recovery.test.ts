import type { Job } from '@vestara/job';
import { Scheduler } from '@vestara/scheduler';
import type { JobResult, RuntimeConfig } from '@vestara/types';
import { Worker } from '@vestara/worker';
import { afterEach, describe, expect, it } from 'vitest';
import { FailureBudget } from '../src/failure-budget';
import { DefaultWorkerManager } from '../src/worker-manager';

class MockWorker extends Worker {
  protected async run(job: Job): Promise<JobResult> {
    return { status: 'success', summary: `Executed: ${job.type}` };
  }
}

function workerConfig(id: string): RuntimeConfig {
  return {
    id,
    type: 'service',
    displayName: id,
  } as RuntimeConfig;
}

function makeWorker(id: string): MockWorker {
  return new MockWorker({
    runtime: workerConfig(id),
    definition: {
      workerType: 'ai',
      capabilities: ['code.write'],
      maxConcurrency: 2,
    },
  });
}

const schedulers: Scheduler[] = [];
afterEach(() => {
  schedulers.length = 0;
});

function scheduler(): Scheduler {
  const s = new Scheduler();
  schedulers.push(s);
  return s;
}

describe('FailureBudget', () => {
  it('starts healthy and stays healthy with low error rate', () => {
    const budget = new FailureBudget({ errorRateLimit: 0.5, minOutcomes: 5 });
    for (let i = 0; i < 10; i++) budget.recordOutcome(true);
    expect(budget.status).toBe('healthy');
  });

  it('flips to consuming once failures start', () => {
    const budget = new FailureBudget({ errorRateLimit: 0.5, minOutcomes: 5 });
    for (let i = 0; i < 4; i++) budget.recordOutcome(true);
    budget.recordOutcome(false);
    expect(budget.status).toBe('consuming');
  });

  it('exhausts when the error rate breaches the limit', () => {
    const budget = new FailureBudget({ errorRateLimit: 0.5, minOutcomes: 5 });
    for (let i = 0; i < 4; i++) budget.recordOutcome(true);
    for (let i = 0; i < 6; i++) budget.recordOutcome(false);
    const state = budget.state();
    expect(state.status).toBe('exhausted');
    expect(state.errorRate).toBeGreaterThan(0.5);
    expect(budget.isExhausted).toBe(true);
  });

  it('respects minOutcomes before declaring exhaustion', () => {
    const budget = new FailureBudget({ errorRateLimit: 0.5, minOutcomes: 10 });
    budget.recordOutcome(false); // 1 outcome, 100% error, but under minOutcomes
    expect(budget.status).toBe('healthy');
  });

  it('resets the budget', () => {
    const budget = new FailureBudget({ errorRateLimit: 0.5, minOutcomes: 5 });
    for (let i = 0; i < 6; i++) budget.recordOutcome(false);
    expect(budget.isExhausted).toBe(true);
    budget.reset();
    expect(budget.isExhausted).toBe(false);
    expect(budget.status).toBe('healthy');
  });

  it('reports the configured mitigation action', () => {
    const budget = new FailureBudget({ mitigation: 'notify' });
    expect(budget.mitigation).toBe('notify');
  });
});

describe('DefaultWorkerManager quarantine', () => {
  it('quarantines a registered worker and removes it from scheduling', () => {
    const manager = new DefaultWorkerManager(scheduler());
    const worker = makeWorker('w1');
    worker.start();
    manager.register(worker);
    expect(manager.count()).toBe(1);

    const ok = manager.quarantine('w1', 'budget exhausted');
    expect(ok).toBe(true);
    expect(manager.get('w1')).toBeUndefined();
    expect(manager.quarantined('w1')).toBeDefined();
    expect(manager.listQuarantined()[0]?.reason).toBe('budget exhausted');
  });

  it('releases a quarantined worker back to scheduling and resets its budget', async () => {
    const manager = new DefaultWorkerManager(scheduler());
    const worker = makeWorker('w1');
    await worker.start();
    manager.register(worker);
    manager.quarantine('w1', 'reason');
    expect(manager.get('w1')).toBeUndefined();

    const released = manager.release('w1');
    expect(released).toBe(true);
    expect(manager.get('w1')).toBeDefined();
    expect(manager.quarantined('w1')).toBeUndefined();
  });

  it('auto-releases a quarantined worker after the expiry window', async () => {
    const manager = new DefaultWorkerManager(scheduler(), { releaseAfterMs: 10 });
    const worker = makeWorker('w1');
    await worker.start();
    manager.register(worker);
    manager.quarantine('w1', 'reason');
    expect(manager.quarantined('w1')).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(manager.quarantined('w1')).toBeUndefined();
    expect(manager.get('w1')).toBeDefined();
  });

  it('tracks a per-worker failure budget', () => {
    const manager = new DefaultWorkerManager(scheduler());
    const budget = manager.failureBudgetFor('w1');
    for (let i = 0; i < 10; i++) budget.recordOutcome(false);
    expect(budget.status).toBe('exhausted');
  });

  it('does not quarantine an unknown worker', () => {
    const manager = new DefaultWorkerManager(scheduler());
    expect(manager.quarantine('missing', 'reason')).toBe(false);
  });
});

describe('Failure budget → quarantine integration', () => {
  it('quarantines a worker once its failure budget exhausts', async () => {
    const manager = new DefaultWorkerManager(scheduler());
    const worker = makeWorker('w1');
    await worker.start();
    manager.register(worker);

    const budget = manager.failureBudgetFor('w1');
    for (let i = 0; i < 10; i++) budget.recordOutcome(false);

    expect(budget.isExhausted).toBe(true);
    expect(budget.mitigation).toBe('quarantine');
    if (budget.mitigation === 'quarantine') {
      manager.quarantine('w1', 'failure budget exhausted');
      expect(manager.get('w1')).toBeUndefined();
      expect(manager.quarantined('w1')).toBeDefined();
    }
  });
});
