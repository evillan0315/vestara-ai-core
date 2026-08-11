import { migrate } from '@vestara/sqlite-migrations';
import { describe, expect, it } from 'vitest';
import { PLANS_MANIFEST } from '../src/agent-migrations.js';
import { AgentStorage } from '../src/agent-storage.js';

function migratedDb(db: import('sql.js').Database): import('sql.js').Database {
  migrate(db, PLANS_MANIFEST, {});
  return db;
}

async function storage() {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  return new AgentStorage(migratedDb(new SQL.Database()));
}

describe('AgentStorage runtime agent persistence', () => {
  it('persists and reads back provider, model, and runtime agent', async () => {
    const db = await storage();
    const now = new Date().toISOString();
    await db.saveAgent({
      id: 'agent-1',
      name: 'Planner',
      role: 'planner',
      agentType: 'workspace',
      description: 'Plans',
      capabilities: [],
      permissions: [],
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
      runtimeAgent: 'planner',
      status: 'active',
      createdAt: now,
    });

    const agent = await db.getAgent('agent-1');
    expect(agent?.provider).toBe('opencode-go');
    expect(agent?.model).toBe('deepseek-v4-flash');
    expect(agent?.runtimeAgent).toBe('planner');
  });

  it('updates provider/model/runtime agent on save', async () => {
    const db = await storage();
    const now = new Date().toISOString();
    await db.saveAgent({
      id: 'agent-2',
      name: 'Reviewer',
      role: 'reviewer',
      agentType: 'workspace',
      capabilities: [],
      permissions: [],
      provider: 'opencode',
      model: 'deepseek-v4-flash-free',
      runtimeAgent: 'reviewer',
      status: 'active',
      createdAt: now,
    });

    await db.saveAgent({
      id: 'agent-2',
      name: 'Reviewer',
      role: 'reviewer',
      agentType: 'workspace',
      capabilities: [],
      permissions: [],
      provider: 'opencode-go',
      model: 'mimo-v2.5',
      runtimeAgent: 'build',
      status: 'active',
      createdAt: now,
    });

    const agent = await db.getAgent('agent-2');
    expect(agent?.provider).toBe('opencode-go');
    expect(agent?.model).toBe('mimo-v2.5');
    expect(agent?.runtimeAgent).toBe('build');
  });
});
