/**
 * Phase A — Identity Convergence Evidence
 *
 * Proves Principal ≠ Surface ≠ Target ≠ Agent across the turn →
 * conversation → ingestion → projection chain. All tests hermetic
 * (in-memory stores, fake services, mock EventBus).
 *
 * Invariants under test:
 * - turn conversation userId is the human principal, never the target agent
 * - target agent travels separately (options.agentId); surface separately
 * - a mentioned agent never becomes a human-message author
 * - surface attribution never becomes principal identity
 * - agent-id userIds fail closed at ingestion (with canonical resolver)
 * - M10 never manufactures Human participants from agent-style human actors
 * - legacy polluted rows are preserved in storage (no rewrite/delete)
 * - a second turn for an existing agent adds no participant
 */

import type { EventBus } from '@vestara/event-bus';
import type { VestaraEvent } from '@vestara/shared';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { triggerAssistantTurn } from '../src/assistant-turn.js';
import type { AgentMessageActivity } from '../src/contracts.js';
import {
  DurableActivityStore,
  fromAgentLifecycle,
  fromHumanMessage,
  M9IngestionBridge,
  ProjectionRuntime,
} from '../src/index.js';
import type { ActivityProjectionService } from '../src/service.js';

// ─── Fakes ─────────────────────────────────────────────────

function humanRecord(): AgentMessageActivity {
  return {
    id: 'activity:msg:human-principal',
    sequence: 7,
    timestamp: '2026-09-14T00:00:00.000Z',
    actor: { type: 'human', id: 'you', displayName: 'You' },
    kind: 'agent-message',
    agentId: 'agent-planner',
    messageKind: 'message',
    content: '@planner create a plan',
    evidenceRefs: [],
  };
}

function fakeService() {
  const appended: AgentMessageActivity[] = [];
  return {
    appended,
    service: {
      appendActivity: async (record: AgentMessageActivity) => {
        appended.push(record);
        return record;
      },
    } as unknown as ActivityProjectionService,
  };
}

function capturingConversationService(responseContent: string) {
  const captured: { userId?: string; options?: Record<string, unknown>; sendOptions?: Record<string, unknown> } = {};
  return {
    captured,
    service: {
      createConversation: async (userId: string, options?: Record<string, unknown>) => {
        captured.userId = userId;
        captured.options = options;
        return { id: 'conv-phase-a' };
      },
      sendMessage: async (_id: string, _content: string, options?: Record<string, unknown>) => {
        captured.sendOptions = options;
        return {
          message: { content: '@planner create a plan' },
          response: { content: responseContent, provider: 'opencode-go', model: 'muse-spark-1.3-contributor' },
          latency: 1,
        };
      },
    },
  };
}

const agentStorage = {
  getAgent: async (id: string) => ({
    id,
    name: 'Planner',
    provider: 'opencode-go',
    model: 'muse-spark-1.3-contributor',
  }),
};

function mockBus() {
  const subscriptions = new Map<string, Function[]>();
  return {
    subscriptions,
    async emit(_event: unknown) {},
    subscribe(pattern: string, handler: Function) {
      const list = subscriptions.get(pattern) ?? [];
      list.push(handler);
      subscriptions.set(pattern, list);
      return () => {};
    },
  } as unknown as EventBus & { subscriptions: Map<string, Function[]> };
}

function sentEvent(actorId: string, extraPayload: Record<string, unknown> = {}): VestaraEvent {
  return {
    id: 'evt-phase-a-1',
    type: 'conversation:message.sent',
    version: 1,
    timestamp: new Date().toISOString(),
    source: 'conversation-service',
    actor: { id: actorId, role: 'user' },
    payload: { conversationId: 'conv-phase-a', messageId: 'msg-phase-a-1', content: '@planner hi', ...extraPayload },
    metadata: {},
  } as unknown as VestaraEvent;
}

// ─── Turn: principal / target / surface ────────────────────

describe('Phase A — turn principal/target/surface separation', () => {
  it('creates the turn conversation under the human principal, not the target agent', async () => {
    const { service } = fakeService();
    const convo = capturingConversationService('plan draft');
    const result = await triggerAssistantTurn({
      agentId: 'agent-planner',
      humanRecord: humanRecord(),
      service,
      conversationService: convo.service,
      agentStorage,
      surface: 'workspace-ui',
    });
    expect(result.status).toBe('completed');
    // Principal: the human author from the persisted record.
    expect(convo.captured.userId).toBe('you');
    // Target travels separately — never written into userId.
    expect(convo.captured.options?.agentId).toBe('agent-planner');
    expect(convo.captured.sendOptions?.agentId).toBe('agent-planner');
    // Surface threads through as attribution, not identity.
    expect(convo.captured.sendOptions?.surface).toBe('workspace-ui');
    // The agent response is still attributed to the executing agent.
    expect(result.agentId).toBe('agent-planner');
  });

  it('omits surface when unattested (UNKNOWN preserved, never manufactured)', async () => {
    const { service } = fakeService();
    const convo = capturingConversationService('plan draft');
    await triggerAssistantTurn({
      agentId: 'agent-developer',
      humanRecord: humanRecord(),
      service,
      conversationService: convo.service,
      agentStorage,
    });
    expect(convo.captured.userId).toBe('you');
    expect(convo.captured.sendOptions).not.toHaveProperty('surface');
  });
});

// ─── Adapter: surface rides data, actor stays principal ────

