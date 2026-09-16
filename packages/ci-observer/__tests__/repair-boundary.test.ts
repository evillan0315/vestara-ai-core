import { describe, expect, it } from 'vitest';
import type { CICompletionResult } from '../src/completion';
import {
  CI_REPAIR_AUTHORITY_CONTRACT_VERSION,
  evaluateRepairAuthority,
  repairRequestFromCompletion,
} from '../src/repair-boundary';

function completion(action: string): CICompletionResult {
  const observation = {
    observationId: 'obs-1',
    runId: 'run-1',
    commitSha: 'abc',
    status: 'completed',
    conclusion: 'failed',
    passedChecks: 0,
    failedChecks: 1,
    skippedChecks: 0,
    trigger: 'webhook',
    observedAt: '2026-09-16T00:00:00.000Z',
    provenance: [],
  };
  const decision = {
    classification: 'TEST',
    hypotheses: [],
    promotion: { verdict: 'promote', evidenceRefs: ['e1'] },
  };
  return {
    correlation: { correlationId: 'c', originatingTaskId: 't' },
    observation,
    evidence: [],
    decision,
    outcome: { action, reason: 'x', observation, decision },
    violations: [],
  } as unknown as CICompletionResult;
}

describe('governed repair boundary (CI-OBS-001J)', () => {
  it('denies repair even for a promoted failure candidate', () => {
    const decision = evaluateRepairAuthority({ action: 'REPAIR_CANDIDATE', classification: 'TEST' });
    expect(decision.authorized).toBe(false);
    expect(decision.reason).toMatch(/candidate/i);
    expect(decision.contractVersion).toBe(CI_REPAIR_AUTHORITY_CONTRACT_VERSION);
  });

  it('denies repair on hold and proceed-to-verification', () => {
    expect(evaluateRepairAuthority({ action: 'HOLD', classification: 'UNKNOWN' }).authorized).toBe(false);
    expect(evaluateRepairAuthority({ action: 'PROCEED_TO_VERIFICATION', classification: 'UNKNOWN' }).authorized).toBe(
      false,
    );
  });

  it('builds a record-only request from a completion', () => {
    const request = repairRequestFromCompletion(completion('REPAIR_CANDIDATE'));
    expect(request.action).toBe('REPAIR_CANDIDATE');
    expect(request.classification).toBe('TEST');
    expect(request.evidenceRefs).toEqual(['e1']);
  });
});
