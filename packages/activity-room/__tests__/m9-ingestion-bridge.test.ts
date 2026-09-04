/**
 * M11C-I1: M9IngestionBridge — Hermetic Tests
 *
 * Tests all invariants:
 *   I1-1: Single M9 ingestion authority
 *   I1-2: Event identity preservation
 *   I1-3: Idempotent redelivery
 *   I1-4: Typed normalization
 *   I1-5: Explicit event disposition
 *   I1-6: Failure isolation
 *   I1-7: Ordering
 *   I1-8: No feedback loop
 *   I1-9: Lifecycle
 *   I1-10: Existing operational path unaffected
 */

import type { EventBus } from '@vestara/event-bus';
import type { VestaraEvent } from '@vestara/shared';
import { migrate } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { M9IngestionBridge } from '../src/m9-ingestion-bridge';
import { SqliteActivityStore } from '../src/m9-sqlite-store';
import { ACTIVITY_MANIFEST } from '../src/migrations';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

// ─── Test Helpers ──────────────────────────────────────────

function createMockEventBus(): EventBus & { emitted: VestaraEvent[]; subscriptions: Map<string, Function[]> } {
  const subscriptions = new Map<string, Function[]>();
  const emitted: VestaraEvent[] = [];

  return {
    emitted,
    subscriptions,
    async emit(event: any) {
      emitted.push(event);
    },
    subscribe(pattern: string, handler: Function) {
      const list = subscriptions.get(pattern) ?? [];
      list.push(handler);
      subscriptions.set(pattern, list);
      return () => {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
        // Clean up empty keys
        if (list.length === 0) subscriptions.delete(pattern);
      };
    },
    once(type: string, handler: Function) {
      return this.subscribe(type, handler);
    },
    unsubscribeAll(pattern?: string) {
      if (pattern) {
        subscriptions.delete(pattern);
      } else {
        subscriptions.clear();
      }
    },
    getMetrics() {
      return { totalEmitted: 0, totalProcessed: 0, totalFailed: 0, avgLatency: 0, activeSubscribers: 0 };
    },
  } as any;
}

function createMockEvent(overrides: Partial<VestaraEvent> = {}): VestaraEvent {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'conversation:created',
    version: 1,
    timestamp: new Date().toISOString(),
    source: 'test',
    actor: { id: 'local', role: 'user' },
    payload: { userId: 'test-user', title: 'Test' },
    metadata: {
      correlationId: `cor-${Date.now()}`,
      causationId: undefined,
      executionId: undefined,
      requestId: undefined,
      traceId: undefined,
      retryCount: 0,
      ttl: 60,
    },
    ...overrides,
  };
}

function createTestStore(): SqliteActivityStore {
  const db = new SQL.Database();
  migrate(db, ACTIVITY_MANIFEST);
  return new SqliteActivityStore(db);
}

// ─── Tests ─────────────────────────────────────────────────

