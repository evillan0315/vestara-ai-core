import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentHarnessRuntime, type HarnessContextAssembler, type HarnessVerifier } from '@vestara/agent-harness';
import { InProcessEventBus } from '@vestara/event-bus';
import type { AIProvider, CompletionRequest, CompletionResponse } from '@vestara/shared';
import { FileThreadStore } from '@vestara/thread-runtime';
import { ToolRuntime } from '@vestara/tool-runtime';
import type { AgentEnvironment, AgentEnvironmentId, HarnessVerificationResult } from '@vestara/types';
import { afterEach, describe, expect, it } from 'vitest';
import { createActivityRoom } from '../src/activity-room.js';
import { startActivityRoomOrganizationalBridge } from '../src/bridges/activity-room-organizational-bridge.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'act-bridge-e2e-'));
  directories.push(directory);
  const workspaceRoot = path.join(directory, 'ws');
  fs.mkdirSync(workspaceRoot);
  fs.writeFileSync(path.join(workspaceRoot, 'README.md'), 'x');
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

const model = {
  id: 'model-test',
  provider: 'test',
  name: 'Test',
  contextWindow: 32_000,
  maxOutput: 4_000,
  capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
  status: 'available',
};

const context: HarnessContextAssembler = {
  async assemble({ thread }) {
    return `Task ${thread.taskId}`;
  },
};
const verifier: HarnessVerifier = {
  async verify(): Promise<HarnessVerificationResult> {
    return { status: 'passed', checks: [], evidence: [], uncoveredRisks: [], confidence: 0.9 };
  },
};

