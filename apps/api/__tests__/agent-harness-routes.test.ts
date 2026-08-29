import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentHarnessRuntime } from '@vestara/agent-harness';
import { SqliteEngineeringEventStore } from '@vestara/engineering-event-store';
import { InProcessEventBus } from '@vestara/event-bus';
import { FilesystemRuntime } from '@vestara/filesystem-runtime';
import type { AIModel, AIProvider, CompletionResponse } from '@vestara/shared';
import { migrate } from '@vestara/sqlite-migrations';
import { FileThreadStore } from '@vestara/thread-runtime';
import { FilesystemWriteTool, type ToolPolicyEvaluator, ToolRuntime, type VestaraTool } from '@vestara/tool-runtime';
import type { AgentEnvironment, HarnessVerificationResult, PolicyEvaluationInput } from '@vestara/types';
import { AgentStorage, HarnessSession, PLANS_MANIFEST } from '@vestara/workspace';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarnessEngineeringEventBridge } from '../src/bridges/harness-engineering-event-bridge.js';
import { createServer } from '../src/server.js';

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
          id: `resp-${Date.now()}`,
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

const approvalPolicy: ToolPolicyEvaluator = {
  async evaluate(input: PolicyEvaluationInput) {
    return input.toolName === 'filesystem.write'
      ? { decision: 'require-approval', reason: 'Writes require approval' }
      : { decision: 'allow', reason: 'Allowed' };
  },
};

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

async function openInMemoryDb(): Promise<import('sql.js').Database> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  return new SQL.Database();
}

