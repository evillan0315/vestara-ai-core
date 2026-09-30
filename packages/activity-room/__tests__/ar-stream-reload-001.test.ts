/**
 * AR-STREAM-RELOAD-001 — Raw Snapshot Recovery invariant.
 *
 * Historical defect: the M11A snapshot hydrated the client from the M10
 * *aggregated* projection, so a reload replaced a populated stream (20+
 * muted/log records + primary messages) with a single `si-agg-*` row.
 * Raw identity was lost on reload: distinct durable records collapsed into
 * one substituted aggregate identity, breaking catch-up dedupe and
 * edit/session correlation.
 *
 * Frozen invariant (MUST hold):
 *   Snapshot/reload hydration uses RAW stream identity. Projection
 *   aggregation is presentation only and MUST NOT be used as durable
 *   recovery state.
 *
 * Architecture preserved:
 *   M9 = durable evidence. M10 raw stream = reload/correlation identity.
 *   M10 aggregation = presentation only. Density filtering = presentation
 *   only (client-side, covered by the M11C stream tests — not here).
 *
 * This test exercises the real boundary: real M9 SqliteActivityStore
 * (durable) → real M10 ProjectionRuntime → the exact M11A snapshot
 * composition (`getRawStream().slice(-SNAPSHOT_WINDOW)` + authoritative
 * cursor; see apps/api/src/routes/activity-room-m11a.ts snapshot handler)
 * → the exact client merge/dedupe rule (dedupe by stream item id only;
 * see useM11CActivityRoom mergeStream).
 */

import { describe, expect, it } from 'vitest';
import { SqliteActivityStore } from '../src/m9-sqlite-store';
import type { ActivityEvent } from '../src/m9-types';
import { ProjectionRuntime } from '../src/m10-projection-runtime';

/** M11A snapshot bound (mirrors the route's `.slice(-50)`). */
const SNAPSHOT_WINDOW = 50;

async function createStore(): Promise<SqliteActivityStore> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  return new SqliteActivityStore(new SQL.Database());
}

function runnableEvent(index: number): ActivityEvent {
  return {
    eventId: `reload-001:runnable:${index}`,
    type: 'task.runnable',
    timestamp: new Date(Date.UTC(2026, 8, 24, 2, 0, index)).toISOString(),
    actor: { type: 'agent', id: 'developer', displayName: 'Developer' },
    source: 'workflow-engine',
    payload: { message: `runnable log ${index}` },
  };
}

function humanEvent(): ActivityEvent {
  return {
    eventId: 'reload-001:human:1',
    type: 'human.message',
    timestamp: new Date(Date.UTC(2026, 8, 24, 3, 0, 0)).toISOString(),
    actor: { type: 'human', id: 'local', displayName: 'Operator' },
    source: 'human-input',
    payload: { message: 'ship it' },
  };
}

/** Client merge/dedupe rule mirrored from useM11CActivityRoom.mergeStream. */
function mergeById(
  previous: ReadonlyArray<{ id: string; sequence: number }>,
  additions: ReadonlyArray<{ id: string; sequence: number }>,
): Array<{ id: string; sequence: number }> {
  const known = new Set(previous.map((item) => item.id));
  const fresh = additions.filter((item) => !known.has(item.id));
  if (fresh.length === 0) return [...previous];
  return [...previous, ...fresh].sort((a, b) => a.sequence - b.sequence);
}

