import { describe, expect, it } from 'vitest';
import { SqliteActivityStore } from '../src/m9-sqlite-store';
import type { ActivityEvent } from '../src/m9-types';

async function createStore(): Promise<SqliteActivityStore> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  return new SqliteActivityStore(new SQL.Database());
}

function event(index: number): ActivityEvent {
  return {
    eventId: `retention:event:${index}`,
    type: 'system.event',
    timestamp: new Date(Date.UTC(2026, 8, 24, 1, 0, index)).toISOString(),
    actor: { type: 'system', id: 'retention-test', displayName: 'Retention test' },
    source: 'system',
    payload: {
      message: `activity ${index}`,
      data: { executionId: `exec-${index}`, operationId: `op-${index}` },
    },
  };
}

describe('M9 Activity retention', () => {
  it('retains exact newest records, preserves replay, and allocates monotonically afterward', async () => {
    const store = await createStore();
    const inserted = [];
    for (let index = 1; index <= 25; index += 1) inserted.push(await store.append(event(index)));

    const retainedIds = inserted.slice(-20).map((record) => record.activityId);
    const result = await store.retainNewest(20);
    const replayed = await store.replay();

    expect(result).toMatchObject({
      deletedCount: 5,
      retainedCount: 20,
      firstRetainedSequence: 6,
      lastRetainedSequence: 25,
    });
    expect(replayed.map((record) => record.activityId)).toEqual(retainedIds);
    expect(replayed.map((record) => record.sequenceNumber)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 6),
    );
    expect(replayed.every((record) => record.payload.data?.operationId === `op-${record.sequenceNumber}`)).toBe(true);

    const appended = await store.append(event(26));
    expect(appended.sequenceNumber).toBe(26);
    expect((await store.replay()).at(-1)?.activityId).toBe(appended.activityId);
  });

  it('rejects an invalid retention limit without changing records', async () => {
    const store = await createStore();
    await store.append(event(1));
    await expect(store.retainNewest(0)).rejects.toThrow('positive integer');
    expect((await store.replay()).map((record) => record.sequenceNumber)).toEqual([1]);
  });
});
