import type { Database } from 'sql.js';

/** Read `PRAGMA user_version` as a number. */
export function userVersion(db: Database): number {
  const rows = db.exec('PRAGMA user_version');
  const raw = rows[0]?.values?.[0]?.[0];
  const value = typeof raw === 'number' ? raw : Number(raw ?? 0);
  return Number.isFinite(value) ? Math.floor(value) : 0;
}

export function setUserVersion(db: Database, version: number): void {
  db.run(`PRAGMA user_version = ${Math.floor(version)}`);
}

/** Column names of a table (empty when the table does not exist). */
export function tableColumns(db: Database, table: string): readonly string[] {
  const rows = db.exec(`PRAGMA table_info(${table})`);
  return (rows[0]?.values ?? []).map((row) => String(row[1]));
}

export function tableExists(db: Database, table: string): boolean {
  return tableColumns(db, table).length > 0;
}

/** True when the database has no user tables at all (pristine). */
export function dbEmpty(db: Database): boolean {
  const rows = db.exec(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`);
  return Number(rows[0]?.values?.[0]?.[0] ?? 0) === 0;
}

export function begin(db: Database): void {
  db.run('BEGIN');
}

export function commit(db: Database): void {
  db.run('COMMIT');
}

export function rollback(db: Database): void {
  db.run('ROLLBACK');
}
