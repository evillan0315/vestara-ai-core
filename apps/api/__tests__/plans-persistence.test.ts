import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { afterEach, describe, expect, it } from 'vitest';
import { openSqlDb } from '../src/workspace-context';

const tempDirectories: string[] = [];

function makeDbPath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-plans-persistence-'));
  tempDirectories.push(directory);
  return path.join(directory, 'plans.db');
}

async function readRows(dbPath: string): Promise<Array<Record<string, unknown>>> {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const statement = db.prepare('SELECT id, value FROM durable_state ORDER BY id');
  const rows: Array<Record<string, unknown>> = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  db.close();
  return rows;
}

async function readTable(dbPath: string, table: string): Promise<Array<Record<string, unknown>>> {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const statement = db.prepare(`SELECT * FROM ${table} ORDER BY id`);
  const rows: Array<Record<string, unknown>> = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  db.close();
  return rows;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('plans database persistence ownership', () => {
  it('does not replace newer durable state when an API snapshot closes', async () => {
    const dbPath = makeDbPath();
    const apiSnapshot = (await openSqlDb(dbPath)) as any;
    apiSnapshot.run('CREATE TABLE durable_state (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    apiSnapshot.run('INSERT INTO durable_state (id, value) VALUES (?, ?)', ['state', 'A']);

    const SQL = await initSqlJs();
    const externalWriter = new SQL.Database(fs.readFileSync(dbPath));
    externalWriter.run('UPDATE durable_state SET value = ? WHERE id = ?', ['B', 'state']);
    fs.writeFileSync(dbPath, Buffer.from(externalWriter.export()));
    externalWriter.close();

    // The corrected API lifecycle does not export its stale in-memory snapshot
    // during shutdown. A subsequent process therefore reads durable state B.
    apiSnapshot.close();
    await expect(readRows(dbPath)).resolves.toEqual([{ id: 'state', value: 'B' }]);
  });

  it('fails closed instead of overwriting newer state on a later API mutation', async () => {
    const dbPath = makeDbPath();
    const apiSnapshot = (await openSqlDb(dbPath)) as any;
    apiSnapshot.run('CREATE TABLE durable_state (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    apiSnapshot.run('INSERT INTO durable_state (id, value) VALUES (?, ?)', ['state', 'A']);

    const SQL = await initSqlJs();
    const externalWriter = new SQL.Database(fs.readFileSync(dbPath));
    externalWriter.run('UPDATE durable_state SET value = ? WHERE id = ?', ['B', 'state']);
    fs.writeFileSync(dbPath, Buffer.from(externalWriter.export()));
    externalWriter.close();

    expect(() => apiSnapshot.run('UPDATE durable_state SET value = ? WHERE id = ?', ['C', 'state'])).toThrow(
      'changed outside the API writer',
    );
    await expect(readRows(dbPath)).resolves.toEqual([{ id: 'state', value: 'B' }]);
    apiSnapshot.close();
  });

  it('persists API-owned db.run and prepared-statement mutations before close', async () => {
    const dbPath = makeDbPath();
    const apiDb = (await openSqlDb(dbPath)) as any;
    apiDb.run('CREATE TABLE durable_state (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    const statement = apiDb.prepare('INSERT INTO durable_state (id, value) VALUES (?, ?)');
    statement.run(['state', 'api-owned']);
    statement.free();
    apiDb.close();

    await expect(readRows(dbPath)).resolves.toEqual([{ id: 'state', value: 'api-owned' }]);
  });

  it('preserves representative shared plans and human identity state', async () => {
    const dbPath = makeDbPath();
    const apiDb = (await openSqlDb(dbPath)) as any;
    apiDb.run('CREATE TABLE plans (id TEXT PRIMARY KEY, title TEXT NOT NULL)');
    apiDb.run(
      'CREATE TABLE human_principals (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)',
    );
    apiDb.run('INSERT INTO human_principals (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      'hp-test',
      'active',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);
    const statement = apiDb.prepare('INSERT INTO plans (id, title) VALUES (?, ?)');
    statement.run(['plan-test', 'Durable plan']);
    statement.free();
    apiDb.close();

    await expect(readTable(dbPath, 'plans')).resolves.toEqual([{ id: 'plan-test', title: 'Durable plan' }]);
    await expect(readTable(dbPath, 'human_principals')).resolves.toEqual([
      {
        id: 'hp-test',
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });
});
