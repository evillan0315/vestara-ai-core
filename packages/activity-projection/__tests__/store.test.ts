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
    await store.append(workflowRecord({ id: 'activity:1', sequence: 1 }));
    expect(await store.lastSequence()).toBe(1);
  });

  it('returns an immutable clone', async () => {
    const store = new InMemoryActivityStore();
    await store.append(workflowRecord({ id: 'activity:1', sequence: 1 }));
    const record = (await store.get('activity:1')) as any;
    record.reason = 'mutated';
    expect((await store.get('activity:1'))?.reason).toBe('phase changed');
  });
});

// STREAM-PERF-001: cursor pagination contract the Activity Room relies on.
describe('InMemoryActivityStore cursor pagination', () => {
  async function seed(n: number): Promise<InMemoryActivityStore> {
    const store = new InMemoryActivityStore();
    for (let i = 1; i <= n; i += 1) {
      await store.append(workflowRecord({ id: `activity:${i}`, sequence: i }));
    }
    return store;
  }

  it('returns a bounded latest window via afterSequence (no full-history eager hydration)', async () => {
    const store = await seed(10_000);
    const { records, nextSequence } = await store.list({ afterSequence: 10_000 - 250, limit: 250 });
    expect(records).toHaveLength(250);
    expect(records[0].sequence).toBe(10_000 - 250 + 1);
    expect(records.at(-1)?.sequence).toBe(10_000);
    expect(nextSequence).toBeDefined();
  });

  it('paginates the page just before a cursor via beforeSequence with no overlap', async () => {
    const store = await seed(1_000);
    const { records: latest } = await store.list({ afterSequence: 1000 - 250, limit: 250 });
    const cursor = latest[0].sequence; // 751

    const { records: older } = await store.list({ beforeSequence: cursor, limit: 250 });
    expect(older).toHaveLength(250);
    expect(older.at(-1)?.sequence).toBe(cursor - 1); // 750
    expect(older[0].sequence).toBe(cursor - 250); // 501
    const latestSet = new Set(latest.map((r) => r.sequence));
    for (const record of older) expect(latestSet.has(record.sequence)).toBe(false);
  });

  it('walks back through the entire history in bounded pages (10k)', async () => {
    const store = await seed(10_000);
    let cursor = 10_001; // beyond the newest
    let seen = 0;
    let pages = 0;
    while (true) {
      const { records } = await store.list({ beforeSequence: cursor, limit: 500 });
      if (records.length === 0) break;
      pages += 1;
      seen += records.length;
      cursor = records[0].sequence;
      if (records[0].sequence === 1) break;
    }
    expect(seen).toBe(10_000);
    expect(pages).toBeGreaterThanOrEqual(20);
  });
});
