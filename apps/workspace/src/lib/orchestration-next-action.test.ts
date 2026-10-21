import { describe, expect, it } from 'vitest';
import {
  buildApprovalDetail,
  buildBannerSignature,
  countHeldUpTasks,
  filterDismissedNextActions,
  formatApprovalAge,
  getActionBadgeLabel,
  getActionPriority,
  getNextAction,
  getNextActions,
  getProjectAction,
  getScopedNextAction,
  isBannerDismissed,
  type NextAction,
  type NextActionMetrics,
  oldestPendingApprovalAge,
  shouldClearStaleBannerDismissal,
  shouldClearStaleQueueDismissal,
  sortProjectsByActionPriority,
} from './orchestration-next-action';

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

describe('banner dismissal signature', () => {
  const planApproval: NextAction = {
    kind: 'plan-approval',
    projectId: 'proj-1',
    projectName: 'Alpha',
    title: 'Approve plan for Alpha',
    detail: 'Architecture review is complete — approve or reject the plan before execution.',
    ctaLabel: 'Review approval',
    actionable: true,
  };

  it('builds a stable kind|project|content-hash signature with no attention input', () => {
    const first = buildBannerSignature(planApproval);
    const second = buildBannerSignature({ ...planApproval });
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(first).toMatch(/^plan-approval\|proj-1\|[0-9a-f]{8}$/);
  });

  it('returns null when there is no recommendation', () => {
    expect(buildBannerSignature(null)).toBeNull();
  });

  it('changes the signature when the action content changes (e.g. pending approval count)', () => {
    const one = buildBannerSignature({
      kind: 'task-approval',
      projectId: 'proj-1',
      projectName: 'Alpha',
      title: 'Approve 1 task in Alpha',
      detail: 'Drop tables',
      ctaLabel: 'Review approvals',
      actionable: true,
    });
    const two = buildBannerSignature({
      kind: 'task-approval',
      projectId: 'proj-1',
      projectName: 'Alpha',
      title: 'Approve 2 tasks in Alpha',
      detail: 'Drop tables',
      ctaLabel: 'Review approvals',
      actionable: true,
    });
    expect(one).not.toBeNull();
    expect(two).not.toBe(one);
  });

  it('distinguishes kinds and projects with identical content', () => {
    const base = buildBannerSignature(planApproval);
    expect(buildBannerSignature({ ...planApproval, kind: 'architecture-review' })).not.toBe(base);
    expect(buildBannerSignature({ ...planApproval, projectId: 'proj-2' })).not.toBe(base);
  });

  it('keeps a dismissed plan-approval dismissed while the signature is unchanged (attention zero)', () => {
    // Phase-level recommendations carry zero task-level attention. Dismissing
    // must stick — no attention===0 cleanup may clear the banner dismissal.
    const signature = buildBannerSignature(planApproval);
    expect(signature).not.toBeNull();
    expect(isBannerDismissed(signature, signature)).toBe(true);
    // A re-resolved identical recommendation is still the same episode.
    expect(isBannerDismissed(signature, buildBannerSignature({ ...planApproval }))).toBe(true);
  });

  it('re-shows the banner when the recommendation changes', () => {
    const dismissed = buildBannerSignature(planApproval);
    const changed = buildBannerSignature({ ...planApproval, detail: 'A revised plan is ready for review.' });
    expect(changed).not.toBe(dismissed);
    expect(isBannerDismissed(dismissed, changed)).toBe(false);
  });

  it('restores the banner via the header chip path (clearing the dismissal)', () => {
    const signature = buildBannerSignature(planApproval);
    expect(isBannerDismissed(signature, signature)).toBe(true);
    expect(isBannerDismissed(null, signature)).toBe(false);
  });

  it('never treats a missing recommendation as dismissed', () => {
    expect(isBannerDismissed('plan-approval|proj-1|deadbeef', null)).toBe(false);
    expect(isBannerDismissed(null, null)).toBe(false);
  });

  it('clears a stale dismissal only when the recommendation changed', () => {
    const dismissed = buildBannerSignature(planApproval);
    const changed = buildBannerSignature({ ...planApproval, projectId: 'proj-2' });
    // Same episode: keep the dismissal.
    expect(shouldClearStaleBannerDismissal(dismissed, dismissed)).toBe(false);
    // Changed recommendation: end the episode so new work is never suppressed.
    expect(shouldClearStaleBannerDismissal(dismissed, changed)).toBe(true);
    // Nothing stored, or nothing recommended: nothing to clear.
    expect(shouldClearStaleBannerDismissal(null, changed)).toBe(false);
    expect(shouldClearStaleBannerDismissal(dismissed, null)).toBe(false);
  });
});

