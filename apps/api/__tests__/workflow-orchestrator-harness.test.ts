import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentHarnessRuntime } from '@vestara/agent-harness';
import { SqliteEngineeringEventStore } from '@vestara/engineering-event-store';
import { InProcessEventBus } from '@vestara/event-bus';
import { FilesystemRuntime } from '@vestara/filesystem-runtime';
import type { AIModel, AIProvider, CompletionRequest, CompletionResponse, StreamChunk } from '@vestara/shared';
import { FileThreadStore } from '@vestara/thread-runtime';
import { FilesystemWriteTool, ToolRuntime } from '@vestara/tool-runtime';
import type { AgentEnvironment, HarnessVerificationResult } from '@vestara/types';
import {
  ArtifactStore,
  FileLockRegistry,
  PlanStore,
  ProjectStore,
  TaskStore,
  WorkflowOrchestrator,
} from '@vestara/workflow-orchestrator';
import { AgentStorage, HarnessSession, HarnessTaskDispatcher } from '@vestara/workspace';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarnessEngineeringEventBridge } from '../src/bridges/harness-engineering-event-bridge';
import { OrchestrationEventBridge } from '../src/bridges/orchestration-event-bridge';

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

function withTools(toolCalls: Array<{ id: string; name: string; arguments: string }>): CompletionResponse {
  return { ...completion('Working...'), toolCalls };
}

/**
 * Scripted provider. Every task turn emits one plan + write tool call, then a
 * final content completion, so each harness turn completes deterministically.
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

describe('WorkflowOrchestrator + HarnessTaskDispatcher (integration)', () => {
  let events: SqliteEngineeringEventStore;
  let harness: AgentHarnessRuntime;
  let orchestrator: WorkflowOrchestrator;
  let store: FileThreadStore;
  let workspaceRoot: string;

  beforeAll(async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-orchestrator-harness-'));
    directories.push(directory);
    workspaceRoot = path.join(directory, 'workspace');
    fs.mkdirSync(workspaceRoot);
    const environment: AgentEnvironment = {
      id: 'environment-local',
      kind: 'local',
      workspaceRoot,
      networkPolicy: 'deny',
      filesystemPolicy: 'workspace-write',
      processPolicy: 'restricted',
    } as AgentEnvironment;

    store = await FileThreadStore.open(path.join(directory, 'threads.db'));
    events = await SqliteEngineeringEventStore.open(path.join(directory, 'events.db'));
    const eventBus = new InProcessEventBus();

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

    // 2 tasks × 2 completions (tools then content) = 4 script entries.
    const script: Array<() => CompletionResponse> = [];
    for (let task = 0; task < 2; task++) {
      script.push(() =>
        withTools([
          { id: `plan-${task}`, name: 'plan', arguments: JSON.stringify({ goal: `goal-${task}` }) },
          {
            id: `write-${task}`,
            name: 'filesystem.write',
            arguments: JSON.stringify({ path: `out-${task}.txt`, content: 'x' }),
          },
        ]),
      );
      script.push(() => completion('Task complete.'));
    }

    harness = new (await import('@vestara/agent-harness')).AgentHarnessRuntime({
      store,
      provider: provider(script),
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
      eventBus,
    });
    createHarnessEngineeringEventBridge({ eventBus, events, workspaceId: 'ws-test', environmentId: environment.id });

    const db = await openInMemoryDb();
    const agents = new AgentStorage(db);
    const harnessSession = new HarnessSession({ harness, storage: agents, environment });
    const orchestrationEvents = new OrchestrationEventBridge({
      events,
      workspaceId: 'ws-test',
      environmentId: environment.id,
    });
    orchestrator = new WorkflowOrchestrator({
      projects: new ProjectStore(db),
      plans: new PlanStore(db),
      tasks: new TaskStore(db),
      artifacts: new ArtifactStore(db),
      locks: new FileLockRegistry(db),
      events: orchestrationEvents,
      dispatcher: new HarnessTaskDispatcher({
        runner: harness,
        session: harnessSession,
        storage: agents,
        environment,
      }),
    });
  });

  afterAll(async () => {
    store.close();
    events.close();
  });

  it('runs a project to completion with verification.passed through the real harness', async () => {
    const project = await orchestrator.createProject({
      name: 'Feature',
      goal: 'Ship the feature',
      repoPath: workspaceRoot,
      workspaceId: 'ws-test',
    });
    await orchestrator.startProject(project.id);
    await orchestrator.completeAnalysis(project.id, { analystId: 'analyst', report: { summary: 'repo scanned' } });
    await orchestrator.generatePlan(project.id, {
      plannerId: 'planner',
      title: 'Plan',
      goal: 'Ship the feature',
      tasks: [
        {
          planId: '',
          summary: 'Implement part A',
          description: 'Write out-0.txt',
          files: ['out-0.txt'],
          dependencies: [],
          effort: 'small',
          requiredCapabilities: ['code-generation'],
        },
        {
          planId: '',
          summary: 'Implement part B',
          description: 'Write out-1.txt',
          files: ['out-1.txt'],
          dependencies: [],
          effort: 'small',
          requiredCapabilities: ['code-generation'],
        },
      ],
    });
    await orchestrator.reviewArchitecture(project.id, { architectId: 'architect', status: 'approved' });
    await orchestrator.approveProject(project.id, { approvalId: 'approval-1' });

    await orchestrator.runExecution(project.id);
    await orchestrator.runVerification(project.id, {
      verifierId: 'verifier',
      report: { passed: true },
      passed: true,
    });

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.status).toBe('completed');
    expect(snapshot.phase).toBe('completed');
    expect(snapshot.tasks).toHaveLength(2);
    expect(snapshot.tasks.every((task) => task.status === 'completed')).toBe(true);

    // Each task ran as its own durable harness thread.
    const threadStates = store
      .listThreads()
      .filter((thread) => thread.taskId.startsWith('task-'))
      .map((thread) => harness.replay(thread.id).turns.at(-1)?.state);
    expect(threadStates.length).toBeGreaterThanOrEqual(2);
    expect(threadStates.every((state) => state === 'completed')).toBe(true);

    // Full audit trail projected into the temporal event store.
    const audit = events.query({ correlationId: project.id, limit: 100_000 });
    const types = audit.map((event) => event.type);
    for (const expected of [
      'orchestration.project.created',
      'orchestration.plan.generated',
      'orchestration.task.completed',
      'orchestration.verification.passed',
      'orchestration.project.completed',
    ]) {
      expect(types).toContain(expected);
    }
    expect(types.filter((type) => type === 'orchestration.task.completed')).toHaveLength(2);
  }, 20000);
});
