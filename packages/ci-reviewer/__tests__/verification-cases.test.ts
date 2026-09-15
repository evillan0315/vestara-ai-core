/**
 * CI-OBS-001D — Acceptance verification cases (V1–V15).
 *
 * Each case from 001D-001 §12 exercised as input → required output.
 * Terminal-CI preconditions per OBSERVATION-3; V15 documents the
 * completeness boundary (hold where completeness is unknowable).
 */

import { describe, expect, it } from 'vitest';
import { review, validateReviewerDecision } from '../src/review';
import { makeEvidence, makeObservation, makePrior } from './fixtures';

describe('V1 empty evidence', () => {
  it('UNKNOWN / no proposals / unknown with named needs', () => {
    const decision = review({ observation: makeObservation(), evidence: [] });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.hypotheses).toEqual([]);
    expect(decision.promotion.verdict).toBe('unknown');
    expect(decision.promotion.limitations.join(' ')).toMatch(/Failed-step logs/);
  });
});

describe('V2 single weak log line', () => {
  it('UNKNOWN with at most a low hold proposal — never promote', () => {
    const decision = review({
      observation: makeObservation(),
      evidence: [makeEvidence({ summary: 'worker exited unexpectedly', stepName: 'Run' })],
    });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.promotion.verdict).not.toBe('promote');
    for (const proposal of decision.hypotheses) {
      expect(proposal.verdict).not.toBe('promote');
      expect(proposal.confidence).toBe('low');
    }
  });
});

describe('V3 strong test-output evidence, terminal, no contradiction', () => {
  it('promotes TEST with non-empty refs', () => {
    const evidence = [
      makeEvidence({
        evidenceId: 'ev-1',
        kind: 'test-output',
        summary: 'FAIL login.test.ts',
        stepName: 'Test',
        exitCode: 1,
        url: 'https://x/1',
      }),
      makeEvidence({
        evidenceId: 'ev-2',
        kind: 'test-output',
        summary: 'FAIL cart.test.ts',
        stepName: 'Test',
        exitCode: 1,
        url: 'https://x/2',
      }),
    ];
    const decision = review({ observation: makeObservation(), evidence });
    expect(decision.classification).toBe('TEST');
    expect(decision.promotion.verdict).toBe('promote');
    expect(decision.promotion.evidenceRefs).toEqual(['ev-1', 'ev-2']);
    expect(decision.promotion.confidence).toBe('high');
  });

  it('holds at nonterminal state on identical inputs (OBSERVATION-3)', () => {
    const evidence = [
      makeEvidence({
        evidenceId: 'ev-1',
        kind: 'test-output',
        summary: 'FAIL login.test.ts',
        stepName: 'Test',
        exitCode: 1,
        url: 'https://x/1',
      }),
    ];
    const decision = review({ observation: makeObservation({ status: 'running', conclusion: 'unknown' }), evidence });
    expect(decision.promotion.verdict).toBe('hold');
  });
});

describe('V4 contradiction blocks', () => {
  it('holds the affected proposal with the blocker named', () => {
    const evidence = [
      makeEvidence({
        evidenceId: 'ev-1',
        kind: 'test-output',
        summary: 'FAIL a.test.ts',
        stepName: 'Test',
        exitCode: 1,
        url: 'https://x/1',
      }),
      makeEvidence({
        evidenceId: 'ev-2',
        kind: 'error-message',
        summary: 'runner connection reset',
        stepName: 'Test',
        exitCode: 1,
      }),
    ];
    const decision = review({ observation: makeObservation(), evidence });
    expect(decision.promotion.verdict).toBe('hold');
    const test = decision.hypotheses.find((proposal) => proposal.classification === 'TEST');
    expect(test?.verdict).toBe('hold');
    expect(test?.contradictionRefs).toContain('ev-2');
  });
});

