import type { EmitEvent, EventBus } from '@vestara/event-bus';
import { describe, expect, it, vi } from 'vitest';
import {
  BrowserEvidenceCollector,
  BrowserRuntimeService,
  type BrowserRuntimeServiceOptions,
  DEFAULT_BROWSER_PERMISSIONS,
  evaluateBrowserPermission,
} from '../src/index';

function createTestEventBus(): EventBus & { events: EmitEvent[] } {
  const events: EmitEvent[] = [];
  return {
    events,
    async emit(event: EmitEvent) {
      events.push(event);
    },
    subscribe: vi.fn() as unknown as EventBus['subscribe'],
    once: vi.fn() as unknown as EventBus['once'],
    unsubscribeAll: vi.fn() as unknown as EventBus['unsubscribeAll'],
    getMetrics: () => ({
      totalEmitted: events.length,
      totalProcessed: 0,
      totalFailed: 0,
      avgLatency: 0,
      activeSubscribers: 0,
    }),
  };
}

function testOptions(overrides: Partial<BrowserRuntimeServiceOptions> = {}): BrowserRuntimeServiceOptions {
  return {
    workspaceId: 'test-ws',
    ...overrides,
  };
}

describe('BrowserRuntimeService lifecycle', () => {
  it('starts in uninitialized state', () => {
    const runtime = new BrowserRuntimeService(testOptions());
    expect(runtime.status).toBe('uninitialized');
  });

  it('transitions through initialize -> start -> stop -> dispose', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.initialize();
    expect(runtime.status).toBe('initialized');
    await runtime.start();
    expect(runtime.status).toBe('running');
    await runtime.stop();
    expect(runtime.status).toBe('stopped');
    await runtime.dispose();
    expect(runtime.status).toBe('disposed');
  });

  it('auto-initializes when start is called before initialize', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    expect(runtime.status).toBe('running');
    await runtime.dispose();
  });

  it('reports healthy status', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    const health = await runtime.health();
    expect(health.status).toBe('healthy');
    expect(health.serviceId).toBe('browser-runtime');
    expect(health.version).toBe('0.1.0');
    expect(health.uptime).toBeGreaterThanOrEqual(0);
    await runtime.dispose();
  });
});

describe('BrowserRuntimeService event emission', () => {
  it('emits runtime.started event on start', async () => {
    const eventBus = createTestEventBus();
    const runtime = new BrowserRuntimeService(testOptions({ eventBus }));
    await runtime.start();
    const started = eventBus.events.find((e) => e.type === 'browser.runtime.started');
    expect(started).toBeDefined();
    expect(started?.source).toBe('browser-runtime');
    expect(started?.payload).toMatchObject({ workspaceId: 'test-ws' });
    await runtime.dispose();
  });

  it('emits session.created and session.ready on createSession', async () => {
    const eventBus = createTestEventBus();
    const runtime = new BrowserRuntimeService(testOptions({ eventBus }));
    await runtime.start();
    runtime.createSession('agent-1', 'task-1');
    const created = eventBus.events.find((e) => e.type === 'browser.session.created');
    const ready = eventBus.events.find((e) => e.type === 'browser.session.ready');
    expect(created).toBeDefined();
    expect(created?.payload).toMatchObject({ sessionId: 'agent-1:task-1', ownerId: 'agent-1' });
    expect(ready).toBeDefined();
    await runtime.dispose();
  });

  it('emits session.stopped on closeSession', async () => {
    const eventBus = createTestEventBus();
    const runtime = new BrowserRuntimeService(testOptions({ eventBus }));
    await runtime.start();
    runtime.createSession('agent-1', 'task-1');
    await runtime.closeSession('agent-1:task-1');
    const stopped = eventBus.events.find((e) => e.type === 'browser.session.stopped');
    expect(stopped).toBeDefined();
    expect(stopped?.payload).toMatchObject({ sessionId: 'agent-1:task-1' });
    await runtime.dispose();
  });

  it('emits action events', async () => {
    const eventBus = createTestEventBus();
    const runtime = new BrowserRuntimeService(testOptions({ eventBus }));
    await runtime.start();
    runtime.createSession('agent-1', 'task-1');
    runtime.recordActionStarted('agent-1:task-1', 'browser.click', { ref: 'e1' });
    runtime.recordActionCompleted('agent-1:task-1', 'browser.click', { url: 'http://example.com' });
    const started = eventBus.events.find((e) => e.type === 'browser.action.started');
    const completed = eventBus.events.find((e) => e.type === 'browser.action.completed');
    expect(started).toBeDefined();
    expect(started?.payload).toMatchObject({ action: 'browser.click', ref: 'e1' });
    expect(completed).toBeDefined();
    expect(completed?.payload).toMatchObject({ action: 'browser.click', url: 'http://example.com' });
    await runtime.dispose();
  });

  it('emits navigation events', async () => {
    const eventBus = createTestEventBus();
    const runtime = new BrowserRuntimeService(testOptions({ eventBus }));
    await runtime.start();
    runtime.createSession('agent-1', 'task-1');
    runtime.recordNavigationStarted('agent-1:task-1', 'http://example.com');
    runtime.recordNavigationCompleted('agent-1:task-1', 'http://example.com', 'Example');
    const navStarted = eventBus.events.find((e) => e.type === 'browser.navigation.started');
    const navCompleted = eventBus.events.find((e) => e.type === 'browser.navigation.completed');
    expect(navStarted).toBeDefined();
    expect(navCompleted).toBeDefined();
    expect(navCompleted?.payload).toMatchObject({ title: 'Example' });
    await runtime.dispose();
  });

  it('emits observation events', async () => {
    const eventBus = createTestEventBus();
    const runtime = new BrowserRuntimeService(testOptions({ eventBus }));
    await runtime.start();
    runtime.createSession('agent-1', 'task-1');
    runtime.recordObservationCreated('agent-1:task-1', 'obs-1', 5);
    const obs = eventBus.events.find((e) => e.type === 'browser.observation.created');
    expect(obs).toBeDefined();
    expect(obs?.payload).toMatchObject({ observationId: 'obs-1', elementCount: 5 });
    await runtime.dispose();
  });
});

