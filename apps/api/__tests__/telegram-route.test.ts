/**
 * VES-TG-010: Telegram route vertical slice.
 *
 * Proves natural-language text entering through the Telegram HTTP surface
 * reaches the existing Global Assistant conversation path
 * (ConversationService.sendMessage) with no Telegram-owned execution,
 * provider, permission, or conversation authority.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTelegramRoute, splitTelegramText } from '../src/routes/telegram';

// Mirror capture: telegram.ts dynamically imports ./activity-room-m11a.js.
// Mock it so the Activity Room projection is asserted without touching
// real durable stores.
const mirrored: unknown[] = [];
vi.mock('../src/routes/activity-room-m11a.js', () => ({
  getM11ARoom: () => ({
    store: {
      append: async (event: unknown) => {
        mirrored.push(event);
        return event;
      },
    },
  }),
}));

// ─── Doubles ─────────────────────────────────────────────────────

interface SendMessageCall {
  conversationId: string;
  content: string;
  options?: { model?: string; provider?: string };
}

let globalConvSeq = 0;

function makeContextStub() {
  const calls: SendMessageCall[] = [];
  const created: string[] = [];
  return {
    calls,
    created,
    ctx: {
      repoPath: '/tmp/tg-test-ws',
      conversationService: {
        createConversation: async (_principalId: string) => {
          // Production conversation IDs are globally unique — the stub
          // must be too, or the double-bind guard (correctly) rejects.
          globalConvSeq += 1;
          const id = `v-conv-${globalConvSeq}`;
          created.push(id);
          return { id, title: `Conversation ${globalConvSeq}` };
        },
        sendMessage: async (conversationId: string, content: string, options?: SendMessageCall['options']) => {
          calls.push({ conversationId, content, options });
          return { response: { content: `GA reply to: ${content}`, tokens: 3 } };
        },
      },
    } as any,
  };
}

function mockReq(body: unknown, headers: Record<string, string> = {}): any {
  const req = new EventEmitter() as any;
  req.headers = headers;
  req.pause = () => {};
  setImmediate(() => {
    req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    req.emit('end');
  });
  return req;
}

function mockRes(): any {
  return {
    writableEnded: false,
    headersSent: false,
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(status: number, headers: Record<string, string>) {
      this.statusCode = status;
      this.headers = headers;
    },
    setHeader() {},
    end(data?: string) {
      if (data) this.body += data;
      this.writableEnded = true;
    },
  };
}

function parsedBody(res: any): any {
  return JSON.parse(res.body);
}

function telegramUpdate(updateId: number, userId: number, chatId: number, text: string) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId * 10,
      from: { id: userId, first_name: 'Test', username: 'testuser' },
      chat: { id: chatId, type: 'private' },
      text,
      date: 1700000000,
    },
  };
}

// No Bot API calls during tests — replies are skipped, pipeline unaffected.
beforeEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  mirrored.length = 0;
});

// ─── splitTelegramText ───────────────────────────────────────────

describe('splitTelegramText', () => {
  it('keeps short text in a single chunk', () => {
    expect(splitTelegramText('hello')).toEqual(['hello']);
  });

  it('splits long text into bounded chunks', () => {
    const chunks = splitTelegramText(`a\n`.repeat(3000));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(4096);
    expect(chunks.join('\n')).toContain('a');
  });
});

// ─── Simulate vertical slice ─────────────────────────────────────

describe('POST /api/telegram/simulate', () => {
  it('routes NL text through ConversationService.sendMessage', async () => {
    const stub = makeContextStub();
    const res = mockRes();
    const handled = await handleTelegramRoute(
      'POST',
      '/api/telegram/simulate',
      mockReq({ text: 'hello there', userId: 'tg-u1', chatId: 'tg-c1', displayName: 'U1' }),
      res,
      stub.ctx,
      0,
      new URL('http://localhost/api/telegram/simulate'),
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = parsedBody(res);
    expect(body.status).toBe('routed');
    expect(body.response).toBe('GA reply to: hello there');
    expect(body.reply).toBe('skipped'); // no bot token in tests
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]!.content).toBe('hello there');
    expect(stub.calls[0]!.conversationId).toBe(body.conversationId);
    expect(stub.created).toHaveLength(1);
  });

  it('reuses the bound conversation on the next message (session continuity)', async () => {
    const stub = makeContextStub();
    const post = (text: string) =>
      handleTelegramRoute(
        'POST',
        '/api/telegram/simulate',
        mockReq({ text, userId: 'tg-u2', chatId: 'tg-c2', displayName: 'U2' }),
        mockRes(),
        stub.ctx,
        0,
        new URL('http://localhost/api/telegram/simulate'),
      );

    const res1 = mockRes();
    await handleTelegramRoute(
      'POST',
      '/api/telegram/simulate',
      mockReq({ text: 'first', userId: 'tg-u2', chatId: 'tg-c2', displayName: 'U2' }),
      res1,
      stub.ctx,
      0,
      new URL('http://localhost/api/telegram/simulate'),
    );
    await post('second');

    // One Vestara conversation created; both turns sent to it — the
    // existing conversation path (with its runtimeSessionId) is reused.
    expect(stub.created).toHaveLength(1);
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[0]!.conversationId).toBe(stub.calls[1]!.conversationId);
    expect(parsedBody(res1).conversationId).toBe(stub.calls[0]!.conversationId);
  });

  it('passes binding model/provider through without Telegram authority', async () => {
    const stub = makeContextStub();
    const res = mockRes();
    await handleTelegramRoute(
      'POST',
      '/api/telegram/simulate',
      mockReq({ text: 'hi', userId: 'tg-u3', chatId: 'tg-c3' }),
      res,
      stub.ctx,
      0,
      new URL('http://localhost/api/telegram/simulate'),
    );

    expect(stub.calls[0]!.options).toMatchObject({ model: 'muse-spark-1.3-contributor', provider: 'opencode-go' });
  });
});

// ─── Webhook behavior ────────────────────────────────────────────

describe('POST /api/telegram/webhook', () => {
  it('rejects unpaired identities without touching the assistant', async () => {
    const stub = makeContextStub();
    const res = mockRes();
    await handleTelegramRoute(
      'POST',
      '/api/telegram/webhook',
      mockReq(telegramUpdate(9001, 424242, 434343, 'hello')),
      res,
      stub.ctx,
      0,
      new URL('http://localhost/api/telegram/webhook'),
    );

    expect(res.statusCode).toBe(200);
    expect(parsedBody(res).status).toBe('unpaired');
    expect(stub.calls).toHaveLength(0);
  });

  it('marks Telegram retries as duplicates', async () => {
    const stub = makeContextStub();
    const update = telegramUpdate(9002, 424243, 434344, 'hello');
    const first = mockRes();
    await handleTelegramRoute(
      'POST',
      '/api/telegram/webhook',
      mockReq(update),
      first,
      stub.ctx,
      0,
      new URL('http://localhost/api/telegram/webhook'),
    );
    const retry = mockRes();
    await handleTelegramRoute(
      'POST',
      '/api/telegram/webhook',
      mockReq(update),
      retry,
      stub.ctx,
      0,
      new URL('http://localhost/api/telegram/webhook'),
    );

    expect(parsedBody(first).status).toBe('unpaired');
    expect(parsedBody(retry).status).toBe('duplicate');
  });

  it('rejects malformed payloads', async () => {
    const stub = makeContextStub();
    const res = mockRes();
    await handleTelegramRoute(
      'POST',
      '/api/telegram/webhook',
      mockReq('not-json'),
      res,
      stub.ctx,
      0,
      new URL('http://localhost/api/telegram/webhook'),
    );

    expect(res.statusCode).toBe(400);
  });
});

// ─── Activity Room projection ─────────────────────────────────────

describe('Telegram → Activity Room projection', () => {
  it('mirrors incoming text and the assistant reply without affecting the pipeline', async () => {
    const stub = makeContextStub();
    const res = mockRes();
    await handleTelegramRoute(
      'POST',
      '/api/telegram/simulate',
      mockReq({ text: 'hello activity room', userId: 'tg-m1', chatId: 'tg-mc1', displayName: 'M1' }),
      res,
      stub.ctx,
      0,
      new URL('http://localhost/api/telegram/simulate'),
    );

    expect(res.statusCode).toBe(200);
    expect(parsedBody(res).status).toBe('routed');

    // Fire-and-forget mirrors resolve asynchronously — flush before asserting.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mirrored.length).toBe(2);
  });

  it('still mirrors incoming text when the pipeline rejects (unpaired)', async () => {
    const stub = makeContextStub();
    const res = mockRes();
    await handleTelegramRoute(
      'POST',
      '/api/telegram/webhook',
      mockReq(telegramUpdate(9101, 424244, 434345, 'knock knock')),
      res,
      stub.ctx,
      0,
      new URL('http://localhost/api/telegram/webhook'),
    );

    expect(parsedBody(res).status).toBe('unpaired');

    await new Promise((resolve) => setTimeout(resolve, 100));
    // Incoming only — no reply to mirror on rejection.
    expect(mirrored.length).toBe(1);
  });
});
