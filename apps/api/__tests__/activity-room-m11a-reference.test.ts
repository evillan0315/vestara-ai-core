/**
 * AR-REPLY-003 — route-level proof that M11A-canonical references resolve.
 *
 * Failure class: M11C displays M11A projection ids verbatim
 * (`act-<seq>-human.me` for mirrored external conversation). The legacy
 * submission validator only queried the legacy ActivityStore, so Reply to
 * an external record failed with UNKNOWN_REFERENCE.
 *
 * Repair: the validator falls back to the M11A M9 store by canonical
 * activity id. Strictness is preserved — ids unknown in both namespaces
 * still fail with 400.
 *
 * Isolation: vitest forks pool gives each file fresh module state, so the
 * process-wide M11A singleton initialized here cannot leak into other
 * files (same precedent as activity-room-duplicate-message.test.ts).
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { fromHumanMessage } from '@vestara/activity-room';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityRoom } from '../src/activity-room';
import { createActivityRoom } from '../src/activity-room';
import { handleActivityRoomRoute } from '../src/routes/activity-room';
import { getM11ARoom, initM11AActivityRoom } from '../src/routes/activity-room-m11a';

const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-reply003-'));
await initM11AActivityRoom(repoDir);

afterEach(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
  fs.mkdirSync(repoDir, { recursive: true });
});

function fakeResponse(): {
  res: http.ServerResponse;
  body: () => unknown;
  status: () => number;
} {
  let statusCode = 200;
  let payload: unknown;
  const res = {
    writeHead: (code: number) => {
      statusCode = code;
    },
    end: (data?: string) => {
      try {
        payload = data ? JSON.parse(data) : undefined;
      } catch {
        payload = data;
      }
    },
  } as unknown as http.ServerResponse;
  return { res, body: () => payload, status: () => statusCode };
}

function fakeRequest(body: unknown): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage;
  queueMicrotask(() => {
    req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}

async function post(room: ActivityRoom, pathName: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const { res, body: responseBody, status } = fakeResponse();
  const url = new URL(`http://127.0.0.1:3001${pathName}`);
  await handleActivityRoomRoute('POST', url.pathname, fakeRequest(body), res, undefined as never, 3001, url, room);
  return { status: status(), body: responseBody() };
}

async function seedExternalRecord(): Promise<string> {
  const record = await getM11ARoom().store.append(
    fromHumanMessage({
      message: '[Telegram] Eddie: hello from the channel',
      userId: 'external-telegram-123',
      displayName: 'Eddie (Telegram)',
      messageId: 'tg-in-456',
    }),
  );
  return record.activityId;
}

describe('AR-REPLY-003 referenced identity across namespaces', () => {
  it('resolves an M11A-mirrored external record id at submission', async () => {
    const activityId = await seedExternalRecord();
    expect(activityId).toMatch(/^act-\d+-human\.me$/);
    const room = createActivityRoom();
    const { status, body } = await post(room, '/api/messages', {
      content: 'Acknowledged — looking into it.',
      targets: [{ type: 'all-agents' }],
      referencedActivityIds: [activityId],
    });
    expect(status).toBe(201);
    expect((body as { record: { referencedActivityIds: string[] } }).record.referencedActivityIds).toEqual([
      activityId,
    ]);
  });

  it('still rejects fabricated M11A-shaped ids (masquerade fails safe)', async () => {
    const room = createActivityRoom();
    const { status, body } = await post(room, '/api/messages', {
      content: 'hello',
      targets: [{ type: 'all-agents' }],
      referencedActivityIds: ['act-1175-human.me'],
    });
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe('UNKNOWN_REFERENCE');
  });

  it('still resolves legacy-namespace ids (internal path unchanged)', async () => {
    const room = createActivityRoom();
    const first = await post(room, '/api/messages', {
      content: 'First message.',
      targets: [{ type: 'all-agents' }],
    });
    expect(first.status).toBe(201);
    const known = (first.body as { record: { id: string } }).record.id;
    const reply = await post(room, '/api/messages', {
      content: 'Replying.',
      targets: [{ type: 'all-agents' }],
      referencedActivityIds: [known],
    });
    expect(reply.status).toBe(201);
  });
});
