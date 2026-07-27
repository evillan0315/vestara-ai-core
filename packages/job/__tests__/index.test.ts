import { describe, expect, it } from 'vitest';

const defaultConfig = {
  id: 'job-1' as any,
  spec: { type: 'implement' as any, priority: 3 as any },
  owner: 'rt-1' as any,
  runtime: 'rt-1' as any,
};

describe('@vestara/job', () => {
  it('creates a Job in requested state', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    expect(job.state).toBe('requested');
    expect(job.id).toBe('job-1');
    expect(job.type).toBe('implement');
  });

  it('full lifecycle: requested → archived', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    expect(job.state).toBe('requested');
    job.validate();
    expect(job.state).toBe('validated');
    job.authorize();
    expect(job.state).toBe('authorized');
    job.schedule();
    expect(job.state).toBe('scheduled');
    job.assign('worker-1' as any);
    expect(job.state).toBe('assigned');
    expect(job.assignedWorker).toBe('worker-1');
    job.start();
    expect(job.state).toBe('running');
    expect(job.startedAt).toBeTruthy();
    job.complete();
    expect(job.state).toBe('verifying');
    job.verifyComplete();
    expect(job.state).toBe('completed');
    expect(job.completedAt).toBeTruthy();
    job.archive();
    expect(job.state).toBe('archived');
    expect(job.archivedAt).toBeTruthy();
  });

  it('rejected on validation failure', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    job.reject('Invalid input schema');
    expect(job.state).toBe('rejected');
    expect(job.result?.status).toBe('failure');
    expect(job.error).toBe('Invalid input schema');
  });

  it('denied on authorization failure', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    job.validate();
    job.deny('Insufficient permissions');
    expect(job.state).toBe('denied');
  });

  it('cancelled from scheduled state', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    job.validate();
    job.authorize();
    job.schedule();
    expect(job.canCancel()).toBe(true);
    job.cancel('No longer needed');
    expect(job.state).toBe('cancelled');
  });

  it('cannot cancel from running state', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as any);
    job.start();
    expect(job.canCancel()).toBe(false);
  });

  it('checkpoints during execution', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as any);
    job.start();
    job.checkpoint(25, { filesAnalyzed: 10 });
    job.checkpoint(50, { filesModified: 5 });
    expect(job.hasCheckpoints).toBe(true);
    expect(job.getLatestCheckpoint()?.percent).toBe(50);
  });

  it('retry and rollback', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job({
      ...defaultConfig,
      spec: {
        ...defaultConfig.spec,
        retry: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
        rollback: { enabled: true, strategy: 'full' },
      },
    });
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as any);
    job.start();
    job.retryLater();
    expect(job.state).toBe('retrying');
    expect(job.retryCount).toBe(1);
    expect(job.retriesRemaining).toBe(2);
    job.assign('worker-2' as any);
    job.start();
    job.startRollback();
    expect(job.state).toBe('rolling-back');
    job.rollbackComplete();
    expect(job.state).toBe('rolled-back');
    expect(job.result?.status).toBe('rollback');
  });

  it('timeout during assignment', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    job.validate();
    job.authorize();
    job.schedule();
    job.timeoutOccurred('scheduled');
    expect(job.state).toBe('timed-out');
    expect(job.error).toContain('scheduled');
  });

  it('retry exhaustion leads to failure', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job({
      ...defaultConfig,
      spec: { ...defaultConfig.spec, retry: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 2 } },
    });
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as any);
    job.start();
    job.retryLater();
    expect(job.retriesRemaining).toBe(0);
    expect(job.canRetry()).toBe(false);
  });

  it('info returns full snapshot', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job({
      ...defaultConfig,
      spec: { ...defaultConfig.spec, capabilities: ['language:typescript:develop'] },
      intent: 'intent-1' as any,
      dependencies: ['job-0' as any],
    });
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as any);
    job.start();
    const info = job.info;
    expect(info.id).toBe('job-1');
    expect(info.type).toBe('implement');
    expect(info.status).toBe('running');
    expect(info.assignedWorker).toBe('worker-1');
    expect(info.capabilities).toBeUndefined();
  });

  it('throws on invalid transition', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    expect(() => job.authorize()).toThrow(/cannot transition/);
  });

  it('canRetry returns false when no retries configured', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as any);
    job.start();
    job.fail('execution error');
    expect(job.canRetry()).toBe(false);
  });

  it('canRetry returns true when retries remain', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job({
      ...defaultConfig,
      spec: { ...defaultConfig.spec, retry: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 } },
    });
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as any);
    job.start();
    job.fail('transient error');
    expect(job.canRetry()).toBe(true);
  });

  it('hasRequiredCapability returns true when no capabilities required', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    expect(job.hasRequiredCapability('anything')).toBe(true);
  });

  it('hasRequiredCapability checks against required list', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job({
      ...defaultConfig,
      spec: { ...defaultConfig.spec, capabilities: ['language:typescript:develop'] },
    });
    expect(job.hasRequiredCapability('language:typescript:develop')).toBe(true);
    expect(job.hasRequiredCapability('language:rust:develop')).toBe(false);
  });

  it('setPriority updates priority', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    expect(job.priority).toBe(3);
    job.setPriority(5 as any);
    expect(job.priority).toBe(5);
  });

  it('verification-failed state', () => {
    const { Job } = require('../dist/index.js');
    const job = new Job(defaultConfig);
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as any);
    job.start();
    job.complete();
    job.verificationFailed();
    expect(job.state).toBe('verification-failed');
  });

  it('observer receives transitions', () => {
    const { Job } = require('../dist/index.js');
    const transitions: Array<{ from: string; to: string }> = [];
    const job = new Job(defaultConfig, {
      onTransition: (from: string, to: string) => transitions.push({ from, to }),
    });
    job.validate();
    job.authorize();
    expect(transitions).toHaveLength(2);
    expect(transitions[0]).toEqual({ from: 'requested', to: 'validated' });
    expect(transitions[1]).toEqual({ from: 'validated', to: 'authorized' });
  });
});
