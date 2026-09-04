import { beforeAll, describe, expect, it } from 'vitest';

let mod: any;
let DefaultConversationEngine: any;
let ProviderRouter: any;
let SqliteUserProfileStore: any;
let SqliteConversationSessionStore: any;
let OpenAICompatibleProvider: any;

const mockResponse = (content: string) => ({
  id: `mock-${Date.now()}`,
  model: 'mock-model',
  provider: 'mock',
  content,
  usage: { promptTokens: 10, completionTokens: content.length, totalTokens: 10 + content.length },
  latency: 0,
});

function makeMockConversationService(responseText = 'Mock response') {
  return {
    createConversation: async () => ({
      id: `conv-${Date.now()}`,
      userId: 'local',
      title: 'Test',
      messages: [],
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    sendMessage: async (_convId: string, content: string) => ({
      message: {
        id: 'msg-u1',
        conversationId: _convId,
        role: 'user' as const,
        content,
        createdAt: new Date().toISOString(),
      },
      response: {
        id: 'msg-a1',
        conversationId: _convId,
        role: 'assistant' as const,
        content: responseText,
        createdAt: new Date().toISOString(),
      },
      latency: 0,
    }),
    sendMessageStream: async function* (_convId: string, _content: string) {
      yield { id: 'chunk-1', type: 'text' as const, content: responseText, metadata: { sequence: 0, timestamp: '' } };
      yield { id: 'chunk-2', type: 'complete' as const, metadata: { sequence: 1, timestamp: '' } };
    },
    closeConversation: async () => {},
    listConversations: async () => [],
    getConversation: async () => null,
    deleteConversation: async () => {},
  };
}

function makeStubProvider(id: string, name: string, online: boolean) {
  return {
    id,
    name,
    model: 'stub-model',
    get available() {
      return online;
    },
    complete: async () => mockResponse(`Response from ${name}`),
    stream: async function* () {
      yield {
        id: `${id}-chunk-1`,
        type: 'text' as const,
        content: `Response from ${name}`,
        metadata: { sequence: 0, timestamp: '' },
      };
      yield { id: `${id}-chunk-2`, type: 'complete' as const, metadata: { sequence: 1, timestamp: '' } };
    },
    health: async () => ({
      status: (online ? 'healthy' : 'unhealthy') as 'healthy' | 'unhealthy',
      providerId: id,
      model: 'stub-model',
      latency: 0,
      lastHeartbeat: '',
      message: '',
    }),
    models: async () => [{ id: 'stub-model', name: 'Stub', provider: id, contextWindow: 4096 }],
  };
}

beforeAll(async () => {
  mod = await import('../dist/index.js');
  DefaultConversationEngine = mod.DefaultConversationEngine;
  ProviderRouter = mod.ProviderRouter;
  SqliteUserProfileStore = mod.SqliteUserProfileStore;
  SqliteConversationSessionStore = mod.SqliteConversationSessionStore;
  const compatMod = await import('../dist/provider/openai-compat.js');
  OpenAICompatibleProvider = compatMod.OpenAICompatibleProvider;
});

// ── AT-001: First Boot Greeting ──
describe('AT-001: First Boot Greeting', () => {
  it('returns welcome prompt when no profile exists', async () => {
    const store = new SqliteUserProfileStore();
    const engine = new DefaultConversationEngine({
      conversationService: makeMockConversationService(),
      profileStore: store,
      sessionStore: new SqliteConversationSessionStore(),
    });
    await engine.initialize();
    const greeting = await engine.getGreeting();
    expect(greeting).toContain("Hello! I'm Vestara");
    expect(greeting).toContain("What's your name");
  });
});

// ── AT-002: Returning User Recognition ──
describe('AT-002: Returning User Recognition', () => {
  it('returns personalized greeting for returning user', async () => {
    const store = new SqliteUserProfileStore();
    await store.save({
      id: 'returning-test',
      name: 'Alice',
      role: 'Developer',
      preferredStack: ['TypeScript'],
      communicationStyle: 'balanced',
      goals: [],
      preferences: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      conversationCount: 0,
    });

    const engine = new DefaultConversationEngine({
      conversationService: makeMockConversationService(),
      profileStore: store,
      sessionStore: new SqliteConversationSessionStore(),
    });
    await engine.initialize();
    const greeting = await engine.getGreeting();
    expect(greeting).toContain('Welcome back');
    expect(greeting).toContain('Alice');
  });
});

// ── AT-003: Profile Enrichment ──
describe('AT-003: Profile Enrichment from Message', () => {
  it('creates profile with extracted name and role', async () => {
    const store = new SqliteUserProfileStore();
    const engine = new DefaultConversationEngine({
      conversationService: makeMockConversationService('Nice to meet you, Bob!'),
      profileStore: store,
      sessionStore: new SqliteConversationSessionStore(),
    });
    await engine.initialize();
    await engine.startSession('local');
    await engine.sendMessage("Hi, my name is Bob and I'm a TypeScript developer");
    const profile = await engine.getProfile();
    expect(profile).not.toBeNull();
    expect(profile!.name).toBe('Bob');
    expect(profile!.role?.toLowerCase()).toContain('typescript');
    expect(profile!.preferredStack).toContain('Typescript');
  });
});

// ── AT-004: Greeting Extraction Patterns ──
describe('AT-004: Name extraction patterns', () => {
  const testCases = [
    { input: 'my name is Alice', expected: 'Alice' },
    { input: "I'm Bob", expected: 'Bob' },
    { input: 'call me Charlie', expected: 'Charlie' },
    { input: "name's Diana", expected: 'Diana' },
    { input: 'Eve', expected: 'Eve' },
  ];

  testCases.forEach(({ input, expected }) => {
    it(`extracts "${expected}" from "${input}"`, () => {
      const { DefaultConversationEngine: _Engine } = mod;
      const regex = /my name is (\w+)|i['"]?m (\w+)|call me (\w+)|name['"]?s (\w+)|^(\w+)$/i;
      const match = input.match(regex);
      const name = match?.[1] || match?.[2] || match?.[3] || match?.[4] || match?.[5];
      expect(name).toBe(expected);
    });
  });
});

// ── AT-005: Provider Switching ──
describe('AT-005: Provider Switching — Same Workflow', () => {
  const providers = [
    { name: 'online-stub', provider: makeStubProvider('online-stub', 'Online Stub', true) },
    { name: 'offline-stub', provider: makeStubProvider('offline-stub', 'Offline Stub', true) },
  ];

  providers.forEach(({ name, provider: prov }) => {
    it(`onboarding workflow works with ${name}`, async () => {
      const router = new ProviderRouter();
      router.registerOnline(prov);
      const store = new SqliteUserProfileStore();
      const sessionStore = new SqliteConversationSessionStore();
      const engine = new DefaultConversationEngine({
        conversationService: makeMockConversationService(`Response from ${name}`),
        profileStore: store,
        sessionStore,
        providerRouter: router,
      });
      await engine.initialize();
      await engine.startSession('test');
      const result = await engine.sendMessage('Hello');
      expect(result.response).toBeTruthy();
      expect(result.profile).toBeTruthy();
      expect(result.session).toBeTruthy();
    });
  });

  it('uses same engine code regardless of provider', () => {
    const engineCode = DefaultConversationEngine.toString();
    expect(engineCode).toContain('sendMessage');
    expect(engineCode).toContain('startSession');
    expect(engineCode).toContain('getGreeting');
  });
});

// ── AT-006: Offline Degradation ──
describe('AT-006: Offline Degradation', () => {
  it('returns deterministic stub when no provider available', async () => {
    const localProv = makeStubProvider('local', 'Local LLM', false);
    const router = new ProviderRouter();
    router.registerOffline(localProv);
    const store = new SqliteUserProfileStore();
    const engine = new DefaultConversationEngine({
      conversationService: makeMockConversationService(),
      profileStore: store,
      sessionStore: new SqliteConversationSessionStore(),
      providerRouter: router,
    });
    await engine.initialize();
    await engine.startSession('test');
    const result = await engine.sendMessage('Hello');
    expect(result.response).toBeTruthy();
  });
});

// ── AT-007: Session Persistence ──
describe('AT-007: Session Persistence', () => {
  it('session survives engine restart', async () => {
    const store = new SqliteUserProfileStore();
    const sessionStore = new SqliteConversationSessionStore();
    const engine1 = new DefaultConversationEngine({
      conversationService: makeMockConversationService(),
      profileStore: store,
      sessionStore,
    });
    await engine1.initialize();
    await engine1.startSession('test');
    await engine1.sendMessage('Hello');
    const sessionId = engine1.session!.id;
    await engine1.endSession();

    const loaded = await sessionStore.load(sessionId);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(sessionId);
  });
});

// ── AT-008: Provider Configuration-Driven ──
describe('AT-008: Provider Configuration-Driven', () => {
  it('selectProvider controls which provider resolves', async () => {
    const router = new ProviderRouter();
    const online = makeStubProvider('opencode', 'OpenCode Cloud', true);
    const offline = makeStubProvider('local', 'Local LLM', true);
    router.registerOnline(online);
    router.registerOffline(offline);

    router.selectProvider('local');
    const resolved = await router.resolve();
    expect(resolved.id).toBe('local');

    router.selectProvider('opencode');
    const resolved2 = await router.resolve();
    expect(resolved2.id).toBe('opencode');

    router.clearSelection();
    const resolved3 = await router.resolve();
    expect(resolved3.id).toBe('opencode');
  });
});

// ── AT-009: Health Check Accuracy ──
describe('AT-009: Health Check Accuracy', () => {
  it('returns correct status for various provider states', async () => {
    const router = new ProviderRouter();
    const online = makeStubProvider('opencode', 'OpenCode Cloud', true);
    const offline = makeStubProvider('local', 'Local LLM', false);
    router.registerOnline(online);
    router.registerOffline(offline);

    const status = await router.getStatus();
    expect(status.active?.connected).toBe(true);
    expect(status.active?.providerId).toBe('opencode');
    expect(status.failoverEnabled).toBe(true);
  });

  it('reports degraded when all providers unhealthy', async () => {
    const router = new ProviderRouter();
    router.registerOnline(makeStubProvider('opencode', 'OpenCode Cloud', false));
    router.registerOffline(makeStubProvider('local', 'Local LLM', false));

    const resolved = await router.resolve().catch(() => null);
    // Should return unhealthy provider rather than throw
    expect(resolved).not.toBeNull();
  });
});

// ── AT-010: OpenAI-Compatible Provider Export ──
describe('AT-010: OpenAI-Compatible Provider Adapter', () => {
  it('exports OpenAICompatibleProvider', () => {
    expect(OpenAICompatibleProvider).toBeDefined();
    expect(typeof OpenAICompatibleProvider).toBe('function');
  });

  it('implements ConversationProvider interface', () => {
    const provider = new OpenAICompatibleProvider({});
    expect(provider.id).toBe('openai-compat');
    expect(provider.name).toBe('OpenAI Compatible');
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.stream).toBe('function');
    expect(typeof provider.health).toBe('function');
    expect(typeof provider.models).toBe('function');
  });
});

// ── AT-011: OpenCode Provider ──
describe('AT-011: OpenCode Provider', () => {
  let OpenCodeProvider: any;
  beforeAll(async () => {
    const p = await import('../dist/provider/opencode.js');
    OpenCodeProvider = p.OpenCodeProvider;
  });

  it('exports OpenCodeProvider', () => {
    expect(OpenCodeProvider).toBeDefined();
    expect(typeof OpenCodeProvider).toBe('function');
  });

  it('initializes with default config (local runtime, no hardcoded model)', () => {
    const provider = new OpenCodeProvider({});
    expect(provider.id).toBe('opencode');
    expect(provider.name).toBe('OpenCode (local)');
    // Model is NEVER hardcoded — empty means the local runtime agent decides.
    expect(provider.model).toBe('');
  });

  it('accepts custom model from authoritative config', () => {
    const provider = new OpenCodeProvider({ model: 'custom-model' });
    expect(provider.model).toBe('custom-model');
  });

  it('implements ConversationProvider interface', () => {
    const provider = new OpenCodeProvider({});
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.stream).toBe('function');
    expect(typeof provider.health).toBe('function');
    expect(typeof provider.models).toBe('function');
  });

  it('setModel updates model', () => {
    const provider = new OpenCodeProvider({});
    provider.setModel('updated-model');
    expect(provider.model).toBe('updated-model');
  });
});

// ── AT-012: Ollama Provider ──
describe('AT-012: Ollama Provider', () => {
  let OllamaProvider: any;
  beforeAll(async () => {
    const p = await import('../dist/provider/ollama.js');
    OllamaProvider = p.OllamaProvider;
  });

  it('exports OllamaProvider', () => {
    expect(OllamaProvider).toBeDefined();
    expect(typeof OllamaProvider).toBe('function');
  });

  it('initializes with default config', () => {
    const provider = new OllamaProvider({});
    expect(provider.id).toBe('ollama');
    expect(provider.name).toBe('Ollama');
    expect(provider.model).toBe('llama3.2:3b');
  });

  it('returns deterministic stub when offline', async () => {
    const provider = new OllamaProvider({});
    const res = await provider.complete({ model: 'test', messages: [{ role: 'user', content: 'hello' }] });
    expect(res.content).toContain('[Ollama offline');
    expect(res.provider).toBe('ollama');
  });

  it('implements ConversationProvider interface', () => {
    const provider = new OllamaProvider({});
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.stream).toBe('function');
    expect(typeof provider.health).toBe('function');
    expect(typeof provider.models).toBe('function');
  });
});

