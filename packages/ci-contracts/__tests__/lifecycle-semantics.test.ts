/**
 * CI-OBS-001B — Lifecycle and terminal semantics.
 *
 * Status progresses through discovered → queued → running → completed.
 * Terminal, non-terminal, and active functions enforce the semantic
 * contract: discovered is non-terminal but NOT active (pre-observation
 * state, not provider-side execution).
 */
import { describe, expect, it } from 'vitest';
import { isCompletedConclusion, isPassedConclusion, isUnknownConclusion } from '../src/conclusion';
import { isTerminalFinding } from '../src/finding';
import { isTerminalHypothesis } from '../src/hypothesis';
import { isTerminalJob } from '../src/job';
import { isRetrievalFailure, isTerminalObservation } from '../src/observation';
import { isTerminalRun } from '../src/run';
import { isActiveStatus, isNonTerminalStatus, isTerminalStatus } from '../src/status';

describe('lifecycle semantics', () => {
  it('discovered is non-terminal but NOT active — pre-observation state', () => {
    // discovered means "we know this exists" but provider has not acknowledged it.
    // It is non-terminal (the run will progress) but not active (no provider resources).
    expect(isTerminalStatus('discovered')).toBe(false);
    expect(isNonTerminalStatus('discovered')).toBe(true);
    expect(isActiveStatus('discovered')).toBe(false);
  });

  it('queued is non-terminal and active — provider has acknowledged', () => {
    expect(isTerminalStatus('queued')).toBe(false);
    expect(isNonTerminalStatus('queued')).toBe(true);
    expect(isActiveStatus('queued')).toBe(true);
  });

  it('running is non-terminal and active — provider is executing', () => {
    expect(isTerminalStatus('running')).toBe(false);
    expect(isNonTerminalStatus('running')).toBe(true);
    expect(isActiveStatus('running')).toBe(true);
  });

  it('completed is terminal, not active, not non-terminal', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isNonTerminalStatus('completed')).toBe(false);
    expect(isActiveStatus('completed')).toBe(false);
  });
});

describe('conclusion semantics', () => {
  it('passed and failed are completed conclusions', () => {
    expect(isCompletedConclusion('passed')).toBe(true);
    expect(isCompletedConclusion('failed')).toBe(true);
    expect(isPassedConclusion('passed')).toBe(true);
    expect(isPassedConclusion('failed')).toBe(false);
  });

  it('cancelled and timed_out are completed conclusions', () => {
    expect(isCompletedConclusion('cancelled')).toBe(true);
    expect(isCompletedConclusion('timed_out')).toBe(true);
  });

  it('skipped and unknown are inconclusive conclusions', () => {
    expect(isCompletedConclusion('skipped')).toBe(false);
    expect(isCompletedConclusion('unknown')).toBe(false);
    expect(isUnknownConclusion('unknown')).toBe(true);
    expect(isUnknownConclusion('passed')).toBe(false);
  });
});

describe('entity terminal semantics', () => {
  it('run is terminal when status is completed', () => {
    expect(isTerminalRun({ status: 'completed' } as any)).toBe(true);
    expect(isTerminalRun({ status: 'running' } as any)).toBe(false);
  });

  it('job is terminal when status is completed', () => {
    expect(isTerminalJob({ status: 'completed' } as any)).toBe(true);
    expect(isTerminalJob({ status: 'queued' } as any)).toBe(false);
  });

  it('hypothesis is terminal for confirmed/rejected/inconclusive', () => {
    expect(isTerminalHypothesis('confirmed')).toBe(true);
    expect(isTerminalHypothesis('rejected')).toBe(true);
    expect(isTerminalHypothesis('inconclusive')).toBe(true);
    expect(isTerminalHypothesis('proposed')).toBe(false);
    expect(isTerminalHypothesis('investigating')).toBe(false);
  });

  it('finding is terminal for rejected/superseded', () => {
    expect(isTerminalFinding('rejected')).toBe(true);
    expect(isTerminalFinding('superseded')).toBe(true);
    expect(isTerminalFinding('open')).toBe(false);
    expect(isTerminalFinding('classified')).toBe(false);
  });
});

describe('observation terminal and retrieval semantics', () => {
  it('observation with concluded checks is terminal', () => {
    expect(
      isTerminalObservation({
        conclusion: 'unknown',
        passedChecks: 1,
        failedChecks: 0,
        skippedChecks: 0,
      } as any),
    ).toBe(true);
  });

  it('observation with unknown conclusion and zero checks is retrieval failure', () => {
    const obs = {
      conclusion: 'unknown',
      passedChecks: 0,
      failedChecks: 0,
      skippedChecks: 0,
    } as any;
    expect(isRetrievalFailure(obs)).toBe(true);
    expect(isTerminalObservation(obs)).toBe(false);
  });

  it('observation with failed checks is not retrieval failure', () => {
    expect(
      isRetrievalFailure({
        conclusion: 'unknown',
        passedChecks: 0,
        failedChecks: 1,
        skippedChecks: 0,
      } as any),
    ).toBe(false);
  });
});
