import {
  buildManifest,
  DatabaseVersionIncompatibleError,
  fingerprint,
  MigrationChecksumMismatchError,
  type MigrationManifest,
  type MigrationStep,
  migrate,
  SchemaMetadataInconsistentError,
  stepChecksum,
  UnknownLegacySchemaError,
} from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

function freshDb(): Database {
  return new SQL.Database();
}

function manifest(steps: readonly MigrationStep[] = TEST_STEPS, file = 'test'): MigrationManifest {
  return buildManifest(file, [steps]);
}

const TEST_STEPS: readonly MigrationStep[] = [
  {
    name: 'items.baseline',
    produces: [fingerprint('items', ['id', 'name'])],
    up: (db) => db.exec('CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)'),
  },
  {
    name: 'items.tags',
    produces: [fingerprint('items', ['tags'])],
    up: (db, ctx) => ctx.addColumnIfMissing(db, 'items', 'tags', "TEXT DEFAULT '[]'"),
  },
  {
    name: 'items.owner',
    produces: [fingerprint('items', ['owner'])],
    up: (db, ctx) => ctx.addColumnIfMissing(db, 'items', 'owner', "TEXT DEFAULT ''"),
  },
];

function uv(db: Database): number {
  return Number(db.exec('PRAGMA user_version')[0]?.values?.[0]?.[0] ?? 0);
}

function columns(db: Database, table: string): string[] {
  return (db.exec(`PRAGMA table_info(${table})`)[0]?.values ?? []).map((row) => String(row[1]));
}

function logRows(db: Database): Array<{ version: number; name: string }> {
  const rows = db.exec('SELECT version, name FROM _vestara_migrations ORDER BY version');
  return (rows[0]?.values ?? []).map((row) => ({ version: Number(row[0]), name: String(row[1]) }));
}

