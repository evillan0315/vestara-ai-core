/**
 * AR-TOOL-ASK-003A schema-ownership correction evidence.
 *
 * Proves the accepted design on a production-shape fixture
 * (M9 user_version=1, populated m9_activity_events, initialized allocator,
 * M9 indexes, no RuntimeInteraction table):
 *
 * - M9 opens before, during, and after RuntimeInteraction migration;
 * - RuntimeInteraction fails closed before its explicit migration and opens
 *   after it, versioning itself independently of M9 (per-domain metadata,
 *   never PRAGMA user_version);
 * - neither migration creates, repairs, versions, or validates the other
 *   domain's objects; reopening either store performs no schema writes.
 *
 * The production database is never touched: every fixture is a temp file.
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectM9Schema } from '../src/m9-native-schema';
import { NativeSqliteActivityStore } from '../src/m9-native-sqlite-store';
import {
  inspectRuntimeInteractionSchema,
  migrateRuntimeInteractionSchema,
  RUNTIME_INTERACTION_SCHEMA_VERSION,
} from '../src/runtime-interaction-schema';
import { RuntimeInteractionStoreOpenError, RuntimeQuestionInteractionStore } from '../src/runtime-interaction-store';

type Row = Record<string, unknown>;

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function fixturePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vestara-003a-ownership-'));
  tempDirs.push(dir);
  return join(dir, 'm9-activity.db');
}

/**
 * Production logical shape: full M9 column set, all eight production M9
 * indexes, five rows (sequences 1..5), allocator ahead at 6,
 * user_version=1, and no RuntimeInteraction objects.
 */
