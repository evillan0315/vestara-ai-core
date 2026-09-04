import type { ActivityRecord } from '@vestara/activity-room';
import { toActivityBatch } from '@vestara/activity-room';
import { describe, expect, it } from 'vitest';
import { workflowRecord } from './helpers';

function records(...sequences: number[]): ActivityRecord[] {
  return sequences.map((sequence) => workflowRecord({ id: `activity:${sequence}`, sequence }));
}

describe('toActivityBatch', () => {
  it('groups ordered records with the sequence span', () => {
    const batch = toActivityBatch(records(1, 2, 3));
    expect(batch.firstSequence).toBe(1);
    expect(batch.lastSequence).toBe(3);
    expect(batch.records).toHaveLength(3);
  });

  it('handles a single record', () => {
    const batch = toActivityBatch(records(7));
    expect(batch.firstSequence).toBe(7);
    expect(batch.lastSequence).toBe(7);
  });

  it('reflects the span even when records are not contiguous', () => {
    const batch = toActivityBatch(records(2, 5, 9));
    expect(batch.firstSequence).toBe(2);
    expect(batch.lastSequence).toBe(9);
  });

  it('yields an empty span for no records', () => {
    const batch = toActivityBatch([]);
    expect(batch.firstSequence).toBe(0);
    expect(batch.lastSequence).toBe(0);
    expect(batch.records).toEqual([]);
  });

  it('preserves input order unchanged', () => {
    const input = records(3, 1, 2);
    const batch = toActivityBatch(input);
    expect(batch.records.map((record) => record.sequence)).toEqual([3, 1, 2]);
  });

  it('composes with a store page for a natural batch view of history', async () => {
    const { InMemoryActivityStore } = await import('@vestara/activity-room');
    const store = new InMemoryActivityStore();
    await store.append(workflowRecord({ id: 'a', sequence: 1, workflowId: 'wfo-a' }));
    await store.append(workflowRecord({ id: 'b', sequence: 2, workflowId: 'wfo-a' }));
    const page = await store.list({ workflowId: 'wfo-a' });
    const batch = toActivityBatch(page.records);
    expect(batch.firstSequence).toBe(1);
    expect(batch.lastSequence).toBe(2);
    expect(batch.records.map((record) => record.id)).toEqual(['a', 'b']);
  });
});
