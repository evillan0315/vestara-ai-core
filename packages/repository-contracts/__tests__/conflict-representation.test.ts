/**
 * VES-REPO-002 — conflict representation for C1-C9 (no detection).
 */
import { describe, expect, it } from 'vitest';
import { isKnownConflictClass, isValidRepositoryConflict, REPOSITORY_CONFLICT_CLASSES } from '../src/conflict';

describe('conflict representation', () => {
  it('every blueprint class has a representative conflict', () => {
    for (const cls of REPOSITORY_CONFLICT_CLASSES) {
      expect(
        isValidRepositoryConflict({
          class: cls,
          repositoryId: 'r1',
          involvedExecutions: ['e1'],
          description: `example ${cls}`,
        }),
      ).toBe(true);
    }
  });

  it('rejects unknown classes and bare codes without description', () => {
    expect(isKnownConflictClass('merge-conflict')).toBe(false);
    expect(
      isValidRepositoryConflict({ class: 'exact-path', repositoryId: 'r1', involvedExecutions: [], description: '' }),
    ).toBe(false);
    expect(
      isValidRepositoryConflict({ class: 'nope', repositoryId: 'r1', involvedExecutions: ['e1'], description: 'x' }),
    ).toBe(false);
  });
});