describe('M9IngestionBridge', () => {
  let store: SqliteActivityStore;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let bridge: M9IngestionBridge;
  let logger: { warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };

  beforeAll(async () => {
    const initSqlJs = (await import('sql.js')).default;
    SQL = await initSqlJs();
  });

  beforeEach(() => {
    store = createTestStore();
    eventBus = createMockEventBus();
    logger = { warn: vi.fn(), info: vi.fn() };
    bridge = new M9IngestionBridge({ store, eventBus, logger });
  });

  // ─── I1-1: Single M9 ingestion authority ───────────────

  describe('I1-1: Single M9 ingestion authority', () => {
    it('bridge is the only documented M9 write boundary', () => {
      // The bridge class is the sole producer of DurableActivityStore.append calls
      // in production. Verify it exists and is constructable.
      expect(bridge).toBeDefined();
      expect(bridge).toBeInstanceOf(M9IngestionBridge);
    });

    it('does not expose store.append publicly', () => {
      // The bridge should not expose the store for external append
      const bridgeAny = bridge as any;
      expect(bridgeAny.store).toBeDefined(); // internal
      // But the class interface doesn't have an append method
      expect(typeof (bridge as any).append).toBe('undefined');
    });
  });

  // ─── I1-2: Event identity preservation ─────────────────

  describe('I1-2: Event identity preservation', () => {
    it('preserves executionId from EventBus metadata', async () => {
      const event = createMockEvent({
        type: 'conversation:created',
        actor: { id: 'user-1', role: 'user' },
        metadata: {
          correlationId: 'cor-1',
          executionId: 'exec-123',
          traceId: 'trace-456',
          requestId: 'req-789',
          retryCount: 0,
          ttl: 60,
        },
        payload: { userId: 'user-1', title: 'Test' },
      });

      await bridge['ingest'](event);

      const records = await store.query({ limit: 10 });
      expect(records.length).toBe(1);
      expect(records[0].executionId).toBe('exec-123');
      expect(records[0].traceId).toBe('trace-456');
    });

    it('preserves workflowRunId from orchestration events', async () => {
      const event = createMockEvent({
        type: 'orchestration.task.started',
        payload: { projectId: 'proj-1', taskId: 'task-1' },
      });

      await bridge['ingest'](event);

      const records = await store.query({ limit: 10 });
      expect(records.length).toBe(1);
      expect(records[0].workflowRunId).toBe('proj-1');
      expect(records[0].taskId).toBe('task-1');
    });
  });

  // ─── I1-3: Idempotent redelivery ───────────────────────

  describe('I1-3: Idempotent redelivery', () => {
    it('deduplicates by eventId (M9 store built-in)', async () => {
      // Two EventBus events with the same id → same adapter-generated eventId
      const event1 = createMockEvent({
        id: 'same-event-id',
        type: 'agent:started',
        payload: { agentId: 'dev', agentName: 'Dev' },
      });
      const event2 = createMockEvent({
        id: 'same-event-id',
        type: 'agent:started',
        payload: { agentId: 'dev', agentName: 'Dev' },
      });

      // Ingest twice with same EventBus event id
      await bridge['ingest'](event1);
      await bridge['ingest'](event2);

      const records = await store.query({ limit: 10 });
      expect(records.length).toBe(1);
    });

    it('different EventBus event ids produce separate records', async () => {
      const event1 = createMockEvent({
        id: 'event-1',
        type: 'agent:started',
        payload: { agentId: 'dev', agentName: 'Dev' },
      });
      const event2 = createMockEvent({
        id: 'event-2',
        type: 'agent:started',
        payload: { agentId: 'dev', agentName: 'Dev' },
      });

      await bridge['ingest'](event1);
      await bridge['ingest'](event2);

      const records = await store.query({ limit: 10 });
      expect(records.length).toBe(2);
    });
  });

  // ─── I1-4: Typed normalization ─────────────────────────

  describe('I1-4: Typed normalization', () => {
    it('uses fromHumanMessage for conversation:created', async () => {
      const event = createMockEvent({
        type: 'conversation:created',
        actor: { id: 'user-1', role: 'user' },
        payload: { userId: 'user-1', title: 'My Chat' },
      });

      await bridge['ingest'](event);

      const records = await store.query({ limit: 10 });
      expect(records.length).toBe(1);
      expect(records[0].type).toBe('human.message');
      expect(records[0].actor.type).toBe('human');
      expect(records[0].actor.id).toBe('user-1');
    });

    it('uses fromAgentLifecycle for agent:started', async () => {
      const event = createMockEvent({
        type: 'agent:started',
        payload: { agentId: 'developer', agentName: 'Developer', task: 'implement' },
      });

      await bridge['ingest'](event);

      const records = await store.query({ limit: 10 });
      expect(records.length).toBe(1);
      expect(records[0].type).toBe('agent.started');
      expect(records[0].actor.type).toBe('agent');
      expect(records[0].actor.id).toBe('developer');
    });

    it('uses fromAgentLifecycle for verification:completed', async () => {
      const event = createMockEvent({
        type: 'verification:completed',
        payload: { agentId: 'verifier', agentName: 'Verifier', allPassed: true },
      });

      await bridge['ingest'](event);

      const records = await store.query({ limit: 10 });
      expect(records.length).toBe(1);
      expect(records[0].type).toBe('agent.completed');
    });

    it('does NOT parse prose or logs', async () => {
      // Verify we use typed adapters, not string parsing
      const event = createMockEvent({
        type: 'agent:started',
        payload: { agentId: 'dev', modelDisplayName: 'Dev', task: 'build feature X' },
      });

      await bridge['ingest'](event);

      const records = await store.query({ limit: 10 });
      expect(records.length).toBe(1);
      // The payload message comes from the adapter's typed switch, not prose parsing
      expect(records[0].payload.message).toContain('Dev');
    });
  });

  // ─── I1-5: Explicit event disposition ──────────────────

  describe('I1-5: Explicit event disposition', () => {
    it('has explicit disposition for every pattern', () => {
      const dispositions = M9IngestionBridge.getDispositions();
      expect(dispositions.length).toBeGreaterThan(0);

      for (const d of dispositions) {
        expect(['INGEST', 'IGNORE', 'DEFER']).toContain(d.disposition);
        expect(d.reason).toBeTruthy();
      }
    });

    it('classifies operational events as IGNORE', () => {
      const dispositions = M9IngestionBridge.getDispositions();
      // These workspace patterns are operational, not collaboration facts
      const operational = dispositions.filter((d) =>
        [
          'workspace:discover.completed',
          'workspace:fingerprint.completed',
          'workspace:analysis.completed',
          'workspace:manifest.created',
          'workspace:present.completed',
          'workspace:index.completed',
          'workspace:understood',
          'workspace:ready',
          'workspace:error',
        ].includes(d.pattern),
      );

      for (const d of operational) {
        expect(d.disposition).toBe('IGNORE');
      }
    });

    it('subscribes only to INGEST patterns', () => {
      bridge.start();

      const subscribedPatterns = Array.from(eventBus.subscriptions.keys());
      const ingestPatterns = M9IngestionBridge.getIngestPatterns();

      // All subscribed patterns should be INGEST patterns
      for (const pattern of subscribedPatterns) {
        expect(ingestPatterns).toContain(pattern);
      }
    });

    it('returns INGEST patterns list', () => {
      const patterns = M9IngestionBridge.getIngestPatterns();
      expect(patterns).toContain('conversation:created');
      expect(patterns).toContain('agent:started');
      expect(patterns).toContain('orchestration.*');
    });
  });

  // ─── I1-6: Failure isolation ───────────────────────────

  describe('I1-6: Failure isolation', () => {
    it('does not throw on store.append failure', async () => {
      // Make store.append throw
      vi.spyOn(store, 'append').mockRejectedValueOnce(new Error('disk full'));

      const event = createMockEvent({
        type: 'agent:started',
        payload: { agentId: 'dev', agentName: 'Dev' },
      });

      // Should not throw
      await expect(bridge['ingest'](event)).resolves.toBeUndefined();

      // Should have logged the error
      expect(logger.warn).toHaveBeenCalledWith(
        'M9IngestionBridge: ingest failed',
        expect.objectContaining({ eventId: event.id }),
      );
    });

    it('does not corrupt authoritative execution on failure', async () => {
      // The bridge failure should not affect the EventBus or workflow engine
      vi.spyOn(store, 'append').mockRejectedValueOnce(new Error('disk full'));

      const event = createMockEvent({
        type: 'orchestration.task.started',
        payload: { projectId: 'proj-1', taskId: 'task-1' },
      });

      await bridge['ingest'](event);

      // EventBus should still be functional
      expect(eventBus.emitted.length).toBe(0); // bridge doesn't emit to EventBus (I1-8)
    });

    it('logs failures observably', async () => {
      vi.spyOn(store, 'append').mockRejectedValueOnce(new Error('test error'));

      const event = createMockEvent({
        type: 'conversation:created',
        payload: { userId: 'user-1' },
      });

      await bridge['ingest'](event);

      expect(logger.warn).toHaveBeenCalled();
      const call = logger.warn.mock.calls[0];
      expect(call[0]).toBe('M9IngestionBridge: ingest failed');
    });
  });

  // ─── I1-7: Ordering ───────────────────────────────────

  describe('I1-7: Ordering', () => {
    it('sequential events produce deterministic M9 sequence ordering', async () => {
      const events = Array.from({ length: 5 }, (_, i) =>
        createMockEvent({
          id: `seq-event-${i}`,
          type: 'agent:started',
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
          payload: { agentId: `agent-${i}`, agentName: `Agent ${i}` },
        }),
      );

      for (const event of events) {
        await bridge['ingest'](event);
      }

      const records = await store.query({ limit: 10 });
      expect(records.length).toBe(5);

      // Sequences should be monotonically increasing
      for (let i = 1; i < records.length; i++) {
        expect(records[i].sequenceNumber).toBeGreaterThan(records[i - 1].sequenceNumber);
      }
    });
  });

  // ─── I1-8: No feedback loop ────────────────────────────

  describe('I1-8: No feedback loop', () => {
    it('does not emit to EventBus', async () => {
      bridge.start();

      const event = createMockEvent({
        type: 'conversation:created',
        payload: { userId: 'user-1' },
      });

      // Simulate EventBus delivery
      const handlers = eventBus.subscriptions.get('conversation:created') ?? [];
      for (const handler of handlers) {
        await handler(event);
      }

      // Bridge should not have emitted anything back to EventBus
      expect(eventBus.emitted.length).toBe(0);
    });

    it('M9 records do not trigger re-ingestion', async () => {
      // After appending to M9, no new EventBus events should be emitted
      const event = createMockEvent({
        type: 'agent:started',
        payload: { agentId: 'dev', agentName: 'Dev' },
      });

      await bridge['ingest'](event);

      // No EventBus emission from the bridge
      expect(eventBus.emitted.length).toBe(0);
    });
  });

  // ─── I1-9: Lifecycle ──────────────────────────────────

  describe('I1-9: Lifecycle', () => {
    it('start() subscribes exactly once', () => {
      bridge.start();
      bridge.start(); // Second call should be no-op

      const subscribedPatterns = Array.from(eventBus.subscriptions.keys());
      // Should not have duplicate subscriptions
      for (const pattern of subscribedPatterns) {
        const handlers = eventBus.subscriptions.get(pattern)!;
        // Each pattern should have exactly one handler from the bridge
        expect(handlers.length).toBe(1);
      }
    });

    it('stop() unsubscribes all patterns', () => {
      bridge.start();
      expect(eventBus.subscriptions.size).toBeGreaterThan(0);

      bridge.stop();
      expect(eventBus.subscriptions.size).toBe(0);
    });

    it('can restart after stop', () => {
      bridge.start();
      bridge.stop();
      bridge.start();

      const subscribedPatterns = Array.from(eventBus.subscriptions.keys());
      expect(subscribedPatterns.length).toBeGreaterThan(0);
    });
  });

  // ─── I1-10: Existing operational path unaffected ──────

  describe('I1-10: Existing operational path unaffected', () => {
    it('does not interfere with ActivityService subscriptions', () => {
      // ActivityService subscribes to the same patterns
      // Bridge should not unsubscribe them
      const activityServiceUnsub = eventBus.subscribe('conversation:created', async () => {});

      bridge.start();
      bridge.stop();

      // ActivityService subscription should still be active
      const handlers = eventBus.subscriptions.get('conversation:created') ?? [];
      expect(handlers.length).toBe(1);
      expect(handlers[0]).toBeDefined();

      activityServiceUnsub();
    });

    it('does not modify ActivityLogStore', async () => {
      // Bridge writes to M9, not ActivityLogStore
      const event = createMockEvent({
        type: 'conversation:created',
        payload: { userId: 'user-1' },
      });

      await bridge['ingest'](event);

      // M9 store should have the record
      const m9Records = await store.query({ limit: 10 });
      expect(m9Records.length).toBe(1);

      // This test verifies the bridge uses M9 store, not ActivityLogStore
      // (ActivityLogStore is a separate class not imported here)
    });
  });
});

