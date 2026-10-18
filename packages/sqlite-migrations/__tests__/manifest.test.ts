import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildManifest,
  contiguousSatisfiedVersion,
  deriveLegacyDetector,
  fingerprint,
  stepSatisfied,
} from '../src/manifest';
import { MigrationRegistrationError } from '../src/types';
import { initSql, makeStep, newDb } from './helpers';

beforeAll(async () => {
  await initSql();
});

function agentSteps() {
  return [
    makeStep('agents.table', [fingerprint('agents', ['id', 'name'])], (db) =>
      db.run('CREATE TABLE agents (id INTEGER, name TEXT)'),
    ),
    makeStep('tasks.table', [fingerprint('tasks', ['id'])], (db) => db.run('CREATE TABLE tasks (id INTEGER)')),
  ];
}

describe('buildManifest', () => {
  it('assigns versions by declared order and derives a legacy detector', () => {
    const manifest = buildManifest('agents.sql', [agentSteps()]);

    expect(manifest.file).toBe('agents.sql');
    expect(manifest.steps.map((step) => step.name)).toEqual(['agents.table', 'tasks.table']);
    expect(typeof manifest.detectLegacyVersion).toBe('function');
  });

  it('flattens multiple composition groups in order', () => {
    const [agents, tasks] = agentSteps();
    const manifest = buildManifest('agents.sql', [[agents], [tasks]]);
    expect(manifest.steps.map((step) => step.name)).toEqual(['agents.table', 'tasks.table']);
  });

  it('rejects duplicate step names', () => {
    const [agents] = agentSteps();
    expect(() => buildManifest('agents.sql', [[agents, agents]])).toThrow(MigrationRegistrationError);
  });

  it('rejects a step with no declared postcondition', () => {
    expect(() => buildManifest('agents.sql', [[makeStep('empty', [])]])).toThrow(MigrationRegistrationError);
  });

  it('rejects a manifest with no steps', () => {
    expect(() => buildManifest('agents.sql', [])).toThrow(MigrationRegistrationError);
  });
});

describe('stepSatisfied', () => {
  it('requires every declared column to exist', () => {
    const db = newDb();
    db.run('CREATE TABLE agents (id INTEGER)');
    const [agents] = agentSteps();

    expect(stepSatisfied(db, agents)).toBe(false);
    db.run('ALTER TABLE agents ADD COLUMN name TEXT');
    expect(stepSatisfied(db, agents)).toBe(true);
  });
});

describe('contiguousSatisfiedVersion', () => {
  it('reports the highest contiguous satisfied version', () => {
    const db = newDb();
    const steps = agentSteps();

    expect(contiguousSatisfiedVersion(db, steps)).toBe(0);
    db.run('CREATE TABLE agents (id INTEGER, name TEXT)');
    expect(contiguousSatisfiedVersion(db, steps)).toBe(1);
    db.run('CREATE TABLE tasks (id INTEGER)');
    expect(contiguousSatisfiedVersion(db, steps)).toBe(2);
  });
});

describe('deriveLegacyDetector', () => {
  it('adopts the highest contiguous satisfied version', () => {
    const db = newDb();
    db.run('CREATE TABLE agents (id INTEGER, name TEXT)');
    expect(deriveLegacyDetector(agentSteps())(db)).toBe(1);
  });

  it('recognizes a fully satisfied schema at the top version', () => {
    const db = newDb();
    db.run('CREATE TABLE agents (id INTEGER, name TEXT)');
    db.run('CREATE TABLE tasks (id INTEGER)');
    expect(deriveLegacyDetector(agentSteps())(db)).toBe(2);
  });

  it('returns null when a baseline table is missing', () => {
    const db = newDb();
    db.run('CREATE TABLE unrelated (id INTEGER)');
    expect(deriveLegacyDetector(agentSteps())(db)).toBeNull();
  });

  it('returns null when a present table has an unexpected column', () => {
    const db = newDb();
    db.run('CREATE TABLE agents (id INTEGER, name TEXT, extra TEXT)');
    expect(deriveLegacyDetector(agentSteps())(db)).toBeNull();
  });

  it('returns null when the baseline is incomplete', () => {
    const db = newDb();
    db.run('CREATE TABLE agents (id INTEGER)');
    expect(deriveLegacyDetector(agentSteps())(db)).toBeNull();
  });
});