describe('Phase A — human-message adapter semantics', () => {
  it('keeps actor as principal while carrying surface in payload data', () => {
    const event = fromHumanMessage({
      message: '@planner hi',
      userId: 'you',
      displayName: 'You',
      surface: 'workspace-ui',
    });
    expect(event.actor).toMatchObject({ type: 'human', id: 'you', displayName: 'You' });
    expect(event.payload.data).toMatchObject({ surface: 'workspace-ui' });
  });

  it('omits surface data when unattested', () => {
    const event = fromHumanMessage({ message: 'hi', userId: 'you', displayName: 'You' });
    expect(event.payload.data).toBeUndefined();
  });
});

// ─── Bridge: fail-closed guard ─────────────────────────────

describe('Phase A — ingestion fail-closed guard', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;

  beforeAll(async () => {
    SQL = await initSqlJs();
  });

  async function ingestWithResolver(
    event: VestaraEvent,
    resolver?: { isCanonicalAgentId(id: string): Promise<boolean> },
  ) {
    const { migrate } = await import('@vestara/sqlite-migrations');
    const { ACTIVITY_MANIFEST } = await import('../src/migrations.js');
    const { SqliteActivityStore } = await import('../src/m9-sqlite-store.js');
    const db = new SQL.Database();
    migrate(db, ACTIVITY_MANIFEST);
    const store = new SqliteActivityStore(db);
    const bus = mockBus();
    const logger = { warn: vi.fn(), info: vi.fn() };
    const bridge = new M9IngestionBridge({
      store,
      eventBus: bus,
      logger,
      ...(resolver ? { agentIdResolver: resolver } : {}),
    });
    bridge.start();
    const handlers = bus.subscriptions.get('conversation:message.sent') ?? [];
    for (const handler of handlers) await handler(event);
    const records = await store.rebuild();
    db.close();
    return { records, logger };
  }

  it('skips a human-message event whose userId is a known canonical agent', async () => {
    const { records, logger } = await ingestWithResolver(sentEvent('agent-planner'), {
      isCanonicalAgentId: async (id: string) => id === 'agent-planner',
    });
    expect(records).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('ingests a principal-authored message, preserving surface attribution', async () => {
    const { records } = await ingestWithResolver(sentEvent('you', { surface: 'workspace-ui' }), {
      isCanonicalAgentId: async () => false,
    });
    expect(records).toHaveLength(1);
    expect(records[0].actor).toMatchObject({ type: 'human', id: 'you' });
  });

  it('preserves legacy behavior when no resolver is wired (documented compat)', async () => {
    const { records } = await ingestWithResolver(sentEvent('agent-planner'));
    expect(records).toHaveLength(1);
    expect(records[0].actor).toMatchObject({ type: 'human', id: 'agent-planner' });
  });

  it('fails open on resolver infrastructure error (only positive evidence quarantines)', async () => {
    const { records } = await ingestWithResolver(sentEvent('agent-planner'), {
      isCanonicalAgentId: async () => {
        throw new Error('storage unavailable');
      },
    });
    expect(records).toHaveLength(1);
  });
});

// ─── M10: no manufactured humans, history preserved ────────

describe('Phase A — M10 participant projection', () => {
  let SQL: Awaited<ReturnType<typeof initSqlJs>>;

  beforeAll(async () => {
    SQL = await initSqlJs();
  });

  async function projectAll() {
    const { migrate } = await import('@vestara/sqlite-migrations');
    const { ACTIVITY_MANIFEST } = await import('../src/migrations.js');
    const { SqliteActivityStore } = await import('../src/m9-sqlite-store.js');
    const db = new SQL.Database();
    migrate(db, ACTIVITY_MANIFEST);
    const store = new SqliteActivityStore(db);
    // Legacy polluted row (preserved verbatim — never rewritten).
    await store.append(
      fromHumanMessage({ message: '@planner hi', userId: 'agent-planner', displayName: 'agent-planner' }),
    );
    // Genuine principal row via surface.
    await store.append(fromHumanMessage({ message: 'hello', userId: 'you', displayName: 'You' }));
    // Canonical agent execution rows.
    await store.append(
      fromAgentLifecycle({ agentId: 'agent-planner', displayName: 'Planner', lifecycleType: 'started' }),
    );
    await store.append(
      fromAgentLifecycle({ agentId: 'agent-planner', displayName: 'Planner', lifecycleType: 'completed' }),
    );
    const records = await store.rebuild();
    const runtime = new ProjectionRuntime();
    const projection = runtime.rebuild(records);
    // Second turn for the same agent: participant set must not grow.
    await store.append(
      fromAgentLifecycle({ agentId: 'agent-planner', displayName: 'Planner', lifecycleType: 'completed' }),
    );
    const records2 = await store.rebuild();
    const afterSecondTurn = new ProjectionRuntime().rebuild(records2);
    db.close();
    return { records, projection, afterSecondTurn };
  }

  it('manufactures no human-agent-* participants from polluted rows', async () => {
    const { projection } = await projectAll();
    const ids = projection.participants.map((p) => p.participantId);
    expect(ids).not.toContain('human-agent-planner');
    expect(ids.filter((id) => id.startsWith('human-agent-'))).toHaveLength(0);
  });

  it('keeps the genuine principal and resolves the canonical agent response', async () => {
    const { projection } = await projectAll();
    const ids = projection.participants.map((p) => p.participantId);
    expect(ids).toContain('human-you');
    expect(ids).toContain('agent-agent-planner');
  });

  it('adds no participant when an existing agent takes another turn', async () => {
    const { projection, afterSecondTurn } = await projectAll();
    expect(afterSecondTurn.participants.length).toBe(projection.participants.length);
  });

  it('preserves polluted rows in storage (history untouched)', async () => {
    const { records } = await projectAll();
    const polluted = records.filter((r) => r.actor.type === 'human' && r.actor.id === 'agent-planner');
    expect(polluted.length).toBeGreaterThan(0);
  });
});
