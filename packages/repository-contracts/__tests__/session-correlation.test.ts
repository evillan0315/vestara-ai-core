/**
 * VES-REPO-006 — RuntimeSessionCorrelation contract tests.
 */
import { describe, expect, it } from 'vitest';
import { isValidRuntimeSessionCorrelation, SESSION_ORIGINS } from '../src/correlation';

function repositoryContext(executionId = 'e1') {
  return {
    executionId: executionId as never,
    repositoryId: 'r1' as never,
    baselineSnapshotId: 's0' as never,
    accessMode: 'ANALYZE' as const,
    changeIntent: {
      executionId: executionId as never,
      repositoryId: 'r1' as never,
      purpose: 'persistence change',
      scopes: [{ level: 'package' as const, name: 'persistence' }],
      mutationKind: 'source' as const,
    },
    boundAt: '2026-09-14T00:01:00.000Z',
  };
}

function correlation(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'e1',
    runtimeSessionId: 'ses-1',
    repositoryContext: repositoryContext(),
    sessionOrigin: 'created' as const,
    correlatedAt: '2026-09-14T00:02:00.000Z',
    ...overrides,
  };
}

describe('RuntimeSessionCorrelation', () => {
  it('accepts an explicit correlation with preserved context', () => {
    expect(isValidRuntimeSessionCorrelation(correlation())).toBe(true);
    expect(SESSION_ORIGINS).toEqual(['created', 'reused', 'resumed']);
  });

  it('refuses cross-wired sessions and missing identities', () => {
    expect(isValidRuntimeSessionCorrelation(correlation({ repositoryContext: repositoryContext('e9') }))).toBe(false);
    expect(isValidRuntimeSessionCorrelation(correlation({ executionId: '' }))).toBe(false);
    expect(isValidRuntimeSessionCorrelation(correlation({ runtimeSessionId: '' }))).toBe(false);
    expect(isValidRuntimeSessionCorrelation(correlation({ sessionOrigin: 'assumed' }))).toBe(false);
  });

  it('cannot express lifecycle, termination, or provenance beyond its links', () => {
    const keys = Object.keys(correlation());
    for (const forbidden of [
      'status',
      'lifecycle',
      'terminated',
      'path',
      'projectId',
      'conversationId',
      'actorId',
      'provider',
      'model',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('keeps workflow lineage optional and explicit', () => {
    expect(isValidRuntimeSessionCorrelation(correlation({ workflowRunId: 'w1' })).valueOf()).toBe(true);
    const without = correlation();
    expect('workflowRunId' in without).toBe(false);
    expect(isValidRuntimeSessionCorrelation(without)).toBe(true);
  });
});
