/**
 * CI-OBS-001B — UNKNOWN is valid evidence.
 *
 * UNKNOWN must be preserved through the contract layer. It must not be
 * silently converted to FAILED or any other conclusion. The system must
 * be able to represent "we don't know" as a first-class state.
 */
import { describe, expect, it } from 'vitest';
import { CI_CLASSIFICATIONS, isUnknownClassification } from '../src/classification';
import { CI_CONCLUSIONS, isUnknownConclusion } from '../src/conclusion';
import { CI_HYPOTHESIS_STATUSES } from '../src/hypothesis';
import { isRetrievalFailure } from '../src/observation';

describe('UNKNOWN preservation', () => {
  it('unknown is a valid CI conclusion', () => {
    expect(CI_CONCLUSIONS).toContain('unknown');
    expect(isUnknownConclusion('unknown')).toBe(true);
  });

  it('unknown is not failed, passed, or cancelled', () => {
    expect(isUnknownConclusion('failed')).toBe(false);
    expect(isUnknownConclusion('passed')).toBe(false);
    expect(isUnknownConclusion('cancelled')).toBe(false);
  });

  it('unknown is a valid classification', () => {
    expect(CI_CLASSIFICATIONS).toContain('UNKNOWN');
    expect(isUnknownClassification('UNKNOWN')).toBe(true);
  });

  it('retrieval failure is distinguishable from CI failure', () => {
    // Retrieval failure: unknown conclusion, zero checks — we couldn't even see the CI
    const retrievalFailure = {
      conclusion: 'unknown',
      passedChecks: 0,
      failedChecks: 0,
      skippedChecks: 0,
    } as any;
    expect(isRetrievalFailure(retrievalFailure)).toBe(true);

    // CI failure: unknown conclusion, but we saw checks — the CI ran but we can't classify
    const ciUnknown = {
      conclusion: 'unknown',
      passedChecks: 3,
      failedChecks: 1,
      skippedChecks: 0,
    } as any;
    expect(isRetrievalFailure(ciUnknown)).toBe(false);
  });

  it('inconclusive is a valid hypothesis status (distinct from confirmed/rejected)', () => {
    expect(CI_HYPOTHESIS_STATUSES).toContain('inconclusive');
  });
});

describe('UNKNOWN cannot be silently converted', () => {
  it('isUnknownConclusion is false for every non-unknown conclusion', () => {
    for (const c of CI_CONCLUSIONS) {
      if (c === 'unknown') {
        expect(isUnknownConclusion(c)).toBe(true);
      } else {
        expect(isUnknownConclusion(c)).toBe(false);
      }
    }
  });

  it('isUnknownClassification is false for every non-UNKNOWN classification', () => {
    for (const c of CI_CLASSIFICATIONS) {
      if (c === 'UNKNOWN') {
        expect(isUnknownClassification(c)).toBe(true);
      } else {
        expect(isUnknownClassification(c)).toBe(false);
      }
    }
  });
});
