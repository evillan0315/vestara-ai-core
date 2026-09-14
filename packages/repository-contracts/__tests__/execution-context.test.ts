/**
 * VES-REPO-005 — ExecutionRepositoryContext contract tests.
 */
import { describe, expect, it } from 'vitest';
import { contextPermitsMutation, isValidExecutionRepositoryContext } from '../src/context';

function intent(executionId = 'e1', repositoryId = 'r1') {
  return {
    executionId: executionId as never,
    repositoryId: repositoryId as never,
    purpose: 'persistence change',
    scopes: [{ level: 'package' as const, name: 'persistence' }],
    mutationKind: 'source' as const,
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'e1',
    repositoryId: 'r1',
    baselineSnapshotId: 's0',
    accessMode: 'MUTATE' as const,
    changeIntent: intent(),
    boundAt: '2026-09-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('ExecutionRepositoryContext', () => {
  it('preserves exact repository, baseline, mode, and intent', () => {
    const value = context();
    expect(isValidExecutionRepositoryContext(value)).toBe(true);
    expect(value.repositoryId).toBe('r1');
    expect(value.baselineSnapshotId).toBe('s0');
    expect(value.accessMode).toBe('MUTATE');
    expect(value.changeIntent.purpose).toBe('persistence change');
  });

  it('refuses contexts whose top level disagrees with their intent', () => {
    expect(isValidExecutionRepositoryContext(context({ repositoryId: 'r2' }))).toBe(false);
    expect(isValidExecutionRepositoryContext(context({ changeIntent: intent('e9') }))).toBe(false);
    expect(isValidExecutionRepositoryContext(context({ baselineSnapshotId: '' }))).toBe(false);
    expect(isValidExecutionRepositoryContext(context({ changeIntent: { ...intent(), scopes: [] } }))).toBe(false);
  });

  it('grants mutation only to explicit MUTATE contexts', () => {
    expect(contextPermitsMutation(context() as never)).toBe(true);
    for (const mode of ['OBSERVE', 'ANALYZE', 'VERIFY'] as const) {
      expect(contextPermitsMutation(context({ accessMode: mode }) as never)).toBe(false);
    }
  });
});
