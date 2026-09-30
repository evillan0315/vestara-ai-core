import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { NativeSqliteActivityStore } from '../src/m9-native-sqlite-store';
import type { ActivityEvent } from '../src/m9-types';

const tempDirs: string[] = [];

function createPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vestara-m9-native-test-'));
  tempDirs.push(dir);
  return join(dir, 'm9-activity.db');
}

function createCurrentPath(): string {
  const dbPath = createPath();
  NativeSqliteActivityStore.migrate(dbPath);
  return dbPath;
}

function event(eventId: string): ActivityEvent {
  return {
    eventId,
    type: 'system.event',
    timestamp: '2026-09-24T00:00:00.000Z',
    actor: { type: 'system', id: 'native-test', displayName: 'Native test' },
    source: 'system',
    payload: { message: eventId, data: { marker: eventId } },
  };
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('native M9 SQLite authority', () => {
  it('passes the Node runtime compatibility smoke check', () => {
    const db = new DatabaseSync(':memory:');
    expect(db.prepare('SELECT sqlite_version() AS version').get()).toHaveProperty('version');
    db.close();
  });

  it('keeps committed appends from two independent connections', async () => {
    const dbPath = createCurrentPath();
    const first = NativeSqliteActivityStore.open(dbPath);
    const second = NativeSqliteActivityStore.open(dbPath);

    const [one, two] = await Promise.all([first.append(event('writer-one')), second.append(event('writer-two'))]);
    const replay = await first.rebuild();

    expect(new Set(replay.map((record) => record.eventId))).toEqual(new Set(['writer-one', 'writer-two']));
    expect(new Set(replay.map((record) => record.sequenceNumber)).size).toBe(2);
    expect(new Set([one.sequenceNumber, two.sequenceNumber]).size).toBe(2);
    first.close();
    second.close();
  });

  it('deduplicates identical event IDs across connections', async () => {
    const dbPath = createCurrentPath();
    const first = NativeSqliteActivityStore.open(dbPath);
    const second = NativeSqliteActivityStore.open(dbPath);

    const [one, two] = await Promise.all([first.append(event('same-event')), second.append(event('same-event'))]);

    expect(one).toEqual(two);
    expect((await first.rebuild()).map((record) => record.eventId)).toEqual(['same-event']);
    first.close();
    second.close();
  });

  it('retains atomically and prevents stale connections from resurrecting rows', async () => {
    const dbPath = createCurrentPath();
    const stale = NativeSqliteActivityStore.open(dbPath);
    await stale.append(event('old-one'));
    await stale.append(event('old-two'));
    await stale.append(event('keep-three'));

    const current = NativeSqliteActivityStore.open(dbPath);
    await expect(current.retainNewest(2)).resolves.toMatchObject({
      deletedCount: 1,
      firstRetainedSequence: 2,
      lastRetainedSequence: 3,
    });
    await stale.append(event('new-four'));

    const replay = await current.rebuild();
    expect(replay.map((record) => record.eventId)).toEqual(['old-two', 'keep-three', 'new-four']);
    expect(replay.map((record) => record.sequenceNumber)).toEqual([2, 3, 4]);
    stale.close();
    current.close();
  });

  it('does not reuse sequences after retention', async () => {
    const store = NativeSqliteActivityStore.open(createCurrentPath());
    await store.append(event('one'));
    await store.append(event('two'));
    await store.append(event('three'));
    await store.retainNewest(1);

    const appended = await store.append(event('four'));
    expect(appended.sequenceNumber).toBe(4);
    store.close();
  });

  it('rolls back allocator advancement when the insert fails', async () => {
    const dbPath = createCurrentPath();
    const store = NativeSqliteActivityStore.open(dbPath);
    const triggerDb = new DatabaseSync(dbPath);
    triggerDb.exec(`
      CREATE TRIGGER reject_native_test_insert
      BEFORE INSERT ON m9_activity_events
      WHEN NEW.event_id = 'forced-failure'
      BEGIN
        SELECT RAISE(ABORT, 'forced native test failure');
      END;
    `);
    triggerDb.close();

    await expect(store.append(event('forced-failure'))).rejects.toThrow('forced native test failure');
    const appended = await store.append(event('after-failure'));
    expect(appended.sequenceNumber).toBe(1);
    store.close();
  });

  it('propagates persistence failure instead of acknowledging ingestion', async () => {
    const errors: unknown[] = [];
    const store = NativeSqliteActivityStore.open(createCurrentPath(), {
      onPersistenceError: (error) => errors.push(error),
    });
    store.close();

    await expect(store.append(event('after-close'))).rejects.toThrow();
    expect(errors).toHaveLength(1);
  });

  it('fails explicitly after the bounded busy timeout without retry sleeps', async () => {
    const dbPath = createCurrentPath();
    const store = NativeSqliteActivityStore.open(dbPath, { busyTimeoutMs: 25 });
    const holder = new DatabaseSync(dbPath);
    holder.exec('BEGIN IMMEDIATE');
    const startedAt = Date.now();

    await expect(store.append(event('busy-event'))).rejects.toThrow(/busy|locked/i);
    expect(Date.now() - startedAt).toBeLessThan(500);
    holder.exec('ROLLBACK');
    holder.close();
    store.close();
  });

  it('reopens and replays committed records exactly', async () => {
    const dbPath = createCurrentPath();
    const first = NativeSqliteActivityStore.open(dbPath);
    const committed = [await first.append(event('one')), await first.append(event('two'))];
    first.close();

    const second = NativeSqliteActivityStore.open(dbPath);
    expect(await second.rebuild()).toEqual(committed);
    second.close();
  });

  it('migrates the existing M9 table shape without rewriting records', async () => {
    const dbPath = createPath();
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE m9_activity_events (
        activity_id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE,
        sequence_number INTEGER NOT NULL, type TEXT NOT NULL, timestamp TEXT NOT NULL,
        execution_id TEXT, trace_id TEXT, request_id TEXT, workflow_run_id TEXT, task_id TEXT,
        agent_assignment_id TEXT, repository_binding_id TEXT, runtime_session_binding_id TEXT,
        ai_binding_id TEXT, actor_type TEXT NOT NULL, actor_id TEXT,
        actor_display_name TEXT NOT NULL, source TEXT NOT NULL, payload_json TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'all'
      );
      INSERT INTO m9_activity_events (
        activity_id, event_id, sequence_number, type, timestamp, actor_type, actor_id,
        actor_display_name, source, payload_json, visibility
      ) VALUES ('act-7-fixture', 'fixture-event', 7, 'system.event',
        '2026-09-24T00:00:00.000Z', 'system', 'fixture', 'Fixture', 'system', '{}', 'all');
    `);
    legacy.close();

    NativeSqliteActivityStore.migrate(dbPath);
    const store = NativeSqliteActivityStore.open(dbPath);
    const appended = await store.append(event('fixture-next'));
    expect(appended.sequenceNumber).toBe(8);
    expect((await store.getByActivityId('act-7-fixture'))?.eventId).toBe('fixture-event');
    store.close();
  });

  it('opens a current schema without schema writes', async () => {
    const dbPath = createPath();
    NativeSqliteActivityStore.migrate(dbPath);
    const before = createHash('sha256').update(readFileSync(dbPath)).digest('hex');
    const store = NativeSqliteActivityStore.open(dbPath);
    expect(await store.rebuild()).toEqual([]);
    store.close();
    expect(createHash('sha256').update(readFileSync(dbPath)).digest('hex')).toBe(before);
  });

  it('refuses a legacy schema without migrating or replacing it', () => {
    const dbPath = createPath();
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE m9_activity_events (
        activity_id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE,
        sequence_number INTEGER NOT NULL, type TEXT NOT NULL, timestamp TEXT NOT NULL,
        execution_id TEXT, trace_id TEXT, request_id TEXT, workflow_run_id TEXT, task_id TEXT,
        agent_assignment_id TEXT, repository_binding_id TEXT, runtime_session_binding_id TEXT,
        ai_binding_id TEXT, actor_type TEXT NOT NULL, actor_id TEXT,
        actor_display_name TEXT NOT NULL, source TEXT NOT NULL, payload_json TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'all'
      );
      INSERT INTO m9_activity_events (
        activity_id, event_id, sequence_number, type, timestamp, actor_type, actor_id,
        actor_display_name, source, payload_json, visibility
      ) VALUES ('act-legacy', 'legacy-event', 4, 'system.event',
        '2026-09-24T00:00:00.000Z', 'system', 'fixture', 'Fixture', 'system', '{}', 'all');
    `);
    legacy.close();
    const before = createHash('sha256').update(readFileSync(dbPath)).digest('hex');

    expect(() => NativeSqliteActivityStore.open(dbPath)).toThrowError(
      expect.objectContaining({ name: 'M9StoreOpenError', status: 'migration-required' }),
    );
    expect(createHash('sha256').update(readFileSync(dbPath)).digest('hex')).toBe(before);
    expect(statSync(dbPath).size).toBeGreaterThan(0);
  });

  it('explicitly migrates a legacy fixture, then reopens without mutation', async () => {
    const dbPath = createPath();
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE m9_activity_events (
        activity_id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE,
        sequence_number INTEGER NOT NULL, type TEXT NOT NULL, timestamp TEXT NOT NULL,
        execution_id TEXT, trace_id TEXT, request_id TEXT, workflow_run_id TEXT, task_id TEXT,
        agent_assignment_id TEXT, repository_binding_id TEXT, runtime_session_binding_id TEXT,
        ai_binding_id TEXT, actor_type TEXT NOT NULL, actor_id TEXT,
        actor_display_name TEXT NOT NULL, source TEXT NOT NULL, payload_json TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'all'
      );
      INSERT INTO m9_activity_events (
        activity_id, event_id, sequence_number, type, timestamp, actor_type, actor_id,
        actor_display_name, source, payload_json, visibility
      ) VALUES ('act-legacy', 'legacy-event', 4, 'system.event',
        '2026-09-24T00:00:00.000Z', 'system', 'fixture', 'Fixture', 'system', '{}', 'all');
    `);
    legacy.close();

    NativeSqliteActivityStore.migrate(dbPath);
    const migrated = NativeSqliteActivityStore.open(dbPath);
    expect((await migrated.getByEventId('legacy-event'))?.sequenceNumber).toBe(4);
    expect((await migrated.append(event('after-explicit-migration'))).sequenceNumber).toBe(5);
    migrated.close();

    const beforeReopen = createHash('sha256').update(readFileSync(dbPath)).digest('hex');
    const reopened = NativeSqliteActivityStore.open(dbPath);
    expect((await reopened.rebuild()).map((record) => record.sequenceNumber)).toEqual([4, 5]);
    reopened.close();
    expect(createHash('sha256').update(readFileSync(dbPath)).digest('hex')).toBe(beforeReopen);
  });

  it('fails closed for an unsupported newer schema', () => {
    const dbPath = createPath();
    NativeSqliteActivityStore.migrate(dbPath);
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA user_version = 99');
    db.close();

    expect(() => NativeSqliteActivityStore.open(dbPath)).toThrowError(
      expect.objectContaining({ name: 'M9StoreOpenError', status: 'unsupported' }),
    );
  });

  it('fails closed for corrupt or incompatible fixtures without replacement', () => {
    const corruptPath = createPath();
    writeFileSync(corruptPath, 'not an sqlite database');
    const beforeCorrupt = createHash('sha256').update(readFileSync(corruptPath)).digest('hex');
    expect(() => NativeSqliteActivityStore.open(corruptPath)).toThrowError(
      expect.objectContaining({ name: 'M9StoreOpenError', status: 'corrupt' }),
    );
    expect(createHash('sha256').update(readFileSync(corruptPath)).digest('hex')).toBe(beforeCorrupt);

    const invalidPath = createPath();
    const invalid = new DatabaseSync(invalidPath);
    invalid.exec('CREATE TABLE m9_activity_events (activity_id TEXT PRIMARY KEY)');
    invalid.close();
    expect(() => NativeSqliteActivityStore.open(invalidPath)).toThrowError(
      expect.objectContaining({ name: 'M9StoreOpenError', status: 'incompatible' }),
    );
  });
});
