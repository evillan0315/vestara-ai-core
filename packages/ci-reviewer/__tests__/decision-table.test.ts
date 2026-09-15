/**
 * CI-OBS-001D — Decision-table conformance (T1–T15).
 *
 * Each row of the 001D-001 §8 table exercised against the kernel.
 * No network, clock, LLM, or persistence involved.
 */

import { describe, expect, it } from 'vitest';
import { review, validateReviewerDecision } from '../src/review';
import { makeEvidence, makeObservation, makePrior } from './fixtures';

function validIds(decision: ReturnType<typeof review>, evidenceIds: string[], priorIds: string[] = []) {
  return validateReviewerDecision(decision, { evidenceIds, priorIds });
}

describe('T1 absent observation', () => {
  it('yields UNKNOWN / no proposals / unknown(no-observation)', () => {
    const decision = review({ observation: null, evidence: [] });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.hypotheses).toEqual([]);
    expect(decision.promotion.verdict).toBe('unknown');
    expect(decision.promotion.verificationState).toEqual({ kind: 'no-observation' });
    expect(validIds(decision, [])).toEqual([]);
  });
});

describe('T2 retrieval failure', () => {
  it('yields UNKNOWN / no proposals / unknown(retrieval-failure), never a CI failure', () => {
    const observation = makeObservation({ conclusion: 'unknown', passedChecks: 0, failedChecks: 0, skippedChecks: 0 });
    const decision = review({ observation, evidence: [] });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.hypotheses).toEqual([]);
    expect(decision.promotion.verdict).toBe('unknown');
    expect(decision.promotion.verificationState.kind).toBe('retrieval-failure');
    expect(decision.promotion.rationale).not.toMatch(/classification (TEST|BUILD|CODE)/);
    expect(validIds(decision, [])).toEqual([]);
  });
});

describe('T3 nonterminal + empty evidence', () => {
  it('yields unknown with no proposals', () => {
    const decision = review({
      observation: makeObservation({ status: 'running', conclusion: 'unknown' }),
      evidence: [],
    });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.hypotheses).toEqual([]);
    expect(decision.promotion.verdict).toBe('unknown');
    expect(decision.promotion.verificationState).toEqual({ kind: 'ci-nonterminal' });
  });
});

describe('T4 nonterminal + evidence (MAJOR-1)', () => {
  it('holds with no promote even for sufficient-looking evidence', () => {
    const strong = [
      makeEvidence({
        evidenceId: 'ev-1',
        kind: 'test-output',
        summary: 'FAIL src/a.test.ts',
        stepName: 'Test',
        exitCode: 1,
      }),
      makeEvidence({
        evidenceId: 'ev-2',
        kind: 'test-output',
        summary: 'FAIL src/b.test.ts',
        stepName: 'Test',
        exitCode: 1,
      }),
    ];
    const decision = review({
      observation: makeObservation({ status: 'running', conclusion: 'unknown' }),
      evidence: strong,
    });
    expect(decision.promotion.verdict).toBe('hold');
    for (const proposal of decision.hypotheses) expect(proposal.verdict).not.toBe('promote');
    expect(decision.promotion.evidenceRefs).toEqual([]);
    expect(decision.promotion.limitations.join(' ')).toMatch(/terminal/);
    expect(validIds(decision, ['ev-1', 'ev-2'])).toEqual([]);
  });
});

describe('T5 terminal failed + empty evidence', () => {
  it('yields unknown with limitations naming needed evidence', () => {
    const decision = review({ observation: makeObservation(), evidence: [] });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.hypotheses).toEqual([]);
    expect(decision.promotion.verdict).toBe('unknown');
    expect(decision.promotion.limitations.length).toBeGreaterThan(0);
  });
});

