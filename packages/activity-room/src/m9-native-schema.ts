import type { DatabaseSync } from 'node:sqlite';

/**
 * M9 schema authority: versions and gates M9 evidence objects ONLY
 * (`m9_activity_events`, `m9_sequence_allocator`, M9 indexes, M9
 * `PRAGMA user_version`). The RuntimeInteraction command-state schema is a
 * separate authority (`runtime-interaction-schema.ts`) sharing the same
 * physical file: M9 inspection, migration, and opening never require,
 * create, repair, or version RuntimeInteraction objects.
 */
export const M9_SCHEMA_VERSION = 1;

export type M9SchemaStatus = 'current' | 'migration-required' | 'unsupported' | 'incompatible' | 'corrupt';

export interface M9SchemaInspection {
  readonly status: M9SchemaStatus;
  readonly userVersion: number;
  readonly reason: string;
}

export class M9SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'M9SchemaError';
  }
}

export class M9SchemaCompatibilityError extends Error {
  readonly status: Exclude<M9SchemaStatus, 'current'>;

  constructor(status: Exclude<M9SchemaStatus, 'current'>, message: string) {
    super(message);
    this.name = 'M9SchemaCompatibilityError';
    this.status = status;
  }
}

type Row = Record<string, unknown>;

function scalar(db: DatabaseSync, sql: string, ...params: unknown[]): unknown {
  const row = db.prepare(sql).get(...(params as never[])) as Row | undefined;
  return row === undefined ? undefined : Object.values(row)[0];
}

function tableColumns(db: DatabaseSync, table: string): readonly string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => String((row as Row).name));
}

