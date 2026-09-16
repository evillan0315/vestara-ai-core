import type { CIConclusion, CIObservation } from '@vestara/ci-contracts';
import type { PromotionVerdict, ReviewerDecision } from '@vestara/ci-reviewer';
import { describe, expect, it } from 'vitest';
import { deriveVerificationAction } from '../src/action';

function observation(conclusion: CIConclusion): CIObservation {
  return {
    observationId: 'obs-1',
    runId: 'run-1',
    commitSha: 'sha-1',
    status: 'completed',
    conclusion,
    passedChecks: 0,
    failedChecks: conclusion === 'failed' ? 1 : 0,
    skippedChecks: 0,
    trigger: 'webhook',
    observedAt: '2026-09-16T00:00:00.000Z',
    provenance: [],
  };
}

function decision(verdict: PromotionVerdict, evidenceRefs: readonly string[] = []): ReviewerDecision {
  return {
    classification: 'BUILD',
    hypotheses: [],
    promotion: {
      verdict,
      evidenceRefs,
      contradictionRefs: [],
      rationale: 'test',
      limitations: [],
      confidence: 'low',
      verificationState: { kind: 'ci-terminal', conclusion: 'failed' },
    },
  };
}

describe('deriveVerificationAction', () => {
  it('holds a failure whose hypothesis was not promoted', () => {
    expect(deriveVerificationAction(observation('failed'), decision('hold')).action).toBe('HOLD');
  });

  it('holds a promoted failure with no evidence refs', () => {
    expect(deriveVerificationAction(observation('failed'), decision('promote', [])).action).toBe('HOLD');
  });

  it('yields only a repair candidate for a promoted, evidenced failure', () => {
    const outcome = deriveVerificationAction(observation('failed'), decision('promote', ['e1']));
    expect(outcome.action).toBe('REPAIR_CANDIDATE');
    expect(outcome.reason).toMatch(/candidate/i);
  });

  it('treats cancellation as evidence, not root-cause failure', () => {
    const outcome = deriveVerificationAction(observation('cancelled'), decision('hold'));
    expect(outcome.action).toBe('HOLD');
    expect(outcome.reason).toMatch(/cancelled/i);
  });

  it('proceeds to verification on CI pass (pass ≠ objective verification)', () => {
    const outcome = deriveVerificationAction(observation('passed'), decision('hold'));
    expect(outcome.action).toBe('PROCEED_TO_VERIFICATION');
    expect(outcome.reason).toMatch(/not objective verification/i);
  });

  it('holds inconclusive and timed-out conclusions', () => {
    expect(deriveVerificationAction(observation('skipped'), decision('hold')).action).toBe('HOLD');
    expect(deriveVerificationAction(observation('unknown'), decision('hold')).action).toBe('HOLD');
    expect(deriveVerificationAction(observation('timed_out'), decision('hold')).action).toBe('HOLD');
  });
});