function createProductionShapeDb(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE m9_activity_events (
      activity_id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      sequence_number INTEGER NOT NULL,
      type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      execution_id TEXT,
      trace_id TEXT,
      request_id TEXT,
      workflow_run_id TEXT,
      task_id TEXT,
      agent_assignment_id TEXT,
      repository_binding_id TEXT,
      runtime_session_binding_id TEXT,
      ai_binding_id TEXT,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      actor_display_name TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
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
      allocator_id INTEGER PRIMARY KEY CHECK (allocator_id = 1),
      next_sequence INTEGER NOT NULL
    );
    INSERT INTO m9_sequence_allocator (allocator_id, next_sequence) VALUES (1, 6);
  `);
  const insert = db.prepare(
    `INSERT INTO m9_activity_events (
      activity_id, event_id, sequence_number, type, timestamp, actor_type, actor_id,
      actor_display_name, source, payload_json, visibility
    ) VALUES (?, ?, ?, 'system.event', '2026-09-24T00:00:00.000Z', 'system', 'fixture',
      'Fixture', 'system', '{}', 'all')`,
  );
  for (let sequence = 1; sequence <= 5; sequence += 1) {
    insert.run(`act-${sequence}-prod`, `prod-event-${sequence}`, sequence);
  }
  db.exec('PRAGMA user_version = 1');
  db.close();
}

function sha256(dbPath: string): string {
  return createHash('sha256').update(readFileSync(dbPath)).digest('hex');
}

function readOnly(dbPath: string): DatabaseSync {
  return new DatabaseSync(dbPath, { readOnly: true });
}

function m9Dump(db: DatabaseSync): {
  rows: readonly Row[];
  allocator: Row | undefined;
  indexes: readonly string[];
  userVersion: unknown;
} {
  const rows = db.prepare('SELECT * FROM m9_activity_events ORDER BY sequence_number ASC').all() as Row[];
  const allocator = db.prepare('SELECT * FROM m9_sequence_allocator').get() as Row | undefined;
  const indexes = (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND sql LIKE '%m9_activity_events%' ORDER BY name")
      .all() as Row[]
  ).map((row) => String(row.name));
  const userVersion = (db.prepare('PRAGMA user_version').get() as Row).user_version;
  return { rows, allocator, indexes, userVersion };
}

function interactionObjects(db: DatabaseSync): { tables: readonly string[]; indexes: readonly string[] } {
  const tables = (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'runtime_%' ORDER BY name")
      .all() as Row[]
  ).map((row) => String(row.name));
  const indexes = (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_runtime_%' ORDER BY name")
      .all() as Row[]
  ).map((row) => String(row.name));
  return { tables, indexes };
}

describe('003A schema ownership: production-shape fixture', () => {
  it('M9 opens before RuntimeInteraction migration while interaction fails closed', async () => {
    const dbPath = fixturePath();
    createProductionShapeDb(dbPath);
    const before = sha256(dbPath);

    // M9 authority is current on its own: missing interaction schema is invisible.
    const m9 = NativeSqliteActivityStore.open(dbPath);
    expect(await m9.lastSequence()).toBe(5);
    m9.close();
    expect(sha256(dbPath)).toBe(before);

    // RuntimeInteraction authority fails closed under its own domain error.
    expect(() => RuntimeQuestionInteractionStore.open(dbPath)).toThrowError(RuntimeInteractionStoreOpenError);
    try {
      RuntimeQuestionInteractionStore.open(dbPath);
    } catch (error) {
      expect(error).toMatchObject({ name: 'RuntimeInteractionStoreOpenError', status: 'migration-required' });
    }
    expect(sha256(dbPath)).toBe(before);
  });

  it('explicit RuntimeInteraction migration preserves every M9 byte of authority state', () => {
    const dbPath = fixturePath();
    createProductionShapeDb(dbPath);
    const probe = readOnly(dbPath);
    const m9Before = m9Dump(probe);
    expect(m9Before.rows).toHaveLength(5);
    probe.close();
    const beforeObjects = (() => {
      const db = readOnly(dbPath);
      try {
        return interactionObjects(db);
      } finally {
        db.close();
      }
    })();
    expect(beforeObjects.tables).toEqual([]);

    RuntimeQuestionInteractionStore.migrate(dbPath);

    const after = readOnly(dbPath);
    try {
      // M9 rows, sequences, allocator, indexes, and M9 version identical.
      expect(m9Dump(after)).toEqual(m9Before);
      expect(after.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 });
      // RuntimeInteraction objects created with an independent v1 stamp.
      expect(interactionObjects(after)).toEqual({
        tables: ['runtime_interaction_schema_meta', 'runtime_question_interactions'],
        indexes: [
          'idx_runtime_question_conversation',
          'idx_runtime_question_expires',
          'idx_runtime_question_session_request',
          'idx_runtime_question_status',
        ],
      });
      const version = after
        .prepare('SELECT value FROM runtime_interaction_schema_meta WHERE key = ?')
        .get('schema_version') as Row;
      expect(String(version.value)).toBe(String(RUNTIME_INTERACTION_SCHEMA_VERSION));
    } finally {
      after.close();
    }
  });

  it('both stores open after migration and reopening either performs no schema writes', async () => {
    const dbPath = fixturePath();
    createProductionShapeDb(dbPath);
    RuntimeQuestionInteractionStore.migrate(dbPath);

    // Both authorities functional against the same physical file.
    const m9 = NativeSqliteActivityStore.open(dbPath);
    const questions = RuntimeQuestionInteractionStore.open(dbPath);
    expect(await m9.lastSequence()).toBe(5);
    const created = questions.ingestAsked({
      conversationId: 'conv-ownership',
      openCodeSessionId: 'ses_ownership',
      openCodeRequestId: 'req_ownership',
      questions: [{ header: 'H', question: 'Q?', options: [{ label: 'Yes' }] }],
    });
    expect(created.status).toBe('pending');
    m9.close();
    questions.close();

    // Reopen byte-stability is measured on a probe-free migrated fixture so
    // row writes cannot be mistaken for schema writes.
    const migratedOnly = fixturePath();
    createProductionShapeDb(migratedOnly);
    RuntimeQuestionInteractionStore.migrate(migratedOnly);
    const settled = sha256(migratedOnly);
    const reopenedM9 = NativeSqliteActivityStore.open(migratedOnly);
    await reopenedM9.rebuild();
    reopenedM9.close();
    expect(sha256(migratedOnly)).toBe(settled);
    const reopenedQuestions = RuntimeQuestionInteractionStore.open(migratedOnly);
    reopenedQuestions.close();
    expect(sha256(migratedOnly)).toBe(settled);
  });

  it('dropping the RuntimeInteraction table does not invalidate M9', () => {
    const dbPath = fixturePath();
    createProductionShapeDb(dbPath);
    RuntimeQuestionInteractionStore.migrate(dbPath);

    const writer = new DatabaseSync(dbPath);
    writer.exec('DROP TABLE runtime_question_interactions');
    writer.close();

    const m9 = NativeSqliteActivityStore.open(dbPath);
    m9.close();
    const probe = readOnly(dbPath);
    try {
      expect(inspectM9Schema(probe).status).toBe('current');
      expect(inspectRuntimeInteractionSchema(probe).status).toBe('migration-required');
    } finally {
      probe.close();
    }
  });

  it('RuntimeInteraction migration does not repair a malformed M9, and M9 migration creates no interaction objects', () => {
    const malformedPath = fixturePath();
    const malformed = new DatabaseSync(malformedPath);
    malformed.exec('CREATE TABLE m9_activity_events (activity_id TEXT PRIMARY KEY)');
    malformed.close();

    // Interaction migration succeeds on its own objects only.
    const malformedHandle = new DatabaseSync(malformedPath);
    try {
      migrateRuntimeInteractionSchema(malformedHandle);
    } finally {
      malformedHandle.close();
    }
    const probe = readOnly(malformedPath);
    try {
      expect(inspectRuntimeInteractionSchema(probe).status).toBe('current');
      expect(inspectM9Schema(probe).status).toBe('incompatible');
    } finally {
      probe.close();
    }
    expect(() => NativeSqliteActivityStore.open(malformedPath)).toThrowError(
      expect.objectContaining({ name: 'M9StoreOpenError', status: 'incompatible' }),
    );
    expect(() => RuntimeQuestionInteractionStore.open(malformedPath)).not.toThrow();

    // M9 migration on an interaction-absent database creates no interaction objects.
    const m9OnlyPath = fixturePath();
    createProductionShapeDb(m9OnlyPath);
    NativeSqliteActivityStore.migrate(m9OnlyPath);
    const check = readOnly(m9OnlyPath);
    try {
      expect(interactionObjects(check)).toEqual({ tables: [], indexes: [] });
      expect(inspectRuntimeInteractionSchema(check).status).toBe('migration-required');
      expect(inspectM9Schema(check).status).toBe('current');
    } finally {
      check.close();
    }
  });

  it('M9 migration preserves rows and allocator on the production-shape fixture', async () => {
    const dbPath = fixturePath();
    createProductionShapeDb(dbPath);
    const before = readOnly(dbPath);
    const m9Before = m9Dump(before);
    before.close();

    // Idempotent on an already-current v1 database: M9 objects only.
    NativeSqliteActivityStore.migrate(dbPath);

    const after = readOnly(dbPath);
    try {
      expect(m9Dump(after)).toEqual(m9Before);
      expect(after.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 });
    } finally {
      after.close();
    }
    const store = NativeSqliteActivityStore.open(dbPath);
    expect((await store.rebuild()).map((record) => record.sequenceNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(await store.lastSequence()).toBe(5);
    store.close();
  });
});
