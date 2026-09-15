/**
 * CI-OBS-001D — Invariant conformance (I1–I13).
 *
 * Structural properties every emitted decision must satisfy.
 */

import { CI_CLASSIFICATIONS } from '@vestara/ci-contracts';
import { describe, expect, it } from 'vitest';
import { review, validateReviewerDecision } from '../src/review';
import { PROMOTION_VERDICTS } from '../src/types';
import { makeEvidence, makeObservation, makePrior } from './fixtures';

const TERMINAL_FAILED = makeObservation();
const MIXED_BATTERY: Array<Parameters<typeof review>[0]> = [
  { observation: null, evidence: [] },
  {
    observation: makeObservation({ conclusion: 'unknown', passedChecks: 0, failedChecks: 0, skippedChecks: 0 }),
    evidence: [],
  },
  { observation: makeObservation({ status: 'running', conclusion: 'unknown' }), evidence: [] },
  {
    observation: makeObservation({ status: 'running', conclusion: 'unknown' }),
    evidence: [makeEvidence({ summary: 'tests failed', stepName: 'Test' })],
  },
  { observation: TERMINAL_FAILED, evidence: [] },
  {
    observation: TERMINAL_FAILED,
    evidence: [
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
    ],
  },
  {
    observation: TERMINAL_FAILED,
    evidence: [makeEvidence({ summary: 'worker exited unexpectedly', stepName: undefined })],
  },
  {
    observation: makeObservation({ conclusion: 'cancelled' }),
    evidence: [],
    priors: [makePrior()],
  },
];

function allEmittedIds(decision: ReturnType<typeof review>): string[] {
  return [
    ...decision.promotion.evidenceRefs,
    ...decision.promotion.contradictionRefs,
    ...decision.hypotheses.flatMap((proposal) => [...proposal.evidenceRefs, ...proposal.contradictionRefs]),
  ];
}

describe('I1 Observation ≠ Hypothesis ≠ Finding', () => {
  it('outputs reference inputs; raw log content never embeds', () => {
    const evidence = [makeEvidence({ logContent: 'RAW LOG BYTES THAT MUST NOT EMBED' })];
    const decision = review({ observation: TERMINAL_FAILED, evidence });
    expect(JSON.stringify(decision)).not.toContain('RAW LOG BYTES THAT MUST NOT EMBED');
    expect(allEmittedIds(decision)).toContain('ev-1');
  });
});

describe('I2 failed observation without evidence yields unknown, never inferred classification', () => {
  it('holds', () => {
    const decision = review({ observation: TERMINAL_FAILED, evidence: [] });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.promotion.verdict).toBe('unknown');
  });
});