describe('harness execution-activity → bridge → room (real wiring)', () => {
  it('projects live SSE execution events through the actual harness emission path', async () => {
    const { dbPath, environment } = setup();
    const store = await FileThreadStore.open(dbPath);
    const eventBus = new InProcessEventBus();

    const provider: AIProvider = {
      id: 'provider-test',
      name: 'T',
      version: '1',
      status: 'available',
      models: [model],
      capabilities: { maxConcurrentRequests: 1, features: ['chat'] },
      async initialize() {},
      async complete(request: CompletionRequest): Promise<CompletionResponse> {
        request.onExecutionEvent?.({
          type: 'tool.started',
          state: 'active',
          activity: 'filesystem.write proof.md',
          at: '2026-08-12T10:00:00.000Z',
          sessionId: 'ses-1',
        });
        request.onExecutionEvent?.({
          type: 'agent.progress',
          state: 'reasoning',
          activity: 'creating the proof file…',
          at: '2026-08-12T10:00:01.000Z',
          sessionId: 'ses-1',
        });
        return {
          id: 'r-1',
          model: model.id,
          provider: 'provider-test',
          content: 'done',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
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

    const harness = new AgentHarnessRuntime({
      store,
      provider,
      model: model.id,
      tools: new ToolRuntime(),
      context,
      verifier,
      eventBus,
    });

    const thread = harness.createThread({
      taskId: 'task-1',
      title: 'Proof',
      environment,
      metadata: { workflowId: 'wf-live', agentId: 'agent-developer', role: 'developer', stageIndex: 1 },
    });

    const room = createActivityRoom();
    const threadStore = {
      getThread() {
        return { metadata: { workflowId: 'wf-live', agentId: 'agent-developer', role: 'developer' } };
      },
    };
    startActivityRoomOrganizationalBridge({
      eventBus: eventBus as never,
      threadStore: threadStore as never,
      room,
    });

    const busProbe: string[] = [];
    const unsubscribeProbe = eventBus.subscribe('*', (evt) => {
      if (
        (evt as { type: string }).type.startsWith('opencode.') ||
        (evt as { type: string }).type === 'harness.turn.started'
      ) {
        busProbe.push((evt as { type: string }).type);
      }
    });

    await harness.run({
      threadId: thread.id,
      instruction: 'create the proof file',
      agentId: 'agent-developer',
      environment,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    unsubscribeProbe();

    console.log('BUS EVENTS SEEN:', JSON.stringify(busProbe));
    const { records } = await room.store.list({});
    console.log(
      'ROOM RECORDS:',
      JSON.stringify(records.map((r) => ({ kind: r.kind, mk: r.messageKind ?? '', t: r.threadId }))),
    );
    // Direct projection probes: unique id vs correlation-colliding id
    const unique = await room.service.project({
      id: 'uniq-tool-1',
      type: 'harness.tool.started',
      at: '2026-08-12T10:00:00.000Z',
      actorId: 'a',
      authority: 'agent',
      workflowId: 'wf-live',
      threadId: thread.id,
      payload: { threadId: thread.id, toolName: 'filesystem.write u.md' },
    });
    console.log('UNIQUE ID PROJECT:', unique.length);
    const colliding = await room.service
      .project({
        id: 'same-correlation',
        type: 'harness.tool.started',
        at: '2026-08-12T10:00:00.000Z',
        actorId: 'a',
        authority: 'agent',
        workflowId: 'wf-live',
        threadId: thread.id,
        payload: { threadId: thread.id, toolName: 'filesystem.write c.md' },
      })
      .catch((e) => ({ threw: String(e) }));
    console.log('COLLIDING ID PROJECT:', JSON.stringify(colliding));
    // Exact duplicate id (same id projected twice) → expect duplicate handling
    const dup = await room.service
      .project({
        id: 'dup-probe',
        type: 'harness.model-response',
        at: '2026-08-12T10:00:00.000Z',
        actorId: 'a',
        authority: 'agent',
        workflowId: 'wf-live',
        threadId: thread.id,
        payload: { threadId: thread.id, content: 'first' },
      })
      .then(async () => {
        return room.service
          .project({
            id: 'dup-probe',
            type: 'harness.model-response',
            at: '2026-08-12T10:00:00.000Z',
            actorId: 'a',
            authority: 'agent',
            workflowId: 'wf-live',
            threadId: thread.id,
            payload: { threadId: thread.id, content: 'second' },
          })
          .then((r) => ({ appended: r.length }))
          .catch((e) => ({ threw: String(e) }));
      });
    console.log('DUP PROBE:', JSON.stringify(dup));
    const kinds = records.map((r) => [r.kind, r.messageKind ?? '']);
    // The real harness emission path reaches the room: tool + progress records.
    expect(kinds).toContainEqual(['agent-message', 'tool-call']);
    expect(kinds).toContainEqual(['agent-message', 'model-response']);
  });
});

describe('session-stream coalescing (replay of captured live events)', () => {
  it('coalesces per-character deltas into one readable narrative, keeping semantic events distinct', async () => {
    const { SessionStreamAccumulator } = await import('../src/session-stream.js');
    const room = createActivityRoom();
    const streams = new SessionStreamAccumulator();
    const eventBus = new (await import('@vestara/event-bus')).InProcessEventBus();
    const threadStore = {
      getThread() {
        return { metadata: { workflowId: 'wf-replay', agentId: 'agent-developer', role: 'developer' } };
      },
    };
    const { startActivityRoomOrganizationalBridge } = await import(
      '../src/bridges/activity-room-organizational-bridge.js'
    );
    startActivityRoomOrganizationalBridge({
      eventBus: eventBus as never,
      threadStore: threadStore as never,
      room,
      streams,
    });

    const emit = (type: string, payload: Record<string, unknown>) =>
      eventBus.emit({ type, source: 'agent-harness', actor: { id: 'agent-developer', role: 'agent' }, payload });

    // 120 per-character deltas (like "streaming 1 chars" before the fix)
    for (let i = 0; i < 120; i++) {
      await emit('opencode.execution.activity', {
        threadId: 'thread-dev',
        turnId: 'turn-dev',
        type: 'agent.progress',
        state: 'reasoning',
        activity: 'H',
        at: `2026-08-12T10:00:${String(i % 60).padStart(2, '0')}.000Z`,
        sessionId: 'ses-dev',
      });
    }
    // A semantic boundary: tool invocation finalizes the narrative.
    await emit('opencode.execution.activity', {
      threadId: 'thread-dev',
      turnId: 'turn-dev',
      type: 'tool.started',
      state: 'active',
      activity: 'filesystem.write proof.md',
      at: '2026-08-12T10:02:00.000Z',
      sessionId: 'ses-dev',
    });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const { records } = await room.store.list({});
    const narrative = records.filter((r) => r.kind === 'agent-message' && r.messageKind === 'message');
    const tools = records.filter((r) => r.kind === 'agent-message' && r.messageKind === 'tool-call');
    // NOT 120 tiny cards: one coalesced narrative + the distinct tool record.
    expect(narrative).toHaveLength(1);
    if (narrative[0]?.kind === 'agent-message') {
      expect(narrative[0].content).toBe('H'.repeat(120));
    }
    expect(tools).toHaveLength(1);
    if (tools[0]?.kind === 'agent-message') {
      expect(tools[0].toolName).toContain('filesystem.write');
    }
  });
});
