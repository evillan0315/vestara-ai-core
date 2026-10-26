import { describe, expect, it } from 'vitest';
import { buildQueue, queueSummary } from '../src/projections';

describe('execution-center projections contract', () => {
  it('summarizes queue statuses without an API context', () => {
    const summary = queueSummary([
      { id: 'a', kind: 'session', title: 'A', status: 'running', started: '', updated: '', priority: 'normal' },
      { id: 'b', kind: 'plan', title: 'B', status: 'failed', started: '', updated: '', priority: 'normal' },
    ]);
    expect(summary.total).toBe(2);
    expect(summary.running).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it('builds queue entries from sessions and plans', () => {
    const entries = buildQueue({
      sessions: [{ id: 's1', goal: 'ship', status: 'running', createdAt: '', completedAt: null } as never],
      plans: [],
      executions: [],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('ship');
  });
});
