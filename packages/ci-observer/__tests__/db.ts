/**
 * CI-OBS-002B test helper — fresh sql.js database with CI-observer schema.
 *
 * `restart()` simulates a process restart: the database is exported to bytes
 * and reopened from those bytes (same file, new process/handle).
 */

import { migrate } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import initSqlJs from 'sql.js';
import { CI_OBSERVER_MIGRATIONS } from '../src/migrations';

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;

let SQL: SqlJsStatic | undefined;

export async function createDb(): Promise<Database> {
  if (!SQL) SQL = await initSqlJs();
  const db = new SQL.Database();
  migrate(db, CI_OBSERVER_MIGRATIONS, { recordApplied: true });
  return db;
}

/** Close the current handle and reopen the same persisted bytes. */
export async function restart(db: Database): Promise<Database> {
  if (!SQL) SQL = await initSqlJs();
  const bytes = db.export();
  db.close();
  const next = new SQL.Database(bytes);
  migrate(next, CI_OBSERVER_MIGRATIONS, { recordApplied: true });
  return next;
}
