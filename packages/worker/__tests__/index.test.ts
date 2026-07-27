import { describe, expect, it } from 'vitest';

const { Worker } = require('../dist/index.js');

const testId = 'worker-test-1' as any;
const runtimeType = 'agent' as any;

function makeWorker(capabilities: string[] = [], maxConcurrency = 5) {
  return new (class extends Worker {
    constructor() {
      super({
        definition: {
          workerType: 'ai' as any,
          capabilities,
          maxConcurrency,
          labels: { region: 'us-east' },
          supportedRuntimes: ['agent' as any],
        },
        runtime: {
          id: testId,
          type: runtimeType,
        },
      });
    }
    protected async run(_job: any): Promise<any> {
      return { status: 'success', summary: 'ok' };
    }
  })();
}

const defaultJob = {
  id: 'job-1' as any,
  type: 'implement' as any,
  capabilities: [] as string[],
  spec: { type: 'implement' as any, priority: 3 as any },
  owner: 'rt-1' as any,
  runtime: 'rt-1' as any,
};

describe('Worker base class', () => {
  it('creates in created state with definition', async () => {
    const w = makeWorker();
    expect(w.state).toBe('created');
    expect(w.workerType).toBe('ai');
    expect(w.definition.maxConcurrency).toBe(5);
    expect(w.definition.labels?.region).toBe('us-east');
  });

  it('supports capability by direct string match', () => {
    const w = makeWorker(['language:typescript:develop']);
    expect(w.supports('language:typescript:develop')).toBe(true);
    expect(w.supports('language:rust:develop')).toBe(false);
  });

  it('supports capability by structured match', () => {
    const w = makeWorker(['language:typescript:develop']);
    expect(w.supports('language:typescript:develop')).toBe(true);
    expect(w.supports('language:python:develop')).toBe(false);
  });

  it('supportsJob fails when worker not running', () => {
    const w = makeWorker(['language:typescript:develop']);
    const job = { ...defaultJob, capabilities: ['language:typescript:develop'] };
    expect(w.supportsJob(job)).toBe(false);
  });

  it('supportsJob succeeds when running and capable', async () => {
    const w = makeWorker(['language:typescript:develop']);
    const job = { ...defaultJob, capabilities: ['language:typescript:develop'] };
    await w.initialize();
    expect(w.supportsJob(job)).toBe(true);
  });

  it('supportsJob succeeds with empty job capabilities', async () => {
    const w = makeWorker([]);
    const job = { ...defaultJob, capabilities: [] };
    await w.initialize();
    expect(w.supportsJob(job)).toBe(true);
  });

  it('availableCapacity returns maxConcurrency minus active', async () => {
    const w = makeWorker([], 3);
    await w.initialize();
    expect(w.availableCapacity()).toBe(3);
    const job = { ...defaultJob, capabilities: [] as string[] };
    const execPromise = w.execute(job);
    expect(w.availableCapacity()).toBe(2);
    await execPromise;
    expect(w.availableCapacity()).toBe(3);
  });

  it('execute invokes run and returns result', async () => {
    const w = makeWorker([]);
    await w.initialize();
    const job = { ...defaultJob, capabilities: [] as string[] };
    const result = await w.execute(job);
    expect(result.status).toBe('success');
  });

  it('workerRuntime reflects state', async () => {
    const w = makeWorker([]);
    const rt = w.workerRuntime;
    expect(rt.status).toBe('available');
    expect(rt.activeJobs).toBe(0);
    expect(rt.currentLoad).toBe(0);
    expect(rt.heartbeat).toBeTruthy();
    expect(rt.lastError).toBeNull();
  });

  it('touch updates heartbeat', () => {
    const w = makeWorker([]);
    const before = w.workerRuntime.heartbeat;
    w.touch();
    const after = w.workerRuntime.heartbeat;
    expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
  });
});
