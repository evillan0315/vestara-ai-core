import type { DatabaseSync } from 'node:sqlite';

/**
 * AR-TOOL-ASK-003A — RuntimeInteraction schema authority.
 *
 * This module owns the `runtime_question_interactions` command-state schema:
 * inspection, explicit migration, and per-domain versioning. It never reads,
 * writes, validates, repairs, or versions M9 evidence objects, and M9 schema
 * code never reads, writes, validates, or versions these objects.
 *
 * Version mechanism: a bounded per-domain metadata table
 * (`runtime_interaction_schema_meta`, single row `schema_version`). The
 * database-wide `PRAGMA user_version` is M9's version authority and is never
 * read or written here — stuffing two domains' versions into one integer
 * would re-couple the authorities this split exists to separate.
 */

export const RUNTIME_INTERACTION_SCHEMA_VERSION = 1;

export type RuntimeInteractionSchemaStatus = 'current' | 'migration-required' | 'incompatible' | 'corrupt';

export interface RuntimeInteractionSchemaInspection {
  readonly status: RuntimeInteractionSchemaStatus;
  readonly reason: string;
}

export class RuntimeInteractionSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeInteractionSchemaError';
  }
}

export class RuntimeInteractionSchemaCompatibilityError extends Error {
  readonly status: Exclude<RuntimeInteractionSchemaStatus, 'current'>;

  constructor(status: Exclude<RuntimeInteractionSchemaStatus, 'current'>, message: string) {
    super(message);
    this.name = 'RuntimeInteractionSchemaCompatibilityError';
    this.status = status;
  }
}

type Row = Record<string, unknown>;

function scalar(db: DatabaseSync, sql: string, ...params: unknown[]): unknown {
  const row = db.prepare(sql).get(...(params as never[])) as Row | undefined;
  return row === undefined ? undefined : Object.values(row)[0];
}

function tableExists(db: DatabaseSync, table: string): boolean {
  return scalar(db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", table) !== undefined;
}

function indexExists(db: DatabaseSync, index: string): boolean {
  return scalar(db, "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1", index) !== undefined;
}

function tableColumns(db: DatabaseSync, table: string): readonly string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => String((row as Row).name));
}

/**
 * Durable runtime question interaction table. Separate authority from the M9
 * evidence/projection log: M9 stays append-only evidence, this table owns the
 * pending → presented → claimed lifecycle with CAS semantics.
 * UNIQUE (openCodeSessionId, openCodeRequestId) enforces one interaction per
 * runtime ask. Moved verbatim from the M9 schema module: M9 migration must
 * not create, version, repair, or validate these objects.
 */
export const RUNTIME_QUESTION_INTERACTIONS_DDL = `
  CREATE TABLE IF NOT EXISTS runtime_question_interactions (
    interaction_id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    opencode_session_id TEXT NOT NULL,
    opencode_request_id TEXT NOT NULL,
    execution_id TEXT,
    turn_id TEXT,
    provider_id TEXT,
    model_id TEXT,
    questions_json TEXT NOT NULL,
    status TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    claim_token TEXT,
    expires_at TEXT NOT NULL,
    presented_at TEXT,
    claimed_at TEXT,
    answers_json TEXT,
    decided_by TEXT,
    decided_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (opencode_session_id, opencode_request_id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_runtime_question_session_request
    ON runtime_question_interactions(opencode_session_id, opencode_request_id);
  CREATE INDEX IF NOT EXISTS idx_runtime_question_conversation
    ON runtime_question_interactions(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_runtime_question_status
    ON runtime_question_interactions(status);
  CREATE INDEX IF NOT EXISTS idx_runtime_question_expires
    ON runtime_question_interactions(expires_at);
`;

const SCHEMA_META_DDL = `
  CREATE TABLE IF NOT EXISTS runtime_interaction_schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const REQUIRED_COLUMNS = [
  'interaction_id',
  'conversation_id',
  'opencode_session_id',
  'opencode_request_id',
  'questions_json',
  'status',
  'version',
  'expires_at',
  'created_at',
  'updated_at',
] as const;

function schemaVersion(db: DatabaseSync): string | undefined {
  if (!tableExists(db, 'runtime_interaction_schema_meta')) return undefined;
  const value = scalar(db, 'SELECT value FROM runtime_interaction_schema_meta WHERE key = ?', 'schema_version');
  return value === undefined || value === null ? undefined : String(value);
}

/** Classify the RuntimeInteraction schema without changing rows, schema, or journal mode. */
export function inspectRuntimeInteractionSchema(db: DatabaseSync): RuntimeInteractionSchemaInspection {
  if (!tableExists(db, 'runtime_question_interactions')) {
    return { status: 'migration-required', reason: 'Runtime question interaction table is absent' };
  }

  const columns = new Set(tableColumns(db, 'runtime_question_interactions'));
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.has(column));
  if (missing.length > 0) {
    return {
      status: 'incompatible',
      reason: `Runtime question interaction table is missing columns: ${missing.join(', ')}`,
    };
  }
  if (!indexExists(db, 'idx_runtime_question_session_request')) {
    return {
      status: 'incompatible',
      reason: 'Runtime question session/request uniqueness index is absent; refusing to repair implicitly',
    };
  }

  const version = schemaVersion(db);
  if (version === undefined) {
    return {
      status: 'migration-required',
      reason: 'RuntimeInteraction schema version is unstamped (adoptable by explicit migration)',
    };
  }
  const parsed = Number(version);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return {
      status: 'migration-required',
      reason: `RuntimeInteraction schema version ${version} requires forward migration`,
    };
  }
  if (parsed > RUNTIME_INTERACTION_SCHEMA_VERSION) {
    return {
      status: 'incompatible',
      reason: `RuntimeInteraction schema version ${version} is newer than supported version ${RUNTIME_INTERACTION_SCHEMA_VERSION}`,
    };
  }
  return { status: 'current', reason: 'RuntimeInteraction schema is current and compatible' };
}

/**
 * Explicit migration authority for the RuntimeInteraction domain. Creates and
 * versions ONLY RuntimeInteraction objects (`runtime_question_interactions`,
 * its indexes, `runtime_interaction_schema_meta`). Never touches M9 tables,
 * indexes, allocator state, or `PRAGMA user_version`. Idempotent: safe to run
 * on fresh databases, interaction-absent v1 databases, and already-current
 * databases. Refuses (fail closed) on incompatible shapes instead of
 * repairing them.
 */
export function migrateRuntimeInteractionSchema(db: DatabaseSync): void {
  const inspection = inspectRuntimeInteractionSchema(db);
  if (inspection.status === 'incompatible' || inspection.status === 'corrupt') {
    throw new RuntimeInteractionSchemaCompatibilityError(inspection.status, inspection.reason);
  }
  if (inspection.status === 'current') return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(RUNTIME_QUESTION_INTERACTIONS_DDL);
    db.exec(SCHEMA_META_DDL);
    db.prepare('INSERT OR REPLACE INTO runtime_interaction_schema_meta (key, value) VALUES (?, ?)').run(
      'schema_version',
      String(RUNTIME_INTERACTION_SCHEMA_VERSION),
    );
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