describe('agent harness API routes', () => {
  let store: FileThreadStore;
  let events: SqliteEngineeringEventStore;
  let harness: AgentHarnessRuntime;
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  let environment: AgentEnvironment;
  let workspaceRoot: string;
  const order: string[] = [];

  beforeAll(async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-api-harness-'));
    directories.push(directory);
    workspaceRoot = path.join(directory, 'workspace');
    fs.mkdirSync(workspaceRoot);
    environment = {
      id: 'environment-local',
      kind: 'local',
      workspaceRoot,
      networkPolicy: 'deny',
      filesystemPolicy: 'workspace-write',
      processPolicy: 'restricted',
    } as AgentEnvironment;

    const dbPath = path.join(directory, 'threads.db');
    store = await FileThreadStore.open(dbPath);
    events = await SqliteEngineeringEventStore.open(path.join(directory, 'events.db'));
    const eventBus = new InProcessEventBus();
    const telemetry = { track: () => {} };
    const tools = new ToolRuntime(approvalPolicy);
    tools.register(echoTool(order));
    tools.register(new FilesystemWriteTool(new FilesystemRuntime({ rootDir: workspaceRoot })));

    const { AgentHarnessRuntime: Harness } = await import('@vestara/agent-harness');
    harness = new Harness({
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
            { id: 'call-a', name: 'test.echo', arguments: JSON.stringify({ id: 'a' }) },
            {
              id: 'call-w',
              name: 'filesystem.write',
              arguments: JSON.stringify({ path: 'out.txt', content: 'approved' }),
            },
            { id: 'call-b', name: 'test.echo', arguments: JSON.stringify({ id: 'b' }) },
          ],
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
          return {
            status: 'passed',
            checks: [],
            evidence: [],
            uncoveredRisks: [],
            confidence: 0.95,
          };
        },
      },
      eventBus,
    });
    createHarnessEngineeringEventBridge({
      eventBus,
      events,
      workspaceId: 'ws-test',
      environmentId: environment.id,
      telemetry,
    });

    // AgentStorage over an in-memory sql.js database for ExecutionSession rows.
    const db = await openInMemoryDb();
    migrate(db, PLANS_MANIFEST, {});
    const agents = new AgentStorage(db);
    const harnessSession = new HarnessSession({ harness, storage: agents, environment });
    const { ChangeEventProjector } = await import('../src/bridges/change-event-bridge.js');
    const changeProjector = new ChangeEventProjector({
      events,
      workspaceId: 'ws-test',
      environmentId: environment.id,
      root: workspaceRoot,
    });

    const mockCtx = {
      repoPath: workspaceRoot,
      workspaceDir: directory,
      runtime: { currentStatus: 'ready' },
      orchestrator: null,
      agentHarness: harness,
      agentThreadStore: store,
      engineeringEvents: events,
      telemetry,
      agentEnvironment: environment,
      harnessSession,
      changeProjector,
      publish: () => {},
      users: {},
    };
    server = createServer(mockCtx as never, 0);
    await server.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    await server.close();
    store.close();
    events.close();
  });

  async function waitForState(
    threadId: string,
    predicate: (state: string) => boolean,
    timeoutMs = 8000,
  ): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await fetch(`${baseUrl}/api/agent-threads/${encodeURIComponent(threadId)}`);
      const body = (await res.json()) as { state: string };
      if (predicate(body.state)) return body.state;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for state`);
  }

  it('runs a harness-backed agent, suspends for approval, resolves it, and streams correlated events', async () => {
    // 1. POST a run.
    const createRes = await fetch(`${baseUrl}/api/agents/developer-01/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction: 'Echo, write, echo', title: 'Route run' }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      threadId: string;
      turnId: string;
      runId: string;
      state: string;
      sessionId?: string;
    };
    expect(created.threadId).toBeTruthy();
    expect(created.runId).toBeTruthy();
    expect(created.turnId).toBeTruthy();
    expect(created.sessionId).toBeTruthy();

    // 2. Wait for approval suspension (multi-tool run reaches the write).
    const awaiting = await waitForState(created.threadId, (state) => state === 'awaiting-approval');
    expect(awaiting).toBe('awaiting-approval');
    expect(order).toEqual(['a']);

    // 3. List pending approvals (durable).
    const approvalsRes = await fetch(`${baseUrl}/api/agent-threads/${created.threadId}/approvals`);
    const approvals = (await approvalsRes.json()) as { approvals: Array<{ approvalId: string; toolName: string }> };
    expect(approvals.approvals).toHaveLength(1);
    expect(approvals.approvals[0].toolName).toBe('filesystem.write');

    // 4. Resolve the approval.
    const resolveRes = await fetch(
      `${baseUrl}/api/agent-threads/${created.threadId}/approvals/${approvals.approvals[0].approvalId}/resolve`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approved: true }) },
    );
    expect(resolveRes.status).toBe(200);
    const resolved = (await resolveRes.json()) as { outcome?: { state: string } };
    expect(resolved.outcome?.state).toBe('completed');

    // 5. Thread items reconstruct the full sequence.
    const itemsRes = await fetch(`${baseUrl}/api/agent-threads/${created.threadId}/items`);
    const replay = (await itemsRes.json()) as { items: Array<{ kind: string }> };
    const kinds = replay.items.map((item) => item.kind);
    expect(kinds).toContain('tool-call');
    expect(kinds).toContain('approval-decision');
    expect(kinds).toContain('verification-result');
    expect(kinds[kinds.length - 1]).toBe('final-outcome');

    // 6. Engineering event store contains correlated harness events.
    let eventsBody: { events: Array<{ type: string }> } = { events: [] };
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const eventsRes = await fetch(`${baseUrl}/api/agent-threads/${created.threadId}/events`);
      eventsBody = (await eventsRes.json()) as typeof eventsBody;
      if (eventsBody.events.some((event) => event.type === 'harness.outcome.completed')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const eventTypes = eventsBody.events.map((event) => event.type);
    expect(eventTypes).toContain('harness.turn.started');
    expect(eventTypes).toContain('harness.approval.requested');
    expect(eventTypes).toContain('harness.approval.resolved');
    expect(eventTypes).toContain('harness.verification.completed');
    expect(eventTypes).toContain('harness.outcome.completed');
  }, 20000);

  it('returns 400 when a run is created without an instruction', async () => {
    const res = await fetch(`${baseUrl}/api/agents/developer-01/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