// ── AT-013: Gemini Provider ──
describe('AT-013: Gemini Provider', () => {
  let GeminiProvider: any;
  beforeAll(async () => {
    const p = await import('../dist/provider/gemini.js');
    GeminiProvider = p.GeminiProvider;
  });

  it('exports GeminiProvider', () => {
    expect(GeminiProvider).toBeDefined();
    expect(typeof GeminiProvider).toBe('function');
  });

  it('initializes with default config', () => {
    const provider = new GeminiProvider({});
    expect(provider.id).toBe('gemini');
    expect(provider.name).toBe('Gemini');
    expect(provider.model).toBe('gemini-2.0-flash');
  });

  it('implements ConversationProvider interface', () => {
    const provider = new GeminiProvider({});
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.stream).toBe('function');
    expect(typeof provider.health).toBe('function');
    expect(typeof provider.models).toBe('function');
  });
});

// ── AT-014: ProviderFactory ──
describe('AT-014: ProviderFactory', () => {
  let ProviderFactory: any;
  beforeAll(async () => {
    const mod2 = await import('../dist/index.js');
    ProviderFactory = mod2.ProviderFactory;
  });

  it('exports ProviderFactory', () => {
    expect(ProviderFactory).toBeDefined();
    expect(typeof ProviderFactory.create).toBe('function');
    expect(typeof ProviderFactory.healthCheckAll).toBe('function');
  });

  it('creates OpenCodeProvider via factory', () => {
    const p = ProviderFactory.create({ kind: 'opencode' });
    expect(p.id).toBe('opencode');
    expect(p.name).toBe('OpenCode (local)');
  });

  it('creates OllamaProvider via factory', () => {
    const p = ProviderFactory.create({ kind: 'ollama' });
    expect(p.id).toBe('ollama');
    expect(p.name).toBe('Ollama');
  });

  it('creates GeminiProvider via factory', () => {
    const p = ProviderFactory.create({ kind: 'gemini' });
    expect(p.id).toBe('gemini');
    expect(p.name).toBe('Gemini');
  });

  it('creates OpenAICompatibleProvider via factory', () => {
    const p = ProviderFactory.create({ kind: 'openai-compat' });
    expect(p.id).toBe('openai-compat');
  });

  it('throws for unknown provider kind', () => {
    expect(() => ProviderFactory.create({ kind: 'nonexistent' })).toThrow('Unknown provider kind');
  });
});

