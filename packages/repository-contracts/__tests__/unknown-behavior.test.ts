/**
 * VES-REPO-002 — UNKNOWN behavior: never ALLOW, never proof.
 */
import { describe, expect, it } from 'vitest';
import { claimStrengthAllowsIntroductionClaim } from '../src/changeset';
import {
  allowMutation,
  decisionPermitsMutation,
  isValidCoordinationDecision,
  unknownCompatibility,
} from '../src/decision';

describe('UNKNOWN behavior', () => {
  it('UNKNOWN decision never permits mutation', () => {
    expect(decisionPermitsMutation(unknownCompatibility('no baseline yet'))).toBe(false);
  });

  it('HOLD and DENY never permit mutation', () => {
    const conflict = {
      class: 'exact-path' as const,
      repositoryId: 'r1',
      involvedExecutions: ['e1', 'e2'],
      description: 'same file',
    };
    expect(decisionPermitsMutation({ decision: 'hold', conflicts: [conflict] })).toBe(false);
    expect(decisionPermitsMutation({ decision: 'deny', conflicts: [conflict] })).toBe(false);
  });

  it('only explicit ALLOW permits mutation', () => {
    expect(decisionPermitsMutation(allowMutation('scopes proven disjoint'))).toBe(true);
  });

  it('empty HOLD/DENY and reasonless ALLOW are invalid', () => {
    expect(isValidCoordinationDecision({ decision: 'hold', conflicts: [] })).toBe(false);
    expect(isValidCoordinationDecision({ decision: 'allow', reason: '' })).toBe(false);
    expect(isValidCoordinationDecision({ decision: 'unknown', reason: '' })).toBe(false);
    expect(isValidCoordinationDecision({ decision: 'maybe', reason: 'x' })).toBe(false);
  });

  it('correlation is never promoted into proof', () => {
    expect(claimStrengthAllowsIntroductionClaim('PROVEN')).toBe(true);
    expect(claimStrengthAllowsIntroductionClaim('CORRELATED')).toBe(false);
    expect(claimStrengthAllowsIntroductionClaim('AMBIGUOUS')).toBe(false);
    expect(claimStrengthAllowsIntroductionClaim('UNKNOWN')).toBe(false);
  });
});
