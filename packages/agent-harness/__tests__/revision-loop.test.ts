import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { InProcessEventBus } from '@vestara/event-bus';
import type { AIModel, AIProvider, CompletionResponse } from '@vestara/shared';
import { FileThreadStore } from '@vestara/thread-runtime';
import { ToolRuntime } from '@vestara/tool-runtime';
import type { AgentEnvironment, HarnessVerificationResult } from '@vestara/types';
import { afterAll, describe, expect, it } from 'vitest';
import { AgentHarnessRuntime, type HarnessVerifier } from '../src/index.js';

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

function textProvider(): AIProvider {
  return {
    id: 'provider-test',
    name: 'Test Provider',
    version: '1.0.0',
    status: 'available',
    models: [model],
    capabilities: { maxConcurrentRequests: 1, features: ['chat'] },
    async initialize() {},
    async complete(): Promise<CompletionResponse> {
      return {
        id: `r-${Date.now()}`,
        model: model.id,
        provider: 'provider-test',
        content: 'Addressed feedback.',
        usage: {},
        latency: 1,
      };
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

const failedVerification: HarnessVerificationResult = {
  status: 'failed',
  checks: [{ id: 'check-1', name: 'Unit tests', status: 'failed', summary: '2 tests failed' }],
  evidence: [],
  uncoveredRisks: ['regression'],
  confidence: 0.2,
};
const passedVerification: HarnessVerificationResult = {
  status: 'passed',
  checks: [{ id: 'check-1', name: 'Unit tests', status: 'passed', summary: 'All green' }],
  evidence: [],
  uncoveredRisks: [],
  confidence: 0.95,
};

async function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-harness-revision-'));
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
  return { directory, workspaceRoot, environment, store };
}

describe('AgentHarnessRuntime — verification revision loop', () => {
  it('retries a failed verification and completes when the agent addresses the feedback', async () => {
    const { environment, store } = await setup();
    const bus = new InProcessEventBus();
    const revisions: Array<{ type: string; payload: Record<string, unknown> }> = [];
    bus.subscribe('harness.revision.*', (event) => {
      revisions.push({ type: event.type, payload: event.payload as Record<string, unknown> });
    });
    let verifierCalls = 0;
    const verifier: HarnessVerifier = {
      async verify() {
        verifierCalls += 1;
        return verifierCalls === 1 ? failedVerification : passedVerification;
      },
    };
    const harness = new AgentHarnessRuntime({
      store,
      provider: textProvider(),
      model: model.id,
      tools: new ToolRuntime(),
      context: {
        async assemble() {
          return 'ctx';
        },
      },
      verifier,
      eventBus: bus,
      maxRevisions: 3,
    });
    const thread = harness.createThread({ taskId: 'TASK-REV', title: 'Revision', environment });
    const result = await harness.run({
      threadId: thread.id,
      instruction: 'Fix the tests',
      agentId: 'dev',
      environment,
    });

    expect(result.outcome?.state).toBe('completed');
    expect(verifierCalls).toBe(2);
    const replay = harness.replay(thread.id);
    expect(replay.items.filter((item) => item.kind === 'revision-request')).toHaveLength(1);
    expect(revisions.filter((event) => event.type === 'harness.revision.requested')).toHaveLength(1);
    expect(revisions[0].payload.revisionNumber).toBe(1);
    store.close();
  });

  it('stops the loop after maxRevisions and finishes failed', async () => {
    const { environment, store } = await setup();
    const harness = new AgentHarnessRuntime({
      store,
      provider: textProvider(),
      model: model.id,
      tools: new ToolRuntime(),
      context: {
        async assemble() {
          return 'ctx';
        },
      },
      verifier: {
        async verify() {
          return failedVerification;
        },
      },
      maxRevisions: 1,
    });
    const thread = harness.createThread({ taskId: 'TASK-REV2', title: 'Always fail', environment });
    const result = await harness.run({ threadId: thread.id, instruction: 'Fix', agentId: 'dev', environment });

    expect(result.outcome?.state).toBe('failed');
    expect(result.outcome?.reasonCode).toBe('verification-failed');
    const replay = harness.replay(thread.id);
    expect(replay.items.filter((item) => item.kind === 'revision-request')).toHaveLength(1);
    expect(replay.items.at(-1)?.kind).toBe('final-outcome');
    store.close();
  });
});