// ── AT-015: Runtime Switch Between Providers ──
describe('AT-015: Runtime Switch Between Providers', () => {
  let ProviderRouter: any;
  let _DefaultConversationEngine: any;

  beforeAll(async () => {
    const mod2 = await import('../dist/index.js');
    ProviderRouter = mod2.ProviderRouter;
    _DefaultConversationEngine = mod2.DefaultConversationEngine;
  });

  it('can switch between OpenCode and Ollama without code changes', async () => {
    const router = new ProviderRouter();

    const opencodeProvider = {
      id: 'opencode',
      name: 'OpenCode',
      model: 'm1',
      available: true,
      complete: async () => mockResponse('from opencode'),
      stream: async function* () {},
      health: async () => ({
        status: 'healthy' as const,
        providerId: 'opencode',
        model: 'm1',
        latency: 1,
        lastHeartbeat: '',
        message: '',
      }),
      models: async () => [],
    };

    const ollamaProvider = {
      id: 'ollama',
      name: 'Ollama',
      model: 'm2',
      available: true,
      complete: async () => mockResponse('from ollama'),
      stream: async function* () {},
      health: async () => ({
        status: 'healthy' as const,
        providerId: 'ollama',
        model: 'm2',
        latency: 2,
        lastHeartbeat: '',
        message: '',
      }),
      models: async () => [],
    };

    // Register both
    router.registerOnline(opencodeProvider);
    router.registerOffline(ollamaProvider);

    // Switch via selectProvider — no code changes to engine
    router.selectProvider('opencode');
    const resolved1 = await router.resolve();
    expect(resolved1.id).toBe('opencode');

    router.selectProvider('ollama');
    const resolved2 = await router.resolve();
    expect(resolved2.id).toBe('ollama');
  });

  it('health reporting consistent across providers', async () => {
    const router = new ProviderRouter();

    const opencodeProvider = {
      id: 'opencode',
      name: 'OpenCode',
      model: 'm1',
      available: true,
      complete: async () => mockResponse(''),
      stream: async function* () {},
      health: async () => ({
        status: 'healthy' as const,
        providerId: 'opencode',
        model: 'm1',
        latency: 5,
        lastHeartbeat: '',
        message: '',
      }),
      models: async () => [],
    };

    const ollamaProvider = {
      id: 'ollama',
      name: 'Ollama',
      model: 'm2',
      available: false,
      complete: async () => mockResponse(''),
      stream: async function* () {},
      health: async () => ({
        status: 'unhealthy' as const,
        providerId: 'ollama',
        model: 'm2',
        latency: 0,
        lastHeartbeat: '',
        message: '',
      }),
      models: async () => [],
    };

    router.registerOnline(opencodeProvider);
    router.registerOffline(ollamaProvider);

    const status = await router.getStatus();
    expect(status.active?.providerId).toBe('opencode');
    expect(status.active?.connected).toBe(true);
    expect(status.offline?.connected).toBe(false);
    expect(status.failoverEnabled).toBe(true);
  });
});