describe('T6 terminal failed + sufficient evidence', () => {
  it('promotes the evidenced member with non-empty refs', () => {
    const evidence = [
      makeEvidence({
        evidenceId: 'ev-1',
        kind: 'test-output',
        summary: 'FAIL src/a.test.ts',
        stepName: 'Test',
        exitCode: 1,
        url: 'https://x/1',
      }),
      makeEvidence({
        evidenceId: 'ev-2',
        kind: 'test-output',
        summary: 'FAIL src/b.test.ts',
        stepName: 'Test',
        exitCode: 1,
        url: 'https://x/2',
      }),
    ];
    const decision = review({ observation: makeObservation(), evidence });
    expect(decision.classification).toBe('TEST');
    expect(decision.promotion.verdict).toBe('promote');
    expect(decision.promotion.evidenceRefs).toEqual(['ev-1', 'ev-2']);
    expect(decision.promotion.verificationState).toEqual({ kind: 'ci-terminal', conclusion: 'failed' });
    expect(validIds(decision, ['ev-1', 'ev-2'])).toEqual([]);
  });
});

describe('T7 sufficient + undispositioned contradiction', () => {
  it('holds all same-scope rivals and names the blocker', () => {
    const evidence = [
      makeEvidence({ evidenceId: 'ev-1', summary: 'npm test failed', stepName: 'Test' }),
      makeEvidence({ evidenceId: 'ev-2', summary: 'runner flaky, intermittent agent lost', stepName: 'Test' }),
    ];
    const decision = review({ observation: makeObservation(), evidence });
    expect(decision.promotion.verdict).toBe('hold');
    expect(decision.hypotheses).toHaveLength(3);
    for (const proposal of decision.hypotheses) {
      expect(proposal.verdict).toBe('hold');
      expect(proposal.contradictionRefs.length).toBeGreaterThan(0);
    }
    expect(validIds(decision, ['ev-1', 'ev-2'])).toEqual([]);
  });
});

describe('T8 defeated by contradiction', () => {
  it('holds (never promotes) with the blocker cited — rejection requires out-of-band disposition', () => {
    const evidence = [
      makeEvidence({ evidenceId: 'ev-1', summary: 'npm test failed', stepName: 'Test' }),
      makeEvidence({ evidenceId: 'ev-2', summary: 'runner lost, infrastructure', stepName: 'Test' }),
    ];
    const decision = review({ observation: makeObservation(), evidence });
    for (const proposal of decision.hypotheses) expect(proposal.verdict).not.toBe('promote');
    expect(['hold', 'reject']).toContain(decision.promotion.verdict);
  });
});

describe('T9 genuine but nonspecific evidence', () => {
  it('yields UNKNOWN hold with specificity limitations', () => {
    const decision = review({
      observation: makeObservation(),
      evidence: [makeEvidence({ summary: 'worker exited unexpectedly', stepName: undefined })],
    });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.promotion.verdict).toBe('hold');
    expect(decision.promotion.limitations.join(' ')).toMatch(/specificity/);
  });
});

describe('T10 duplicates-only sufficiency', () => {
  it('collapses copies to one signal: UNKNOWN hold, duplicates out of refs', () => {
    const base = makeEvidence({
      evidenceId: 'ev-1',
      kind: 'test-output',
      summary: 'FAIL a.test.ts',
      stepName: 'Test',
      exitCode: 1,
    });
    const evidence = [base, { ...base, evidenceId: 'ev-2' }, { ...base, evidenceId: 'ev-3' }];
    const decision = review({ observation: makeObservation(), evidence });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.promotion.verdict).toBe('hold');
    const allRefs = decision.hypotheses.flatMap((proposal) => proposal.evidenceRefs);
    expect(allRefs).toHaveLength(1);
    expect(decision.promotion.limitations.join(' ') + decision.hypotheses.map((p) => p.statement).join(' ')).toMatch(
      /single-signal|copies/,
    );
    expect(validIds(decision, ['ev-1', 'ev-2', 'ev-3'])).toEqual([]);
  });
});

describe('T11 shared support without discriminator', () => {
  it('holds both siblings', () => {
    const decision = review({
      observation: makeObservation(),
      evidence: [makeEvidence({ summary: 'build test failure', stepName: 'CI' })],
    });
    expect(decision.hypotheses.length).toBeGreaterThanOrEqual(2);
    for (const proposal of decision.hypotheses) expect(proposal.verdict).toBe('hold');
    expect(decision.promotion.verdict).toBe('hold');
  });
});

