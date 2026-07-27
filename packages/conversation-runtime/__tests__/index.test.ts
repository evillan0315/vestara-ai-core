import { describe, expect, it } from 'vitest';

describe('@vestara/conversation-runtime', () => {
  it('exports DefaultConversationEngine', () => {
    const mod = require('../dist/index.js');
    expect(mod.DefaultConversationEngine).toBeDefined();
    expect(typeof mod.DefaultConversationEngine).toBe('function');
  });

  it('exports SqliteUserProfileStore', () => {
    const mod = require('../dist/index.js');
    expect(mod.SqliteUserProfileStore).toBeDefined();
    expect(typeof mod.SqliteUserProfileStore).toBe('function');
  });

  it('exports SqliteConversationSessionStore', () => {
    const mod = require('../dist/index.js');
    expect(mod.SqliteConversationSessionStore).toBeDefined();
    expect(typeof mod.SqliteConversationSessionStore).toBe('function');
  });

  it('exports ProviderRouter', () => {
    const mod = require('../dist/index.js');
    expect(mod.ProviderRouter).toBeDefined();
    expect(typeof mod.ProviderRouter).toBe('function');
  });

  it('exports OpenCodeCloudProvider', () => {
    const mod = require('../dist/index.js');
    expect(mod.OpenCodeCloudProvider).toBeDefined();
    expect(typeof mod.OpenCodeCloudProvider).toBe('function');
  });

  it('exports LocalProvider', () => {
    const mod = require('../dist/index.js');
    expect(mod.LocalProvider).toBeDefined();
    expect(typeof mod.LocalProvider).toBe('function');
  });

  it('UserProfileStore round-trips a profile', async () => {
    const mod = require('../dist/index.js');
    const store = new mod.SqliteUserProfileStore();
    const profile = {
      id: 'profile-test-1',
      name: 'Test User',
      role: 'Developer',
      preferredStack: ['TypeScript', 'Rust'],
      communicationStyle: 'concise' as const,
      goals: ['Build CLI tool'],
      preferences: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      conversationCount: 0,
    };
    await store.save(profile);
    const loaded = await store.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(profile.id);
    expect(loaded!.name).toBe('Test User');
    expect(loaded!.role).toBe('Developer');
    expect(loaded!.preferredStack).toEqual(['TypeScript', 'Rust']);
    expect(loaded!.goals).toEqual(['Build CLI tool']);
  });

  it('UserProfileStore updates a profile', async () => {
    const mod = require('../dist/index.js');
    const store = new mod.SqliteUserProfileStore();
    const profile = {
      id: 'profile-test-2',
      name: 'Update User',
      role: 'Engineer',
      preferredStack: [],
      communicationStyle: 'balanced' as const,
      goals: [],
      preferences: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      conversationCount: 0,
    };
    await store.save(profile);
    const updated = await store.update(profile.id, { role: 'Senior Engineer', goals: ['Lead team'] });
    expect(updated.role).toBe('Senior Engineer');
    expect(updated.goals).toEqual(['Lead team']);
    expect(updated.updatedAt).not.toBe(profile.updatedAt);
  });

  it('UserProfileStore returns null when no profile exists', async () => {
    const mod = require('../dist/index.js');
    const store = new mod.SqliteUserProfileStore();
    const result = await store.load();
    expect(result).toBeNull();
  });

  it('SessionStore round-trips a session', async () => {
    const mod = require('../dist/index.js');
    const store = new mod.SqliteConversationSessionStore();
    const session = {
      id: 'session-test-1',
      userId: 'user-1',
      profileId: 'profile-1',
      startedAt: new Date().toISOString(),
      transcript: [
        {
          id: 'msg-1',
          conversationId: 'session-test-1',
          role: 'user' as const,
          content: 'Hello',
          createdAt: new Date().toISOString(),
        },
      ],
      audioTimeline: [],
      context: { key: 'value' },
      referencedArtifacts: ['plan-1'],
      summaries: [],
      actions: [],
      memoryUpdates: [],
    };
    await store.save(session);
    const loaded = await store.load('session-test-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('session-test-1');
    expect(loaded!.transcript).toHaveLength(1);
    expect(loaded!.referencedArtifacts).toEqual(['plan-1']);
    expect(loaded!.context).toEqual({ key: 'value' });
  });

  it('ProviderRouter resolves provider by priority', async () => {
    const mod = require('../dist/index.js');
    const router = new mod.ProviderRouter();

    const fakeOnline = {
      id: 'online-test',
      name: 'Online',
      available: true,
      model: 'm1',
      complete: async () => ({
        id: '',
        model: '',
        provider: '',
        content: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
      }),
      stream: async function* () {},
      health: async () => ({
        status: 'healthy' as const,
        providerId: 'online-test',
        model: 'm1',
        latency: 5,
        lastHeartbeat: '',
        message: '',
      }),
      models: async () => [],
    };
    const fakeOffline = {
      id: 'offline-test',
      name: 'Offline',
      available: false,
      model: 'm2',
      complete: async () => ({
        id: '',
        model: '',
        provider: '',
        content: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
      }),
      stream: async function* () {},
      health: async () => ({
        status: 'unhealthy' as const,
        providerId: 'offline-test',
        model: 'm2',
        latency: 0,
        lastHeartbeat: '',
        message: '',
      }),
      models: async () => [],
    };

    router.registerOnline(fakeOnline);
    router.registerOffline(fakeOffline);

    const resolved = await router.resolve();
    expect(resolved.id).toBe('online-test');
  });

  it('ProviderRouter falls back to offline when online unavailable', async () => {
    const mod = require('../dist/index.js');
    const router = new mod.ProviderRouter();

    const fakeOnline = {
      id: 'online-gone',
      name: 'Online',
      available: false,
      model: 'm1',
      complete: async () => ({
        id: '',
        model: '',
        provider: '',
        content: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
      }),
      stream: async function* () {},
      health: async () => ({
        status: 'unhealthy' as const,
        providerId: 'online-gone',
        model: 'm1',
        latency: 0,
        lastHeartbeat: '',
        message: '',
      }),
      models: async () => [],
    };
    const fakeOffline = {
      id: 'offline-here',
      name: 'Offline',
      available: true,
      model: 'm2',
      complete: async () => ({
        id: '',
        model: '',
        provider: '',
        content: '',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
      }),
      stream: async function* () {},
      health: async () => ({
        status: 'healthy' as const,
        providerId: 'offline-here',
        model: 'm2',
        latency: 3,
        lastHeartbeat: '',
        message: '',
      }),
      models: async () => [],
    };

    router.registerOnline(fakeOnline);
    router.registerOffline(fakeOffline);

    const resolved = await router.resolve();
    expect(resolved.id).toBe('offline-here');
  });

  it('ProviderRouter supports intent-based model resolution', () => {
    const mod = require('../dist/index.js');
    const router = new mod.ProviderRouter();

    router.setIntent('explain');
    const model = router.resolveModel();
    expect(model).toBe('deepseek-v4-flash-free');

    router.setIntent('conversation');
    const convModel = router.resolveModel();
    expect(convModel).toBe('deepseek-v4-flash-free');

    router.setIntent('architecture');
    const archModel = router.resolveModel();
    expect(archModel).toBe('deepseek-v4-flash-free');
  });

  it('Profile enrichment extracts name from messages', async () => {
    const mod = require('../dist/index.js');
    const { DefaultConversationEngine } = mod;

    const mockConversationService = {
      createConversation: async () => ({
        id: 'conv-1',
        userId: 'local',
        title: 'Test',
        messages: [],
        status: 'active' as const,
        createdAt: '',
        updatedAt: '',
      }),
      sendMessage: async () => ({
        message: { id: '', conversationId: '', role: 'user' as const, content: '', createdAt: '' },
        response: {
          id: '',
          conversationId: '',
          role: 'assistant' as const,
          content: 'Nice to meet you!',
          createdAt: '',
        },
        latency: 0,
      }),
      sendMessageStream: async function* () {},
      closeConversation: async () => {},
      listConversations: () => [],
      getConversation: () => null,
    };

    const store = new mod.SqliteUserProfileStore();
    const sessionStore = new mod.SqliteConversationSessionStore();
    const engine = new DefaultConversationEngine({
      conversationService: mockConversationService,
      profileStore: store,
      sessionStore,
    });

    await engine.initialize();
    expect(engine.isFirstBoot).toBe(true);

    const greeting = await engine.getGreeting();
    expect(greeting).toContain("What's your name");
  });
});
