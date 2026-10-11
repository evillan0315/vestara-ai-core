/**
 * AR-REPORT phase 1 — bounded `since`/`until` range queries on the activity store.
 *
 * Bounds are inclusive ISO-8601 timestamps. An inverted range (since > until)
 * matches nothing — never inferred, never widened.
 */

import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../src/contracts';
import { InMemoryActivityStore } from '../src/store';

function record(sequence: number, timestamp: string): ActivityRecord {
  return {
    id: `activity-${sequence}`,
    kind: 'workflow',
    workflowId: 'workflow-1',
    previousState: 'pending',
    currentState: 'running',
    reason: `step ${sequence}`,
    authoritative: true,
    observed: false,
    sequence,
    timestamp,
    actor: { type: 'system', id: 'workflow', displayName: 'Workflow' },
    evidenceRefs: [],
  } as unknown as ActivityRecord;
}

async function seeded(): Promise<InMemoryActivityStore> {
  const store = new InMemoryActivityStore();
  await store.append(record(1, '2026-10-08T12:00:00.000Z'));
  await store.append(record(2, '2026-10-09T12:00:00.000Z'));
  await store.append(record(3, '2026-10-10T12:00:00.000Z'));
  await store.append(record(4, '2026-10-11T12:00:00.000Z'));
  return store;
}

async function ids(
  store: InMemoryActivityStore,
  query: Parameters<InMemoryActivityStore['list']>[0],
): Promise<number[]> {
  const page = await store.list(query);
  return page.records.map((entry) => entry.sequence);
}

describe('activity range query (AR-REPORT)', () => {
  it('returns everything when no bounds are set', async () => {
    expect(await ids(await seeded(), {})).toEqual([1, 2, 3, 4]);
  });

  it('applies an inclusive lower bound', async () => {
    expect(await ids(await seeded(), { since: '2026-10-09T12:00:00.000Z' })).toEqual([2, 3, 4]);
  });

  it('applies an inclusive upper bound', async () => {
    expect(await ids(await seeded(), { until: '2026-10-10T12:00:00.000Z' })).toEqual([1, 2, 3]);
  });

  it('applies a closed window', async () => {
    const store = await seeded();
    expect(await ids(store, { since: '2026-10-09T00:00:00.000Z', until: '2026-10-10T23:59:59.999Z' })).toEqual([2, 3]);
  });

  it('matches nothing when since is after until (no inference)', async () => {
    const store = await seeded();
    expect(await ids(store, { since: '2026-10-11T00:00:00.000Z', until: '2026-10-09T00:00:00.000Z' })).toEqual([]);
  });

  it('composes with the kind filter', async () => {
    const store = await seeded();
    expect(await ids(store, { since: '2026-10-09T00:00:00.000Z', kind: 'task' })).toEqual([]);
    expect(await ids(store, { since: '2026-10-09T00:00:00.000Z', kind: 'workflow' })).toEqual([2, 3, 4]);
  });
});
