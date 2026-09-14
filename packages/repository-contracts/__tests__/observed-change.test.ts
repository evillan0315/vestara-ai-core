/**
 * VES-REPO-007 — ObservedRepositoryChange contract tests.
 */
import { describe, expect, it } from 'vitest';
import { isValidObservedRepositoryChange } from '../src/observed-change';

function change(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'e1',
    repositoryId: 'r1',
    baselineSnapshotId: 's0',
    observedSnapshotId: 's1',
    comparison: {
      baselineSnapshotId: 's0',
      currentSnapshotId: 's1',
      sameRepository: true,
      changes: ['no-material-change'],
      materialChange: false,
    },
    observedAt: '2026-09-14T00:03:00.000Z',
    ...overrides,
  };
}

describe('ObservedRepositoryChange', () => {
  it('accepts a link-consistent observed change', () => {
    expect(isValidObservedRepositoryChange(change())).toBe(true);
  });

  it('refuses comparisons describing other snapshots', () => {
    expect(
      isValidObservedRepositoryChange(
        change({
          comparison: {
            baselineSnapshotId: 's9',
            currentSnapshotId: 's1',
            sameRepository: true,
            changes: [],
            materialChange: true,
          },
        }),
      ),
    ).toBe(false);
    expect(isValidObservedRepositoryChange(change({ observedSnapshotId: 's2' }))).toBe(false);
  });

  it('expresses no attribution, actor, violation, or causation', () => {
    const keys = Object.keys(change());
    for (const forbidden of ['attribution', 'actor', 'causedBy', 'violation', 'confidence', 'authority']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
