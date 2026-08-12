import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentHarnessRuntime } from '@vestara/agent-harness';
import { SqliteEngineeringEventStore } from '@vestara/engineering-event-store';
import { InProcessEventBus } from '@vestara/event-bus';
import { FilesystemRuntime } from '@vestara/filesystem-runtime';
import type { AIModel, AIProvider, CompletionRequest, CompletionResponse, StreamChunk } from '@vestara/shared';
import { migrate } from '@vestara/sqlite-migrations';
import { FileThreadStore } from '@vestara/thread-runtime';
import { FilesystemWriteTool, ToolRuntime } from '@vestara/tool-runtime';
import type { AgentEnvironment, HarnessVerificationResult } from '@vestara/types';
import { AgentStorage, HarnessSession, MultiAgentWorkflowOrchestrator, PLANS_MANIFEST } from '@vestara/workspace';
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

function completion(content: string): CompletionResponse {
  return {
    id: `resp-${Date.now()}-${Math.random()}`,
    model: model.id,
    provider: 'provider-test',
    content,
    usage: {},
    latency: 1,
  };
}

function toolCall(
  id: string,
  name: string,
  argumentsString: string,
): NonNullable<CompletionResponse['toolCalls']>[number] {
  return { id, name, arguments: argumentsString };
}

function withTools(toolCalls: Array<{ id: string; name: string; arguments: string }>): CompletionResponse {
  return { ...completion('Working...'), toolCalls };
}

/**
 * Scripted provider. The orchestrator runs stage threads sequentially and
 * awaits each turn, so completions arrive in a deterministic order: each stage
 * thread emits a planning + write tool call, then a final content completion.
 */
function provider(script: Array<() => CompletionResponse>): AIProvider {
  return {
    id: 'provider-test',
    name: 'Test Provider',
    version: '1.0.0',
    status: 'available',
    models: [model],
    capabilities: { maxConcurrentRequests: 1, features: ['chat', 'function-calling'] },
    async initialize() {},
    async complete(): Promise<CompletionResponse> {
      return (
        script.shift()?.() ?? {
          id: `resp-${Date.now()}-${Math.random()}`,
          model: model.id,
          provider: 'provider-test',
          content: 'Done',
          usage: {},
          latency: 1,
        }
      );
    },
    async *stream(_request: CompletionRequest): AsyncIterable<StreamChunk> {},
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

async function openInMemoryDb(): Promise<import('sql.js').Database> {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  return new SQL.Database();
}

describe('multi-agent workflow routes', () => {
  let store: FileThreadStore;
  let events: SqliteEngineeringEventStore;
  let harness: AgentHarnessRuntime;
  let server: ReturnType<typeof createServer>;
  let baseUrl: string;
  let environment: AgentEnvironment;
  let workspaceRoot: string;

  beforeAll(async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-api-multiagent-'));
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
    const tools = new ToolRuntime();
    tools.register({
      name: 'plan',
      description: 'Plan the work',
      risk: 'low',
      inputSchema: {
        jsonSchema: {
          type: 'object',
          properties: { goal: { type: 'string' } },
          required: [],
          additionalProperties: false,
        },
        parse: (input) => ({ goal: (input as { goal?: string })?.goal ?? '' }),
      },
      affectedResources: () => [],
      execute: async () => ({ status: 'completed', output: { ok: true }, evidence: [] }),
    });
    tools.register(new FilesystemWriteTool(new FilesystemRuntime({ rootDir: workspaceRoot })));

    // Each stage thread runs sequentially; every thread's turn emits a plan +
    // write tool call, then a final content completion (2 completions per thread).
    const threadCompletions: Array<() => CompletionResponse> = [];
    for (let thread = 0; thread < 4; thread++) {
      threadCompletions.push(() =>
        withTools([
          toolCall(`plan-${thread}`, 'plan', JSON.stringify({ goal: `goal-${thread}` })),
          toolCall(`write-${thread}`, 'filesystem.write', JSON.stringify({ path: `out-${thread}.txt`, content: 'x' })),
        ]),
      );
      threadCompletions.push(() => completion('Completed stage work.'));
    }

    harness = new (await import('@vestara/agent-harness')).AgentHarnessRuntime({
      store,
      provider: provider(threadCompletions),
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
    const multiAgentWorkflow = new MultiAgentWorkflowOrchestrator({ session: harnessSession });
    multiAgentWorkflow.changeProjector = changeProjector;

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
      multiAgentWorkflow,
      changeProjector,
      publish: () => {},
      users: {},
      agents: { listAgents: async () => [] },
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

  async function waitForWorkflowComplete(workflowId: string, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const siblings = store.listThreads().filter((thread) => thread.metadata?.workflowId === workflowId);
      const allTerminal =
        siblings.length > 0 &&
        siblings.every((thread) => {
          const state = harness.replay(thread.id).turns.at(-1)?.state;
          return state === 'completed' || state === 'blocked' || state === 'failed' || state === 'cancelled';
        });
      if (allTerminal) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const states = store
      .listThreads()
      .filter((thread) => thread.metadata?.workflowId === workflowId)
      .map((thread) => `${thread.id}:${harness.replay(thread.id).turns.at(-1)?.state}`);
    throw new Error(`Timed out waiting for workflow completion: ${states.join(', ')}`);
  }

  it('starts a multi-agent workflow and aggregates sibling threads into one projection', async () => {
    const startRes = await fetch(`${baseUrl}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'Ship the feature' }),
    });
    expect(startRes.status).toBe(201);
    const started = (await startRes.json()) as {
      workflowId: string;
      goal: string;
      stages: Array<{ role: string; agentId: string; threadId: string }>;
    };
    expect(started.workflowId).toMatch(/^wf-/);
    expect(started.stages.map((stage) => stage.role)).toEqual(['planner', 'developer', 'verifier', 'reviewer']);
    expect(started.stages.map((stage) => stage.threadId)).toHaveLength(4);

    await waitForWorkflowComplete(started.workflowId);

    // GET the workflow for any sibling thread → aggregated eight-stage projection.
    const snapshotRes = await fetch(`${baseUrl}/api/workflow/${started.stages[1].threadId}`);
    if (snapshotRes.status !== 200) {
      const errorBody = await snapshotRes.text();
      console.error('[test] workflow snapshot error:', errorBody);
    }
    expect(snapshotRes.status).toBe(200);
    const snapshot = (await snapshotRes.json()) as {
      projection: {
        workflowId: string;
        stages: Array<{ id: string; agentId: string; status: string }>;
        swimlanes: Array<{ agentId: string }>;
        status: string;
      };
    };
    expect(snapshot.projection.workflowId).toBe(started.workflowId);
    expect(snapshot.projection.stages).toHaveLength(8);
    expect(snapshot.projection.status).toBe('completed');
    // Swimlanes span the stage agents whose stages actually ran, not a single thread.
    const laneAgents = snapshot.projection.swimlanes.map((lane) => lane.agentId);
    expect(laneAgents).toContain('vestara-planner');
    expect(laneAgents).toContain('vestara-developer');
    expect(laneAgents).toContain('vestara-verifier');
    // Stage ownership is attributed to the owning agent per role.
    const byId = new Map(snapshot.projection.stages.map((stage) => [stage.id, stage]));
    expect(byId.get('planning')?.agentId).toBe('vestara-planner');
    expect(byId.get('execution')?.agentId).toBe('vestara-developer');
    expect(byId.get('verification')?.agentId).toBe('vestara-verifier');
  }, 20000);

  it('returns 400 when a workflow is started without a goal', async () => {
    const res = await fetch(`${baseUrl}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
