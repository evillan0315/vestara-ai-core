import { describe, expect, it } from 'vitest';
import { buildQueue, computeMetrics, EXECUTION_PIPELINE, queueSummary } from '../src/routes/execution.js';

const mockBase = {
  plans: [
    {
      id: 'pln-1',
      title: 'Build auth',
      goal: 'Add auth',
      status: 'executing',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      tasks: [
        { id: 't1', summary: 'Add login', status: 'in-progress', dependencies: ['t2'] },
        { id: 't2', summary: 'Add users', status: 'completed', dependencies: [] },
        { id: 't3', summary: 'Add logout', status: 'blocked', dependencies: ['t1'] },
      ],
    },
    {
      id: 'pln-2',
      title: 'Docs',
      goal: 'Write docs',
      status: 'completed',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T12:00:00.000Z',
      tasks: [],
    },
  ],
  changeSets: [{ id: 'cs-1' }],
  verifications: [{ id: 'v-1' }],
  collab: [{ id: 'c-1' }],
  sessions: [
    {
      id: 'exs-1',
      goal: 'Build auth',
      status: 'running',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'exs-2',
      goal: 'Fix bug',
      status: 'completed',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:10:00.000Z',
    },
    {
      id: 'exs-3',
      goal: 'Ship',
      status: 'failed',
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:05:00.000Z',
    },
  ],
  executions: [
    {
      id: 'e-1',
      agentId: 'planner',
      task: 'Plan',
      status: 'completed',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:02:00.000Z',
    },
    {
      id: 'e-2',
      agentId: 'developer',
      task: 'Code',
      status: 'failed',
      startedAt: '2026-01-01T00:02:00.000Z',
      completedAt: '2026-01-01T00:04:00.000Z',
    },
    { id: 'e-3', agentId: 'developer', task: 'Retry', status: 'running', startedAt: '2026-01-01T00:04:00.000Z' },
  ],
  projects: [{ id: 'prj-1', name: 'Vestara', status: 'active' }],
} as any;

describe('execution queue', () => {
  it('builds unified queue entries from sessions, plans, tasks, and executions', () => {
    const entries = buildQueue(mockBase);
    const kinds = entries.map((e) => e.kind);
    expect(kinds).toContain('session');
    expect(kinds).toContain('plan');
    expect(kinds).toContain('task');
    expect(kinds).toContain('execution');
    // 3 sessions + 2 plans + 3 tasks + 3 executions
    expect(entries).toHaveLength(11);
    const task = entries.find((e) => e.kind === 'task' && e.id === 'pln-1:t1');
    expect(task?.status).toBe('in-progress');
  });

  it('summarizes queue statuses', () => {
    const entries = buildQueue(mockBase);
    const summary = queueSummary(entries);
    expect(summary.total).toBe(11);
    expect(summary.running).toBeGreaterThanOrEqual(2); // running session + in-progress task + running execution
    expect(summary.completed).toBeGreaterThanOrEqual(3);
    expect(summary.failed).toBeGreaterThanOrEqual(2);
    expect(summary.blocked).toBeGreaterThanOrEqual(1);
    expect(summary.waitingApproval).toBe(0);
  });
});

describe('execution metrics', () => {
  it('computes derived metrics from the base snapshot', () => {
    const agents = [
      { id: 'a1', status: 'working' },
      { id: 'a2', status: 'idle' },
    ];
    const metrics = computeMetrics(mockBase, agents, []);
    expect(metrics.sessions.total).toBe(3);
    expect(metrics.sessions.running).toBe(1);
    expect(metrics.sessions.completed).toBe(1);
    expect(metrics.sessions.failed).toBe(1);
    expect(metrics.sessions.successRate).toBe(50);
    expect(metrics.sessions.avgDurationMs).toBe(450_000); // (10m + 5m) / 2

    expect(metrics.executions.total).toBe(3);
    expect(metrics.executions.successRate).toBe(50);

    expect(metrics.plans.executing).toBe(1);
    expect(metrics.tasks.total).toBe(3);
    expect(metrics.tasks.blocked).toBe(1);
    expect(metrics.tasks.running).toBe(1);

    expect(metrics.agents.total).toBe(2);
    expect(metrics.agents.active).toBe(1);
    expect(metrics.agents.utilization).toBe(50);

    expect(metrics.artifacts).toBe(3); // 1 changeSet + 1 verification + 1 collab
    expect(metrics.approvalsPending).toBe(0);
    expect(metrics.queueLength).toBe(2); // 1 running session + 1 in-progress task
  });

  it('counts filesystem operations from telemetry', () => {
    const telemetry = [
      { agent: 'dev', operation: 'file.read', filePath: 'a.ts' },
      { agent: 'dev', operation: 'file.write', filePath: 'b.ts' },
      { agent: 'dev', operation: 'plan', task: 'x' },
    ];
    const metrics = computeMetrics(mockBase, [], telemetry);
    expect(metrics.fsOps).toBe(2);
  });
});

describe('execution pipeline', () => {
  it('defines the multi-agent orchestration pipeline', () => {
    expect(EXECUTION_PIPELINE).toHaveLength(12);
    expect(EXECUTION_PIPELINE[0].id).toBe('conversation');
    expect(EXECUTION_PIPELINE[EXECUTION_PIPELINE.length - 1].id).toBe('completed');
    const labels = EXECUTION_PIPELINE.map((s) => s.id);
    expect(labels).toContain('planner');
    expect(labels).toContain('architect');
    expect(labels).toContain('developer');
    expect(labels).toContain('verifier');
  });
});
