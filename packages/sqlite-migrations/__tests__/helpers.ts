/**
 * Shared test helpers for @vestara/sqlite-migrations.
 *
 * sql.js loads a WASM build asynchronously, so each suite calls `initSql()`
 * in `beforeAll` before constructing databases via `newDb()`.
 */

import type { Database, SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js';
import type { MigrationContext, MigrationStep, TableFingerprint } from '../src/types';

let loaded: SqlJsStatic | undefined;

export async function initSql(): Promise<void> {
  if (!loaded) loaded = await initSqlJs();
}

export function newDb(): Database {
  if (!loaded) throw new Error('sql.js is not initialised — call initSql() in beforeAll');
  return new loaded.Database();
}

export function fingerprint(table: string, columns: readonly string[]): TableFingerprint {
  return { table, columns };
}

export function makeStep(
  name: string,
  produces: readonly TableFingerprint[],
  up: (db: Database, ctx: MigrationContext) => void = () => {},
): MigrationStep {
  return { name, produces, up };
}
