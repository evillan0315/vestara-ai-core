import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { closeM11AActivityRoom, getM11ARoom, initM11AActivityRoom } from '../src/routes/activity-room-m11a';

const tempDirs: string[] = [];

function createLegacyDb(repo: string): string {
  const dbPath = join(repo, '.vestara', 'm9-activity.db');
  mkdirSync(join(repo, '.vestara'), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
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
    ) VALUES ('act-legacy', 'legacy-event', 2, 'system.event',
      '2026-09-24T00:00:00.000Z', 'system', 'fixture', 'Fixture', 'system', '{}', 'all');
  `);
  db.close();
  return dbPath;
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function createProductionShapeDb(repo: string): string {
  const dbPath = join(repo, '.vestara', 'm9-activity.db');
  mkdirSync(join(repo, '.vestara'), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE m9_activity_events (
      activity_id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE,
      sequence_number INTEGER NOT NULL, type TEXT NOT NULL, timestamp TEXT NOT NULL,
      execution_id TEXT, trace_id TEXT, request_id TEXT, workflow_run_id TEXT, task_id TEXT,
      agent_assignment_id TEXT, repository_binding_id TEXT, runtime_session_binding_id TEXT,
      ai_binding_id TEXT, actor_type TEXT NOT NULL, actor_id TEXT,
      actor_display_name TEXT NOT NULL, source TEXT NOT NULL, payload_json TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'all'
    );
    CREATE INDEX idx_m9_sequence ON m9_activity_events(sequence_number);
    CREATE INDEX idx_m9_event_id ON m9_activity_events(event_id);
    CREATE INDEX idx_m9_workflow_run ON m9_activity_events(workflow_run_id);
    CREATE INDEX idx_m9_execution ON m9_activity_events(execution_id);
    CREATE INDEX idx_m9_task ON m9_activity_events(task_id);
    CREATE INDEX idx_m9_type ON m9_activity_events(type);
    CREATE INDEX idx_m9_timestamp ON m9_activity_events(timestamp);
    CREATE UNIQUE INDEX idx_m9_sequence_unique ON m9_activity_events(sequence_number);
    CREATE TABLE m9_sequence_allocator (
      allocator_id INTEGER PRIMARY KEY CHECK (allocator_id = 1), next_sequence INTEGER NOT NULL
    );
    INSERT INTO m9_sequence_allocator (allocator_id, next_sequence) VALUES (1, 2);
    INSERT INTO m9_activity_events (
      activity_id, event_id, sequence_number, type, timestamp, actor_type, actor_id,
      actor_display_name, source, payload_json, visibility
    ) VALUES ('act-prod', 'prod-event', 1, 'system.event',
      '2026-09-24T00:00:00.000Z', 'system', 'fixture', 'Fixture', 'system', '{}', 'all');
    PRAGMA user_version = 1;
  `);
  db.close();
  return dbPath;
}

describe('M9 production migration gate', () => {
  it('boots M9 on a production-shape v1 database without requiring the RuntimeInteraction migration', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'vestara-m9-api-gate-'));
    tempDirs.push(repo);
    const dbPath = createProductionShapeDb(repo);
    const before = createHash('sha256').update(readFileSync(dbPath)).digest('hex');

    await initM11AActivityRoom(repo);
    try {
      // M9 authority operational; interaction capability unavailable under its
      // own domain, never as an M9 validity failure.
      expect(await getM11ARoom().store.lastSequence()).toBe(1);
      expect(getM11ARoom().runtimeQuestions).toBeNull();
    } finally {
      closeM11AActivityRoom();
    }
    // Booting performed no schema writes and no interaction migration.
    expect(createHash('sha256').update(readFileSync(dbPath)).digest('hex')).toBe(before);
    const check = new DatabaseSync(dbPath, { readOnly: true });
    try {
      expect(check.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 });
      expect(
        check.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'runtime_question_interactions'").get(),
      ).toEqual({ count: 0 });
    } finally {
      check.close();
    }
  });

  it('fails API initialization closed instead of migrating a legacy database', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'vestara-m9-api-gate-'));
    tempDirs.push(repo);
    const movedDbPath = createLegacyDb(repo);
    const before = createHash('sha256').update(readFileSync(movedDbPath)).digest('hex');

    await expect(initM11AActivityRoom(repo)).rejects.toMatchObject({
      name: 'M9StoreOpenError',
      status: 'migration-required',
    });
    expect(createHash('sha256').update(readFileSync(movedDbPath)).digest('hex')).toBe(before);
    const check = new DatabaseSync(movedDbPath, { readOnly: true });
    expect(check.prepare('PRAGMA user_version').get()).toEqual({ user_version: 0 });
    expect(
      check.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'm9_sequence_allocator'").get(),
    ).toEqual({
      count: 0,
    });
    check.close();
  });
});
