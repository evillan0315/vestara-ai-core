/**
 * AR-TOOLS-001 — tools in the Activity Room.
 *
 * Proves the durable mirror for tool lifecycle:
 * 1. Global Assistant adapter emits canonical `opencode.message.part.updated`
 *    (part.type=tool) to the EventBus on tool start/completion/failure, and
 *    stays a no-op without a bus (live SSE chunks unaffected).
 * 2. Agent-lifecycle bridge maps `harness.tool.*` → the same canonical event
 *    for M9 ingestion; `harness.tool.proposed` is excluded by design.
 * 3. Organizational bridge forwards `harness.tool.*` for legacy projection
 *    (the AgentMessageProjector already maps them to tool-call/tool-result).
 */

import type { CompletionRequest } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import { createAssistantOpenCodeExecutor } from '../src/assistant-opencode-adapter';
import { startActivityRoomOrganizationalBridge } from '../src/bridges/activity-room-organizational-bridge';
import { createAgentLifecycleBridge } from '../src/bridges/agent-lifecycle-bridge';

// ─── Stubs ───────────────────────────────────────────────────────

type Emitted = { type: string; source?: string; payload?: Record<string, unknown> };

function captureBus() {
  const emitted: Emitted[] = [];
  const handlers = new Map<string, (event: never) => unknown>();
  return {
    emitted,
    bus: {
      emit: async (event: Emitted) => {
        emitted.push(event);
      },
      subscribe: (pattern: string, handler: (event: never) => unknown) => {
        handlers.set(pattern, handler);
        return () => {
          handlers.delete(pattern);
        };
      },
    },
    handlers,
  };
}

function toolStreamClient(sessionId: string) {
  return {
    createSession: async () => ({ id: `${sessionId}-fresh` }),
    getSession: async (id: string) => ({ id }),
    sendMessageAsync: async () => undefined,
    openEventStream: async function* () {
      yield {
        type: 'session.next.tool.called',
        payload: { sessionID: sessionId, callID: 'call-1', tool: 'read' },
      };
      yield {
        type: 'session.next.tool.success',
        payload: {
          sessionID: sessionId,
          callID: 'call-1',
          tool: 'read',
          content: [{ type: 'text', text: 'file contents' }],
        },
      };
      yield { type: 'session.status', payload: { sessionID: sessionId, status: { type: 'idle' } } };
    },
    abortSession: async () => true,
    getSessionDiff: async () => [],
    getSessionTodos: async () => [],
  };
}

function userRequest(): CompletionRequest {
  return {
    model: 'model-a',
    provider: 'provider-a',
    messages: [{ role: 'user' as const, content: 'list the files' }],
    conversationId: 'conv-ar-tools',
  } as CompletionRequest;
}

// ─── 1: adapter mirror ───────────────────────────────────────────

describe('AR-TOOLS-001 adapter mirror', () => {
  it('emits canonical part.updated for tool start + success', async () => {
    const { emitted, bus } = captureBus();
    const registry = {
      set: () => undefined,
      acquire: async () => ({
        session: { sessionId: 'oc-tools', repositoryDir: '/repo', createdAt: new Date().toISOString() },
        created: false,
      }),
    };
    const executor = createAssistantOpenCodeExecutor({
      client: toolStreamClient('oc-tools') as never,
      workspaceId: 'workspace-1',
      directory: '/repo',
      agent: 'vestara-assistant',
      resolveProviderModel: async () => undefined,
      sessionRegistry: registry as never,
      eventBus: bus as never,
    });
    await executor.complete(userRequest());
    const mirrored = emitted.filter((e) => e.type === 'opencode.message.part.updated');
    expect(mirrored).toHaveLength(2);
    expect(mirrored[0].source).toBe('assistant-opencode-adapter');
    expect(mirrored[0].payload?.part).toMatchObject({
      type: 'tool',
      callID: 'call-1',
      tool: 'read',
      state: { status: 'running' },
    });
    expect(mirrored[1].payload?.part).toMatchObject({
      type: 'tool',
      callID: 'call-1',
      tool: 'read',
      state: { status: 'completed' },
    });
  });

  it('is a no-op without a bus (turn still completes)', async () => {
    const executor = createAssistantOpenCodeExecutor({
      client: toolStreamClient('oc-nobus') as never,
      workspaceId: 'workspace-1',
      directory: '/repo',
      agent: 'vestara-assistant',
      resolveProviderModel: async () => undefined,
    });
    const response = await executor.complete(userRequest());
    expect(response.content).toBeDefined();
  });
});

// ─── 2: lifecycle bridge ─────────────────────────────────────────

describe('AR-TOOLS-001 lifecycle bridge', () => {
  function bridgedBus() {
    const capture = captureBus();
    createAgentLifecycleBridge({
      eventBus: capture.bus as never,
      agentModelResolver: { resolve: async () => undefined },
    });
    return capture;
  }

  it('maps harness.tool.completed to canonical part.updated', async () => {
    const capture = bridgedBus();
    const handler = capture.handlers.get('harness.*');
    expect(handler).toBeDefined();
    await handler?.({
      id: 'evt-tool-1',
      type: 'harness.tool.completed',
      timestamp: new Date().toISOString(),
      actor: { id: 'agent-developer' },
      payload: {
        agentId: 'agent-developer',
        threadId: 'thread-1',
        turnId: 'turn-1',
        callId: 'call-9',
        toolName: 'read',
        correlationId: 'corr-1',
      },
    } as never);
    const mirrored = capture.emitted.filter((e) => e.type === 'opencode.message.part.updated');
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0].source).toBe('agent-lifecycle-bridge');
    expect(mirrored[0].payload?.part).toMatchObject({
      type: 'tool',
      callID: 'call-9',
      tool: 'read',
      state: { status: 'completed' },
    });
  });

  it('excludes harness.tool.proposed (durable fact starts at execution)', async () => {
    const capture = bridgedBus();
    const handler = capture.handlers.get('harness.*');
    await handler?.({
      id: 'evt-tool-proposed',
      type: 'harness.tool.proposed',
      timestamp: new Date().toISOString(),
      actor: { id: 'agent-developer' },
      payload: { agentId: 'agent-developer', callId: 'call-10', toolName: 'read' },
    } as never);
    expect(capture.emitted).toHaveLength(0);
  });
});

// ─── 3: organizational bridge ────────────────────────────────────

describe('AR-TOOLS-001 organizational bridge', () => {
  it('forwards harness.tool.started for legacy projection', async () => {
    const capture = captureBus();
    const projected: Array<Record<string, unknown>> = [];
    startActivityRoomOrganizationalBridge({
      eventBus: capture.bus as never,
      threadStore: { getThread: () => undefined },
      room: { service: { project: async (e: Record<string, unknown>) => void projected.push(e) } } as never,
    });
    const handler = capture.handlers.get('*');
    expect(handler).toBeDefined();
    await handler?.({
      id: 'evt-org-tool',
      type: 'harness.tool.started',
      timestamp: new Date().toISOString(),
      actor: { id: 'agent-developer', role: 'agent' },
      payload: { threadId: 'thread-1', turnId: 'turn-1', callId: 'call-7', toolName: 'bash' },
    } as never);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({ type: 'harness.tool.started', actorId: 'agent-developer' });
  });
});
