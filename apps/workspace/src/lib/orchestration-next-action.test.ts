import { describe, expect, it } from 'vitest';
import { getNextAction, getNextActions, getProjectAction, type NextActionMetrics } from './orchestration-next-action';

function metrics(overrides: Partial<NextActionMetrics['tasks']> = {}): NextActionMetrics {
  return {
    tasks: { total: 4, completed: 1, failed: 0, blocked: 0, awaitingApproval: 0, running: 1, ...overrides },
  };
}

describe('getNextAction', () => {
  it('returns a synthetic empty-state action when there are no projects', () => {
    const action = getNextAction([], {}, {});
    expect(action).toMatchObject({
      kind: 'start',
      projectId: '',
      title: 'Create your first workflow',
      ctaLabel: 'Create workflow',
      actionable: true,
    });
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
    expect(action).toMatchObject({ kind: 'task-approval', projectId: 'b', ctaLabel: 'Review approvals', actionable: true });
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
    expect(action).toMatchObject({ kind: 'task-failure', projectId: 'a', ctaLabel: 'Open tasks', actionable: true });
  });

  it('recommends plan approval, then resume, then progress', () => {
    const plan = getNextAction(
      [{ id: 'a', name: 'Alpha', phase: 'pending-approval', status: 'awaiting-approval' }],
      { a: metrics() },
      {},
    );
    expect(plan).toMatchObject({ kind: 'plan-approval', ctaLabel: 'Review approval', actionable: true });

    const resume = getNextAction(
      [{ id: 'a', name: 'Alpha', phase: 'executing', status: 'running' }],
      { a: metrics() },
      {},
    );
    expect(resume).toMatchObject({ kind: 'resume', ctaLabel: 'Resume', actionable: true });

    const progress = getNextAction(
      [{ id: 'a', name: 'Alpha', phase: 'verifying', status: 'completed' }],
      { a: metrics() },
      {},
    );
    expect(progress).toMatchObject({ kind: 'progress', ctaLabel: 'Open graph', actionable: false });
  });

  it('falls back to the first untouched project', () => {
    const action = getNextAction(
      [{ id: 'a', name: 'Alpha', phase: 'draft', status: 'draft' }],
      {},
      {},
    );
    expect(action).toMatchObject({ kind: 'start', projectId: 'a', ctaLabel: 'View project', actionable: false });
  });
});

describe('getProjectAction', () => {
  it('returns task approval action when approvals exist', () => {
    const action = getProjectAction(
      { id: 'a', name: 'Alpha', phase: 'executing', status: 'running' },
      metrics(),
      [{ id: 't1', summary: 'Drop tables' }],
    );
    expect(action).toMatchObject({ kind: 'task-approval', actionable: true });
  });

  it('returns failure action when tasks are blocked or failed', () => {
    const action = getProjectAction(
      { id: 'a', name: 'Alpha', phase: 'executing', status: 'running' },
      metrics({ failed: 1 }),
      [],
    );
    expect(action).toMatchObject({ kind: 'task-failure', actionable: true });
  });

  it('returns architecture review action for the architecture phase', () => {
    const action = getProjectAction(
      { id: 'a', name: 'Alpha', phase: 'architecture', status: 'awaiting-approval' },
      metrics(),
      [],
    );
    expect(action).toMatchObject({ kind: 'architecture-review', ctaLabel: 'Review gate', actionable: true });
  });

  it('returns plan approval action for pending-approval phase', () => {
    const action = getProjectAction(
      { id: 'a', name: 'Alpha', phase: 'pending-approval', status: 'awaiting-approval' },
      metrics(),
      [],
    );
    expect(action).toMatchObject({ kind: 'plan-approval', actionable: true });
  });

  it('returns resume action for running status', () => {
    const action = getProjectAction(
      { id: 'a', name: 'Alpha', phase: 'executing', status: 'running' },
      metrics(),
      [],
    );
    expect(action).toMatchObject({ kind: 'resume', actionable: true });
  });

  it('returns progress action for executing phase with a non-running status', () => {
    const action = getProjectAction(
      { id: 'a', name: 'Alpha', phase: 'executing', status: 'paused' },
      metrics(),
      [],
    );
    expect(action).toMatchObject({ kind: 'progress', actionable: false });
  });

  it('returns start action for untouched project', () => {
    const action = getProjectAction(
      { id: 'a', name: 'Alpha', phase: 'draft', status: 'draft' },
      undefined,
      undefined,
    );
    expect(action).toMatchObject({ kind: 'start', actionable: false });
  });

  it('returns progress action for verifying phase with completed status', () => {
    const action = getProjectAction(
      { id: 'a', name: 'Alpha', phase: 'verifying', status: 'completed' },
      metrics(),
      [],
    );
    expect(action).toMatchObject({ kind: 'progress', actionable: false });
  });
});

describe('getNextActions', () => {
  it('returns empty array when there are no projects', () => {
    expect(getNextActions([], {}, {})).toEqual([]);
  });

  it('returns all project actions sorted by priority', () => {
    const actions = getNextActions(
      [
        { id: 'a', name: 'Alpha', phase: 'executing', status: 'running' },
        { id: 'b', name: 'Beta', phase: 'executing', status: 'running' },
        { id: 'c', name: 'Gamma', phase: 'draft', status: 'draft' },
      ],
      { a: metrics({ failed: 2 }), b: metrics() },
      { b: [{ id: 't1', summary: 'Drop tables' }] },
    );
    expect(actions).toHaveLength(3);
    // Task approval (b) should be first — highest priority
    expect(actions[0]).toMatchObject({ kind: 'task-approval', projectId: 'b' });
    // Task failure (a) should be second
    expect(actions[1]).toMatchObject({ kind: 'task-failure', projectId: 'a' });
    // Start (c) should be last
    expect(actions[2]).toMatchObject({ kind: 'start', projectId: 'c' });
  });

  it('marks approvals as actionable and progress as observational', () => {
    const actions = getNextActions(
      [
        { id: 'a', name: 'Alpha', phase: 'executing', status: 'running' },
        { id: 'b', name: 'Beta', phase: 'verifying', status: 'completed' },
      ],
      { a: metrics(), b: metrics() },
      { a: [{ id: 't1', summary: 'Review' }] },
    );
    const approval = actions.find((a) => a.projectId === 'a');
    const progress = actions.find((a) => a.projectId === 'b');
    expect(approval?.actionable).toBe(true);
    expect(progress?.actionable).toBe(false);
  });
});