describe('task-approval why-now context', () => {
  it('names every pending item in a multi-approval action', () => {
    const action = getProjectAction(
      { id: 'a', name: 'Alpha', phase: 'executing', status: 'running' },
      metrics(),
      [
        { id: 't1', summary: 'Drop tables' },
        { id: 't2', summary: 'Migrate users' },
        { id: 't3', summary: 'Rotate keys' },
      ],
    );
    expect(action?.title).toBe('Approve 3 tasks in Alpha');
    expect(action?.detail).toContain('Drop tables');
    expect(action?.detail).toContain('Migrate users');
    expect(action?.detail).toContain('Rotate keys');
  });

  it('keeps a single approval detail as its summary when no enrichment data exists', () => {
    expect(buildApprovalDetail([{ id: 't1', summary: 'Drop tables' }])).toBe('Drop tables');
  });

  it('omits age and held-up counts when the data does not support them (never zero-filled)', () => {
    const detail = buildApprovalDetail([{ id: 't1', summary: 'Drop tables' }]);
    expect(detail).not.toContain('waiting');
    expect(detail).not.toContain('holding up');
    expect(detail).not.toContain('0 tasks');
    expect(countHeldUpTasks([{ id: 't1', summary: 'Drop tables' }], undefined)).toBeNull();
    expect(oldestPendingApprovalAge([{ id: 't1', summary: 'Drop tables' }])).toBeNull();
  });

  it('surfaces the oldest pending age only when a timestamp parses', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const detail = buildApprovalDetail([
      { id: 't1', summary: 'Drop tables', updatedAt: oneHourAgo },
      { id: 't2', summary: 'Migrate users', updatedAt: threeHoursAgo },
    ]);
    expect(detail).toContain('waiting 3h');
    expect(detail).toContain('Drop tables');
    expect(detail).toContain('Migrate users');
  });

  it('ignores unparsable timestamps instead of zero-filling age', () => {
    const detail = buildApprovalDetail([{ id: 't1', summary: 'Drop tables', updatedAt: 'not-a-date' }]);
    expect(detail).toBe('Drop tables');
  });

  it('surfaces the held-up dependent count only when the task graph supports it', () => {
    const approvals = [{ id: 't1', summary: 'Drop tables' }];
    const tasks = [
      { id: 't1', dependencies: [] as string[], status: 'awaiting-approval' },
      { id: 't2', dependencies: ['t1'], status: 'blocked' },
      { id: 't3', dependencies: ['t2'], status: 'pending' },
      { id: 't4', dependencies: [], status: 'pending' },
    ];
    // t2 directly blocked plus t3 transitively held up; unrelated t4 excluded.
    expect(countHeldUpTasks(approvals, tasks)).toBe(2);
    expect(buildApprovalDetail(approvals, tasks)).toContain('holding up 2 tasks');
  });

  it('does not render a held-up count when nothing depends on the approvals', () => {
    const approvals = [{ id: 't1', summary: 'Drop tables' }];
    const tasks = [
      { id: 't1', dependencies: [] as string[], status: 'awaiting-approval' },
      { id: 't2', dependencies: [], status: 'pending' },
    ];
    expect(countHeldUpTasks(approvals, tasks)).toBe(0);
    expect(buildApprovalDetail(approvals, tasks)).not.toContain('holding up');
  });

  it('buckets age coarsely so the banner signature stays stable within a bucket', () => {
    expect(formatApprovalAge(45 * 1000)).toBe('45s');
    expect(formatApprovalAge(5 * 60 * 1000)).toBe('5m');
    expect(formatApprovalAge(3 * 3600 * 1000)).toBe('3h');
    expect(formatApprovalAge(2 * 24 * 3600 * 1000)).toBe('2d');
  });
});