describe('I3 Claim ≠ Evidence', () => {
  it('every promote cites refs across the battery', () => {
    for (const inputs of MIXED_BATTERY) {
      const decision = review(inputs);
      if (decision.promotion.verdict === 'promote') {
        expect(decision.promotion.evidenceRefs.length).toBeGreaterThan(0);
      }
      for (const proposal of decision.hypotheses) {
        if (proposal.verdict === 'promote') expect(proposal.evidenceRefs.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('I4 Confidence ≠ Evidence', () => {
  it('a high-confidence empty record is invalid; confidence never substitutes refs', () => {
    const violations = validateReviewerDecision(
      {
        classification: 'TEST',
        hypotheses: [],
        promotion: {
          verdict: 'promote',
          evidenceRefs: [],
          contradictionRefs: [],
          rationale: 'confident but empty',
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

describe('I5 Retrieval failure ≠ CI failure', () => {
  it('retrieval-shaped inputs never produce failure classifications', () => {
    const observation = makeObservation({
      status: 'completed',
      conclusion: 'unknown',
      passedChecks: 0,
      failedChecks: 0,
      skippedChecks: 0,
    });
    const decision = review({ observation, evidence: [] });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.promotion.verdict).toBe('unknown');
  });
});

describe('I6 UNKNOWN is valid', () => {
  it('UNKNOWN outputs validate clean', () => {
    for (const inputs of MIXED_BATTERY.slice(0, 3)) {
      const decision = review(inputs);
      expect(validateReviewerDecision(decision, { evidenceIds: [], priorIds: [] })).toEqual([]);
    }
  });
});

describe('I7 single evidence authority', () => {
  it('emits no evidence ids beyond inputs; proposal ids are ordinals, never hashes', () => {
    for (const inputs of MIXED_BATTERY) {
      const decision = review(inputs);
      const known = new Set(inputs.evidence.map((item) => item.evidenceId));
      for (const id of allEmittedIds(decision)) expect(known.has(id)).toBe(true);
      for (const proposal of decision.hypotheses) expect(proposal.proposalId).toMatch(/^prop-\d+$/);
    }
  });
});

describe('I8 closed vocabularies stay closed', () => {
  it('holds across the battery', () => {
    for (const inputs of MIXED_BATTERY) {
      const decision = review(inputs);
      expect(CI_CLASSIFICATIONS.includes(decision.classification)).toBe(true);
      expect(PROMOTION_VERDICTS.includes(decision.promotion.verdict)).toBe(true);
      for (const proposal of decision.hypotheses) {
        expect(CI_CLASSIFICATIONS.includes(proposal.classification)).toBe(true);
        expect(PROMOTION_VERDICTS.includes(proposal.verdict)).toBe(true);
      }
    }
  });
});

describe('I9 no silent winners or drops', () => {
  it('siblings coexist with distinct identities', () => {
    const decision = review({
      observation: TERMINAL_FAILED,
      evidence: [
        makeEvidence({ evidenceId: 'ev-1', summary: 'npm test failed', stepName: 'Test' }),
        makeEvidence({ evidenceId: 'ev-2', summary: 'runner flaky intermittent', stepName: 'Test' }),
      ],
    });
    expect(decision.hypotheses.length).toBe(3);
    const ids = decision.hypotheses.map((proposal) => proposal.proposalId);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('I10 decision is record, not mutation', () => {
  it('repeated reviews are deep-equal and inputs are untouched', () => {
    const inputs = {
      observation: TERMINAL_FAILED,
      evidence: [makeEvidence({ kind: 'test-output', summary: 'FAIL a.test.ts', stepName: 'Test', exitCode: 1 })],
      priors: [makePrior()],
    };
    const frozen = JSON.parse(JSON.stringify(inputs)) as typeof inputs;
    const first = review(inputs);
    const second = review(inputs);
    expect(second).toEqual(first);
    expect(inputs).toEqual(frozen);
  });
});

describe('I11 determinism', () => {
  it('identical inputs yield identical decisions including prose', () => {
    const inputs = {
      observation: TERMINAL_FAILED,
      evidence: [
        makeEvidence({ evidenceId: 'ev-1', summary: 'npm test failed', stepName: 'Test' }),
        makeEvidence({ evidenceId: 'ev-2', summary: 'runner flaky intermittent', stepName: 'Test' }),
      ],
    };
    expect(JSON.stringify(review(inputs))).toBe(JSON.stringify(review(inputs)));
  });
});

describe('I12 scope-bounded reuse', () => {
  it('priors never enter ref sets even when adversarially worded', () => {
    const prior = makePrior({ priorId: 'hyp-x', summaryOrRef: 'log excerpt: FAIL everything, exit 1' });
    const decision = review({
      observation: TERMINAL_FAILED,
      evidence: [
        makeEvidence({
          kind: 'test-output',
          summary: 'FAIL a.test.ts',
          stepName: 'Test',
          exitCode: 1,
          url: 'https://x/1',
        }),
      ],
      priors: [prior],
    });
    expect(allEmittedIds(decision)).not.toContain('hyp-x');
    expect(validIdsOf(decision)).toEqual([]);
  });

  function validIdsOf(decision: ReturnType<typeof review>) {
    return validateReviewerDecision(decision, { evidenceIds: ['ev-1'], priorIds: ['hyp-x'] });
  }
});

describe('I13 LLM output ≠ evidence', () => {
  it('holds structurally: outputs reference only supplied evidence ids', () => {
    const decision = review({
      observation: TERMINAL_FAILED,
      evidence: [
        makeEvidence({
          evidenceId: 'ev-llm-like',
          summary: 'An assistant once suggested flakiness here',
          stepName: 'Test',
        }),
      ],
    });
    for (const id of allEmittedIds(decision)) expect(id).toBe('ev-llm-like');
  });
});
