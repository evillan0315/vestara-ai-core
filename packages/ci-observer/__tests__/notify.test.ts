import { describe, expect, it } from 'vitest';
import type { CICompletionResult } from '../src/completion';
import { projectCINotification } from '../src/notify';

function completion(over: {
  conclusion: string;
  action: string;
  verdict?: string;
  passed?: number;
  failed?: number;
  skipped?: number;
}): CICompletionResult {
  const observation = {
    observationId: 'obs-1',
    runId: 'run-1',
    commitSha: 'abc',
    status: 'completed',
    conclusion: over.conclusion,
    passedChecks: over.passed ?? 1,
    failedChecks: over.failed ?? 0,
    skippedChecks: over.skipped ?? 0,
    trigger: 'webhook',
    observedAt: '2026-09-16T00:00:00.000Z',
    provenance: [],
  };
  const decision = {
    classification: 'TEST',
    hypotheses: [],
    promotion: { verdict: over.verdict ?? 'promote' },
  };
  return {
    correlation: { correlationId: 'ci-corr:r:abc:t', originatingTaskId: 't' },
    observation,
    evidence: [],
    decision,
    outcome: { action: over.action, reason: 'x', observation, decision },
    violations: [],
  } as unknown as CICompletionResult;
}

describe('projectCINotification', () => {
  it('notifies on a passing run without claiming objective verification', () => {
    const notification = projectCINotification(completion({ conclusion: 'passed', action: 'PROCEED_TO_VERIFICATION' }));
    expect(notification?.kind).toBe('all-required-checks-passed');
    expect(notification?.severity).toBe('info');
    expect(notification?.body).toMatch(/not objective verification/);
  });

  it('notifies a promoted failure as a failed required check (repair is a candidate)', () => {
    const notification = projectCINotification(completion({ conclusion: 'failed', action: 'REPAIR_CANDIDATE' }));
    expect(notification?.kind).toBe('required-check-failed');
    expect(notification?.body).toMatch(/candidate, not an instruction/);
  });

  it('asks for a human decision when a failure was not promoted', () => {
    const notification = projectCINotification(
      completion({ conclusion: 'failed', action: 'HOLD', verdict: 'hold', passed: 0, failed: 1 }),
    );
    expect(notification?.kind).toBe('human-decision-required');
  });

  it('reports a retrieval failure as an observation failure, not a CI failure', () => {
    const notification = projectCINotification(
      completion({ conclusion: 'unknown', action: 'HOLD', verdict: 'unknown', passed: 0, failed: 0, skipped: 0 }),
    );
    expect(notification?.kind).toBe('observation-failed');
    expect(notification?.body).toMatch(/not a CI failure/);
  });

  it('treats cancelled/timed-out as inconclusive', () => {
    for (const conclusion of ['cancelled', 'timed_out']) {
      expect(projectCINotification(completion({ conclusion, action: 'HOLD' }))?.kind).toBe(
        'run-cancelled-or-timed-out',
      );
    }
  });

  it('does not notify on a skipped run', () => {
    expect(projectCINotification(completion({ conclusion: 'skipped', action: 'HOLD' }))).toBeUndefined();
  });
});