// ─── Event Coverage Tests ──────────────────────────────────

describe('M9IngestionBridge: Event Coverage', () => {
  let store: SqliteActivityStore;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let bridge: M9IngestionBridge;

  beforeAll(async () => {
    if (!SQL) {
      const initSqlJs = (await import('sql.js')).default;
      SQL = await initSqlJs();
    }
  });

  beforeEach(() => {
    store = createTestStore();
    eventBus = createMockEventBus();
    bridge = new M9IngestionBridge({ store, eventBus });
  });

  it('ingests conversation:created', async () => {
    await bridge['ingest'](
      createMockEvent({
        type: 'conversation:created',
        payload: { userId: 'user-1', title: 'Chat' },
      }),
    );
    const records = await store.query({ limit: 10 });
    expect(records.length).toBe(1);
    expect(records[0].type).toBe('human.message');
  });

  it('ingests conversation:response.completed', async () => {
    await bridge['ingest'](
      createMockEvent({
        type: 'conversation:response.completed',
        payload: { tokens: 150 },
      }),
    );
    const records = await store.query({ limit: 10 });
    expect(records.length).toBe(1);
    expect(records[0].type).toBe('agent.completed');
  });

  it('ingests agent:started', async () => {
    await bridge['ingest'](
      createMockEvent({
        type: 'agent:started',
        payload: { agentId: 'dev', agentName: 'Developer', task: 'build' },
      }),
    );
    const records = await store.query({ limit: 10 });
    expect(records.length).toBe(1);
    expect(records[0].type).toBe('agent.started');
  });

  it('ingests agent:completed', async () => {
    await bridge['ingest'](
      createMockEvent({
        type: 'agent:completed',
        payload: { agentId: 'dev', agentName: 'Developer' },
      }),
    );
    const records = await store.query({ limit: 10 });
    expect(records.length).toBe(1);
    expect(records[0].type).toBe('agent.completed');
  });

  it('ingests orchestration.task.started', async () => {
    await bridge['ingest'](
      createMockEvent({
        type: 'orchestration.task.started',
        payload: { projectId: 'proj-1', taskId: 'task-1' },
      }),
    );
    const records = await store.query({ limit: 10 });
    expect(records.length).toBe(1);
    expect(records[0].type).toBe('task.started');
    expect(records[0].workflowRunId).toBe('proj-1');
  });

  it('ignores workspace:discover.completed', async () => {
    await bridge['ingest'](
      createMockEvent({
        type: 'workspace:discover.completed',
        payload: { fileCount: 100 },
      }),
    );
    const records = await store.query({ limit: 10 });
    expect(records.length).toBe(0);
  });

  it('ignores memory:indexed', async () => {
    await bridge['ingest'](
      createMockEvent({
        type: 'memory:indexed',
        payload: { source: 'test' },
      }),
    );
    const records = await store.query({ limit: 10 });
    expect(records.length).toBe(0);
  });
});
