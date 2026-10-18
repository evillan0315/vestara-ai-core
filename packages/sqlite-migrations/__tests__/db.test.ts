import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { begin, commit, dbEmpty, rollback, setUserVersion, tableColumns, tableExists, userVersion } from '../src/db';
import { initSql, newDb } from './helpers';

beforeAll(async () => {
  await initSql();
});

function count(db: Database, table: string): number {
  return Number(db.exec(`SELECT count(*) FROM ${table}`)[0]?.values?.[0]?.[0] ?? 0);
}

describe('user_version', () => {
  it('defaults to 0 and is settable', () => {
    const db = newDb();
    expect(userVersion(db)).toBe(0);
    setUserVersion(db, 3);
    expect(userVersion(db)).toBe(3);
  });

  it('floors fractional values', () => {
    const db = newDb();
    setUserVersion(db, 2.9);
    expect(userVersion(db)).toBe(2);
  });
});

describe('table introspection', () => {
  it('lists columns and detects existence', () => {
    const db = newDb();

    expect(tableColumns(db, 'widgets')).toEqual([]);
    expect(tableExists(db, 'widgets')).toBe(false);

    db.run('CREATE TABLE widgets (id INTEGER, label TEXT)');
    expect(tableColumns(db, 'widgets')).toEqual(['id', 'label']);
    expect(tableExists(db, 'widgets')).toBe(true);
  });
});

describe('dbEmpty', () => {
  it('is true for a pristine database and false once a user table exists', () => {
    const db = newDb();
    expect(dbEmpty(db)).toBe(true);
    db.run('CREATE TABLE t (id INTEGER)');
    expect(dbEmpty(db)).toBe(false);
  });
});

describe('transactions', () => {
  it('commits changes', () => {
    const db = newDb();
    db.run('CREATE TABLE t (id INTEGER)');

    begin(db);
    db.run('INSERT INTO t (id) VALUES (1)');
    commit(db);

    expect(count(db, 't')).toBe(1);
  });

  it('rolls back changes', () => {
    const db = newDb();
    db.run('CREATE TABLE t (id INTEGER)');

    begin(db);
    db.run('INSERT INTO t (id) VALUES (1)');
    rollback(db);

    expect(count(db, 't')).toBe(0);
  });
});
