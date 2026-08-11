import type { Database } from 'sql.js';

/** Declared postcondition of a migration step: a table and the columns it must end up with. */
export interface TableFingerprint {
  readonly table: string;
  readonly columns: readonly string[];
}

/** Context provided to a step's `up` for safe, idempotent DDL. */
export interface MigrationContext {
  /** Add a column only if absent (safe against partially-migrated legacy DBs). */
  addColumnIfMissing(db: Database, table: string, column: string, definition: string): void;
}

/**
 * One migration step. Domain packages export steps; they never choose a
 * file-level version — the manifest assigns versions 1..N by order.
 */
export interface MigrationStep {
  /** Stable, unique name (e.g. `agents.agent_type`). */
  readonly name: string;
  /** Declared postcondition — the fingerprint used by legacy detection and checksums. */
  readonly produces: readonly TableFingerprint[];
  readonly up: (db: Database, ctx: MigrationContext) => void;
  readonly down?: (db: Database) => void;
  /** Marks destructive (drop/replace) changes; forward-only. */
  readonly destructive?: boolean;
}

/**
 * The composition-owned, per-file ordered migration manifest. Version numbers
 * are assigned 1..N by `steps` order — the FILE owns chronology.
 */
export interface MigrationManifest {
  readonly file: string;
  readonly steps: readonly MigrationStep[];
  /**
   * Conservative legacy detection: returns the highest contiguous version whose
   * postconditions are satisfied, or `null` when the schema is unknown. Never
   * guesses.
   */
  readonly detectLegacyVersion?: (db: Database) => number | null;
}

export interface MigrateOptions {
  /** Export + write the database file after any successful change. */
  readonly persist?: (db: Database) => void;
  /** Record applied steps in `_vestara_migrations` (default true). */
  readonly recordApplied?: boolean;
}

export interface MigrationResult {
  readonly from: number;
  readonly to: number;
  /** Set when a legacy (unversioned) DB was adopted at this baseline version. */
  readonly adopted?: number;
  /** Step names applied this run (excludes an adopted baseline). */
  readonly applied: readonly string[];
}

export class MigrationRegistrationError extends Error {
  readonly code = 'MIGRATION_REGISTRATION';
  constructor(message: string) {
    super(message);
    this.name = 'MigrationRegistrationError';
  }
}

export class DatabaseVersionIncompatibleError extends Error {
  readonly code = 'DATABASE_VERSION_INCOMPATIBLE';
  constructor(
    readonly dbVersion: number,
    readonly supportedVersion: number,
  ) {
    super(
      `Database schema version ${dbVersion} exceeds this build's supported version ${supportedVersion}; upgrades only, no downgrade.`,
    );
    this.name = 'DatabaseVersionIncompatibleError';
  }
}

export class UnknownLegacySchemaError extends Error {
  readonly code = 'UNKNOWN_LEGACY_SCHEMA';
  constructor(message: string) {
    super(message);
    this.name = 'UnknownLegacySchemaError';
  }
}

export class SchemaMetadataInconsistentError extends Error {
  readonly code = 'SCHEMA_METADATA_INCONSISTENT';
  constructor(message: string) {
    super(message);
    this.name = 'SchemaMetadataInconsistentError';
  }
}

export class MigrationChecksumMismatchError extends Error {
  readonly code = 'MIGRATION_CHECKSUM_MISMATCH';
  constructor(version: number, name: string) {
    super(`Migration step "${name}" (v${version}) changed after it was applied.`);
    this.name = 'MigrationChecksumMismatchError';
  }
}
