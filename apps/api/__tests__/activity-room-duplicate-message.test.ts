/**
 * Duplicate-message regression (@developer dogfood).
 *
 * One human submission to a turn-capable agent appeared twice in the
 * Activity Room stream while the agent execution stayed singular.
 *
 * Proven boundary: M9 append. The legacy→M9 mirror appended
 * `human.message:<legacyActivityId>` AND the EventBus bridge ingested the
 * turn's `conversation:message.sent` as `human.message:<convMessageId>` —
 * two records, two activityIds, identical content. Client merge dedupes by
 * id, so it could never collapse them.
 *
 * Repair: single M9 writer per message. A turn-triggering message skips the
 * direct mirror (the bridge owns its projection); a message with no turn
 * keeps the mirror as its only M9 path. Identity-based (agent target),
 * never content-based: two intentionally identical submissions stay two.
 */
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { M9IngestionBridge } from '@vestara/activity-room';
import { DefaultContextAssembler } from '@vestara/context';
import { DefaultConversationService } from '@vestara/conversation';
import { InProcessEventBus } from '@vestara/event-bus';
import { afterAll, describe, expect, it } from 'vitest';
import type { ActivityRoom } from '../src/activity-room';
import { createActivityRoom } from '../src/activity-room';
import { handleActivityRoomRoute } from '../src/routes/activity-room';
import { getM11ARoom, initM11AActivityRoom } from '../src/routes/activity-room-m11a';

const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-dup-'));
await initM11AActivityRoom(repoDir);

afterAll(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
});

function fakeResponse(): { res: http.ServerResponse; body: () => unknown; status: () => number } {
  let status = 0;
  let body: unknown = null;
  const res = new EventEmitter() as unknown as http.ServerResponse;
  res.writeHead = (code: number) => {
    status = code;
    return res as unknown as http.ServerResponse;
  };
  res.end = (data?: unknown) => {
    body = typeof data === 'string' ? JSON.parse(data) : data;
    return res as unknown as http.ServerResponse;
  };
  return { res, body: () => body, status: () => status };
}

function fakeRequest(body: unknown): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage;
  queueMicrotask(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}

interface TestContext {
  room: ActivityRoom;
  bus: InProcessEventBus;
}

async function setup(): Promise<TestContext> {
  const room = createActivityRoom();
  const bus = new InProcessEventBus();
  const bridge = new M9IngestionBridge({ store: getM11ARoom().store, eventBus: bus });
  bridge.start();
  return { room, bus };
}

function ctxFor(bus: InProcessEventBus): Record<string, unknown> {
  const conversationService = new DefaultConversationService({
    contextAssembler: new DefaultContextAssembler(),
    providerExecutor: {
      async complete() {
        return {
          id: 'resp-dup',
          model: 'test-model',
          provider: 'test',
          content: 'Working on it.',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          latency: 1,
        };
      },
      async *stream() {
        yield {
          id: 'chunk-dup',
          type: 'text',
          content: 'Working on it.',
          metadata: { sequence: 0, timestamp: new Date().toISOString() },
        };
      },
    },
    eventBus: bus,
  });
  return {
    conversationService,
    agents: {
      listAgents: async () => [],
      getAgent: async (id: string) => ({ id, name: 'Developer', provider: 'test', model: 'test-model' }),
    },
  };
}

async function post(
  room: ActivityRoom,
  urlPath: string,
  body: unknown,
  ctx: unknown,
): Promise<{ status: number; body: unknown }> {
  const { res, body: responseBody, status } = fakeResponse();
  const url = new URL(`http://127.0.0.1:3001${urlPath}`);
  await handleActivityRoomRoute('POST', url.pathname, fakeRequest(body), res, ctx as never, 3001, url, room);
  return { status: status(), body: responseBody() };
}

/** Poll the M9 store until exactly `expected` human.message records carry `content`. */
async function expectHumanMessages(content: string, expected: number): Promise<void> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const records = await getM11ARoom().store.query({ type: 'human.message' });
    const matches = records.filter((r) => (r.payload?.message as string | undefined) === content);
    if (matches.length === expected) return;
    if (matches.length > expected) {
      throw new Error(`expected ${expected} M9 human.message record(s), found ${matches.length}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${expected} M9 human.message record(s), found ${matches.length}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('Activity Room duplicate-message regression', () => {
  it('one @developer submission → one authoritative message → one M9 projection', async () => {
    const { room, bus } = await setup();
    const content = `@developer duplicate-probe-${Date.now()}`;
    const { status } = await post(
      room,
      '/api/messages',
      { content, targets: [{ type: 'agent', agentId: 'agent-developer' }] },
      ctxFor(bus),
    );
    expect(status).toBe(201);
    // The turn's agent execution still fires exactly once (singular
    // execution preserved); only the M9 projection count is repaired.
    await expectHumanMessages(content, 1);
  });

  it('two intentionally identical @developer submissions → two M9 projections', async () => {
    const { room, bus } = await setup();
    const content = `@developer identical-probe-${Date.now()}`;
    const first = await post(
      room,
      '/api/messages',
      { content, targets: [{ type: 'agent', agentId: 'agent-developer' }] },
      ctxFor(bus),
    );
    expect(first.status).toBe(201);
    const second = await post(
      room,
      '/api/messages',
      { content, targets: [{ type: 'agent', agentId: 'agent-developer' }] },
      ctxFor(bus),
    );
    expect(second.status).toBe(201);
    // Identity-based repair: distinct submissions keep distinct records —
    // never collapsed by content.
    await expectHumanMessages(content, 2);
  });

  it('broadcast with no turn keeps the direct mirror as its only M9 path', async () => {
    const { room, bus } = await setup();
    const content = `broadcast-probe-${Date.now()} all hands`;
    const { status } = await post(room, '/api/messages', { content, targets: [{ type: 'all-agents' }] }, ctxFor(bus));
    expect(status).toBe(201);
    // No conversation-runtime turn follows, so the bridge never ingests;
    // the direct mirror remains the single projection.
    await expectHumanMessages(content, 1);
  });
});
