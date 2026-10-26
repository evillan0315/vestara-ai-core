import { describe, expect, it } from 'vitest';
import { normalizeJobStatus, normalizeRunConclusion, normalizeRunStatus } from '../src/normalize';

describe('GitHub CI normalization contract', () => {
  it('maps run statuses without confirming unknown activity', () => {
    expect(normalizeRunStatus('completed')).toBe('completed');
    expect(normalizeRunStatus('in_progress')).toBe('running');
    expect(normalizeRunStatus('queued')).toBe('queued');
    // Unknown statuses must NOT read as running — weakest assertion only.
    expect(normalizeRunStatus('bogus_future_state')).toBe('discovered');
    expect(normalizeJobStatus('completed')).toBe('completed');
  });

  it('maps conclusions, preserving unknowns', () => {
    expect(normalizeRunConclusion('success')).toBe('passed');
    expect(normalizeRunConclusion('failure')).toBe('failed');
    expect(normalizeRunConclusion('action_required')).toBe('failed');
    expect(normalizeRunConclusion(null)).toBe('unknown');
    expect(normalizeRunConclusion('stale')).toBe('unknown');
  });
});