describe('W1 scoped resolution over the visible set', () => {
  it('never recommends a project the filter has hidden', () => {
    const projects = [
      { id: 'a', name: 'Alpha', phase: 'executing', status: 'running' },
      { id: 'b', name: 'Beta', phase: 'executing', status: 'running' },
    ];
    const metricsByProject = { a: metrics({ failed: 2 }), b: metrics() };
    const approvalsByProject = { b: [{ id: 't1', summary: 'Drop tables' }] };
    // Filter hides the urgent approval project; visible set is Beta-only.
    const visible = [projects[1]];
    expect(getScopedNextAction(visible, projects.length, metricsByProject, approvalsByProject)).toMatchObject({
      projectId: 'b',
    });
    expect(getNextActions(visible, metricsByProject, approvalsByProject).map((a) => a.projectId)).toEqual(['b']);
  });

  it('resolves identically when unfiltered (visible === all)', () => {
    const projects = [
      { id: 'a', name: 'Alpha', phase: 'executing', status: 'running' },
      { id: 'b', name: 'Beta', phase: 'pending-approval', status: 'awaiting-approval' },
    ];
    const metricsByProject = { a: metrics({ blocked: 1 }), b: metrics() };
    expect(getScopedNextAction(projects, projects.length, metricsByProject, {})).toEqual(
      getNextAction(projects, metricsByProject, {}),
    );
  });

  it('returns null for a filtered-empty set instead of the synthetic create action', () => {
    expect(getScopedNextAction([], 2, {}, {})).toBeNull();
    expect(getNextActions([], {}, {})).toEqual([]);
  });

  it('still returns the synthetic create action for a truly empty workspace', () => {
    expect(getScopedNextAction([], 0, {}, {})).toMatchObject({
      kind: 'start',
      projectId: '',
      ctaLabel: 'Create workflow',
    });
  });
});

describe('W3 persistent Next lane queue', () => {
  const approvalAction: NextAction = {
    kind: 'task-approval',
    projectId: 'proj-1',
    projectName: 'Alpha',
    title: 'Approve 1 task in Alpha',
    detail: 'Drop tables',
    ctaLabel: 'Review approvals',
    actionable: true,
  };
  const progressAction: NextAction = {
    kind: 'progress',
    projectId: 'proj-2',
    projectName: 'Beta',
    title: 'Check progress in Beta',
    detail: 'Execution in progress',
    ctaLabel: 'Open graph',
    actionable: false,
  };

  it('keeps the full queue when nothing is dismissed', () => {
    const queue = [approvalAction, progressAction];
    expect(filterDismissedNextActions(queue, null)).toEqual(queue);
  });

  it('suppresses only the dismissed item and keeps the rest of the queue', () => {
    const queue = [approvalAction, progressAction];
    const dismissed = buildBannerSignature(approvalAction);
    const visible = filterDismissedNextActions(queue, dismissed);
    expect(visible).toEqual([progressAction]);
  });

  it('keeps a queue with an unrelated dismissal fully visible', () => {
    const queue = [approvalAction, progressAction];
    const visible = filterDismissedNextActions(queue, 'plan-approval|other|deadbeef');
    expect(visible).toHaveLength(2);
  });

  it('clears a stale dismissal only when no queued action matches it', () => {
    const queue = [approvalAction, progressAction];
    const dismissed = buildBannerSignature(approvalAction);
    expect(shouldClearStaleQueueDismissal(dismissed, queue)).toBe(false);
    expect(shouldClearStaleQueueDismissal('plan-approval|other|deadbeef', queue)).toBe(true);
    expect(shouldClearStaleQueueDismissal(null, queue)).toBe(false);
    expect(shouldClearStaleQueueDismissal(dismissed, [])).toBe(false);
  });
});

