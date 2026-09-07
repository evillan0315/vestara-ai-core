/**
 * GA-RUNTIME-001 — Conversation Continuity & Provider/Model Turn Binding.
 *
 * Deterministic regression suite (section N) + addendum B capability coverage.
 * Proves with mocked OpenCode clients:
 * - conversationId → { sessionId, repositoryDir } mapping ownership
 * - single-flight session creation for concurrent first turns
 * - repository binding immutability (fail-safe, never silent rebind)
 * - session reuse across turns; provider/model change does NOT create a session
 * - per-turn execution binding on prompt_async (model/provider on the prompt)
 * - response projection metadata reflects the ACTUAL binding (immutable history)
 * - capability policy preserved across turns and models
 * - interactive ASK: permission approval/denial round-trip over the broker
 * - question round-trip
 * - cancel safety: non-idle turn exit settles the OpenCode session (abort)
 * - title stability: createSession once with the first-turn title
 */

import type { ProviderExecutor } from '@vestara/conversation';
import type { OpenCodeHttpClient } from '@vestara/opencode-runtime';
import type { CompletionRequest, StreamChunk } from '@vestara/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantBindingError, createAssistantBindingResolver } from '../src/assistant-binding-resolver';
import { createDefaultAssistantPolicy } from '../src/assistant-capability-policy';
import { AssistantConversationSessionRegistry } from '../src/assistant-conversation-sessions';
import { AssistantInteractionBroker } from '../src/assistant-interaction-broker';
import { createAssistantOpenCodeExecutor, runAssistantOpenCodeTurn } from '../src/assistant-opencode-adapter';

// ── Test doubles ───────────────────────────────────────────────────────────

function sseEvent(id: string, type: string, payload: Record<string, unknown>, sessionID = 'sess-reused') {
  return { id, type, timestamp: new Date().toISOString(), payload: { sessionID, ...payload } };
}

