import { describe, expect, it } from 'vitest';
import { review } from '../src/review';

describe('CI reviewer pure decision contract', () => {
  it('claims nothing without an observation', () => {
    const decision = review({ observation: undefined, evidence: [] });
    expect(decision.classification).toBe('UNKNOWN');
    expect(decision.promotion.verdict).toBe('unknown');
    expect(decision.hypotheses).toEqual([]);
  });

  it('is deterministic for identical inputs', () => {
    const inputs = { observation: undefined, evidence: [] } as never;
    expect(review(inputs)).toEqual(review(inputs));
  });
});
