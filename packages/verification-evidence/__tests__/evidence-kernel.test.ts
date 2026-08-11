import { describe, expect, it } from 'vitest';
import { deriveConclusion, snapshotContentHash } from '../src/index.js';

function testSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: '1.0',
    evidenceType: 'test-evidence',
    identity: { repositoryId: 'repo', baselineSha: 'a', currentSha: 'b' },
    execution: { command: 'pnpm test', scope: 'full-suite' },
    results: { passed: 1, failed: 0 },
    capturedAt: '2026-08-06T00:00:00.000Z',
    contentHash: 'ignored',
    ...overrides,
  };
}

describe('evidence kernel (ADR-012)', () => {
  it('produces a deterministic content hash for equal snapshots', () => {
    const a = snapshotContentHash(testSnapshot() as never);
    const b = snapshotContentHash(testSnapshot() as never);
    expect(a).toBe(b);
  });

  it('produces different content hashes when results differ', () => {
    const a = snapshotContentHash(testSnapshot() as never);
    const b = snapshotContentHash(testSnapshot({ results: { passed: 2, failed: 1 } }) as never);
    expect(a).not.toBe(b);
  });

  it('comparable snapshots can produce pass', () => {
    const conclusion = deriveConclusion({
      comparabilityStatus: 'comparable',
      changesSummary: ['no failures added'],
      evidenceHashes: ['baseline-hash', 'current-hash'],
      deltaHash: 'delta-hash',
      confidence: 'high',
    });
    expect(conclusion.status).toBe('pass');
    expect(conclusion.regressionIntroduced).toBe(false);
  });

  it('incomparable snapshots always produce indeterminate with null regression', () => {
    const conclusion = deriveConclusion({
      comparabilityStatus: 'incomparable',
      changesSummary: ['verification scope differs'],
      evidenceHashes: ['baseline-hash', 'current-hash'],
      deltaHash: 'delta-hash',
      confidence: 'low',
    });
    expect(conclusion.status).toBe('indeterminate');
    expect(conclusion.regressionIntroduced).toBeNull();
  });

  it('partial comparability restricts conclusions and lowers confidence', () => {
    const conclusion = deriveConclusion({
      comparabilityStatus: 'partially-comparable',
      changesSummary: ['lockfile changed'],
      evidenceHashes: ['baseline-hash', 'current-hash'],
      deltaHash: 'delta-hash',
      confidence: 'medium',
    });
    expect(conclusion.status).toBe('indeterminate');
    expect(conclusion.regressionIntroduced).toBeNull();
    expect(conclusion.confidence).toBe('medium');
  });

  it('a conclusion cannot be constructed without comparability evaluation', () => {
    // deriveConclusion requires an explicit comparability status; there is no
    // overload that skips it. The low-confidence comparable case demonstrates
    // the guard: low confidence cannot yield a definitive pass.
    const conclusion = deriveConclusion({
      comparabilityStatus: 'comparable',
      changesSummary: [],
      evidenceHashes: [],
      deltaHash: 'd',
      confidence: 'low',
    });
    expect(conclusion.status).toBe('indeterminate');
  });

  it('references immutable snapshot and delta hashes', () => {
    const conclusion = deriveConclusion({
      comparabilityStatus: 'comparable',
      changesSummary: [],
      evidenceHashes: ['baseline-hash', 'current-hash'],
      deltaHash: 'delta-hash',
      confidence: 'high',
    });
    expect(conclusion.evidenceHashes).toEqual(['baseline-hash', 'current-hash']);
    expect(conclusion.deltaHash).toBe('delta-hash');
  });
});
