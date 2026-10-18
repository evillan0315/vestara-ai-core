import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { setUserVersion, tableColumns, tableExists } from '../src/db';
import { buildManifest } from '../src/manifest';
import { currentVersion, migrate } from '../src/runner';
import {
  DatabaseVersionIncompatibleError,
  MigrationChecksumMismatchError,
  type MigrationManifest,
  type MigrationStep,
  SchemaMetadataInconsistentError,
  UnknownLegacySchemaError,
} from '../src/types';
import { fingerprint, initSql, makeStep, newDb } from './helpers';

beforeAll(async () => {
  await initSql();
});

const LOG_TABLE = '_vestara_migrations';

function createStep(name: string, table: string, columns: readonly string[]): MigrationStep {
  return makeStep(name, [fingerprint(table, columns)], (db) =>
    db.run(`CREATE TABLE ${table} (${columns.map((column) => `${column} INTEGER`).join(', ')})`),
  );
}

function agentManifest(): MigrationManifest {
  return buildManifest('agents.sql', [
    [createStep('agents', 'agents', ['id', 'name']), createStep('tasks', 'tasks', ['id'])],
  ]);
}

function logRows(db: Database): readonly { readonly version: number; readonly name: string }[] {
  const rows = db.exec(`SELECT version, name FROM ${LOG_TABLE} ORDER BY version`);
  return (rows[0]?.values ?? []).map((row) => ({ version: Number(row[0]), name: String(row[1]) }));
}

describe('migrate — forward path', () => {
  it('applies every step to a pristine database and persists once', () => {
    const db = newDb();
    const persisted: Database[] = [];

    const result = migrate(db, agentManifest(), { persist: (database) => persisted.push(database) });

    expect(result).toEqual({ from: 0, to: 2, applied: ['agents', 'tasks'] });
    expect(currentVersion(db)).toBe(2);
    expect(persisted).toHaveLength(1);
    expect(tableColumns(db, 'agents')).toEqual(['id', 'name']);
    expect(tableExists(db, 'tasks')).toBe(true);
    expect(logRows(db)).toEqual([
      { version: 1, name: 'agents' },
      { version: 2, name: 'tasks' },
    ]);
  });

  it('is idempotent — a second run applies nothing and does not persist', () => {
    const db = newDb();
    migrate(db, agentManifest());

    const persisted: Database[] = [];
    const result = migrate(db, agentManifest(), { persist: (database) => persisted.push(database) });

    expect(result).toEqual({ from: 2, to: 2, applied: [] });
    expect(persisted).toHaveLength(0);
  });

  it('adds columns idempotently through the migration context', () => {
    const db = newDb();
    const manifest = buildManifest('cols.sql', [
      [
        makeStep('base', [fingerprint('t', ['id'])], (database) => database.run('CREATE TABLE t (id INTEGER)')),
        makeStep('add-label', [fingerprint('t', ['id', 'label'])], (database, ctx) => {
          ctx.addColumnIfMissing(database, 't', 'label', 'TEXT');
          ctx.addColumnIfMissing(database, 't', 'label', 'TEXT');
        }),
      ],
    ]);

    migrate(db, manifest);

    expect(tableColumns(db, 't')).toEqual(['id', 'label']);
  });

  it('skips the applied log when recordApplied is false', () => {
    const db = newDb();

    const result = migrate(db, agentManifest(), { recordApplied: false });

    expect(result.applied).toEqual(['agents', 'tasks']);
    expect(currentVersion(db)).toBe(2);
    expect(tableExists(db, LOG_TABLE)).toBe(false);
  });
});

describe('migrate — fail-closed guards', () => {
  it('rejects a database newer than the build', () => {
    const db = newDb();
    migrate(db, agentManifest());
    setUserVersion(db, 5);

    expect(() => migrate(db, agentManifest())).toThrow(DatabaseVersionIncompatibleError);
  });

  it('rejects an unrecognized legacy schema', () => {
    const db = newDb();
    db.run('CREATE TABLE mystery (id INTEGER)');

    expect(() => migrate(db, agentManifest())).toThrow(UnknownLegacySchemaError);
  });

  it('rejects a non-empty database when the manifest has no detector', () => {
    const db = newDb();
    db.run('CREATE TABLE mystery (id INTEGER)');
    const manifest: MigrationManifest = { file: 'no-detector.sql', steps: [createStep('agents', 'agents', ['id'])] };

    expect(() => migrate(db, manifest)).toThrow(UnknownLegacySchemaError);
  });

  it('rejects a step that changed after it was applied', () => {
    const db = newDb();
    migrate(db, agentManifest());
    const mutated = buildManifest('agents.sql', [
      [createStep('agents', 'agents', ['id', 'name', 'extra']), createStep('tasks', 'tasks', ['id'])],
    ]);

    expect(() => migrate(db, mutated)).toThrow(MigrationChecksumMismatchError);
  });

  it('rejects a log that disagrees with the pragma version', () => {
    const db = newDb();
    migrate(db, agentManifest());
    setUserVersion(db, 1);

    expect(() => migrate(db, agentManifest())).toThrow(SchemaMetadataInconsistentError);
  });

  it('rejects a log row with no matching step', () => {
    const db = newDb();
    migrate(db, agentManifest());
    db.run(`UPDATE ${LOG_TABLE} SET name = 'ghost' WHERE version = 1`);

    expect(() => migrate(db, agentManifest())).toThrow(SchemaMetadataInconsistentError);
  });
});

describe('migrate — legacy adoption and rollback', () => {
  it('adopts a recognized legacy database then upgrades it', () => {
    const db = newDb();
    db.run('CREATE TABLE agents (id INTEGER, name TEXT)');

    const result = migrate(db, agentManifest());

    expect(result).toEqual({ from: 0, to: 2, adopted: 1, applied: ['tasks'] });
    expect(currentVersion(db)).toBe(2);
    expect(tableExists(db, 'tasks')).toBe(true);
    expect(logRows(db)).toEqual([
      { version: 1, name: 'agents' },
      { version: 2, name: 'tasks' },
    ]);
  });

  it('rolls back a failing step and leaves prior steps committed', () => {
    const db = newDb();
    const failing: MigrationStep = {
      name: 'boom',
      produces: [fingerprint('boom', ['id'])],
      up: (database) => {
        database.run('CREATE TABLE boom (id INTEGER)');
        throw new Error('migration exploded');
      },
    };
    const manifest = buildManifest('boom.sql', [[createStep('ok', 'ok', ['id']), failing]]);

    expect(() => migrate(db, manifest)).toThrow('migration exploded');

    expect(currentVersion(db)).toBe(1);
    expect(tableExists(db, 'ok')).toBe(true);
    expect(tableExists(db, 'boom')).toBe(false);
  });
});