describe('V5 duplicates-only support', () => {
  it('holds with single-signal rationale', () => {
    const base = makeEvidence({ evidenceId: 'ev-1', summary: 'npm test failed', stepName: 'Test' });
    const decision = review({ observation: makeObservation(), evidence: [base, { ...base, evidenceId: 'ev-2' }] });
    expect(decision.promotion.verdict).toBe('hold');
    expect(decision.promotion.evidenceRefs).toEqual([]);
  });
});

describe('V6 retrieval-failure input', () => {
  it('unknown + retrieval-failure state, zero proposals, nothing CI-failure-shaped', () => {
    const observation = makeObservation({
      status: 'completed',
      conclusion: 'unknown',
      passedChecks: 0,
      failedChecks: 0,
      skippedChecks: 0,
    });
    const decision = review({ observation, evidence: [] });
    expect(decision.promotion.verdict).toBe('unknown');
    expect(decision.promotion.verificationState.kind).toBe('retrieval-failure');
    expect(decision.hypotheses).toEqual([]);
  });
});

describe('V7 incompatible hypotheses, no discriminator', () => {
  it('holds both, review holds', () => {
    const decision = review({
      observation: makeObservation(),
      evidence: [
        makeEvidence({ evidenceId: 'ev-1', summary: 'npm test failed', stepName: 'Test' }),
        makeEvidence({ evidenceId: 'ev-2', summary: 'runner flaky intermittent', stepName: 'Test' }),
      ],
    });
    expect(decision.hypotheses.length).toBeGreaterThanOrEqual(2);
    for (const proposal of decision.hypotheses) expect(proposal.verdict).toBe('hold');
    expect(decision.promotion.verdict).toBe('hold');
  });
});

describe('V8 discriminating exit-code excerpt', () => {
  it('promotes the discriminated sibling at terminal state; holds at nonterminal', () => {
    const evidence = [
      makeEvidence({
        evidenceId: 'ev-1',
        kind: 'test-output',
        summary: 'FAIL login.test.ts',
        stepName: 'Test',
        exitCode: 1,
        url: 'https://x/1',
      }),
      makeEvidence({ evidenceId: 'ev-2', summary: 'flaky runner, intermittent', stepName: 'Test' }),
    ];
    const terminal = review({ observation: makeObservation(), evidence });
    const winner = terminal.hypotheses.find((proposal) => proposal.verdict === 'promote');
    expect(winner?.classification).toBe('TEST');
    expect(terminal.promotion.verdict).toBe('promote');

    const interim = review({
      observation: makeObservation({ status: 'in_progress', conclusion: 'unknown' }),
      evidence,
    });
    expect(interim.promotion.verdict).toBe('hold');
    expect(interim.hypotheses.some((proposal) => proposal.verdict === 'promote')).toBe(false);
  });
});

describe('V9 compatible siblings on disjoint scopes', () => {
  it('dual-promotes at terminal with union refs; holds at nonterminal', () => {
    const evidence = [
      makeEvidence({
        evidenceId: 'ev-1',
        kind: 'test-output',
        summary: 'FAIL a.test.ts',
        stepName: 'Unit',
        exitCode: 1,
        url: 'https://x/1',
      }),
      makeEvidence({ evidenceId: 'ev-2', summary: 'e2e flaky, passed on retry', stepName: 'E2E' }),
      makeEvidence({ evidenceId: 'ev-3', summary: 'e2e intermittent timeout', stepName: 'E2E' }),
    ];
    const terminal = review({ observation: makeObservation(), evidence });
    expect(terminal.hypotheses.filter((proposal) => proposal.verdict === 'promote')).toHaveLength(2);
    expect(terminal.promotion.verdict).toBe('promote');
    expect([...terminal.promotion.evidenceRefs].sort()).toEqual(['ev-1', 'ev-2', 'ev-3']);

    const interim = review({ observation: makeObservation({ status: 'queued', conclusion: 'unknown' }), evidence });
    expect(interim.promotion.verdict).toBe('hold');
  });
});

