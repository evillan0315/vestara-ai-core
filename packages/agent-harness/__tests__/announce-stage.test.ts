import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { InProcessEventBus } from '@vestara/event-bus';
import type { AIModel, AIProvider, CompletionResponse } from '@vestara/shared';
import { FileThreadStore } from '@vestara/thread-runtime';
import { ToolRuntime } from '@vestara/tool-runtime';
import type { AgentEnvironment, HarnessVerificationResult } from '@vestara/types';
import { afterAll, describe, expect, it } from 'vitest';

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

function provider(): AIProvider {
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
        content: 'Done.',
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

describe('AgentHarnessRuntime.announceStage', () => {
  it('emits harness.stage.* events that the workflow projection can consume', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-harness-stage-'));
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
    const bus = new InProcessEventBus();
    const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
    bus.subscribe('harness.*', (event) => {
      emitted.push({ type: event.type, payload: event.payload as Record<string, unknown> });
    });
    const { AgentHarnessRuntime: Harness } = await import('@vestara/agent-harness');
    const store = await FileThreadStore.open(path.join(directory, 'threads.db'));
    const harness = new Harness({
      store,
      provider: provider(),
      model: model.id,
      tools: new ToolRuntime(),
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
      eventBus: bus,
    });
    const thread = harness.createThread({ taskId: 'T', title: 'Stage', environment });
    const running = harness.run({ threadId: thread.id, instruction: 'Do work', agentId: 'dev', environment });

    await harness.announceStage(thread.id, 'execution', 'started');
    await harness.announceStage(thread.id, 'execution', 'completed');

    const stageEvents = emitted.filter((event) => event.type.startsWith('harness.stage.'));
    expect(stageEvents.map((event) => event.type).sort()).toEqual(['harness.stage.completed', 'harness.stage.started']);
    expect(stageEvents.every((event) => event.payload.stageId === 'execution')).toBe(true);
    expect(stageEvents.every((event) => event.payload.runId)).toBeTruthy();
    expect(stageEvents.every((event) => event.payload.threadId === thread.id)).toBe(true);

    await running;
    store.close();
  });
});
