import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AIModel, AIProvider, CompletionResponse } from '@vestara/shared';
import { migrate } from '@vestara/sqlite-migrations';
import { FileThreadStore } from '@vestara/thread-runtime';
import type { VestaraTool } from '@vestara/tool-runtime';
import { ToolRuntime } from '@vestara/tool-runtime';
import type { AgentEnvironment, HarnessVerificationResult } from '@vestara/types';
import { afterAll, describe, expect, it } from 'vitest';
import { PLANS_MANIFEST } from '../src/agent-migrations.js';
import { AgentStorage } from '../src/agent-storage.js';

/** Composition-root responsibility for direct-construction tests. */
function migratedDb(db: import('sql.js').Database): import('sql.js').Database {
  migrate(db, PLANS_MANIFEST, {});
  return db;
}

import { HarnessExecutionAdapter, HarnessSession } from '../src/harness-session.js';

const directories: string[] = [];

afterAll(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const model: AIModel = {
  id: 'model-test',
  provider: 'test',
  name: 'Test',
  contextWindow: 32_000,
  maxOutput: 4_000,
  capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
  status: 'available',
};

function provider(script: Array<() => CompletionResponse>): AIProvider {
  return {
    id: 'provider-test',
    name: 'Test Provider',
    version: '1.0.0',
    status: 'available',
    models: [model],
    capabilities: { maxConcurrentRequests: 1, features: ['chat', 'function-calling'] },
    async initialize() {},
    async complete() {
      return (
        script.shift()?.() ?? {
          id: `resp-${Math.random()}`,
          model: model.id,
          provider: 'provider-test',
          content: 'Done',
          usage: {},
          latency: 1,
        }
      );
    },
    async *stream() {},
    async healthCheck() {
      return {
        status: 'healthy',
        providerId: 'provider-test',
        modelCount: 1,
        latency: 1,
        lastHeartbeat: new Date().toISOString(),
      };
    },
    async listModels() {
      return [model];
    },
  };
}

function echoTool(log: string[]): VestaraTool<{ id: string }, { ok: boolean }> {
  return {
    name: 'test.echo',
    description: 'Echo',
    risk: 'low',
    inputSchema: {
      jsonSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
      parse: (input) => ({ id: (input as { id?: string })?.id ?? '?' }),
    },
    affectedResources: () => [],
    execute: async (input) => {
      log.push(input.id);
      return { status: 'completed', output: { ok: true }, evidence: [] };
    },
  };
}

async function setup(): Promise<{
  directory: string;
  harness: import('@vestara/agent-harness').AgentHarnessRuntime;
  storage: AgentStorage;
  session: HarnessSession;
  environment: AgentEnvironment;
  threadId: string;
}> {
  const { AgentHarnessRuntime: Harness } = await import('@vestara/agent-harness');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-harness-session-'));
  directories.push(directory);
  const workspaceRoot = path.join(directory, 'workspace');
  fs.mkdirSync(workspaceRoot);
  const environment: AgentEnvironment = {
    id: 'environment-local',
    kind: 'local',
    workspaceRoot,
    networkPolicy: 'deny',
    filesystemPolicy: 'workspace-write',
    processPolicy: 'restricted',
  };
  const store = await FileThreadStore.open(path.join(directory, 'threads.db'));
  const order: string[] = [];
  const tools = new ToolRuntime();
  tools.register(echoTool(order));
  const harness = new Harness({
    store,
    provider: provider([
      () => ({
        id: 'r1',
        model: model.id,
        provider: 'provider-test',
        content: '',
        usage: {},
        latency: 1,
        toolCalls: [{ id: 'call-1', name: 'test.echo', arguments: JSON.stringify({ id: 'a' }) }],
      }),
      () => ({ id: 'r2', model: model.id, provider: 'provider-test', content: 'Done.', usage: {}, latency: 1 }),
    ]),
    model: model.id,
    tools,
    context: {
      async assemble({ thread }) {
        return `Task ${thread.taskId}`;
      },
    },
    verifier: {
      async verify(): Promise<HarnessVerificationResult> {
        return { status: 'passed', checks: [], evidence: [], uncoveredRisks: [], confidence: 0.95 };
      },
    },
  });
  const thread = harness.createThread({
    taskId: 'TASK-1',
    title: 'Inspect',
    environment,
    metadata: { agentId: 'developer-1' },
  });
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const storage = new AgentStorage(migratedDb(new SQL.Database()));
  const session = new HarnessSession({ harness, storage, environment });
  return { directory, harness, storage, session, environment, threadId: thread.id };
}

describe('HarnessSession', () => {
  it('creates an ExecutionSession durably linked to a harness thread', async () => {
    const { session, storage, threadId } = await setup();
    const record = await session.createForRun({ threadId, goal: 'Inspect', agentId: 'developer-1' });
    const stored = await storage.getExecutionSession(record.sessionId);
    expect(stored).not.toBeNull();
    expect(stored!.workflowId).toBe(`thread:${threadId}`);
    expect(stored!.status).toBe('running');
    expect(stored!.assignedAgentIds).toEqual(['developer-1']);
  });

  it('adapter executes a run and projects it into the linked session', async () => {
    const { session, harness } = await setup();
    const adapter = new HarnessExecutionAdapter(session);
    const result = await adapter.execute({
      agentId: 'developer-1',
      instruction: 'Inspect the project',
      goal: 'Inspect',
    });
    expect(result.status).toBe('completed');
    expect(result.threadId).toBeTruthy();
    expect(result.turnId).toBeTruthy();
    expect(result.runId).toBeTruthy();
    const linked = await session.sessionForThread(result.threadId);
    expect(linked).not.toBeNull();
    expect(linked!.status).toBe('completed');
    expect(linked!.metrics.totalSteps).toBeGreaterThan(0);
    expect(linked!.metrics.completedSteps).toBeGreaterThan(0);
    expect(linked!.timeline.some((step) => step.step.startsWith('tool:'))).toBe(true);
    expect(harness.replay(result.threadId as never).items.at(-1)?.kind).toBe('final-outcome');
  });

  it('restoreActiveSessions re-links and syncs a thread after restart', async () => {
    const { session, storage, threadId } = await setup();
    // Simulate a prior run that left no ExecutionSession row.
    await session.harness.run({
      threadId: threadId as never,
      instruction: 'Inspect',
      agentId: 'developer-1',
      environment: session.environment,
    });
    const records = await session.restoreActiveSessions();
    expect(records.some((record) => record.threadId === threadId)).toBe(true);
    const linked = await session.sessionForThread(threadId);
    expect(linked).not.toBeNull();
    expect(linked!.status).toBe('completed');
    // Re-running restore must not duplicate the session row.
    const again = await session.sessionForThread(threadId);
    expect(again).not.toBeNull();
    const all = await storage.listExecutionSessions(100);
    expect(all.filter((entry) => entry.workflowId === `thread:${threadId}`)).toHaveLength(1);
  });

  it('maps a blocked harness outcome to a failed session status', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-harness-session-block-'));
    directories.push(directory);
    const workspaceRoot = path.join(directory, 'workspace');
    fs.mkdirSync(workspaceRoot);
    const environment: AgentEnvironment = {
      id: 'environment-local',
      kind: 'local',
      workspaceRoot,
      networkPolicy: 'deny',
      filesystemPolicy: 'workspace-write',
      processPolicy: 'restricted',
    };
    const { AgentHarnessRuntime: Harness } = await import('@vestara/agent-harness');
    const store = await FileThreadStore.open(path.join(directory, 'threads.db'));
    const tools = new ToolRuntime();
    tools.register(echoTool([]));
    const harness = new Harness({
      store,
      provider: provider([
        () => ({ id: 'r1', model: model.id, provider: 'provider-test', content: 'Final.', usage: {}, latency: 1 }),
      ]),
      model: model.id,
      tools,
      context: {
        async assemble() {
          return 'ctx';
        },
      },
      verifier: {
        async verify(): Promise<HarnessVerificationResult> {
          return { status: 'blocked', checks: [], evidence: [], uncoveredRisks: ['policy blocked'], confidence: 0.2 };
        },
      },
    });
    const thread = harness.createThread({ taskId: 'T', title: 'Blocked', environment, metadata: { agentId: 'dev' } });
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const storage = new AgentStorage(migratedDb(new SQL.Database()));
    const session = new HarnessSession({ harness, storage, environment });
    await session.createForRun({ threadId: thread.id, goal: 'Blocked', agentId: 'dev' });
    const result = await harness.run({ threadId: thread.id, instruction: 'Work', agentId: 'dev', environment });
    expect(result.outcome?.state).toBe('blocked');
    await session.syncFromReplay(thread.id);
    const linked = await session.sessionForThread(thread.id);
    expect(linked!.status).toBe('failed');
  });

  it('exposes pending approvals for a session when a run is suspended', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-harness-session-appr-'));
    directories.push(directory);
    const workspaceRoot = path.join(directory, 'workspace');
    fs.mkdirSync(workspaceRoot);
    const environment: AgentEnvironment = {
      id: 'environment-local',
      kind: 'local',
      workspaceRoot,
      networkPolicy: 'deny',
      filesystemPolicy: 'workspace-write',
      processPolicy: 'restricted',
    };
    const { AgentHarnessRuntime: Harness } = await import('@vestara/agent-harness');
    const { FilesystemWriteTool } = await import('@vestara/tool-runtime');
    const { FilesystemRuntime } = await import('@vestara/filesystem-runtime');
    const store = await FileThreadStore.open(path.join(directory, 'threads.db'));
    const tools = new ToolRuntime({
      async evaluate(input) {
        return input.toolName === 'filesystem.write'
          ? { decision: 'require-approval', reason: 'Writes need approval' }
          : { decision: 'allow', reason: 'Allowed' };
      },
    });
    tools.register(echoTool([]));
    tools.register(new FilesystemWriteTool(new FilesystemRuntime({ rootDir: workspaceRoot })));
    const harness = new Harness({
      store,
      provider: provider([
        () => ({
          id: 'r1',
          model: model.id,
          provider: 'provider-test',
          content: '',
          usage: {},
          latency: 1,
          toolCalls: [
            { id: 'call-w', name: 'filesystem.write', arguments: JSON.stringify({ path: 'x.txt', content: 'x' }) },
          ],
        }),
      ]),
      model: model.id,
      tools,
      context: {
        async assemble() {
          return 'ctx';
        },
      },
      verifier: {
        async verify(): Promise<HarnessVerificationResult> {
          return { status: 'passed', checks: [], evidence: [], uncoveredRisks: [], confidence: 0.95 };
        },
      },
    });
    const thread = harness.createThread({ taskId: 'T', title: 'Write', environment, metadata: { agentId: 'dev' } });
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const storage = new AgentStorage(migratedDb(new SQL.Database()));
    const session = new HarnessSession({ harness, storage, environment });
    const record = await session.createForRun({ threadId: thread.id, goal: 'Write', agentId: 'dev' });
    const waiting = await harness.run({ threadId: thread.id, instruction: 'Write', agentId: 'dev', environment });
    expect(waiting.turn.state).toBe('awaiting-approval');
    const pending = await session.pendingApprovalsForSession(record.sessionId);
    expect(pending).toHaveLength(1);
    expect(pending[0].toolName).toBe('filesystem.write');
  });
});
