import { describe, expect, it } from 'vitest';
import { InMemoryCITaskGate } from '../src/task-gate';

describe('InMemoryCITaskGate', () => {
  it('suspends a running task into waiting with typed reason ci', async () => {
    const gate = new InMemoryCITaskGate();
    const wait = await gate.suspend({
      taskId: 'task-1',
      correlationId: 'ci-corr:repo:sha:task-1',
      currentStatus: 'running',
      suspendedAt: '2026-09-16T00:00:00.000Z',
    });
    expect(wait).toEqual({
      taskId: 'task-1',
      correlationId: 'ci-corr:repo:sha:task-1',
      reason: 'ci',
      from: 'running',
      status: 'waiting',
      suspendedAt: '2026-09-16T00:00:00.000Z',
    });
    expect(await gate.getStatus('task-1')).toBe('waiting');
    expect(await gate.getWait('ci-corr:repo:sha:task-1')).toEqual(wait);
  });

  it('resumes waiting into running citing the decision reference', async () => {
    const gate = new InMemoryCITaskGate();
    await gate.suspend({ taskId: 'task-1', correlationId: 'c1', currentStatus: 'running' });
    const resumed = await gate.resume({
      correlationId: 'c1',
      decisionRef: 'obs-35031683683:HOLD',
      resumedAt: '2026-09-16T00:10:00.000Z',
    });
    expect(resumed).toEqual({
      taskId: 'task-1',
      correlationId: 'c1',
      from: 'waiting',
      status: 'running',
      decisionRef: 'obs-35031683683:HOLD',
      resumedAt: '2026-09-16T00:10:00.000Z',
    });
    expect(await gate.getStatus('task-1')).toBe('running');
    expect(await gate.getWait('c1')).toBeUndefined();
  });

  it('refuses to suspend a task that is not running', async () => {
    const gate = new InMemoryCITaskGate();
    await expect(gate.suspend({ taskId: 'task-1', correlationId: 'c1', currentStatus: 'runnable' })).rejects.toThrow(
      /expected running/,
    );
  });

  it('refuses duplicate waits and unresolvable/decision-less resumes', async () => {
    const gate = new InMemoryCITaskGate();
    await gate.suspend({ taskId: 'task-1', correlationId: 'c1', currentStatus: 'running' });
    await expect(gate.suspend({ taskId: 'task-1', correlationId: 'c1', currentStatus: 'running' })).rejects.toThrow(
      /already has a wait/,
    );
    await expect(gate.resume({ correlationId: 'nope', decisionRef: 'x' })).rejects.toThrow(/no wait registered/);
    await expect(gate.resume({ correlationId: 'c1', decisionRef: '  ' })).rejects.toThrow(
      /requires a correlated decision reference/,
    );
  });
});