function tableExists(db: DatabaseSync, table: string): boolean {
  return scalar(db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", table) !== undefined;
}

function indexExists(db: DatabaseSync, index: string): boolean {
  return scalar(db, "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1", index) !== undefined;
}

function requiredColumnsPresent(db: DatabaseSync): readonly string[] {
  const required = [
    'activity_id',
    'event_id',
    'sequence_number',
    'type',
    'timestamp',
    'execution_id',
    'trace_id',
    'request_id',
    'workflow_run_id',
    'task_id',
    'agent_assignment_id',
    'repository_binding_id',
    'runtime_session_binding_id',
    'ai_binding_id',
    'actor_type',
    'actor_id',
    'actor_display_name',
    'source',
    'payload_json',
    'visibility',
  ];
  const columns = new Set(tableColumns(db, 'm9_activity_events'));
  return required.filter((column) => !columns.has(column));
}

/** Classify an existing database without changing schema, journal mode, or rows. */
export function inspectM9Schema(db: DatabaseSync): M9SchemaInspection {
  let integrity: unknown;
  try {
    integrity = scalar(db, 'PRAGMA integrity_check');
  } catch (error) {
    return { status: 'corrupt', userVersion: 0, reason: `M9 integrity check could not run: ${String(error)}` };
  }
  if (integrity !== 'ok')
    return { status: 'corrupt', userVersion: 0, reason: `M9 integrity check failed: ${String(integrity)}` };

  const userVersion = Number(scalar(db, 'PRAGMA user_version') ?? 0);
  if (userVersion > M9_SCHEMA_VERSION) {
    return {
      status: 'unsupported',
      userVersion,
      reason: `M9 schema version ${userVersion} is newer than supported version ${M9_SCHEMA_VERSION}`,
    };
  }
  if (!tableExists(db, 'm9_activity_events')) {
    return { status: 'migration-required', userVersion, reason: 'M9 activity table is absent' };
  }

  const missingColumns = requiredColumnsPresent(db);
  if (missingColumns.length > 0) {
    return {
      status: 'incompatible',
      userVersion,
      reason: `M9 schema is missing columns: ${missingColumns.join(', ')}`,
    };
  }

  const duplicateSequence = db
    .prepare('SELECT sequence_number FROM m9_activity_events GROUP BY sequence_number HAVING COUNT(*) > 1 LIMIT 1')
    .get() as Row | undefined;
  if (duplicateSequence !== undefined) {
    return {
      status: 'incompatible',
      userVersion,
      reason: `M9 schema has duplicate sequence ${String(duplicateSequence.sequence_number)}`,
    };
  }

  if (userVersion === 0 || !tableExists(db, 'm9_sequence_allocator') || !indexExists(db, 'idx_m9_sequence_unique')) {
    return {
      status: 'migration-required',
      userVersion,
      reason: 'M9 schema requires the explicit native migration gate',
    };
  }
  // Ownership boundary: RuntimeInteraction command-state objects
  // (`runtime_question_interactions`, its indexes, its version) are a
  // separate authority sharing this physical file. Their absence, corruption,
  // or version mismatch must never make an otherwise valid M9 store fail to
  // open. See runtime-interaction-schema.ts.
  if (userVersion < M9_SCHEMA_VERSION) {
    return {
      status: 'migration-required',
      userVersion,
      reason: `M9 schema version ${userVersion} requires forward migration to version ${M9_SCHEMA_VERSION}`,
    };
  }
  if (userVersion !== M9_SCHEMA_VERSION) {
    return { status: 'incompatible', userVersion, reason: `M9 schema version ${userVersion} is not supported` };
  }

  const allocator = db.prepare('SELECT next_sequence FROM m9_sequence_allocator WHERE allocator_id = 1').get() as
    | Row
    | undefined;
  const maxSequence = Number(scalar(db, 'SELECT COALESCE(MAX(sequence_number), 0) FROM m9_activity_events') ?? 0);
  if (allocator === undefined || Number(allocator.next_sequence) <= maxSequence) {
    return {
      status: 'incompatible',
      userVersion,
      reason: 'M9 sequence allocator is missing or behind persisted history',
    };
  }
  return { status: 'current', userVersion, reason: 'M9 native schema is current and compatible' };
}

export function preflightM9Schema(db: DatabaseSync): void {
  if (!tableExists(db, 'm9_activity_events')) return;

  const missing = requiredColumnsPresent(db);
  if (missing.length > 0) throw new M9SchemaError(`M9 schema is missing columns: ${missing.join(', ')}`);

  const duplicateSequence = db
    .prepare('SELECT sequence_number FROM m9_activity_events GROUP BY sequence_number HAVING COUNT(*) > 1 LIMIT 1')
    .get() as Row | undefined;
  if (duplicateSequence !== undefined) {
    throw new M9SchemaError(`M9 schema has duplicate sequence ${String(duplicateSequence.sequence_number)}`);
  }

  const integrity = scalar(db, 'PRAGMA integrity_check');
  if (integrity !== 'ok') throw new M9SchemaError(`M9 integrity check failed: ${String(integrity)}`);
}

export function migrateM9Schema(db: DatabaseSync): void {
  const inspection = inspectM9Schema(db);
  if (inspection.status === 'unsupported' || inspection.status === 'incompatible' || inspection.status === 'corrupt') {
    throw new M9SchemaCompatibilityError(inspection.status, inspection.reason);
  }
  preflightM9Schema(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS m9_activity_events (
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
      CREATE INDEX IF NOT EXISTS idx_m9_sequence ON m9_activity_events(sequence_number);
      CREATE INDEX IF NOT EXISTS idx_m9_event_id ON m9_activity_events(event_id);
      CREATE INDEX IF NOT EXISTS idx_m9_workflow_run ON m9_activity_events(workflow_run_id);
      CREATE INDEX IF NOT EXISTS idx_m9_execution ON m9_activity_events(execution_id);
      CREATE INDEX IF NOT EXISTS idx_m9_task ON m9_activity_events(task_id);
      CREATE INDEX IF NOT EXISTS idx_m9_type ON m9_activity_events(type);
      CREATE INDEX IF NOT EXISTS idx_m9_timestamp ON m9_activity_events(timestamp);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_m9_sequence_unique ON m9_activity_events(sequence_number);
      CREATE TABLE IF NOT EXISTS m9_sequence_allocator (
        allocator_id INTEGER PRIMARY KEY CHECK (allocator_id = 1),
        next_sequence INTEGER NOT NULL
      );
    `);
    // Ownership boundary: M9 migration creates, versions, repairs, and
    // validates M9 objects only. RuntimeInteraction objects are migrated by
    // migrateRuntimeInteractionSchema() (runtime-interaction-schema.ts).

    const maxSequence = Number(scalar(db, 'SELECT COALESCE(MAX(sequence_number), 0) FROM m9_activity_events') ?? 0);
    const allocator = db.prepare('SELECT next_sequence FROM m9_sequence_allocator WHERE allocator_id = 1').get() as
      | Row
      | undefined;
    if (allocator === undefined) {
      db.prepare('INSERT INTO m9_sequence_allocator (allocator_id, next_sequence) VALUES (1, ?)').run(maxSequence + 1);
    } else if (Number(allocator.next_sequence) <= maxSequence) {
      db.prepare('UPDATE m9_sequence_allocator SET next_sequence = ? WHERE allocator_id = 1').run(maxSequence + 1);
    }

    db.exec(`PRAGMA user_version = ${M9_SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the migration error.
    }
    throw error;
  }
}