describe('W4 priority-ordered rail', () => {
  const approvalAction: NextAction = {
    kind: 'task-approval',
    projectId: 'proj-approval',
    projectName: 'NeedsApproval',
    title: 'Approve 3 tasks in NeedsApproval',
    detail: 'A; B; C',
    ctaLabel: 'Review approvals',
    actionable: true,
  };
  const failureAction: NextAction = {
    kind: 'task-failure',
    projectId: 'proj-blocked',
    projectName: 'Blocked',
    title: 'Unblock Blocked',
    detail: '1 task failed or blocked — review tasks to resume progress.',
    ctaLabel: 'Open tasks',
    actionable: true,
  };
  const planAction: NextAction = {
    kind: 'plan-approval',
    projectId: 'proj-plan',
    projectName: 'Plan',
    title: 'Approve plan for Plan',
    detail: 'Architecture review is complete — approve or reject the plan before execution.',
    ctaLabel: 'Review approval',
    actionable: true,
  };

  it('exposes the resolver ladder without a second ordering', () => {
    expect(getActionPriority('task-approval')).toBeLessThan(getActionPriority('task-failure'));
    expect(getActionPriority('task-failure')).toBeLessThan(getActionPriority('architecture-review'));
    expect(getActionPriority('architecture-review')).toBeLessThan(getActionPriority('plan-approval'));
    expect(getActionPriority('plan-approval')).toBeLessThan(getActionPriority('resume'));
    expect(getActionPriority('resume')).toBeLessThan(getActionPriority('progress'));
    expect(getActionPriority('progress')).toBeLessThan(getActionPriority('start'));
  });

  it('orders the rail by action priority so the first row is the recommended action', () => {
    const projects = [
      { id: 'proj-plan', name: 'Plan', phase: 'pending-approval', status: 'awaiting-approval' },
      { id: 'proj-blocked', name: 'Blocked', phase: 'executing', status: 'running' },
      { id: 'proj-approval', name: 'NeedsApproval', phase: 'executing', status: 'running' },
    ];
    const actionsById: Record<string, NextAction> = {
      'proj-plan': planAction,
      'proj-blocked': failureAction,
      'proj-approval': approvalAction,
    };
    const ordered = sortProjectsByActionPriority(projects, actionsById);
    expect(ordered.map((p) => p.id)).toEqual(['proj-approval', 'proj-blocked', 'proj-plan']);
    const queue = getNextActions(
      projects,
      {
        'proj-blocked': metrics({ failed: 1 }),
        'proj-plan': metrics(),
        'proj-approval': metrics(),
      },
      { 'proj-approval': [{ id: 't1', summary: 'A' }] },
    );
    expect(queue[0]?.projectId).toBe(ordered[0].id);
  });

  it('is stable for ties and preserves the filtered set (no rows added or removed)', () => {
    const projects = [
      { id: 'a', name: 'A', phase: 'draft', status: 'draft' },
      { id: 'b', name: 'B', phase: 'draft', status: 'draft' },
      { id: 'c', name: 'C', phase: 'draft', status: 'draft' },
    ];
    const start = (id: string): NextAction => ({
      kind: 'start',
      projectId: id,
      projectName: id,
      title: `Continue with ${id}`,
      detail: 'Phase is draft',
      ctaLabel: 'View project',
      actionable: false,
    });
    const ordered = sortProjectsByActionPriority(projects, { a: start('a'), b: start('b'), c: start('c') });
    expect(ordered.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(ordered).toHaveLength(projects.length);
  });

  it('sorts projects without a resolved action last while preserving their order', () => {
    const projects = [
      { id: 'a', name: 'A', phase: 'draft', status: 'draft' },
      { id: 'b', name: 'B', phase: 'draft', status: 'draft' },
    ];
    const ordered = sortProjectsByActionPriority(projects, { b: planAction });
    // b has a higher-priority resolved action; a without an action sorts last.
    expect(ordered.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('badges approval and blocked counts from the same inputs the resolver uses', () => {
    expect(
      getActionBadgeLabel(approvalAction, [
        { id: 't1', summary: 'A' },
        { id: 't2', summary: 'B' },
        { id: 't3', summary: 'C' },
      ]),
    ).toBe('3 approvals');
    expect(getActionBadgeLabel({ ...approvalAction, title: 'Approve 1 task in X' }, [{ id: 't1', summary: 'A' }])).toBe(
      '1 approval',
    );
    expect(getActionBadgeLabel(failureAction, undefined, metrics({ failed: 1, blocked: 0 }))).toBe('1 blocked');
    expect(getActionBadgeLabel(failureAction, undefined, metrics({ failed: 1, blocked: 2 }))).toBe('3 blocked');
  });

  it('badges phase kinds with fixed review labels', () => {
    expect(getActionBadgeLabel(planAction)).toBe('review plan');
    expect(
      getActionBadgeLabel({
        kind: 'architecture-review',
        projectId: 'x',
        projectName: 'X',
        title: 'Review architecture for X',
        detail: 'The plan is proposed',
        ctaLabel: 'Review gate',
        actionable: true,
      }),
    ).toBe('review architecture');
    expect(
      getActionBadgeLabel({
        kind: 'resume',
        projectId: 'x',
        projectName: 'X',
        title: 'Resume X',
        detail: 'Status is running',
        ctaLabel: 'Resume',
        actionable: true,
      }),
    ).toBe('resume');
  });
});