/** Let the turn's async generator reach its broker await before deciding. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

interface MockClient extends Partial<OpenCodeHttpClient> {
  createSession: ReturnType<typeof vi.fn>;
  sendMessageAsync: ReturnType<typeof vi.fn>;
  openEventStream: ReturnType<typeof vi.fn>;
  abortSession: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
  getSessionDiff: ReturnType<typeof vi.fn>;
  getSessionTodos: ReturnType<typeof vi.fn>;
  respondToPermission: ReturnType<typeof vi.fn>;
  replyToQuestion: ReturnType<typeof vi.fn>;
  rejectQuestion: ReturnType<typeof vi.fn>;
}

function makeClient(options: { sessions?: string[]; events?: ReturnType<typeof sseEvent>[] } = {}): MockClient {
  const sessions = options.sessions ?? ['sess-reused'];
  const events = options.events ?? [sseEvent('idle', 'session.status', { status: { type: 'idle' } })];
  async function* stream() {
    for (const ev of events) yield ev;
  }
  return {
    createSession: vi.fn(async (input: { title: string }) => ({ id: sessions[0] as string, title: input.title })),
    sendMessageAsync: vi.fn(async () => undefined),
    openEventStream: stream as unknown as MockClient['openEventStream'],
    abortSession: vi.fn(async () => true),
    getSession: vi.fn(async (id: string) => {
      if (sessions.includes(id)) return { id };
      throw new Error(`Session not found: ${id}`);
    }),
    getSessionDiff: vi.fn(async () => []),
    getSessionTodos: vi.fn(async () => []),
    respondToPermission: vi.fn(async () => true),
    replyToQuestion: vi.fn(async () => true),
    rejectQuestion: vi.fn(async () => true),
  };
}

function makeRequest(overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    model: 'muse-spark-1.3-contributor',
    provider: 'opencode-go',
    conversationId: 'conv-1',
    messages: [{ role: 'user', content: 'Remember the exact word ORCHID-731.' }],
    ...overrides,
  };
}

async function collect(executor: ProviderExecutor, request: CompletionRequest): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = [];
  for await (const item of executor.stream(request)) chunks.push(item);
  return chunks;
}

const POLICY = createDefaultAssistantPolicy('/repo');

afterEach(() => {
  vi.restoreAllMocks();
});

// ── B/C. conversationId → session mapping + single-flight ──────────────────

describe('GA-RUNTIME-001: conversation session registry', () => {
  it('single-flight: concurrent first turns create exactly ONE session', async () => {
    const registry = new AssistantConversationSessionRegistry();
    let createCount = 0;
    const results = await Promise.all([
      registry.acquire({
        conversationId: 'conv-1',
        repositoryDir: '/repo',
        createSession: async () => {
          createCount += 1;
          return 'sess-single';
        },
        verifySession: async () => false,
      }),
      registry.acquire({
        conversationId: 'conv-1',
        repositoryDir: '/repo',
        createSession: async () => {
          createCount += 1;
          return 'sess-single';
        },
        verifySession: async () => false,
      }),
      registry.acquire({
        conversationId: 'conv-1',
        repositoryDir: '/repo',
        createSession: async () => {
          createCount += 1;
          return 'sess-single';
        },
        verifySession: async () => false,
      }),
    ]);
    expect(createCount).toBe(1);
    expect(new Set(results.map((r) => r.session.sessionId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(registry.count()).toBe(1);
  });

  it('distinct conversations never share a session', async () => {
    const registry = new AssistantConversationSessionRegistry();
    const a = await registry.acquire({
      conversationId: 'conv-a',
      repositoryDir: '/repo',
      createSession: async () => 'sess-a',
      verifySession: async () => false,
    });
    const b = await registry.acquire({
      conversationId: 'conv-b',
      repositoryDir: '/repo',
      createSession: async () => 'sess-b',
      verifySession: async () => false,
    });
    expect(a.session.sessionId).not.toBe(b.session.sessionId);
    expect(registry.count()).toBe(2);
  });

  it('repository binding cannot change underneath a conversation (fail-safe)', async () => {
    const registry = new AssistantConversationSessionRegistry();
    await registry.acquire({
      conversationId: 'conv-1',
      repositoryDir: '/repo',
      createSession: async () => 'sess-1',
      verifySession: async () => false,
    });
    await expect(
      registry.acquire({
        conversationId: 'conv-1',
        repositoryDir: '/other/repo',
        createSession: async () => 'sess-wrong',
        verifySession: async () => false,
      }),
    ).rejects.toThrow(/Repository directory is immutable/);
    // The original binding is untouched.
    expect(registry.get('conv-1')?.sessionId).toBe('sess-1');
  });

  it('reuse returns the existing session without calling createSession', async () => {
    const registry = new AssistantConversationSessionRegistry();
    const createSession = vi.fn(async () => 'sess-1');
    await registry.acquire({
      conversationId: 'conv-1',
      repositoryDir: '/repo',
      createSession,
      verifySession: async () => false,
    });
    createSession.mockClear();
    const second = await registry.acquire({
      conversationId: 'conv-1',
      repositoryDir: '/repo',
      createSession,
      verifySession: async () => false,
    });
    expect(second.created).toBe(false);
    expect(second.session.sessionId).toBe('sess-1');
    expect(createSession).not.toHaveBeenCalled();
  });

  it('adopts a persisted preferred session when the runtime still owns it', async () => {
    const registry = new AssistantConversationSessionRegistry();
    const createSession = vi.fn(async () => 'sess-new');
    const result = await registry.acquire({
      conversationId: 'conv-1',
      repositoryDir: '/repo',
      preferredSessionId: 'sess-persisted',
      createSession,
      verifySession: async () => true,
    });
    expect(result.created).toBe(false);
    expect(result.session.sessionId).toBe('sess-persisted');
    expect(createSession).not.toHaveBeenCalled();
  });

  it('recreates when a persisted preferred session is no longer alive', async () => {
    const registry = new AssistantConversationSessionRegistry();
    const result = await registry.acquire({
      conversationId: 'conv-1',
      repositoryDir: '/repo',
      preferredSessionId: 'sess-dead',
      createSession: async () => 'sess-new',
      verifySession: async () => false,
    });
    expect(result.created).toBe(true);
    expect(result.session.sessionId).toBe('sess-new');
  });
});

// ── E/D. session reuse + per-turn execution binding on the prompt ──────────

describe('GA-RUNTIME-001: adapter session reuse + turn binding', () => {
  it('reuses the same OpenCode session across turns (createSession called once)', async () => {
    const client = makeClient();
    const registry = new AssistantConversationSessionRegistry();
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      sessionRegistry: registry,
      resolveProviderModel: async (model, provider) => ({
        providerID: provider ?? 'opencode-go',
        modelID: model ?? 'm',
      }),
      capabilityPolicy: POLICY,
    });
    await collect(executor, makeRequest({ model: 'deepseek-v4-flash', provider: 'deepseek' }));
    await collect(executor, makeRequest({ model: 'muse-spark-1.3-contributor', provider: 'opencode-go' }));
    expect(client.createSession).toHaveBeenCalledTimes(1);
    expect(client.sendMessageAsync).toHaveBeenCalledTimes(2);
    const sessions = client.sendMessageAsync.mock.calls.map((call) => call[0]);
    expect(sessions[0]).toBe(sessions[1]);
  });

  it('provider/model change rides the prompt — never a new session', async () => {
    const client = makeClient();
    const registry = new AssistantConversationSessionRegistry();
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      sessionRegistry: registry,
      resolveProviderModel: async (model, provider) => ({ providerID: provider ?? 'x', modelID: model ?? 'm' }),
      capabilityPolicy: POLICY,
    });
    await collect(executor, makeRequest({ model: 'deepseek-v4-flash', provider: 'deepseek' }));
    await collect(executor, makeRequest({ model: 'muse-spark-1.3-contributor', provider: 'opencode-go' }));
    const firstBody = client.sendMessageAsync.mock.calls[0]?.[1] as { model?: { providerId: string; modelId: string } };
    const secondBody = client.sendMessageAsync.mock.calls[1]?.[1] as {
      model?: { providerId: string; modelId: string };
    };
    // The prompt_async body carries the per-turn execution binding (lowercase
    // async input contract: { providerId, modelId }).
    expect(firstBody.model).toEqual({ providerId: 'deepseek', modelId: 'deepseek-v4-flash' });
    expect(secondBody.model).toEqual({ providerId: 'opencode-go', modelId: 'muse-spark-1.3-contributor' });
    // Agent is always vestara-assistant on the prompt.
    expect(firstBody.agent).toBe('vestara-assistant');
  });

  it('emits runtimeSessionId metadata so the service can persist it', async () => {
    const client = makeClient({
      events: [
        sseEvent('d1', 'message.part.delta', { delta: 'hi' }),
        sseEvent('idle', 'session.status', { status: { type: 'idle' } }),
      ],
    });
    const registry = new AssistantConversationSessionRegistry();
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      sessionRegistry: registry,
      capabilityPolicy: POLICY,
    });
    const chunks = await collect(executor, makeRequest());
    const withSession = chunks.filter((c) => c.metadata?.runtimeSessionId);
    expect(withSession.length).toBeGreaterThan(0);
    expect(withSession[0]!.metadata!.runtimeSessionId).toBe('sess-reused');
  });

  it('delta metadata projects the ACTUAL execution binding (H)', async () => {
    const client = makeClient({
      events: [
        sseEvent('d1', 'message.part.delta', { delta: 'hello' }),
        sseEvent('idle', 'session.status', { status: { type: 'idle' } }),
      ],
    });
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      resolveProviderModel: async () => ({ providerID: 'opencode-go', modelID: 'muse-spark-1.3-contributor' }),
      capabilityPolicy: POLICY,
    });
    const chunks = await collect(executor, makeRequest());
    const delta = chunks.find((c) => c.type === 'text');
    expect(delta?.metadata?.provider).toBe('opencode-go');
    expect(delta?.metadata?.model).toBe('muse-spark-1.3-contributor');
  });

  it('title is set once on creation and never renamed on reuse (J)', async () => {
    const client = makeClient();
    const registry = new AssistantConversationSessionRegistry();
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      sessionRegistry: registry,
      capabilityPolicy: POLICY,
    });
    await collect(executor, makeRequest());
    await collect(executor, makeRequest({ messages: [{ role: 'user', content: 'What did I say?' }] }));
    expect(client.createSession).toHaveBeenCalledTimes(1);
    const createInput = client.createSession.mock.calls[0]?.[0] as { title?: string };
    expect(createInput.title).toBe('Remember the exact word ORCHID-731.');
  });
});

// ── G. server-authoritative binding resolution ─────────────────────────────

describe('GA-RUNTIME-001: binding resolver', () => {
  function clientWithProviders(providers: Array<{ id: string; models: string[] }>) {
    return { listProviders: vi.fn(async () => providers) } as unknown as OpenCodeHttpClient;
  }

  const DISCOVERED = [
    { id: 'opencode-go', models: ['muse-spark-1.3-contributor', 'deepseek-v4-flash'] },
    { id: 'opencode', models: ['nemotron-3-ultra-free'] },
  ];

  it('resolves a valid requested provider/model', async () => {
    const resolver = createAssistantBindingResolver(clientWithProviders(DISCOVERED), undefined);
    const binding = await resolver.resolve({ providerId: 'opencode-go', modelId: 'muse-spark-1.3-contributor' });
    expect(binding).toEqual({ providerID: 'opencode-go', modelID: 'muse-spark-1.3-contributor' });
  });

  it('rejects an unknown provider deterministically', async () => {
    const resolver = createAssistantBindingResolver(clientWithProviders(DISCOVERED), undefined);
    await expect(resolver.resolve({ providerId: 'not-a-provider', modelId: 'x' })).rejects.toMatchObject({
      code: 'provider-not-found',
    });
  });

  it('rejects a model not offered by the provider deterministically', async () => {
    const resolver = createAssistantBindingResolver(clientWithProviders(DISCOVERED), undefined);
    await expect(resolver.resolve({ providerId: 'opencode-go', modelId: 'nonexistent-model' })).rejects.toMatchObject({
      code: 'model-not-found',
    });
  });

  it('falls back to the configured default when no request is made', async () => {
    const resolver = createAssistantBindingResolver(clientWithProviders(DISCOVERED), {
      providerID: 'opencode',
      modelID: 'nemotron-3-ultra-free',
    });
    const binding = await resolver.resolve();
    expect(binding).toEqual({ providerID: 'opencode', modelID: 'nemotron-3-ultra-free' });
  });

  it('fails deterministically when the runtime is unreachable', async () => {
    const resolver = createAssistantBindingResolver(
      { listProviders: async () => Promise.reject(new Error('ECONNREFUSED')) } as unknown as OpenCodeHttpClient,
      undefined,
    );
    await expect(resolver.resolve({ providerId: 'x', modelId: 'y' })).rejects.toMatchObject({
      code: 'runtime-unavailable',
    });
    expect(() => new AssistantBindingError('provider-not-found', 'msg', { providerId: 'p' })).not.toThrow();
  });
});

// ── L. cancel safety ───────────────────────────────────────────────────────

describe('GA-RUNTIME-001: cancel safety (L)', () => {
  it('a turn that ends without idle settles the session via abort', async () => {
    const client = makeClient({
      events: [sseEvent('delta', 'message.part.delta', { delta: 'partial' })], // no idle
    });
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      capabilityPolicy: POLICY,
    });
    await collect(executor, makeRequest());
    expect(client.abortSession).toHaveBeenCalled();
    expect(client.abortSession.mock.calls[0]?.[0]).toBe('sess-reused');
  });

  it('a turn that reaches idle does NOT abort (natural completion)', async () => {
    const client = makeClient();
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      capabilityPolicy: POLICY,
    });
    await collect(executor, makeRequest());
    expect(client.abortSession).not.toHaveBeenCalled();
  });
});

// ── B. interactive ASK permissions + questions over the broker ─────────────

describe('GA-RUNTIME-001 B: interactive permission/question decisions', () => {
  it('ASK permission approval (once) resolves the broker and responds to OpenCode', async () => {
    const client = makeClient({
      events: [
        sseEvent('perm', 'permission.v2.asked', {
          id: 'perm-1',
          action: 'edit',
          resources: ['README.md'],
        }),
        sseEvent('idle', 'session.status', { status: { type: 'idle' } }),
      ],
    });
    const broker = new AssistantInteractionBroker();
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      capabilityPolicy: POLICY,
      interactionBroker: broker,
    });
    const streamPromise = collect(executor, makeRequest());
    await settle(); // let the turn register the pending permission
    const decided = broker.decidePermission('conv-1', 'perm-1', { decision: 'approve', scope: 'once' });
    expect(decided).toBe(true);
    const chunks = await streamPromise;
    const perm = chunks.filter((c) => c.detail?.kind === 'permission');
    expect(perm.some((c) => c.content?.startsWith('Approved'))).toBe(true);
    expect(client.respondToPermission).toHaveBeenCalledWith(
      'sess-reused',
      'perm-1',
      expect.objectContaining({ decision: 'approve', scope: 'once' }),
      expect.anything(),
    );
  });

  it('ASK permission denial resolves and responds reject', async () => {
    const client = makeClient({
      events: [
        sseEvent('perm', 'permission.v2.asked', { id: 'perm-2', action: 'bash', resources: ['pnpm test'] }),
        sseEvent('idle', 'session.status', { status: { type: 'idle' } }),
      ],
    });
    const broker = new AssistantInteractionBroker();
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      capabilityPolicy: POLICY,
      interactionBroker: broker,
    });
    const streamPromise = collect(executor, makeRequest());
    await settle();
    broker.decidePermission('conv-1', 'perm-2', { decision: 'reject', reason: 'No' });
    const chunks = await streamPromise;
    expect(chunks.some((c) => c.content?.startsWith('Denied'))).toBe(true);
    expect(client.respondToPermission).toHaveBeenCalledWith(
      'sess-reused',
      'perm-2',
      expect.objectContaining({ decision: 'reject' }),
      expect.anything(),
    );
  });

  it('ALLOW policy auto-approves without awaiting a decision', async () => {
    const client = makeClient({
      events: [
        sseEvent('perm', 'permission.v2.asked', { id: 'perm-3', action: 'read', resources: ['package.json'] }),
        sseEvent('idle', 'session.status', { status: { type: 'idle' } }),
      ],
    });
    const broker = new AssistantInteractionBroker();
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      capabilityPolicy: POLICY,
      interactionBroker: broker,
    });
    const chunks = await collect(executor, makeRequest());
    expect(client.respondToPermission).toHaveBeenCalledWith(
      'sess-reused',
      'perm-3',
      expect.objectContaining({ decision: 'approve' }),
      expect.anything(),
    );
    expect(chunks.some((c) => c.content?.startsWith('Auto-approved'))).toBe(true);
  });

  it('unknown actions are denied by the capability policy (never auto-authorized)', async () => {
    const client = makeClient({
      events: [
        sseEvent('perm', 'permission.v2.asked', { id: 'perm-4', action: 'mystery-tool', resources: [] }),
        sseEvent('idle', 'session.status', { status: { type: 'idle' } }),
      ],
    });
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      capabilityPolicy: POLICY,
    });
    const chunks = await collect(executor, makeRequest());
    expect(client.respondToPermission).toHaveBeenCalledWith(
      'sess-reused',
      'perm-4',
      expect.objectContaining({ decision: 'reject' }),
      expect.anything(),
    );
  });

  it('question round-trip: question projected, answer replied to OpenCode', async () => {
    const client = makeClient({
      events: [
        sseEvent('q', 'question.v2.asked', {
          id: 'q-1',
          questions: [{ question: 'Run the tests?', options: [{ label: 'Yes' }, { label: 'No' }] }],
        }),
        sseEvent('idle', 'session.status', { status: { type: 'idle' } }),
      ],
    });
    const broker = new AssistantInteractionBroker();
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      capabilityPolicy: POLICY,
      interactionBroker: broker,
    });
    const streamPromise = collect(executor, makeRequest());
    await settle();
    const decided = broker.decideQuestion('conv-1', 'q-1', { answers: [['Yes']] });
    expect(decided).toBe(true);
    await streamPromise;
    expect(client.replyToQuestion).toHaveBeenCalledWith('sess-reused', 'q-1', { answers: [['Yes']] });
  });

  it('question with no timely answer is rejected fail-safe', async () => {
    const client = makeClient({
      events: [
        sseEvent('q', 'question.v2.asked', { id: 'q-2', questions: [{ question: 'Proceed?' }] }),
        sseEvent('idle', 'session.status', { status: { type: 'idle' } }),
      ],
    });
    const broker = new AssistantInteractionBroker();
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      capabilityPolicy: POLICY,
      interactionBroker: broker,
    });
    const streamPromise = collect(executor, makeRequest());
    await settle();
    // The user dismisses (no valid answer selection) → fail-safe reject.
    const decided = broker.decideQuestion('conv-1', 'q-2', { answers: [] });
    expect(decided).toBe(true);
    await streamPromise;
    expect(client.rejectQuestion).toHaveBeenCalledWith('sess-reused', 'q-2');
  });
});

// ── N. conversation service persistence contract ───────────────────────────

describe('GA-RUNTIME-001: conversation service session persistence', () => {
  it('persists the emitted runtime session id after a streamed turn', async () => {
    const client = makeClient({
      events: [
        sseEvent('d1', 'message.part.delta', { delta: 'hi' }),
        sseEvent('idle', 'session.status', { status: { type: 'idle' } }),
      ],
    });
    const registry = new AssistantConversationSessionRegistry();
    const executor = createAssistantOpenCodeExecutor({
      client: client as unknown as OpenCodeHttpClient,
      workspaceId: 'ws',
      directory: '/repo',
      agent: 'vestara-assistant',
      sessionRegistry: registry,
      capabilityPolicy: POLICY,
    });
    // DefaultConversationService wiring is covered by conversations.test.ts;
    // here we prove the chunk contract the service consumes.
    const chunks = await collect(executor, makeRequest({ conversationId: 'conv-1' }));
    const meta = chunks.map((c) => c.metadata?.runtimeSessionId).find(Boolean);
    expect(meta).toBe('sess-reused');
  });

  it('runAssistantOpenCodeTurn without a session id creates one (single-turn path)', async () => {
    const client = makeClient({
      sessions: ['sess-created'],
      events: [
        sseEvent('d1', 'message.part.delta', { delta: 'hi' }, 'sess-created'),
        sseEvent('idle', 'session.status', { status: { type: 'idle' } }, 'sess-created'),
      ],
    });
    const chunks: StreamChunk[] = [];
    for await (const item of runAssistantOpenCodeTurn(
      {
        client: client as unknown as OpenCodeHttpClient,
        workspaceId: 'ws',
        directory: '/repo',
        agent: 'vestara-assistant',
        capabilityPolicy: POLICY,
      },
      makeRequest(),
    )) {
      chunks.push(item);
    }
    expect(client.createSession).toHaveBeenCalledTimes(1);
    expect(chunks.length).toBeGreaterThan(0);
  });
});
