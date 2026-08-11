import { describe, expect, it } from 'vitest';
import { compareFailures, failureFingerprint, normalizeFailureMessage } from '../src/index.js';

function failure(suitePath: string, testName: string, message = 'boom'): string {
  return failureFingerprint(suitePath, testName, normalizeFailureMessage(message));
}

describe('failure fingerprinting', () => {
  it('normalizes run-specific noise in failure messages', () => {
    const normalized = normalizeFailureMessage('failed at /2026-08-06T12:00:00Z/some path abcdef1234567');
    expect(normalized).not.toContain('2026-08-06');
    expect(normalized).not.toContain('abcdef1234567');
  });

  it('identifies a failure by suite, test, and normalized message', () => {
    const a = failure('a.test.ts', 'test one');
    const b = failure('a.test.ts', 'test one');
    const c = failure('a.test.ts', 'test two');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('detects added and resolved failures by fingerprint', () => {
    const baseline = [failure('a.test.ts', 't1'), failure('a.test.ts', 't2')];
    const current = [failure('a.test.ts', 't2'), failure('a.test.ts', 't3')];
    const delta = compareFailures(
      baseline.map((fingerprint) => ({
        suitePath: 'a',
        testName: 'x',
        normalizedMessageHash: fingerprint,
        fingerprint,
      })),
      current.map((fingerprint) => ({
        suitePath: 'a',
        testName: 'x',
        normalizedMessageHash: fingerprint,
        fingerprint,
      })),
    );
    expect(delta.addedCount).toBe(1);
    expect(delta.resolvedCount).toBe(1);
    expect(delta.unchangedCount).toBe(1);
    expect(delta.fingerprintChanged).toBe(true);
  });

  it('same count with different fingerprints is detected as a change', () => {
    const baseline = [failure('a.test.ts', 't1')];
    const current = [failure('a.test.ts', 't2')];
    const delta = compareFailures(
      baseline.map((fingerprint) => ({
        suitePath: 'a',
        testName: 'x',
        normalizedMessageHash: fingerprint,
        fingerprint,
      })),
      current.map((fingerprint) => ({
        suitePath: 'a',
        testName: 'x',
        normalizedMessageHash: fingerprint,
        fingerprint,
      })),
    );
    expect(delta.addedCount).toBe(1);
    expect(delta.resolvedCount).toBe(1);
    expect(delta.fingerprintChanged).toBe(true);
  });
});
