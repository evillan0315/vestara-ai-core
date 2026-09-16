import { describe, expect, it } from 'vitest';
import { aggregateRequiredChecks, evaluateCIResumeGate } from '../src/required-checks';

describe('aggregateRequiredChecks (H3)', () => {
  it('satisfies when all observed checks passed', () => {
    const aggregate = aggregateRequiredChecks([
      { name: 'build', conclusion: 'passed' },
      { name: 'test', conclusion: 'passed' },
    ]);
    expect(aggregate.state).toBe('satisfied');
  });

  it('fails when any required check failed', () => {
    const aggregate = aggregateRequiredChecks([
      { name: 'build', conclusion: 'passed' },
      { name: 'test', conclusion: 'failed' },
    ]);
    expect(aggregate.state).toBe('failed');
    expect(aggregate.failed).toEqual(['test']);
  });

  it('is pending when a declared required check was not observed', () => {
    const aggregate = aggregateRequiredChecks([{ name: 'build', conclusion: 'passed' }], {
      mode: 'any-designated',
      names: ['build', 'desktop-build'],
    });
    expect(aggregate.state).toBe('pending');
    expect(aggregate.pending).toEqual(['desktop-build']);
  });

  it('is inconclusive for cancelled/timed-out/skipped checks, never failed', () => {
    expect(aggregateRequiredChecks([{ name: 'a', conclusion: 'cancelled' }]).state).toBe('inconclusive');
    expect(aggregateRequiredChecks([{ name: 'a', conclusion: 'timed_out' }]).state).toBe('failed');
    expect(aggregateRequiredChecks([{ name: 'a', conclusion: 'skipped' }]).state).toBe('inconclusive');
  });

  it('is unknown when nothing is required or observed', () => {
    expect(aggregateRequiredChecks([]).state).toBe('unknown');
    expect(aggregateRequiredChecks([{ name: 'a', conclusion: 'passed' }], { mode: 'any-designated' }).state).toBe(
      'unknown',
    );
  });
});

describe('evaluateCIResumeGate (H3)', () => {
  const base = { status: 'completed', passedChecks: 1, failedChecks: 0, skippedChecks: 0 };

  it('allows resume on a terminal classifiable state', () => {
    expect(evaluateCIResumeGate({ ...base, conclusion: 'passed' }).allow).toBe(true);
    expect(evaluateCIResumeGate({ ...base, conclusion: 'failed' }).allow).toBe(true);
  });

  it('denies resume on a retrieval failure (retrieval failure ≠ CI failure)', () => {
    const decision = evaluateCIResumeGate({
      status: 'completed',
      conclusion: 'unknown',
      passedChecks: 0,
      failedChecks: 0,
      skippedChecks: 0,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toMatch(/retrieval failure/i);
  });

  it('denies resume on a non-terminal observation', () => {
    expect(evaluateCIResumeGate({ ...base, status: 'running', conclusion: 'unknown' }).allow).toBe(false);
  });

  it('denies resume on inconclusive conclusions', () => {
    expect(evaluateCIResumeGate({ ...base, conclusion: 'skipped' }).allow).toBe(false);
    expect(evaluateCIResumeGate({ ...base, conclusion: 'unknown' }).allow).toBe(false);
  });
});