describe('V10 high confidence with empty refs is invalid', () => {
  it('fails validation', () => {
    const violations = validateReviewerDecision(
      {
        classification: 'TEST',
        hypotheses: [],
        promotion: {
          verdict: 'promote',
          evidenceRefs: [],
          contradictionRefs: [],
          rationale: 'x',
          limitations: [],
          confidence: 'high',
          verificationState: { kind: 'ci-terminal', conclusion: 'failed' },
        },
      },
      { evidenceIds: [], priorIds: [] },
    );
    expect(violations).toContain('promotion-without-evidence');
  });
});

describe('V11 prior cited as evidence support is invalid', () => {
  it('fails validation; kernel never emits it', () => {
    const violations = validateReviewerDecision(
      {
        classification: 'TEST',
        hypotheses: [],
        promotion: {
          verdict: 'hold',
          evidenceRefs: ['hyp-old-1'],
          contradictionRefs: [],
          rationale: 'x',
          limitations: [],
          confidence: 'low',
          verificationState: { kind: 'ci-terminal', conclusion: 'failed' },
        },
      },
      { evidenceIds: [], priorIds: ['hyp-old-1'] },
    );
    expect(violations).toContain('prior-as-evidence');
  });
});

describe('V12 out-of-scope contradiction vs prior', () => {
  it('opens a new-scope proposal without reconsidering the prior', () => {
    const prior = makePrior({ priorId: 'hyp-far', scopeKeys: { runId: 'run-zzz', commitSha: 'zzz' } });
    const evidence = [
      makeEvidence({
        evidenceId: 'ev-1',
        kind: 'test-output',
        summary: 'FAIL a.test.ts',
        stepName: 'Test',
        exitCode: 1,
        url: 'https://x/1',
      }),
      makeEvidence({
        evidenceId: 'ev-2',
        kind: 'test-output',
        summary: 'FAIL b.test.ts',
        stepName: 'Test',
        exitCode: 1,
        url: 'https://x/2',
      }),
    ];
    const decision = review({ observation: makeObservation(), evidence, priors: [prior] });
    for (const proposal of decision.hypotheses) expect(proposal.reconsiders).toBeUndefined();
    const text = decision.hypotheses.map((proposal) => proposal.statement).join(' ');
    expect(text).toMatch(/scope differs/);
  });
});

describe('V13 non-vocabulary classification is invalid', () => {
  it('fails validation', () => {
    const violations = validateReviewerDecision(
      {
        classification: 'NOPE' as never,
        hypotheses: [],
        promotion: {
          verdict: 'hold',
          evidenceRefs: [],
          contradictionRefs: [],
          rationale: 'x',
          limitations: [],
          confidence: 'low',
          verificationState: { kind: 'ci-terminal', conclusion: 'failed' },
        },
      },
      { evidenceIds: [], priorIds: [] },
    );
    expect(violations).toContain('unknown-classification');
  });
});

describe('V14 identical inputs reviewed twice', () => {
  it('yields equivalent decisions', () => {
    const inputs = {
      observation: makeObservation(),
      evidence: [
        makeEvidence({ evidenceId: 'ev-1', summary: 'npm test failed', stepName: 'Test' }),
        makeEvidence({ evidenceId: 'ev-2', summary: 'runner flaky intermittent', stepName: 'Test' }),
      ],
      priors: [makePrior()],
    };
    expect(review(inputs)).toEqual(review(inputs));
  });
});

describe('V15 UNKNOWN-with-evidence completeness boundary', () => {
  it('holds where completeness is unknowable, with the boundary stated', () => {
    const decision = review({
      observation: makeObservation(),
      evidence: [makeEvidence({ summary: 'worker exited unexpectedly', stepName: 'Run' })],
    });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.promotion.verdict).toBe('hold');
    // Promote-as-UNKNOWN-accepted requires a completeness signal only 001E/out-of-band
    // evidence can provide; the kernel documents the boundary instead of guessing.
    expect(decision.promotion.limitations.join(' ')).toMatch(/specificity/);
  });
});
