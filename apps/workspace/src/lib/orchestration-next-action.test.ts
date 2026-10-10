import { describe, expect, it } from 'vitest';
import { getNextAction, type NextActionMetrics } from './orchestration-next-action';

function metrics(overrides: Partial<NextActionMetrics['tasks']> = {}): NextActionMetrics {
  return {
    tasks: { total: 4, completed: 1, failed: 0, blocked: 0, awaitingApproval: 0, running: 1, ...overrides },
  };
}

describe('getNextAction', () => {
  it('returns null when there are no projects', () => {
    expect(getNextAction([], {}, {})).toBeNull();
  });

  it('prioritizes task approvals first', () => {
    const action = getNextAction(
      [
        { id: 'a', name: 'Alpha', phase: 'executing', status: 'running' },
        { id: 'b', name: 'Beta', phase: 'executing', status: 'running' },
      ],
      { a: metrics({ failed: 2 }), b: metrics() },
      { b: [{ id: 't1', summary: 'Drop tables' }] },
    );
    expect(action).toMatchObject({ kind: 'task-approval', projectId: 'b', ctaLabel: 'Review approvals' });
  });

  it('surfaces failed/blocked tasks before plan approval', () => {
    const action = getNextAction(
      [
        { id: 'a', name: 'Alpha', phase: 'executing', status: 'running' },
        { id: 'b', name: 'Beta', phase: 'pending-approval', status: 'awaiting-approval' },
      ],
      { a: metrics({ blocked: 1 }), b: metrics() },
      {},
    );
    expect(action).toMatchObject({ kind: 'task-failure', projectId: 'a', ctaLabel: 'Open tasks' });
  });

  it('recommends plan approval, then resume, then progress', () => {
    const plan = getNextAction(
      [{ id: 'a', name: 'Alpha', phase: 'pending-approval', status: 'awaiting-approval' }],
      { a: metrics() },
      {},
    );
    expect(plan).toMatchObject({ kind: 'plan-approval', ctaLabel: 'Approve plan' });

    const resume = getNextAction(
      [{ id: 'a', name: 'Alpha', phase: 'executing', status: 'running' }],
      { a: metrics() },
      {},
    );
    expect(resume).toMatchObject({ kind: 'resume', ctaLabel: 'Resume' });

    const progress = getNextAction(
      [{ id: 'a', name: 'Alpha', phase: 'verifying', status: 'completed' }],
      { a: metrics() },
      {},
    );
    expect(progress).toMatchObject({ kind: 'progress', ctaLabel: 'Open graph' });
  });

  it('falls back to the first untouched project', () => {
    const action = getNextAction(
      [{ id: 'a', name: 'Alpha', phase: 'draft', status: 'draft' }],
      {},
      {},
    );
    expect(action).toMatchObject({ kind: 'start', projectId: 'a', ctaLabel: 'View project' });
  });
});