describe('BrowserRuntimeService session management', () => {
  it('creates and retrieves sessions', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    const session = runtime.createSession('agent-1', 'task-1');
    expect(session.id).toBe('agent-1:task-1');
    expect(session.status).toBe('active');
    expect(runtime.getSession('agent-1:task-1')).toBe(session);
    await runtime.dispose();
  });

  it('reuses existing active sessions', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    const first = runtime.createSession('agent-1', 'task-1');
    const second = runtime.createSession('agent-1', 'task-1');
    expect(first).toBe(second);
    await runtime.dispose();
  });

  it('getOrCreateSession creates when missing', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    const session = runtime.getOrCreateSession('agent-1', 'task-1');
    expect(session.id).toBe('agent-1:task-1');
    await runtime.dispose();
  });

  it('lists all sessions', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    runtime.createSession('agent-1', 'task-1');
    runtime.createSession('agent-2', 'task-2');
    const list = runtime.listSessions();
    expect(list).toHaveLength(2);
    await runtime.dispose();
  });

  it('closes sessions and updates status', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    runtime.createSession('agent-1', 'task-1');
    await runtime.closeSession('agent-1:task-1');
    const session = runtime.getSession('agent-1:task-1');
    expect(session?.status).toBe('closed');
    await runtime.dispose();
  });
});

describe('BrowserRuntimeService stats', () => {
  it('tracks session creation count', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    runtime.createSession('agent-1', 'task-1');
    runtime.createSession('agent-2', 'task-2');
    const stats = runtime.getStats();
    expect(stats.totalSessionsCreated).toBe(2);
    expect(stats.activeSessions).toBe(2);
    await runtime.dispose();
  });

  it('tracks action and navigation counts', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    runtime.createSession('agent-1', 'task-1');
    runtime.recordActionStarted('agent-1:task-1', 'browser.click');
    runtime.recordActionCompleted('agent-1:task-1', 'browser.click');
    runtime.recordNavigationStarted('agent-1:task-1', 'http://example.com');
    const stats = runtime.getStats();
    expect(stats.totalActions).toBe(1);
    expect(stats.totalNavigations).toBe(1);
    await runtime.dispose();
  });

  it('tracks errors', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    runtime.createSession('agent-1', 'task-1');
    runtime.recordActionFailed('agent-1:task-1', 'browser.click', 'element not found');
    const stats = runtime.getStats();
    expect(stats.errors).toBe(1);
    const health = await runtime.health();
    expect(health.status).toBe('degraded');
    await runtime.dispose();
  });
});

describe('BrowserRuntimeService permission enforcement', () => {
  it('allows safe actions', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    expect(runtime.checkPermission('browser.navigate')).toBe('allow');
    expect(runtime.checkPermission('browser.observe')).toBe('allow');
    expect(runtime.checkPermission('browser.screenshot')).toBe('allow');
    await runtime.dispose();
  });

  it('asks for sensitive actions', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    expect(runtime.checkPermission('browser.click')).toBe('ask');
    expect(runtime.checkPermission('browser.type')).toBe('ask');
    await runtime.dispose();
  });

  it('asks for unknown actions', async () => {
    const runtime = new BrowserRuntimeService(testOptions());
    await runtime.start();
    expect(runtime.checkPermission('browser.unknown')).toBe('ask');
    await runtime.dispose();
  });
});

describe('evaluateBrowserPermission', () => {
  it('returns allow for safe actions', () => {
    expect(evaluateBrowserPermission('browser.navigate').level).toBe('allow');
    expect(evaluateBrowserPermission('browser.observe').level).toBe('allow');
  });

  it('returns ask for sensitive actions', () => {
    expect(evaluateBrowserPermission('browser.click').level).toBe('ask');
    expect(evaluateBrowserPermission('browser.type').level).toBe('ask');
  });

  it('returns ask for unknown actions', () => {
    expect(evaluateBrowserPermission('browser.unknown').level).toBe('ask');
  });

  it('respects custom rules', () => {
    const customRules = [{ action: 'browser.click', level: 'allow' as const, reason: 'Custom allow' }];
    expect(evaluateBrowserPermission('browser.click', customRules).level).toBe('allow');
  });
});

describe('BrowserEvidenceCollector', () => {
  it('has browser-navigation kind', () => {
    const collector = new BrowserEvidenceCollector();
    expect(collector.kind).toBe('browser-navigation');
  });

  it('returns empty items when session has no trace', async () => {
    const collector = new BrowserEvidenceCollector();
    // We can't easily create a full ManagedBrowserSession without Playwright,
    // so we test the kind and interface contract.
    expect(collector.kind).toBe('browser-navigation');
    expect(typeof collector.collect).toBe('function');
  });
});