describe('T12 shared support with discriminator (V8)', () => {
  it('promotes the discriminated winner, holds the loser with the blocker named', () => {
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
    const decision = review({ observation: makeObservation(), evidence });
    const winner = decision.hypotheses.find((proposal) => proposal.verdict === 'promote');
    expect(winner?.classification).toBe('TEST');
    const loser = decision.hypotheses.find((proposal) => proposal.verdict !== 'promote');
    expect(loser?.contradictionRefs).toContain('ev-1');
    expect(decision.promotion.verdict).toBe('promote');
    expect(validIds(decision, ['ev-1', 'ev-2'])).toEqual([]);
  });
});

describe('T13 terminal non-failed', () => {
  it('cancelled without failure evidence → CANCELLED, unknown, no proposals', () => {
    const decision = review({ observation: makeObservation({ conclusion: 'cancelled' }), evidence: [] });
    expect(decision.classification).toBe('CANCELLED');
    expect(decision.hypotheses).toEqual([]);
    expect(decision.promotion.verdict).toBe('unknown');
  });

  it('cancelled WITH affirmative failure evidence takes the evidenced member (MINOR-1)', () => {
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
    const decision = review({ observation: makeObservation({ conclusion: 'cancelled' }), evidence });
    expect(decision.classification).toBe('TEST');
    expect(decision.promotion.verdict).toBe('promote');
    expect(decision.promotion.rationale).toMatch(/cancell/i);
    expect(decision.promotion.limitations.join(' ')).toMatch(/Cancellation/);
  });

  it('timed_out with evidence stays literal: UNKNOWN + unknown', () => {
    const decision = review({
      observation: makeObservation({ conclusion: 'timed_out' }),
      evidence: [makeEvidence({ summary: 'tests timed out', stepName: 'Test' })],
    });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.promotion.verdict).toBe('unknown');
  });
});

describe('T14 prior interplay (case 9)', () => {
  it('overlapping scope yields a reconsideration link with 001E recommendation', () => {
    const evidence = [
      makeEvidence({
        evidenceId: 'ev-new',
        kind: 'test-output',
        summary: 'FAIL a.test.ts',
        stepName: 'Test',
        exitCode: 1,
        url: 'https://x/1',
      }),
      makeEvidence({
        evidenceId: 'ev-new2',
        kind: 'test-output',
        summary: 'FAIL b.test.ts',
        stepName: 'Test',
        exitCode: 1,
        url: 'https://x/2',
      }),
    ];
    const decision = review({ observation: makeObservation(), evidence, priors: [makePrior()] });
    const reconsidered = decision.hypotheses.filter((proposal) => proposal.reconsiders === 'hyp-old-1');
    expect(reconsidered.length).toBeGreaterThan(0);
    expect(decision.hypotheses.map((p) => p.statement).join(' ')).toMatch(/001E/);
    expect(validIds(decision, ['ev-new', 'ev-new2'], ['hyp-old-1'])).toEqual([]);
  });

  it('out-of-scope prior yields new-scope proposals with a boundary note (V12)', () => {
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
    const text = decision.hypotheses.map((p) => p.statement).join(' ') + decision.promotion.limitations.join(' ');
    expect(text).toMatch(/scope differs|context only/);
  });
});

describe('T15 validation failures', () => {
  it('flags promotion-without-evidence, unknown classification, dangling and prior refs', () => {
    expect(
      validateReviewerDecision(
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
      ),
    ).toContain('promotion-without-evidence');
    expect(
      validateReviewerDecision(
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
      ),
    ).toContain('unknown-classification');
    expect(
      validateReviewerDecision(
        {
          classification: 'TEST',
          hypotheses: [],
          promotion: {
            verdict: 'hold',
            evidenceRefs: ['ghost'],
            contradictionRefs: [],
            rationale: 'x',
            limitations: [],
            confidence: 'low',
            verificationState: { kind: 'ci-terminal', conclusion: 'failed' },
          },
        },
        { evidenceIds: [], priorIds: [] },
      ),
    ).toContain('dangling-ref');
    expect(
      validateReviewerDecision(
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
      ),
    ).toContain('prior-as-evidence');
  });
});