describe('@vestara/sqlite-migrations', () => {
  it('migrates a pristine DB 0 → v1 → v2 → v3', () => {
    const db = freshDb();
    const result = migrate(db, manifest());
    expect(result).toMatchObject({ from: 0, to: 3 });
    expect(result.applied).toEqual(['items.baseline', 'items.tags', 'items.owner']);
    expect(uv(db)).toBe(3);
    expect(columns(db, 'items')).toEqual(['id', 'name', 'tags', 'owner']);
    expect(logRows(db).map((r) => r.version)).toEqual([1, 2, 3]);
  });

  it('adopts a synthetic historical v1 DB and upgrades it, preserving rows', () => {
    const db = freshDb();
    db.exec('CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)');
    db.run('INSERT INTO items (id, name) VALUES (?, ?)', ['a', 'alpha']);
    db.run('INSERT INTO items (id, name) VALUES (?, ?)', ['b', 'beta']);

    const result = migrate(db, manifest());
    expect(result.adopted).toBe(1);
    expect(result.applied).toEqual(['items.tags', 'items.owner']);
    expect(uv(db)).toBe(3);
    expect(columns(db, 'items')).toEqual(['id', 'name', 'tags', 'owner']);

    const rows = db.exec('SELECT id, name FROM items ORDER BY id')[0]?.values ?? [];
    expect(rows).toEqual([
      ['a', 'alpha'],
      ['b', 'beta'],
    ]);
  });

  it('converges a partially-migrated legacy state (v3 column present, v2 absent)', () => {
    const db = freshDb();
    db.exec('CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT)');
    db.exec("ALTER TABLE items ADD COLUMN owner TEXT DEFAULT ''"); // v3 column, v2 missing
    db.run('INSERT INTO items (id, name) VALUES (?, ?)', ['x', 'ex']);

    const result = migrate(db, manifest());
    expect(result.adopted).toBe(1);
    expect(result.applied).toEqual(['items.tags', 'items.owner']);
    expect(uv(db)).toBe(3);
    expect([...columns(db, 'items')].sort()).toEqual(['id', 'name', 'owner', 'tags']);
    // Historical row preserved.
    expect(db.exec('SELECT name FROM items WHERE id = ?', ['x'])[0]?.values?.[0]?.[0]).toBe('ex');
  });

  it('is idempotent: a second migrate is a no-op', () => {
    const db = freshDb();
    migrate(db, manifest());
    const second = migrate(db, manifest());
    expect(second).toMatchObject({ from: 3, to: 3 });
    expect(second.applied).toEqual([]);
    expect(logRows(db)).toHaveLength(3);
  });

  it('keeps metadata consistent: MAX(log.version) == user_version', () => {
    const db = freshDb();
    migrate(db, manifest());
    expect(Math.max(...logRows(db).map((r) => r.version))).toBe(uv(db));
  });

  it('rolls back a failed migration without advancing the version', () => {
    const db = freshDb();
    const failing = manifest([
      ...TEST_STEPS,
      {
        name: 'items.broken',
        produces: [fingerprint('items', ['broken'])],
        up: (db, ctx) => {
          ctx.addColumnIfMissing(db, 'items', 'broken', 'TEXT');
          throw new Error('boom');
        },
      },
    ]);
    expect(() => migrate(db, failing)).toThrow('boom');
    expect(uv(db)).toBe(3); // v1..v3 committed; v4 rolled back
    expect(columns(db, 'items')).not.toContain('broken');
    expect(logRows(db).map((r) => r.version)).toEqual([1, 2, 3]);
  });

  it('fails closed when the DB is newer than the binary, without mutation', () => {
    const db = freshDb();
    db.run('PRAGMA user_version = 5');
    expect(() => migrate(db, manifest())).toThrow(DatabaseVersionIncompatibleError);
    expect(uv(db)).toBe(5);
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values ?? [];
    expect(tables.some((r) => r[0] === 'items')).toBe(false); // nothing created
    expect(tables.some((r) => r[0] === '_vestara_migrations')).toBe(false);
  });

  it('fails without mutation on an unknown legacy schema (unexpected column)', () => {
    const db = freshDb();
    db.exec('CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT, mystery TEXT)');
    expect(() => migrate(db, manifest())).toThrow(UnknownLegacySchemaError);
    expect(uv(db)).toBe(0);
    const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values ?? [];
    expect(tables.some((r) => r[0] === '_vestara_migrations')).toBe(false);
  });

  it('fails without mutation when an expected legacy table is missing', () => {
    const db = freshDb();
    db.exec('CREATE TABLE other (id TEXT PRIMARY KEY)'); // not the expected tables
    expect(() => migrate(db, manifest())).toThrow(UnknownLegacySchemaError);
    expect(uv(db)).toBe(0);
  });

  it('persists explicitly when something changed, and not on a no-op', () => {
    const exports: Uint8Array[] = [];
    const persist = (db: Database) => exports.push(db.export());
    const db = freshDb();
    migrate(db, manifest(), { persist });
    expect(exports).toHaveLength(1);
    migrate(db, manifest(), { persist });
    expect(exports).toHaveLength(1); // no-op → no persist
  });

  it('reopening the exported DB preserves version + schema (restart verification)', () => {
    let bytes: Uint8Array | undefined;
    const db = freshDb();
    migrate(db, manifest(), { persist: (d) => (bytes = d.export()) });

    const reopened = new SQL.Database(bytes);
    expect(uv(reopened)).toBe(3);
    expect(columns(reopened, 'items')).toEqual(['id', 'name', 'tags', 'owner']);
    expect(logRows(reopened)).toHaveLength(3);
  });

  it('rejects a step whose definition changed after it was applied (checksum)', () => {
    const db = freshDb();
    migrate(db, manifest());
    const edited: MigrationStep[] = TEST_STEPS.map((step) =>
      step.name === 'items.tags' ? { ...step, produces: [fingerprint('items', ['tags', 'label'])] } : step,
    );
    expect(() => migrate(db, manifest(edited))).toThrow(MigrationChecksumMismatchError);
  });

  it('detects metadata inconsistency (log max != user_version)', () => {
    const db = freshDb();
    migrate(db, manifest());
    db.run('DELETE FROM _vestara_migrations WHERE version = 3'); // corrupt: log max=2, uv=3
    expect(() => migrate(db, manifest())).toThrow(SchemaMetadataInconsistentError);
  });

  it('computes stable step checksums', () => {
    expect(stepChecksum(TEST_STEPS[0])).toBe(stepChecksum({ ...TEST_STEPS[0] }));
    expect(stepChecksum(TEST_STEPS[0])).toHaveLength(64);
  });
});
