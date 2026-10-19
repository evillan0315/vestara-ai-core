import { DatabaseSync } from 'node:sqlite';

/**
 * Native SQLite access for the conversation store.
 *
 * The store previously kept SQLite in memory (sql.js) and rewrote the entire
 * database file on every write statement. Measured on the dogfood instance, one
 * trivial assistant turn performed 15 whole-file rewrites of a 17.3 MB
 * database, each blocking the event loop for ~437 ms (248 MB, ~6.5 s of an
 * 8.5 s turn), and a wedged instance rewrote it every ~1.5 s indefinitely.
 *
 * `node:sqlite` writes pages through the WAL instead, so a mutation costs a few
 * KB rather than the whole database while commits stay durable. The same driver
 * already backs the M9 activity and RuntimeInteraction stores, so this adds no
 * new dependency.
 */

export type SqlParams = readonly unknown[];

/**
 * node:sqlite binds null, number, bigint, string and Uint8Array only; booleans
 * and undefined are rejected. Callers pass `?? null` already, but a single
 * rejected binding would turn a durable write into a failed turn.
 */
function normalizeParams(params?: SqlParams): unknown[] {
  return (params ?? []).map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  });
}

/**
 * Open the database, or an in-memory database when no path is given.
 *
 * WAL avoids the whole-file rewrite and survives crashes without leaving a
 * truncated database; `synchronous = FULL` keeps the previous per-write
 * durability guarantee now that a commit no longer rewrites the whole file.
 */
export function openConversationDatabase(dbPath?: string): DatabaseSync {
  const db = new DatabaseSync(dbPath ?? ':memory:');
  if (dbPath) {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = FULL');
    db.exec('PRAGMA busy_timeout = 5000');
  }
  return db;
}

export function dbRun(db: DatabaseSync, sql: string, params?: SqlParams): void {
  db.prepare(sql).run(...(normalizeParams(params) as never[]));
}

export function dbGet(db: DatabaseSync, sql: string, params?: SqlParams): any {
  return db.prepare(sql).get(...(normalizeParams(params) as never[])) ?? null;
}

export function dbAll(db: DatabaseSync, sql: string, params?: SqlParams): any[] {
  return db.prepare(sql).all(...(normalizeParams(params) as never[]));
}

/** The sql.js surface `@vestara/sqlite-migrations` uses. */
export interface SqljsCompatDatabase {
  exec(sql: string): readonly { readonly values: readonly unknown[][] }[];
  run(sql: string, params?: SqlParams): void;
  close(): void;
}

/**
 * Adapter exposing the sql.js surface the migration engine needs, so the
 * existing engine — checksums, applied-log verification, fail-closed gates —
 * runs unchanged against the native handle instead of being reimplemented.
 *
 * `exec` must serve two different callers:
 * - The engine itself only ever passes single row-returning queries
 *   (`PRAGMA user_version`, `PRAGMA table_info`, the `sqlite_master` count, the
 *   applied-log select) and expects rows.
 * - Migration steps pass baseline DDL constants, which are multi-statement, and
 *   expect them to run.
 *
 * `prepare()` accepts a single statement and throws on the multi-statement DDL
 * (the baseline constants carry up to five statements), so a row-returning
 * single query is detected first and everything else goes to native `exec`,
 * which runs every statement.
 */
const ROW_RETURNING = /^(select|pragma|with|explain)\s/i;

export function sqljsCompat(db: DatabaseSync): SqljsCompatDatabase {
  return {
    exec(sql: string) {
      const singleStatement = !sql.trim().replace(/;\s*$/, '').includes(';');
      if (singleStatement && ROW_RETURNING.test(sql.trim())) {
        const rows = db.prepare(sql).all() as Record<string, unknown>[];
        return [{ values: rows.map((row) => Object.values(row)) }];
      }
      db.exec(sql);
      return [];
    },
    run(sql: string, params?: SqlParams) {
      if (!params || params.length === 0) {
        db.exec(sql);
        return;
      }
      db.prepare(sql).run(...(normalizeParams(params) as never[]));
    },
    close() {
      db.close();
    },
  };
}
