import { DefaultCapabilityCatalog, DefaultCapabilityResolver } from '@vestara/capabilities';
import { migrate } from '@vestara/sqlite-migrations';
import type { AgentEnvironment } from '@vestara/types';
import type { WorkflowTask } from '@vestara/workflow-orchestrator';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { PLANS_MANIFEST } from '../src/agent-migrations';
import { AgentStorage } from '../src/agent-storage';

/** Composition-root responsibility for direct-construction tests. */
function migratedDb(db: import('sql.js').Database): import('sql.js').Database {
  migrate(db, PLANS_MANIFEST, {});
  return db;
}

import type { AgentSource } from '../src/harness-task-dispatcher';
import { HarnessTaskDispatcher, type HarnessThreadRunner } from '../src/harness-task-dispatcher';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

const ENV: AgentEnvironment = {
  id: 'test-env' as AgentEnvironment['id'],
  kind: 'local',
  workspaceRoot: '/repo',
  networkPolicy: 'restricted',
  filesystemPolicy: 'workspace-write',
  processPolicy: 'restricted',
};

class StubRunner implements HarnessThreadRunner {
  created: Array<{ taskId: string; title: string; metadata: Readonly<Record<string, unknown>> }> = [];
  runs: Array<{ threadId: string; instruction: string; agentId: string }> = [];

  constructor(
    private readonly state: string,
    private readonly summary?: string,
  ) {}

  createThread(input: { taskId: string; title: string; metadata: Readonly<Record<string, unknown>> }) {
    this.created.push({ taskId: input.taskId, title: input.title, metadata: input.metadata });
    return { id: `thread-${this.created.length}` };
  }

  async run(input: { threadId: string; instruction: string; agentId: string }) {
    this.runs.push(input);
    return {
      turn: {
        state: this.state,
        outcome: this.summary ? { summary: this.summary } : undefined,
      },
    };
  }
}

function task(overrides?: Partial<WorkflowTask>): WorkflowTask {
  return {
    id: 'task-1',
    planId: 'plan-1',
    summary: 'Implement feature',
    description: 'Do the work',
    files: ['src/a.ts'],
    dependencies: [],
    status: 'pending',
    effort: 'medium',
    requiredCapabilities: ['code-generation'],
    revisionCount: 0,
    attemptCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const PROJECT = { id: 'project-1' } as Parameters<HarnessTaskDispatcher['dispatch']>[1];

describe('HarnessTaskDispatcher', () => {
  it('dispatches a task as a durable harness thread tagged with the project workflowId', async () => {
    const runner = new StubRunner('completed', 'all done');
    const dispatcher = new HarnessTaskDispatcher({ runner, environment: ENV });
    const result = await dispatcher.dispatch(task(), PROJECT);

    expect(result.status).toBe('completed');
    expect(result.agentId).toBe('developer');
    expect(result.output).toBe('all done');
    expect(runner.created).toHaveLength(1);
    expect(runner.created[0].taskId).toBe('task-1');
    expect(runner.created[0].metadata).toMatchObject({
      workflowId: 'wf:project-1',
      taskId: 'task-1',
      planId: 'plan-1',
      runSource: 'workflow-orchestrator',
    });
    expect(runner.runs[0].instruction).toBe('Do the work');
  });

  it('maps a non-terminal turn state to a failed result', async () => {
    const runner = new StubRunner('blocked');
    const dispatcher = new HarnessTaskDispatcher({ runner, environment: ENV });
    const result = await dispatcher.dispatch(task(), PROJECT);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('blocked');
  });

  it('resolves an agent by capability match from the agent store', async () => {
    const storage = new AgentStorage(migratedDb(new SQL.Database()));
    const runner = new StubRunner('completed');
    const dispatcher = new HarnessTaskDispatcher({ runner, storage, environment: ENV });
    const result = await dispatcher.dispatch(task({ requiredCapabilities: ['code-generation'] }), PROJECT);
    expect(result.agentId).toBe('agent-developer');
    expect(runner.runs[0].agentId).toBe('agent-developer');
  });

  it('falls back to the developer role when no capability matches', async () => {
    const storage = new AgentStorage(migratedDb(new SQL.Database()));
    const runner = new StubRunner('completed');
    const dispatcher = new HarnessTaskDispatcher({ runner, storage, environment: ENV });
    const result = await dispatcher.dispatch(task({ requiredCapabilities: ['quantum-computing'] }), PROJECT);
    expect(result.agentId).toBe('agent-developer');
  });

  it('resolves a namespaced requirement against a wildcard provider', async () => {
    const storage = stubStorage([
      { id: 'agent-fs', role: 'developer', status: 'active', capabilities: ['filesystem.*'] },
      { id: 'agent-chat', role: 'analyst', status: 'active', capabilities: ['ai.chat'] },
    ]);
    const runner = new StubRunner('completed');
    const dispatcher = new HarnessTaskDispatcher({ runner, storage, environment: ENV });
    const result = await dispatcher.dispatch(task({ requiredCapabilities: ['filesystem.write'] }), PROJECT);
    expect(result.agentId).toBe('agent-fs');
  });

  it('resolves a requirement through capability implications', async () => {
    const catalog = new DefaultCapabilityCatalog();
    const definition = (id: string) => ({
      id,
      category: 'agent',
      name: id,
      version: '1.0.0',
      stability: 'stable' as const,
      description: id,
    });
    catalog.register(definition('implements'));
    catalog.register(definition('code-generation'));
    catalog.registerRelationships('implements', { implies: ['code-generation'] });
    const resolver = new DefaultCapabilityResolver(catalog);

    const storage = stubStorage([
      { id: 'agent-builder', role: 'developer', status: 'active', capabilities: ['implements'] },
    ]);
    const runner = new StubRunner('completed');
    const dispatcher = new HarnessTaskDispatcher({ runner, storage, environment: ENV, resolver });
    const result = await dispatcher.dispatch(task({ requiredCapabilities: ['code-generation'] }), PROJECT);
    expect(result.agentId).toBe('agent-builder');
  });

  it('prefers the developer role when several agents satisfy the requirement', async () => {
    const storage = stubStorage([
      { id: 'agent-security', role: 'security', status: 'active', capabilities: ['code-generation'] },
      { id: 'agent-developer', role: 'developer', status: 'active', capabilities: ['code-generation'] },
    ]);
    const runner = new StubRunner('completed');
    const dispatcher = new HarnessTaskDispatcher({ runner, storage, environment: ENV });
    const result = await dispatcher.dispatch(task({ requiredCapabilities: ['code-generation'] }), PROJECT);
    expect(result.agentId).toBe('agent-developer');
  });
});

function stubStorage(agents: Array<{ id: string; role: string; status: string; capabilities: string[] }>): AgentSource {
  return { listAgents: async () => agents };
}
