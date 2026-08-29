import type { EvidenceIdentity } from '@vestara/verification-evidence';
import { describe, expect, it } from 'vitest';
import {
  collectRepositoryEvidence,
  failureFingerprint,
  normalizeFailureMessage,
  RepositoryEvidenceComparator,
} from '../src/index.js';

function identity(sha: string): EvidenceIdentity {
  return {
    repositoryId: 'repo',
    baselineSha: 'a',
    currentSha: sha,
    branch: 'main',
    dirtyWorkingTree: false,
    untrackedFilesPresent: false,
  };
}

function failure(suitePath: string, testName: string, message = 'boom') {
  return {
    suitePath,
    testName,
    normalizedMessageHash: normalizeFailureMessage(message),
    fingerprint: failureFingerprint(suitePath, testName, normalizeFailureMessage(message)),
  };
}

function snapshot(overrides: {
  profile?: 'full-suite' | 'changed-path';
  packages?: string[];
  passed?: number;
  failed?: number;
  failures?: ReturnType<typeof failure>[];
  nodeVersion?: string;
  sha?: string;
}) {
  const profile = overrides.profile ?? 'full-suite';
  const failures = overrides.failures ?? [];
  return collectRepositoryEvidence({
    identity: identity(overrides.sha ?? 'b'),
    execution: {
      testCommand: 'pnpm test',
      workingDirectory: '/repo',
      verificationProfile: profile,
      verificationScope: {
        packages: overrides.packages ?? ['pkg-a'],
        applications: [],
        testsExecuted: [],
        filesChanged: [],
      },
      environmentFingerprint: {
        nodeVersion: overrides.nodeVersion ?? '22.0.0',
        platform: 'linux',
        architecture: 'x64',
        packageManagerVersion: 'pnpm@9',
        dependencyLockHash: 'lock-a',
      },
    },
    results: {
      testSummary: { passed: overrides.passed ?? 10, failed: overrides.failed ?? 0, skipped: 0, total: 10 },
      failures,
      buildStatus: 'passed',
      lintStatus: 'passed',
      dependencyStatus: 'passed',
      documentationStatus: 'passed',
      artifactHashes: {},
    },
  });
}

describe('RepositoryEvidenceComparator (ADR-012)', () => {
  const comparator = new RepositoryEvidenceComparator();

  it('comparable snapshots with no new failures produce a pass', async () => {
    const baseline = snapshot({ failures: [failure('a.test.ts', 't1')] });
    const current = snapshot({ failures: [failure('a.test.ts', 't1')] });
    const result = await comparator.compare(baseline, current);
    expect(result.comparable).toBe(true);
    expect(result.regressionIntroduced).toBe(false);
    expect(result.conclusion.status).toBe('pass');
    expect(result.delta.changes.failureDelta.unchangedCount).toBe(1);
  });

  it('comparable snapshots with an added failure produce a regression', async () => {
    const baseline = snapshot({ failures: [failure('a.test.ts', 't1')] });
    const current = snapshot({ failures: [failure('a.test.ts', 't1'), failure('b.test.ts', 't2')] });
    const result = await comparator.compare(baseline, current);
    expect(result.comparable).toBe(true);
    expect(result.regressionIntroduced).toBe(true);
    expect(result.conclusion.status).toBe('fail');
    expect(result.delta.changes.failureDelta.addedCount).toBe(1);
  });

  it('different verification profiles are incomparable and indeterminate', async () => {
    const baseline = snapshot({ profile: 'full-suite', failures: [failure('a.test.ts', 't1')] });
    const current = snapshot({ profile: 'changed-path', failures: [failure('a.test.ts', 't1')] });
    const result = await comparator.compare(baseline, current);
    expect(result.comparable).toBe(false);
    expect(result.conclusion.status).toBe('indeterminate');
    expect(result.regressionIntroduced).toBeNull();
  });

  it('same command with different actual scope is not equivalent', async () => {
    const baseline = snapshot({ packages: ['pkg-a'] });
    const current = snapshot({ packages: ['pkg-b'] });
    const result = await comparator.compare(baseline, current);
    expect(result.comparable).toBe(false);
    expect(result.conclusion.status).toBe('indeterminate');
    expect(result.regressionIntroduced).toBeNull();
    expect(result.delta.changes.scopeChanged).toBe(true);
  });

  it('same count with different failure fingerprints detects the change', async () => {
    const baseline = snapshot({ failures: [failure('a.test.ts', 't1')] });
    const current = snapshot({ failures: [failure('b.test.ts', 't2')] });
    const result = await comparator.compare(baseline, current);
    expect(result.comparable).toBe(true);
    expect(result.regressionIntroduced).toBe(true);
    expect(result.delta.changes.failureDelta.addedCount).toBe(1);
    expect(result.delta.changes.failureDelta.resolvedCount).toBe(1);
  });

  it('environment changes produce partial comparability and null regression', async () => {
    const baseline = snapshot({ nodeVersion: '22.0.0', failures: [failure('a.test.ts', 't1')] });
    const current = snapshot({ nodeVersion: '24.0.0', failures: [failure('a.test.ts', 't1')] });
    const result = await comparator.compare(baseline, current);
    expect(result.conclusion.status).toBe('indeterminate');
    expect(result.regressionIntroduced).toBeNull();
    expect(result.delta.comparability.status).toBe('partially-comparable');
    expect(result.delta.changes.environmentDimensionsChanged).toContain('nodeVersion');
  });

  it('VEF-001 policy: environment differences yield indeterminate, not pass or fail', async () => {
    // VEF-001 intentionally treats any environment dimension change as
    // grounds for indeterminate. Future versions may refine partial
    // comparability by dimension (e.g. Node version affects timing/artifact
    // hashes but not failure fingerprints).
    const baseline = snapshot({
      nodeVersion: '22.0.0',
      packages: ['pkg-a'],
      failures: [failure('a.test.ts', 't1')],
    });
    const current = snapshot({
      nodeVersion: '24.0.0',
      packages: ['pkg-a'],
      failures: [failure('a.test.ts', 't1')],
    });
    const result = await comparator.compare(baseline, current);
    expect(result.conclusion.status).toBe('indeterminate');
    expect(result.regressionIntroduced).toBeNull();
    expect(result.delta.comparability.status).not.toBe('comparable');
  });
});
