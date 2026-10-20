import { migrate } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { AGENT_MANIFEST } from '../src/agent-migrations';
import { AgentStorage } from '../src/agent-storage';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

function openAgentDb(): Database {
  const db = new SQL.Database();
  migrate(db, AGENT_MANIFEST, {});
  db.run("ALTER TABLE agents ADD COLUMN origin TEXT DEFAULT 'user'");
  return db;
}

function seedAgent(db: Database, provider: string, model: string): void {
  db.run(
    `INSERT INTO agents
      (id, name, role, agent_type, origin, description, capabilities, permissions, provider, model, runtime_agent, team_id, color, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'agent-developer',
      'Developer',
      'developer',
      'workspace',
      'system',
      'Implement approved tasks.',
      '[]',
      '[]',
      provider,
      model,
      'vestara-developer',
      '',
      '#3b82f6',
      'active',
      '2026-08-12T00:00:00.000Z',
    ],
  );
}

function storedModel(db: Database): readonly [string, string] {
  const result = db.exec("SELECT provider, model FROM agents WHERE id = 'agent-developer'");
  const row = result[0]?.values[0] ?? [];
  return [String(row[0]), String(row[1])];
}

describe('AgentStorage canonical reconciliation', () => {
  it('repairs a legacy model pin that is absent from the provider catalog', () => {
    const db = openAgentDb();
    seedAgent(db, 'opencode', 'muse-spark-1.3-contributor-free');

    new AgentStorage(db);

    expect(storedModel(db)).toEqual(['opencode-go', 'muse-spark-1.3-contributor']);
  });

  it('preserves a valid user-selected model on a system agent', () => {
    const db = openAgentDb();
    seedAgent(db, 'google', 'gemini-2.5-pro');

    new AgentStorage(db);

    expect(storedModel(db)).toEqual(['google', 'gemini-2.5-pro']);
  });
});
