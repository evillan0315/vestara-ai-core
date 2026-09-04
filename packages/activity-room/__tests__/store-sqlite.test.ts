import { migrate } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../src/contracts';
import { ACTIVITY_MANIFEST, SqliteActivityStore } from '../src/index';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

function record(id: string, sequence: number, content: string): ActivityRecord {
  return {
    id,
    sequence,
    timestamp: '2026-08-08T10:00:00.000Z',
    actor: { type: 'human', id: 'current-user', displayName: 'You' },
    kind: 'agent-message',
    agentId: 'all-agents',
    messageKind: 'message',
    content,
    evidenceRefs: [],
  };
}

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

describe('SqliteActivityStore (durable continuity)', () => {
  it('persists records and reconstructs them after reopen, resuming sequence', async () => {
    const db = new SQL.Database();
    migrate(db, ACTIVITY_MANIFEST);
    const store = new SqliteActivityStore(db);
    await store.append(record('activity:msg:1', 1, 'first'));
    await store.append(record('activity:msg:2', 2, 'second'));
    expect(await store.lastSequence()).toBe(2);
    expect(store.size()).toBe(2);

    // Reopen the exported bytes as a fresh process would.
    const bytes = db.export();
    const reopened = new SQL.Database(bytes);
    const store2 = new SqliteActivityStore(reopened);
    expect(await store2.lastSequence()).toBe(2);
    expect(store2.size()).toBe(2);
    const page = await store2.list({});
    expect(page.records.map((entry) => entry.id)).toEqual(['activity:msg:1', 'activity:msg:2']);
    expect(await store2.get('activity:msg:1')).toMatchObject({ content: 'first' });
    expect(page.nextSequence).toBe(3);

    // New appends on the reopened store continue the sequence.
    await store2.append(record('activity:msg:3', 3, 'third'));
    expect(await store2.lastSequence()).toBe(3);
  });

  it('enforces the append-only duplicate contract', async () => {
    const db = new SQL.Database();
    migrate(db, ACTIVITY_MANIFEST);
    const store = new SqliteActivityStore(db);
    await store.append(record('activity:msg:1', 1, 'first'));
    await expect(store.append(record('activity:msg:1', 1, 'dupe'))).rejects.toThrow(/Duplicate/);
  });

  it('filters by sequence and kind after reopen', async () => {
    const db = new SQL.Database();
    migrate(db, ACTIVITY_MANIFEST);
    const store = new SqliteActivityStore(db);
    await store.append(record('activity:msg:1', 1, 'first'));
    await store.append(record('activity:msg:2', 2, 'second'));
    const after = await store.list({ afterSequence: 1 });
    expect(after.records.map((entry) => entry.id)).toEqual(['activity:msg:2']);
    expect(after.nextSequence).toBe(3);
  });
});
