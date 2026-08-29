import { describe, expect, it } from 'vitest';
import { buildQueue, computeMetrics, countFsOps, countPendingApprovals, queueSummary } from '../src/index.js';

describe('queueSummary', () => {
  it('classifies entries into status buckets', () => {
    const entries = [
      { id: 's1', kind: 'session', title: 'a', status: 'running' },
      { id: 's2', kind: 'session', title: 'b', status: 'completed' },
      { id: 's3', kind: 'plan', title: 'c', status: 'failed' },
      { id: 's4', kind: 'plan', title: 'd', status: 'blocked' },
      { id: 's5', kind: 'task', title: 'e', status: 'draft' },
      { id: 's6', kind: 'task', title: 'f', status: 'queued' },
    ] as const;
    const summary = queueSummary([...entries]);
    expect(summary.total).toBe(6);
    expect(summary.running).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.blocked).toBe(1);
    expect(summary.waitingApproval).toBe(1);
    expect(summary.pending).toBe(1);
  });

  it('handles an empty queue', () => {
    const summary = queueSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.pending).toBe(0);
    expect(summary.running).toBe(0);
  });
});

describe('buildQueue', () => {
  it('merges sessions, plans, tasks, and executions sorted by recency', () => {
    const entries = buildQueue({
      sessions: [{ id: 's1', goal: 'Ship feature', status: 'running', createdAt: '2026-08-02T10:00:00.000Z' }],
      plans: [
        {
          id: 'p1',
          title: 'Refactor',
          status: 'approved',
          createdAt: '2026-08-02T09:00:00.000Z',
          tasks: [{ id: 't1', summary: 'Extract module', status: 'pending', effort: 'medium' }],
        },
      ],
      executions: [
        { id: 'e1', agentId: 'dev', task: 'Write tests', status: 'completed', startedAt: '2026-08-02T11:00:00.000Z' },
      ],
    });
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.kind)).toEqual(expect.arrayContaining(['session', 'plan', 'task', 'execution']));
    const task = entries.find((e) => e.kind === 'task')!;
    expect(task.id).toBe('p1:t1');
    expect(task.priority).toBe('medium');
    // Newest updated first.
    expect(entries[0].id).toBe('e1');
  });
});

describe('computeMetrics', () => {
  it('computes session/execution success rates and durations', () => {
    const source = {
      plans: [],
      changeSets: [{ id: 'cs1' }],
      verifications: [{ id: 'v1' }],
      collab: [{ id: 'c1', status: 'draft' }],
      sessions: [
        {
          id: 's1',
          goal: 'a',
          status: 'completed',
          createdAt: '2026-08-02T10:00:00.000Z',
          completedAt: '2026-08-02T10:10:00.000Z',
        },
        {
          id: 's2',
          goal: 'b',
          status: 'failed',
          createdAt: '2026-08-02T11:00:00.000Z',
          completedAt: '2026-08-02T11:05:00.000Z',
        },
        { id: 's3', goal: 'c', status: 'running', createdAt: '2026-08-02T12:00:00.000Z' },
      ],
      executions: [
        {
          id: 'e1',
          agentId: 'a',
          task: 'x',
          status: 'completed',
          startedAt: '2026-08-02T10:00:00.000Z',
          completedAt: '2026-08-02T10:01:00.000Z',
        },
        {
          id: 'e2',
          agentId: 'a',
          task: 'y',
          status: 'failed',
          startedAt: '2026-08-02T10:05:00.000Z',
          completedAt: '2026-08-02T10:05:30.000Z',
        },
      ],
    };
    const metrics = computeMetrics(
      source,
      [{ id: 'a', status: 'working' }],
      [
        { agent: 'a', operation: 'file.write', status: 'ok', timestamp: '2026-08-02T10:00:00.000Z' },
        { agent: 'a', operation: 'search', status: 'ok', timestamp: '2026-08-02T10:00:01.000Z' },
        { agent: 'a', operation: 'analyze', status: 'ok', timestamp: '2026-08-02T10:00:02.000Z' },
      ],
    );
    expect(metrics.sessions.successRate).toBe(50);
    expect(metrics.sessions.avgDurationMs).toBe(450_000);
    expect(metrics.executions.successRate).toBe(50);
    expect(metrics.executions.avgDurationMs).toBe(45_000);
    expect(metrics.agents.utilization).toBe(100);
    expect(metrics.fsOps).toBe(2);
    expect(metrics.artifacts).toBe(3);
    expect(metrics.approvalsPending).toBe(1);
    expect(metrics.queueLength).toBe(1); // one running session
  });

  it('degrades gracefully with empty data', () => {
    const metrics = computeMetrics(
      { plans: [], changeSets: [], verifications: [], collab: [], sessions: [], executions: [] },
      [],
      [],
    );
    expect(metrics.sessions.total).toBe(0);
    expect(metrics.sessions.successRate).toBe(0);
    expect(metrics.agents.utilization).toBe(0);
    expect(metrics.fsOps).toBe(0);
    expect(metrics.queueLength).toBe(0);
  });
});

describe('countFsOps / countPendingApprovals', () => {
  it('counts file and search operations only', () => {
    const events = [
      { agent: 'a', operation: 'file.read', timestamp: 't1' },
      { agent: 'a', operation: 'search', timestamp: 't2' },
      { agent: 'a', operation: 'analyze', timestamp: 't3' },
    ];
    expect(countFsOps(events)).toBe(2);
  });

  it('counts submitted/reviewing/draft collaboration records', () => {
    expect(
      countPendingApprovals({
        plans: [],
        changeSets: [],
        verifications: [],
        collab: [
          { id: 'a', status: 'submitted' },
          { id: 'b', status: 'reviewing' },
          { id: 'c', status: 'draft' },
          { id: 'd', status: 'approved' },
        ],
        sessions: [],
        executions: [],
      }),
    ).toBe(3);
  });
});
