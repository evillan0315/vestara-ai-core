import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openConversationDatabase, sqljsCompat } from '../src/native-sqlite';

/**
 * The sql.js compatibility adapter is the only bridge between the shared
 * migration engine and native SQLite. These lock the two ways the engine calls
 * `exec`: multi-statement baseline DDL from migration steps, and single
 * row-returning queries from the engine itself.
 */
describe('native sqlite access', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'conversation-native-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs the multi-statement baseline DDL that migration steps pass to exec', () => {
    const db = openConversationDatabase(join(dir, 'multi.db'));
    const compat = sqljsCompat(db);

    // Shaped like CONVERSATION_BASELINE_DDL: several statements in one call.
    compat.exec('CREATE TABLE alpha (a TEXT);\nCREATE TABLE beta (b TEXT);\nCREATE INDEX idx_beta ON beta (b);');

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => String((row as Record<string, unknown>).name));
    expect(tables).toEqual(['alpha', 'beta']);
    db.close();
  });

  it('returns engine queries as { values } rows in column order', () => {
    const db = openConversationDatabase();
    const compat = sqljsCompat(db);
    compat.exec('CREATE TABLE things (id TEXT, label TEXT)');

    // PRAGMA table_info rows are read positionally by the engine (row[1] = name).
    const info = compat.exec('PRAGMA table_info(things)');
    expect(info[0]?.values.map((row) => row[1])).toEqual(['id', 'label']);

    // PRAGMA user_version and the sqlite_master count are read as [0][0].
    expect(compat.exec('PRAGMA user_version')[0]?.values[0]?.[0]).toBe(0);
    expect(
      compat.exec("SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0]
        ?.values[0]?.[0],
    ).toBe(1);

    // Statements that return nothing degrade to no rows rather than throwing.
    expect(compat.exec('ALTER TABLE things ADD COLUMN extra TEXT')).toEqual([]);
    db.close();
  });

  it('binds normalized parameters for writes the engine issues', () => {
    const db = openConversationDatabase();
    const compat = sqljsCompat(db);
    compat.exec('CREATE TABLE bound (a TEXT, b INTEGER)');
    compat.run('INSERT INTO bound (a, b) VALUES (?, ?)', [undefined, true]);

    const row = db.prepare('SELECT a, b FROM bound').get() as Record<string, unknown>;
    expect(row.a).toBeNull();
    expect(row.b).toBe(1);
    db.close();
  });

  it('opens file databases in WAL mode so writes stop rewriting the whole file', () => {
    const db = openConversationDatabase(join(dir, 'wal.db'));
    const mode = db.prepare('PRAGMA journal_mode').get() as Record<string, unknown>;
    expect(String(mode.journal_mode)).toBe('wal');
    db.close();
  });
});
