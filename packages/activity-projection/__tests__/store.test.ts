import { DuplicateActivityError, InMemoryActivityStore } from '@vestara/activity-projection';
import { describe, expect, it } from 'vitest';
import { workflowRecord } from './helpers';

describe('InMemoryActivityStore', () => {
  it('appends and retrieves a record by id', async () => {
    const store = new InMemoryActivityStore();
    const record = workflowRecord({ id: 'activity:1', sequence: 1, workflowId: 'wfo-a' });
    await store.append(record);
    expect(await store.get('activity:1')).toEqual(record);
    expect(await store.get('missing')).toBeNull();
  });

  it('rejects duplicate ids as immutable', async () => {
    const store = new InMemoryActivityStore();
    await store.append(workflowRecord({ id: 'activity:1', sequence: 1 }));
    await expect(store.append(workflowRecord({ id: 'activity:1', sequence: 2 }))).rejects.toBeInstanceOf(
      DuplicateActivityError,
    );
  });

  it('lists records ordered by sequence, then timestamp, then id', async () => {
    const store = new InMemoryActivityStore();
    await store.append(workflowRecord({ id: 'activity:3', sequence: 3, timestamp: '2026-08-06T12:00:00.000Z' }));
    await store.append(workflowRecord({ id: 'activity:1', sequence: 1, timestamp: '2026-08-06T12:00:01.000Z' }));
    await store.append(workflowRecord({ id: 'activity:2', sequence: 2, timestamp: '2026-08-06T12:00:00.000Z' }));
    const { records } = await store.list();
    expect(records.map((record) => record.id)).toEqual(['activity:1', 'activity:2', 'activity:3']);
  });

  it('uses id as the deterministic tie-breaker', async () => {
    const store = new InMemoryActivityStore();
    await store.append(workflowRecord({ id: 'activity:b', sequence: 1, timestamp: '2026-08-06T12:00:00.000Z' }));
    await store.append(workflowRecord({ id: 'activity:a', sequence: 1, timestamp: '2026-08-06T12:00:00.000Z' }));
    const { records } = await store.list();
    expect(records.map((record) => record.id)).toEqual(['activity:a', 'activity:b']);
  });

  it('reports the last allocated sequence', async () => {
    const store = new InMemoryActivityStore();
    expect(await store.lastSequence()).toBe(0);
    await store.append(workflowRecord({ id: 'activity:1', sequence: 7 }));
    await store.append(workflowRecord({ id: 'activity:2', sequence: 3 }));
    expect(await store.lastSequence()).toBe(7);
  });

  it('filters by workflow, task, kind, agent, and sequence range', async () => {
    const store = new InMemoryActivityStore();
    await store.append(workflowRecord({ id: 'a', sequence: 1, workflowId: 'wfo-a', taskId: 'task-1' }));
    await store.append(workflowRecord({ id: 'b', sequence: 2, workflowId: 'wfo-b' }));
    await store.append(workflowRecord({ id: 'c', sequence: 3, workflowId: 'wfo-a' }));

    expect((await store.list({ workflowId: 'wfo-a' })).records.map((record) => record.id)).toEqual(['a', 'c']);
    expect((await store.list({ taskId: 'task-1' })).records.map((record) => record.id)).toEqual(['a']);
    expect((await store.list({ kind: 'workflow' })).records).toHaveLength(3);
    expect((await store.list({ kind: 'task' })).records).toHaveLength(0);
    expect((await store.list({ agentId: 'workflow-orchestrator' })).records).toHaveLength(3);
    expect((await store.list({ afterSequence: 1 })).records.map((record) => record.id)).toEqual(['b', 'c']);
    expect((await store.list({ beforeSequence: 3 })).records.map((record) => record.id)).toEqual(['a', 'b']);
    expect((await store.list({ limit: 2 })).records).toHaveLength(2);
  });

  it('filters by derived severity', async () => {
    const store = new InMemoryActivityStore();
    await store.append(workflowRecord({ id: 'a', sequence: 1, workflowId: 'wfo-a', currentState: 'executing' }));
    await store.append(workflowRecord({ id: 'b', sequence: 2, workflowId: 'wfo-b', currentState: 'completed' }));
    await store.append(workflowRecord({ id: 'c', sequence: 3, workflowId: 'wfo-a', currentState: 'cancelled' }));

    expect((await store.list({ severity: 'success' })).records.map((record) => record.id)).toEqual(['b']);
    expect((await store.list({ severity: 'warning' })).records.map((record) => record.id)).toEqual(['c']);
    expect((await store.list({ severity: 'info' })).records.map((record) => record.id)).toEqual(['a']);
  });

  it('returns a resumable nextSequence on each page', async () => {
    const store = new InMemoryActivityStore();
    await store.append(workflowRecord({ id: 'a', sequence: 1 }));
    await store.append(workflowRecord({ id: 'b', sequence: 2 }));
    const { nextSequence } = await store.list();
    expect(nextSequence).toBe(3);
  });

  it('does not mutate the appended record or leak later edits', async () => {
    const store = new InMemoryActivityStore();
    const record = workflowRecord({ id: 'activity:1', sequence: 1, reason: 'original' });
    await store.append(record);
    record.reason = 'mutated';
    expect((await store.get('activity:1'))?.reason).toBe('original');
  });
});
