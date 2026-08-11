import * as fs from 'node:fs';
import * as path from 'node:path';
import { type MigrationContext, migrate } from '@vestara/sqlite-migrations';
import { AGENT_MANIFEST, AGENT_MIGRATIONS, AgentStorage } from '@vestara/workspace';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';

const FIXTURE = path.resolve(
  __dirname,
  '../../../apps/workspace/docs/agent-control-testing/fixtures/plans-pre-migration.db',
);

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

const noopCtx: MigrationContext = { addColumnIfMissing: () => undefined };

function uv(db: Database): number {
  return Number(db.exec('PRAGMA user_version')[0]?.values?.[0]?.[0] ?? 0);
}

function agentColumns(db: Database): string[] {
  return (db.exec('PRAGMA table_info(agents)')[0]?.values ?? []).map((row) => String(row[1]));
}

function loadFixture(): Database {
  return new SQL.Database(fs.readFileSync(FIXTURE));
}

function buildSyntheticV1(): Database {
  const db = new SQL.Database();
  AGENT_MIGRATIONS[0].up(db, noopCtx); // exact original baseline DDL
  db.run(
    "INSERT INTO agents (id, name, role, status, created_at) VALUES ('v1-a', 'Alpha', 'developer', 'active', '2026-01-01')",
  );
  db.run(
    "INSERT INTO agents (id, name, role, status, created_at) VALUES ('v1-b', 'Beta', 'reviewer', 'active', '2026-01-02')",
  );
  return db;
}

describe('AgentStorage migration (incident #0001, Phase 1.1a)', () => {
  it('migrates a pristine DB to v3 with the full agents schema', () => {
    const db = new SQL.Database();
    const result = migrate(db, AGENT_MANIFEST);
    expect(result.to).toBe(3);
    expect(result.applied).toEqual(['agents.baseline', 'agents.agent_type', 'agents.runtime_agent']);
    const cols = agentColumns(db);
    expect(cols).toContain('agent_type');
    expect(cols).toContain('runtime_agent');
    expect(uv(db)).toBe(3);
  });

  it('upgrades a synthetic historical v1 DB, preserving rows', () => {
    const db = buildSyntheticV1();
    const result = migrate(db, AGENT_MANIFEST);
    expect(result.adopted).toBe(1);
    expect(result.applied).toEqual(['agents.agent_type', 'agents.runtime_agent']);
    expect(agentColumns(db)).toContain('agent_type');
    expect(agentColumns(db)).toContain('runtime_agent');
    const rows = db.exec('SELECT id, name FROM agents ORDER BY id')[0]?.values ?? [];
    expect(rows).toEqual([
      ['v1-a', 'Alpha'],
      ['v1-b', 'Beta'],
    ]);
  });

  it('migrates the real pre-migration fixture (runtime_agent present, agent_type absent) and preserves all rows', () => {
    const db = loadFixture();
    const before = db.exec('SELECT COUNT(*) FROM agents')[0]?.values?.[0]?.[0];
    expect(before).toBe(18);
    expect(agentColumns(db)).not.toContain('agent_type');
    expect(agentColumns(db)).toContain('runtime_agent');

    const result = migrate(db, AGENT_MANIFEST);
    expect(result.adopted).toBe(1);
    expect(result.to).toBe(3);
    expect(agentColumns(db)).toContain('agent_type');

    const after = db.exec('SELECT COUNT(*) FROM agents')[0]?.values?.[0]?.[0];
    expect(after).toBe(18);
    const first = db.exec('SELECT id, name, status FROM agents ORDER BY id LIMIT 1')[0]?.values?.[0];
    expect(first).toBeTruthy();
  });

  it('keeps metadata consistent (log max == user_version) after migration', () => {
    const db = loadFixture();
    migrate(db, AGENT_MANIFEST);
    const maxLog = Number(db.exec('SELECT MAX(version) FROM _vestara_migrations')[0]?.values?.[0]?.[0]);
    expect(maxLog).toBe(uv(db));
  });

  it('survives restart: reopened exported DB keeps version and schema', () => {
    let bytes: Uint8Array | undefined;
    const db = loadFixture();
    migrate(db, AGENT_MANIFEST, { persist: (d) => (bytes = d.export()) });

    const reopened = new SQL.Database(bytes);
    expect(uv(reopened)).toBe(3);
    expect(agentColumns(reopened)).toContain('agent_type');
    expect(reopened.exec('SELECT COUNT(*) FROM agents')[0]?.values?.[0]?.[0]).toBe(18);
  });

  it('AgentStorage CRUD works on a migrated fresh DB (the original 500 is gone)', async () => {
    const db = new SQL.Database();
    migrate(db, AGENT_MANIFEST);
    const storage = new AgentStorage(db);
    await storage.saveAgent({
      id: 'agent-crud',
      name: 'Crud Agent',
      role: 'developer',
      agentType: 'workspace',
      capabilities: [],
      permissions: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    const loaded = await storage.getAgent('agent-crud');
    expect(loaded?.name).toBe('Crud Agent');
    expect(loaded?.agentType).toBe('workspace');
  });

  it('AgentStorage works on the migrated real fixture', async () => {
    const db = loadFixture();
    migrate(db, AGENT_MANIFEST);
    const storage = new AgentStorage(db);
    expect((await storage.listAgents()).length).toBe(18);
    await storage.saveAgent({
      id: 'agent-live',
      name: 'Live Agent',
      role: 'developer',
      agentType: 'workspace',
      capabilities: [],
      permissions: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    expect((await storage.getAgent('agent-live'))?.name).toBe('Live Agent');
  });

  it('drift guard: AgentStorage no longer mutates schema or runs migrations itself', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/agent-storage.ts'), 'utf8');
    expect(source).not.toContain('CREATE TABLE IF NOT EXISTS');
    expect(source).not.toContain('ALTER TABLE');
    expect(source).not.toContain('migrate(');
    // The entrypoints (composition roots) own execution.
    const apiRoot = fs.readFileSync(path.resolve(__dirname, '../../../apps/api/src/workspace-context.ts'), 'utf8');
    expect(apiRoot).toContain('migrate(raw, PLANS_MANIFEST');
    const cliRoot = fs.readFileSync(path.resolve(__dirname, '../../../apps/cli/src/lib/db.ts'), 'utf8');
    expect(cliRoot).toContain('migrate(db, PLANS_MANIFEST');
  });

  it('drift guard: agent DDL lives only in the registered migration chain', () => {
    const migrationsSource = fs.readFileSync(path.resolve(__dirname, '../src/agent-migrations.ts'), 'utf8');
    // The domain file owns the baseline CREATE (v1) but delegates column-adds
    // to the runner — no raw ALTER in the domain package.
    expect(migrationsSource).toContain('CREATE TABLE IF NOT EXISTS'); // baseline v1
    expect(migrationsSource).not.toContain('ALTER TABLE');
    expect(migrationsSource).toContain('agents.agent_type');
    expect(migrationsSource).toContain('agents.runtime_agent');
    // The runner owns the ALTER mechanism.
    const runnerSource = fs.readFileSync(path.resolve(__dirname, '../../sqlite-migrations/src/runner.ts'), 'utf8');
    expect(runnerSource).toContain('ALTER TABLE');
    expect(AGENT_MIGRATIONS.map((step) => step.name)).toEqual([
      'agents.baseline',
      'agents.agent_type',
      'agents.runtime_agent',
    ]);
  });
});
