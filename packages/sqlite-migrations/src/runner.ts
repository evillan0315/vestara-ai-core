import type { Database } from 'sql.js';
import { stepChecksum } from './checksum';
import { begin, commit, dbEmpty, rollback, setUserVersion, tableColumns, tableExists, userVersion } from './db';
import type { MigrateOptions, MigrationContext, MigrationManifest, MigrationResult, MigrationStep } from './types';
import {
  DatabaseVersionIncompatibleError,
  MigrationChecksumMismatchError,
  SchemaMetadataInconsistentError,
  UnknownLegacySchemaError,
} from './types';

const LOG_TABLE = '_vestara_migrations';

export function currentVersion(db: Database): number {
  return userVersion(db);
}

/**
 * Run the migration chain for a manifest. Fail-closed on unknown schema, newer
 * DB, or checksum/metadata inconsistency. Persists once, after all commits, when
 * anything changed.
 */
export function migrate(db: Database, manifest: MigrationManifest, options: MigrateOptions = {}): MigrationResult {
  const recordApplied = options.recordApplied ?? true;
  const maxVersion = manifest.steps.length;
  const current = userVersion(db);

  if (current > maxVersion) {
    throw new DatabaseVersionIncompatibleError(current, maxVersion);
  }
  if (recordApplied) verifyAppliedLog(db, manifest);

  const ctx: MigrationContext = {
    addColumnIfMissing(db: Database, table: string, column: string, definition: string): void {
      if (tableColumns(db, table).includes(column)) return;
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    },
  };

  let startApplyAt = current;
  let adopted: number | undefined;
  let changed = false;

  if (current === 0) {
    if (dbEmpty(db)) {
      startApplyAt = 0; // pristine → apply from v1
    } else {
      const detector = manifest.detectLegacyVersion;
      if (!detector) throw new UnknownLegacySchemaError(`No legacy detector for manifest "${manifest.file}"`);
      const detected = detector(db);
      if (detected === null || detected < 1) {
        throw new UnknownLegacySchemaError(`Unrecognized legacy schema in "${manifest.file}"; refusing to guess`);
      }
      adopted = detected;
      begin(db);
      try {
        setUserVersion(db, adopted);
        if (recordApplied) recordAppliedStep(db, adopted, manifest.steps[adopted - 1]);
        commit(db);
      } catch (error) {
        rollback(db);
        throw error;
      }
      changed = true;
      startApplyAt = adopted;
    }
  }

  const applied: string[] = [];
  for (let version = startApplyAt + 1; version <= maxVersion; version += 1) {
    const step = manifest.steps[version - 1];
    begin(db);
    try {
      step.up(db, ctx);
      setUserVersion(db, version);
      if (recordApplied) recordAppliedStep(db, version, step);
      commit(db);
      applied.push(step.name);
      changed = true;
    } catch (error) {
      rollback(db);
      throw error;
    }
  }

  if (recordApplied) verifyAppliedLog(db, manifest);
  if (changed && options.persist) options.persist(db);

  return {
    from: current,
    to: userVersion(db),
    ...(adopted !== undefined ? { adopted } : {}),
    applied,
  };
}

function verifyAppliedLog(db: Database, manifest: MigrationManifest): void {
  if (!tableExists(db, LOG_TABLE)) return;
  const rows = readAppliedLog(db);
  if (rows.length === 0) return;
  const maxLogged = Math.max(...rows.map((row) => row.version));
  if (maxLogged !== userVersion(db)) {
    throw new SchemaMetadataInconsistentError(
      `_vestara_migrations max version (${maxLogged}) does not match PRAGMA user_version (${userVersion(db)})`,
    );
  }
  for (const row of rows) {
    const step = manifest.steps[row.version - 1];
    if (step === undefined || step.name !== row.name) {
      throw new SchemaMetadataInconsistentError(
        `Applied migration v${row.version} ("${row.name}") has no matching step`,
      );
    }
    if (stepChecksum(step) !== row.checksum) {
      throw new MigrationChecksumMismatchError(row.version, row.name);
    }
  }
}

function ensureLogTable(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT, checksum TEXT)`,
  );
}

function recordAppliedStep(db: Database, version: number, step: MigrationStep): void {
  ensureLogTable(db);
  db.run(`INSERT OR REPLACE INTO ${LOG_TABLE} (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)`, [
    version,
    step.name,
    new Date().toISOString(),
    stepChecksum(step),
  ]);
}

function readAppliedLog(
  db: Database,
): readonly { readonly version: number; readonly name: string; readonly checksum: string }[] {
  const rows = db.exec(`SELECT version, name, checksum FROM ${LOG_TABLE} ORDER BY version`);
  return (rows[0]?.values ?? []).map((row) => ({
    version: Number(row[0]),
    name: String(row[1]),
    checksum: String(row[2]),
  }));
}
