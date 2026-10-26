// NOTE: imported from the built package, not ../src/index — the src barrel
// has a value-level cycle (index ↔ jobs/*) that ESM hoisting breaks under
// vitest, while the compiled CJS dist evaluates in order. This also pins
// the shipped artifact contract.
import { Job } from '@vestara/job';
import { describe, expect, it } from 'vitest';

function makeJob(id: string): Job {
  return new Job({
    id: id as never,
    spec: { type: 'build', priority: 3 } as never,
    owner: 'owner-1' as never,
    runtime: 'runtime-1' as never,
  });
}

describe('Job lifecycle contract', () => {
  it('walks requested → running → verifying → completed', () => {
    const job = makeJob('job-1');
    expect(job.state).toBe('requested');
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as never);
    job.start();
    expect(job.state).toBe('running');
    job.complete();
    expect(job.state).toBe('verifying');
    expect(job.result?.status).toBe('success');
    job.verifyComplete();
    expect(job.state).toBe('completed');
  });

  it('records checkpoints and failures without losing identity', () => {
    const job = makeJob('job-2');
    job.checkpoint(50, { note: 'halfway' });
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as never);
    job.start();
    job.fail('disk full');
    expect(job.id).toBe('job-2');
    expect(job.state).toBe('failed');
    expect(job.error).toBe('disk full');
  });
});
