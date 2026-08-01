import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FilesystemRuntime } from '@vestara/filesystem-runtime';
import type {
  AIModel,
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  ProviderHealthStatus,
  StreamChunk,
} from '@vestara/shared';
import { FileThreadStore } from '@vestara/thread-runtime';
import { FilesystemReadTool, FilesystemWriteTool, type ToolPolicyEvaluator, ToolRuntime } from '@vestara/tool-runtime';
import type {
  AgentEnvironment,
  AgentEnvironmentId,
  ApprovalRequestId,
  HarnessVerificationResult,
  PolicyEvaluationInput,
} from '@vestara/types';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentHarnessRuntime, type HarnessContextAssembler, type HarnessVerifier } from '../src/index.js';

const directories: string[] = [];

afterEach(() => {
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

function provider(complete: (request: CompletionRequest) => Promise<CompletionResponse>): AIProvider {
  return {
    id: 'provider-test',
    name: 'Test Provider',
    version: '1.0.0',
    status: 'available',
    models: [model],
    capabilities: { maxConcurrentRequests: 1, features: ['chat', 'function-calling'] },
    async initialize() {},
    complete,
    async *stream(_request: CompletionRequest): AsyncIterable<StreamChunk> {},
    async healthCheck(): Promise<ProviderHealthStatus> {
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

function response(content: string, toolCalls?: CompletionResponse['toolCalls']): CompletionResponse {
  return {
    id: `response-${content}`,
    model: model.id,
    provider: 'provider-test',
    content,
    toolCalls,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    latency: 1,
  };
}

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-harness-'));
  directories.push(directory);
  const workspaceRoot = path.join(directory, 'workspace');
  fs.mkdirSync(workspaceRoot);
  const environment: AgentEnvironment = {
    id: 'environment-local' as AgentEnvironmentId,
    kind: 'local',
    workspaceRoot,
    networkPolicy: 'deny',
    filesystemPolicy: 'workspace-write',
    processPolicy: 'restricted',
  };
  return { directory, workspaceRoot, environment, dbPath: path.join(directory, 'threads.db') };
}

const context: HarnessContextAssembler = {
  async assemble({ thread }) {
    return `Task ${thread.taskId}; follow repository instructions.`;
  },
};

const passedVerification: HarnessVerificationResult = {
  status: 'passed',
  checks: [{ id: 'check-1', name: 'Focused test', status: 'passed', summary: 'Passed' }],
  evidence: [{ id: 'evidence-1', kind: 'test', summary: 'Focused test passed', metadata: {} }],
  uncoveredRisks: [],
  confidence: 0.95,
};

const verifier: HarnessVerifier = {
  async verify() {
    return passedVerification;
  },
};

async function createHarness(
  dbPath: string,
  aiProvider: AIProvider,
  tools: ToolRuntime,
  customVerifier: HarnessVerifier = verifier,
) {
  const store = await FileThreadStore.open(dbPath);
  const harness = new AgentHarnessRuntime({
    store,
    provider: aiProvider,
    model: model.id,
    tools,
    context,
    verifier: customVerifier,
  });
  return { store, harness };
}

describe('AgentHarnessRuntime', () => {
  it('runs model → tool → observation → verification to a durable outcome', async () => {
    const { dbPath, workspaceRoot, environment } = setup();
    fs.writeFileSync(path.join(workspaceRoot, 'README.md'), 'Harness foundation');
    const tools = new ToolRuntime();
    tools.register(new FilesystemReadTool(new FilesystemRuntime({ rootDir: workspaceRoot })));
    const responses = [
      response('', [{ id: 'call-read', name: 'filesystem.read', arguments: JSON.stringify({ path: 'README.md' }) }]),
      response('The repository was inspected.'),
    ];
    const requests: CompletionRequest[] = [];
    const { store, harness } = await createHarness(
      dbPath,
      provider(async (request) => {
        requests.push(request);
        return responses.shift() ?? response('Done');
      }),
      tools,
    );
    const thread = harness.createThread({ taskId: 'TASK-1', title: 'Inspect', environment });

    const result = await harness.run({
      threadId: thread.id,
      instruction: 'Inspect README.md',
      agentId: 'developer-01',
      environment,
    });

    expect(result.outcome?.state).toBe('completed');
    expect(requests[0]?.tools?.map((tool) => tool.id)).toEqual(['filesystem.read']);
    const replay = harness.replay(thread.id);
    expect(replay.items.map((item) => item.kind)).toContain('tool-result');
    expect(replay.items.map((item) => item.kind)).toContain('verification-result');
    expect(replay.items.at(-1)?.kind).toBe('final-outcome');
    expect(replay.items.map((item) => item.sequence)).toEqual(replay.items.map((_, index) => index + 1));
    store.close();
  });

  it('resumes a persisted approval after restart without writing early', async () => {
    const { dbPath, workspaceRoot, environment } = setup();
    const approvalPolicy: ToolPolicyEvaluator = {
      async evaluate(input: PolicyEvaluationInput) {
        return {
          decision: input.toolName === 'filesystem.write' ? 'require-approval' : 'allow',
          reason: 'Workspace writes require approval',
        };
      },
    };
    const tools = new ToolRuntime(approvalPolicy);
    tools.register(new FilesystemWriteTool(new FilesystemRuntime({ rootDir: workspaceRoot })));
    const responses = [
      response('', [
        {
          id: 'call-write',
          name: 'filesystem.write',
          arguments: JSON.stringify({ path: 'result.txt', content: 'approved content' }),
        },
      ]),
      response('The approved file was written.'),
    ];
    const aiProvider = provider(async () => responses.shift() ?? response('Done'));
    const first = await createHarness(dbPath, aiProvider, tools);
    const thread = first.harness.createThread({ taskId: 'TASK-2', title: 'Write result', environment });
    const waiting = await first.harness.run({
      threadId: thread.id,
      instruction: 'Write result.txt',
      agentId: 'developer-02',
      environment,
    });
    expect(waiting.turn.state).toBe('awaiting-approval');
    expect(fs.existsSync(path.join(workspaceRoot, 'result.txt'))).toBe(false);
    first.store.close();

    const resumed = await createHarness(dbPath, aiProvider, tools);
    const completed = await resumed.harness.decideApproval(
      thread.id,
      waiting.approvalId as ApprovalRequestId,
      true,
      environment,
    );
    expect(completed.outcome?.state).toBe('completed');
    expect(fs.readFileSync(path.join(workspaceRoot, 'result.txt'), 'utf8')).toBe('approved content');
    expect(resumed.harness.replay(thread.id).items.map((item) => item.kind)).toContain('approval-decision');
    resumed.store.close();
  });

  it('feeds steering received during inference into the next model iteration', async () => {
    const { dbPath, environment } = setup();
    const tools = new ToolRuntime();
    let release: ((value: CompletionResponse) => void) | undefined;
    const firstResponse = new Promise<CompletionResponse>((resolve) => {
      release = resolve;
    });
    const requests: CompletionRequest[] = [];
    const aiProvider = provider(async (request) => {
      requests.push(request);
      if (requests.length === 1) return firstResponse;
      return response('Steering applied.');
    });
    const { store, harness } = await createHarness(dbPath, aiProvider, tools);
    const thread = harness.createThread({ taskId: 'TASK-3', title: 'Steer work', environment });
    const running = harness.run({
      threadId: thread.id,
      instruction: 'Inspect the project',
      agentId: 'developer-03',
      environment,
    });
    await expect.poll(() => requests.length).toBe(1);
    harness.steer(thread.id, 'Focus on package boundaries');
    release?.(response('Initial inspection.'));

    const result = await running;
    expect(result.outcome?.state).toBe('completed');
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.some((message) => message.content === 'Focus on package boundaries')).toBe(true);
    store.close();
  });

  it('cancels an in-flight turn and preserves a replayable terminal outcome', async () => {
    const { dbPath, environment } = setup();
    let release: ((value: CompletionResponse) => void) | undefined;
    const pending = new Promise<CompletionResponse>((resolve) => {
      release = resolve;
    });
    let inferenceStarted = false;
    const { store, harness } = await createHarness(
      dbPath,
      provider(async () => {
        inferenceStarted = true;
        return pending;
      }),
      new ToolRuntime(),
    );
    const thread = harness.createThread({ taskId: 'TASK-4', title: 'Cancel work', environment });
    const running = harness.run({
      threadId: thread.id,
      instruction: 'Long task',
      agentId: 'developer-04',
      environment,
    });
    await expect.poll(() => inferenceStarted).toBe(true);
    expect(harness.cancel(thread.id).state).toBe('cancelled');
    release?.(response('Late response'));

    const result = await running;
    expect(result.outcome?.state).toBe('cancelled');
    expect(harness.replay(thread.id).items.at(-1)?.kind).toBe('final-outcome');
    store.close();
  });
});
