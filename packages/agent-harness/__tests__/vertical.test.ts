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
import { FilesystemWriteTool, type ToolPolicyEvaluator, ToolRuntime, type VestaraTool } from '@vestara/tool-runtime';
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
    id: `response-${content}-${Math.random()}`,
    model: model.id,
    provider: 'provider-test',
    content,
    toolCalls,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    latency: 1,
  };
}

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-harness-v-'));
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
  options: { maxIterations?: number } = {},
) {
  const store = await FileThreadStore.open(dbPath);
  const harness = new AgentHarnessRuntime({
    store,
    provider: aiProvider,
    model: model.id,
    tools,
    context,
    verifier: customVerifier,
    maxIterations: options.maxIterations,
  });
  return { store, harness };
}

/** Low-risk tool that records the `id` it was called with, in order. */
function recordingTool(name: string, log: string[]): VestaraTool<{ id: string }, { ok: boolean }> {
  return {
    name,
    description: name,
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

function hangingTool(): {
  tool: VestaraTool<{ id: string }, { ok: boolean }>;
  started: () => boolean;
  release: (result: { status: 'completed'; evidence: [] }) => void;
} {
  let started = false;
  let release: (result: { status: 'completed'; evidence: [] }) => void = () => {};
  const execute = new Promise<{ status: 'completed'; evidence: [] }>((resolve) => {
    release = resolve;
  });
  const tool: VestaraTool<{ id: string }, { ok: boolean }> = {
    name: 'test.hang',
    description: 'Hangs until released',
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
    execute: () => {
      started = true;
      return execute;
    },
  };
  return {
    tool,
    started: () => started,
    release: (result) => release(result),
  };
}

const approvalPolicy: ToolPolicyEvaluator = {
  async evaluate(input: PolicyEvaluationInput) {
    return input.toolName === 'filesystem.write'
      ? { decision: 'require-approval', reason: 'Workspace writes require approval' }
      : { decision: 'allow', reason: 'Allowed' };
  },
};

describe('AgentHarnessRuntime — vertical integration', () => {
  it('executes multiple tool calls from one model response in deterministic order', async () => {
    const { dbPath, environment } = setup();
    const order: string[] = [];
    const tools = new ToolRuntime();
    tools.register(recordingTool('test.echo', order));
    const responses = [
      response('', [
        { id: 'call-1', name: 'test.echo', arguments: JSON.stringify({ id: 'first' }) },
        { id: 'call-2', name: 'test.echo', arguments: JSON.stringify({ id: 'second' }) },
      ]),
      response('All echoed.'),
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
    const thread = harness.createThread({ taskId: 'TASK-MT', title: 'Multi tool', environment });
    const result = await harness.run({
      threadId: thread.id,
      instruction: 'Echo twice',
      agentId: 'developer-mt',
      environment,
    });
    expect(result.outcome?.state).toBe('completed');
    expect(order).toEqual(['first', 'second']);
    expect(requests).toHaveLength(2);
    const replay = harness.replay(thread.id);
    expect(replay.items.filter((item) => item.kind === 'tool-call')).toHaveLength(2);
    expect(replay.items.filter((item) => item.kind === 'tool-result')).toHaveLength(2);
    store.close();
  });

  it('appends a structured failure for an unknown tool and lets the model react', async () => {
    const { dbPath, environment } = setup();
    const tools = new ToolRuntime();
    tools.register(recordingTool('test.echo', []));
    const responses = [
      response('', [{ id: 'call-z', name: 'nonexistent.tool', arguments: '{}' }]),
      response('Recovered from unknown tool.'),
    ];
    const { store, harness } = await createHarness(
      dbPath,
      provider(async () => responses.shift() ?? response('Done')),
      tools,
    );
    const thread = harness.createThread({ taskId: 'TASK-BADTOOL', title: 'Bad tool', environment });
    const result = await harness.run({ threadId: thread.id, instruction: 'Run it', agentId: 'a', environment });
    expect(result.outcome?.state).toBe('completed');
    const failures = harness
      .replay(thread.id)
      .items.filter((item) => item.kind === 'tool-result' && item.payload.status === 'failed');
    expect(failures).toHaveLength(1);
    expect(String(failures[0].payload.error)).toContain('Tool not found');
    store.close();
  });

  it('appends a structured failure for invalid tool arguments and lets the model react', async () => {
    const { dbPath, environment } = setup();
    const tools = new ToolRuntime();
    tools.register(recordingTool('test.echo', []));
    const responses = [
      response('', [{ id: 'call-z', name: 'test.echo', arguments: 'not-valid-json' }]),
      response('Recovered from bad arguments.'),
    ];
    const { store, harness } = await createHarness(
      dbPath,
      provider(async () => responses.shift() ?? response('Done')),
      tools,
    );
    const thread = harness.createThread({ taskId: 'TASK-BADARGS', title: 'Bad args', environment });
    const result = await harness.run({ threadId: thread.id, instruction: 'Run it', agentId: 'a', environment });
    expect(result.outcome?.state).toBe('completed');
    const failures = harness
      .replay(thread.id)
      .items.filter((item) => item.kind === 'tool-result' && item.payload.status === 'failed');
    expect(failures).toHaveLength(1);
    expect(String(failures[0].payload.error)).toContain('invalid tool arguments');
    store.close();
  });

  it('suspends mid-queue on approval, survives restart, resumes remaining calls without repeating, and replays fully', async () => {
    const { dbPath, workspaceRoot, environment } = setup();
    const order: string[] = [];
    const tools = new ToolRuntime(approvalPolicy);
    tools.register(recordingTool('test.echo', order));
    tools.register(new FilesystemWriteTool(new FilesystemRuntime({ rootDir: workspaceRoot })));
    const responses = [
      response('', [
        { id: 'call-a', name: 'test.echo', arguments: JSON.stringify({ id: 'a' }) },
        {
          id: 'call-w',
          name: 'filesystem.write',
          arguments: JSON.stringify({ path: 'out.txt', content: 'approved content' }),
        },
        { id: 'call-b', name: 'test.echo', arguments: JSON.stringify({ id: 'b' }) },
      ]),
      response('Done writing.'),
    ];
    const aiProvider = provider(async () => responses.shift() ?? response('Done'));
    const first = await createHarness(dbPath, aiProvider, tools);
    const thread = first.harness.createThread({ taskId: 'TASK-APPR', title: 'Approval queue', environment });
    const waiting = await first.harness.run({
      threadId: thread.id,
      instruction: 'Echo, write, echo',
      agentId: 'developer-ap',
      environment,
    });
    expect(waiting.turn.state).toBe('awaiting-approval');
    expect(fs.existsSync(path.join(workspaceRoot, 'out.txt'))).toBe(false);
    expect(order).toEqual(['a']);
    const pending = await first.harness.pendingApprovals(thread.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].toolName).toBe('filesystem.write');
    expect(pending[0].approvalId).toBe(waiting.approvalId);
    first.store.close();

    // Restart — pending approval is durable, not in-memory.
    const resumed = await createHarness(dbPath, aiProvider, tools);
    const stillPending = await resumed.harness.pendingApprovals(thread.id);
    expect(stillPending).toHaveLength(1);
    const completed = await resumed.harness.decideApproval(
      thread.id,
      waiting.approvalId as ApprovalRequestId,
      true,
      environment,
    );
    expect(completed.outcome?.state).toBe('completed');
    expect(fs.readFileSync(path.join(workspaceRoot, 'out.txt'), 'utf8')).toBe('approved content');
    expect(order).toEqual(['a', 'b']);

    const replay = resumed.harness.replay(thread.id);
    const toolCalls = replay.items
      .filter((item) => item.kind === 'tool-call')
      .map((item) => String(item.payload.callId));
    expect(new Set(toolCalls).size).toBe(toolCalls.length); // no repeated execution
    expect(replay.items.map((item) => item.kind)).toContain('approval-decision');
    expect(replay.items.map((item) => item.sequence)).toEqual(replay.items.map((_, index) => index + 1));
    expect(replay.items.at(-1)?.kind).toBe('final-outcome');
    resumed.store.close();
  });

  it('resolution is idempotent — a repeated decision never re-executes the tool', async () => {
    const { dbPath, workspaceRoot, environment } = setup();
    const order: string[] = [];
    const tools = new ToolRuntime(approvalPolicy);
    tools.register(recordingTool('test.echo', order));
    tools.register(new FilesystemWriteTool(new FilesystemRuntime({ rootDir: workspaceRoot })));
    const responses = [
      response('', [
        { id: 'call-a', name: 'test.echo', arguments: JSON.stringify({ id: 'a' }) },
        { id: 'call-w', name: 'filesystem.write', arguments: JSON.stringify({ path: 'once.txt', content: 'once' }) },
      ]),
      response('Done.'),
    ];
    const aiProvider = provider(async () => responses.shift() ?? response('Done'));
    const { store, harness } = await createHarness(dbPath, aiProvider, tools);
    const thread = harness.createThread({ taskId: 'TASK-IDEM', title: 'Idempotent', environment });
    const waiting = await harness.run({ threadId: thread.id, instruction: 'Write once', agentId: 'a', environment });
    const first = await harness.decideApproval(thread.id, waiting.approvalId as ApprovalRequestId, true, environment);
    expect(first.outcome?.state).toBe('completed');
    const before = fs.statSync(path.join(workspaceRoot, 'once.txt')).mtimeMs;
    const second = await harness.decideApproval(thread.id, waiting.approvalId as ApprovalRequestId, true, environment);
    expect(second.outcome?.state).toBe('completed');
    expect(fs.statSync(path.join(workspaceRoot, 'once.txt')).mtimeMs).toBe(before);
    expect(order).toEqual(['a']);
    store.close();
  });

  it('blocks the turn when an approval is rejected', async () => {
    const { dbPath, workspaceRoot, environment } = setup();
    const tools = new ToolRuntime(approvalPolicy);
    tools.register(new FilesystemWriteTool(new FilesystemRuntime({ rootDir: workspaceRoot })));
    const responses = [
      response('', [
        { id: 'call-w', name: 'filesystem.write', arguments: JSON.stringify({ path: 'no.txt', content: 'x' }) },
      ]),
    ];
    const aiProvider = provider(async () => responses.shift() ?? response('Done'));
    const { store, harness } = await createHarness(dbPath, aiProvider, tools);
    const thread = harness.createThread({ taskId: 'TASK-REJECT', title: 'Reject', environment });
    const waiting = await harness.run({ threadId: thread.id, instruction: 'Write', agentId: 'a', environment });
    const result = await harness.decideApproval(thread.id, waiting.approvalId as ApprovalRequestId, false, environment);
    expect(result.outcome?.state).toBe('blocked');
    expect(result.outcome?.reasonCode).toBe('approval-rejected');
    expect(fs.existsSync(path.join(workspaceRoot, 'no.txt'))).toBe(false);
    store.close();
  });

  it('blocks the turn when the iteration limit is reached', async () => {
    const { dbPath, environment } = setup();
    const order: string[] = [];
    const tools = new ToolRuntime();
    tools.register(recordingTool('test.echo', order));
    const aiProvider = provider(async () =>
      response('', [{ id: 'call-x', name: 'test.echo', arguments: JSON.stringify({ id: 'x' }) }]),
    );
    const { store, harness } = await createHarness(dbPath, aiProvider, tools, verifier, { maxIterations: 1 });
    const thread = harness.createThread({ taskId: 'TASK-LIMIT', title: 'Limit', environment });
    const result = await harness.run({ threadId: thread.id, instruction: 'Loop', agentId: 'a', environment });
    expect(result.outcome?.state).toBe('blocked');
    expect(result.outcome?.reasonCode).toBe('iteration-limit');
    store.close();
  });

  it('cancels during tool execution and exposes a durable run snapshot', async () => {
    const { dbPath, environment } = setup();
    const hang = hangingTool();
    const tools = new ToolRuntime();
    tools.register(hang.tool);
    const { store, harness } = await createHarness(
      dbPath,
      provider(async () => response('', [{ id: 'call-h', name: 'test.hang', arguments: JSON.stringify({ id: 'h' }) }])),
      tools,
    );
    const thread = harness.createThread({ taskId: 'TASK-HANG', title: 'Hang', environment });
    const running = harness.run({ threadId: thread.id, instruction: 'Hang', agentId: 'a', environment });
    await expect.poll(() => hang.started()).toBe(true);
    const snap = harness.snapshot(thread.id);
    expect(snap.runId).toBeTruthy();
    expect(snap.turnId).toBeTruthy();
    expect(harness.cancel(thread.id).state).toBe('cancelled');
    hang.release({ status: 'completed', evidence: [] });
    const result = await running;
    expect(result.outcome?.state).toBe('cancelled');
    expect(harness.replay(thread.id).items.at(-1)?.kind).toBe('final-outcome');
    store.close();
  });
});