describe('AR-STREAM-RELOAD-001: raw snapshot recovery', () => {
  it('snapshot hydrates every seeded raw record with raw identity (no si-agg-* substitution)', async () => {
    const store = await createStore();
    const seeded: string[] = [];
    for (let index = 1; index <= 49; index += 1) {
      const record = await store.append(runnableEvent(index));
      seeded.push(String(record.activityId));
    }
    const human = await store.append(humanEvent());
    seeded.push(String(human.activityId));

    // M9 durable evidence: all 50 records survive with monotonic sequences.
    const durable = await store.rebuild();
    expect(durable).toHaveLength(50);
    expect(durable.map((record) => record.sequenceNumber)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));

    // M10 rebuild over the durable records.
    const runtime = new ProjectionRuntime();
    const projection = runtime.rebuild(durable);

    // ─── M11A snapshot composition (exact boundary expression) ───
    const raw = runtime.getRawStream();
    const snapshotStream = raw.slice(-SNAPSHOT_WINDOW);
    const cursor = projection.room.cursor;

    // Snapshot contains all seeded raw records within the bound.
    expect(snapshotStream).toHaveLength(50);
    expect(snapshotStream.map((item) => String(item.activityId)).sort()).toEqual([...seeded].sort());

    // Raw IDs survive individually: one row per record, si-<activityId>.
    const snapshotIds = snapshotStream.map((item) => item.streamItemId);
    expect(new Set(snapshotIds).size).toBe(50);
    for (const item of snapshotStream) {
      expect(item.streamItemId).toBe(`si-${String(item.activityId)}`);
    }

    // No substituted aggregate identity for those records.
    expect(snapshotIds.some((id) => id.startsWith('si-agg-'))).toBe(false);
    expect(snapshotStream.some((item) => item.aggregated !== undefined)).toBe(false);

    // The muted run keeps its presentation classification (density may still
    // hide it client-side) without losing recovery identity.
    const muted = snapshotStream.filter((item) => item.importance === 'muted');
    expect(muted.length).toBeGreaterThanOrEqual(20);
    expect(snapshotStream.some((item) => item.importance === 'primary')).toBe(true);

    // Cursor corresponds to authoritative snapshot state.
    expect(cursor.sequenceNumber).toBe(50);
    expect(cursor.eventId).toBe(human.eventId);
    const storeCursor = await store.getCursor();
    expect(storeCursor?.sequenceNumber).toBe(cursor.sequenceNumber);
    expect(storeCursor?.eventId).toBe(cursor.eventId);
    expect(snapshotStream[snapshotStream.length - 1].sequenceNumber).toBe(cursor.sequenceNumber);
  });

  it('M10 may still aggregate those records for presentation without altering recovery identity', async () => {
    const store = await createStore();
    for (let index = 1; index <= 49; index += 1) {
      await store.append(runnableEvent(index));
    }
    await store.append(humanEvent());

    const runtime = new ProjectionRuntime();
    const projection = runtime.rebuild(await store.rebuild());

    // Presentation projection coalesces the muted run (compact view).
    const aggregatedIds = projection.stream.map((item) => item.streamItemId);
    expect(aggregatedIds.some((id) => id.startsWith('si-agg-'))).toBe(true);
    expect(projection.stream.length).toBeLessThan(50);

    // Recovery identity is untouched: raw stream still holds every record.
    const raw = runtime.getRawStream();
    expect(raw).toHaveLength(50);
    expect(raw.some((item) => item.streamItemId.startsWith('si-agg-'))).toBe(false);

    // Every aggregate reference resolves back to a raw snapshot row.
    const rawIds = new Set(raw.map((item) => String(item.activityId)));
    for (const item of projection.stream) {
      for (const ref of item.aggregated?.referencedActivityIds ?? []) {
        expect(rawIds.has(String(ref))).toBe(true);
      }
    }
  });

  it('client merge/dedupe does not collapse distinct raw records after hydration', async () => {
    const store = await createStore();
    for (let index = 1; index <= 49; index += 1) {
      await store.append(runnableEvent(index));
    }
    await store.append(humanEvent());

    const runtime = new ProjectionRuntime();
    runtime.rebuild(await store.rebuild());
    const snapshotItems = runtime
      .getRawStream()
      .slice(-SNAPSHOT_WINDOW)
      .map((item) => ({ id: item.streamItemId, sequence: item.sequenceNumber }));

    // Hydration: snapshot rows become client state.
    let client = mergeById([], snapshotItems);
    expect(client).toHaveLength(50);

    // Catch-up redelivery of the same rows dedupes to zero additions.
    client = mergeById(client, snapshotItems);
    expect(client).toHaveLength(50);

    // Distinct records with identical content keep distinct identity.
    const dupA = { id: 'si-act-dup-a', sequence: 51 };
    const dupB = { id: 'si-act-dup-b', sequence: 52 };
    client = mergeById(client, [dupA, dupB]);
    expect(client).toHaveLength(52);
    expect(client.filter((item) => item.id === 'si-act-dup-a')).toHaveLength(1);
    expect(client.filter((item) => item.id === 'si-act-dup-b')).toHaveLength(1);
  });

  it('snapshot window stays bounded; older durable history remains reachable via pagination', async () => {
    const store = await createStore();
    for (let index = 1; index <= 54; index += 1) {
      await store.append(runnableEvent(index));
    }
    await store.append(humanEvent());

    const runtime = new ProjectionRuntime();
    const projection = runtime.rebuild(await store.rebuild());

    // 55 durable records; the snapshot window holds the newest 50 only.
    expect(await store.lastSequence()).toBe(55);
    const windowed = runtime.getRawStream().slice(-SNAPSHOT_WINDOW);
    expect(windowed).toHaveLength(50);
    expect(windowed[0].sequenceNumber).toBe(6);
    expect(windowed[windowed.length - 1].sequenceNumber).toBe(55);
    expect(projection.room.cursor.sequenceNumber).toBe(55);

    // Older durable history is obtained through pagination, not the snapshot.
    const older = await store.getAfter({ sequenceNumber: 0, eventId: '', timestamp: '' });
    expect(older.length).toBe(55);
    expect(older.slice(0, 5).map((record) => record.sequenceNumber)).toEqual([1, 2, 3, 4, 5]);
  });
});
