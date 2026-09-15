/**
 * Reload survival: UI lifetime ≠ execution lifetime ≠ OpenCode session lifetime.
 *
 * - Disconnect (generator.return / SSE close) must NOT abort the OpenCode session.
 * - Explicit Stop (signal abort / POST /cancel) MUST abort the matching session.
 * - Second POST /stream while a turn is in-flight must NOT start a duplicate
 *   execution (409 conversation-busy); reloaded UI discovers via GET /active.
 */
import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { DefaultContextAssembler } from '@vestara/context';
import { DefaultConversationService } from '@vestara/conversation';
import type { OpenCodeHttpClient } from '@vestara/opencode-runtime';
import type { CompletionRequest } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import { runAssistantOpenCodeTurn } from '../src/assistant-opencode-adapter.js';
import {
  cancelTurn,
  handleConversationsRoute,
  isTurnActive,
  registerTurnController,
  releaseTurnController,
} from '../src/routes/conversations.js';
import type { WorkspaceContext } from '../src/workspace-context.js';

function sseEvent(id: string, type: string, payload: Record<string, unknown>) {
  return { id, type, timestamp: new Date().toISOString(), payload: { sessionID: 'sess-1', ...payload } };
}

function makeRequest(signal?: AbortSignal): CompletionRequest {
  return {
    model: 'gpt-test',
    messages: [{ role: 'user', content: 'long running task' }],
    ...(signal ? { signal } : {}),
  };
}

describe('adapter termination: detach ≠ cancel', () => {
  it('early consumer return (reload disconnect) does NOT abort the session', async () => {
    const aborted: string[] = [];
    const client = {
      createSession: async () => ({ id: 'sess-1', status: 'idle' as const }),
      sendMessageAsync: async () => undefined,
      openEventStream: async function* (_ctx: unknown, signal?: AbortSignal) {
        yield sseEvent('e1', 'session.next.text.delta', { delta: 'Working...' });
        // Block until the adapter closes the reader (finally → controller.abort).
        await new Promise<void>((resolve) => {
          if (signal?.aborted) {
            resolve();
            return;
          }
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      } as OpenCodeHttpClient['openEventStream'],
      getSessionDiff: async () => [],
      getSessionTodos: async () => [],
      abortSession: async (id: string) => {
        aborted.push(id);
      },
    } as unknown as OpenCodeHttpClient;

    const gen = runAssistantOpenCodeTurn(
      { client, workspaceId: 'ws', directory: '/repo', agent: 'vestara-assistant', turnTimeoutMs: 30000 },
      makeRequest(),
    );
    const first = await gen.next();
    expect(first.done).toBe(false);
    // Simulate SSE disconnect: the transport stops consuming (old code did
    // `break`, which calls generator.return()). Execution must survive.
    await gen.return(undefined);
    expect(aborted).toHaveLength(0);
  });

  it('explicit Stop (signal abort) DOES abort the session', async () => {
    const aborted: string[] = [];
    const controller = new AbortController();
    const client = {
      createSession: async () => ({ id: 'sess-1', status: 'idle' as const }),
      sendMessageAsync: async () => undefined,
      openEventStream: async function* (_ctx: unknown, signal?: AbortSignal) {
        yield sseEvent('e1', 'session.next.text.delta', { delta: 'Working...' });
        await new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      } as OpenCodeHttpClient['openEventStream'],
      getSessionDiff: async () => [],
      getSessionTodos: async () => [],
      abortSession: async (id: string) => {
        aborted.push(id);
      },
    } as unknown as OpenCodeHttpClient;

    const done = (async () => {
      const chunks = [];
      for await (const item of runAssistantOpenCodeTurn(
        { client, workspaceId: 'ws', directory: '/repo', agent: 'vestara-assistant', turnTimeoutMs: 30000 },
        makeRequest(controller.signal),
      )) {
        chunks.push(item);
      }
      return chunks;
    })();
    setTimeout(() => controller.abort(), 20);
    await done;
    expect(aborted).toEqual(['sess-1']);
  });

  it('genuine runtime exception settles FAILED and aborts', async () => {
    const aborted: string[] = [];
    const client = {
      createSession: async () => ({ id: 'sess-1', status: 'idle' as const }),
      sendMessageAsync: async () => {
        throw new Error('opencode down');
      },
      openEventStream: async function* () {} as OpenCodeHttpClient['openEventStream'],
      getSessionDiff: async () => [],
      getSessionTodos: async () => [],
      abortSession: async (id: string) => {
        aborted.push(id);
      },
    } as unknown as OpenCodeHttpClient;

    await expect(
      (async () => {
        const chunks = [];
        for await (const item of runAssistantOpenCodeTurn(
          { client, workspaceId: 'ws', directory: '/repo', agent: 'vestara-assistant', turnTimeoutMs: 30000 },
          makeRequest(),
        )) {
          chunks.push(item);
        }
      })(),
    ).rejects.toThrow('opencode down');
    expect(aborted).toEqual(['sess-1']);
  });
});

describe('conversations route: reattach ≠ create, disconnect ≠ cancel', () => {
  function fakeRequest(method: string, url: string, body?: string): http.IncomingMessage {
    const req = new EventEmitter() as unknown as http.IncomingMessage & {
      method: string;
      url: string;
      headers: Record<string, string>;
    };
    req.method = method;
    req.url = url;
    req.headers = {};
    if (body) {
      queueMicrotask(() => {
        req.emit('data', Buffer.from(body));
        req.emit('end');
      });
    } else {
      queueMicrotask(() => req.emit('end'));
    }
    return req;
  }

  function jsonResponse() {
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
    return { res, status: () => status, body: () => body };
  }

  function ctxWithService(): WorkspaceContext {
    const svc = new DefaultConversationService({
      contextAssembler: new DefaultContextAssembler(),
      providerExecutor: {
        async complete() {
          return {
            id: 'r',
            model: 'm',
            provider: 'p',
            content: 'hi',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            latency: 0,
          };
        },
        async *stream() {
          yield {
            id: 'c',
            type: 'text',
            content: 'hi',
            metadata: { sequence: 0, timestamp: new Date().toISOString() },
          };
        },
      },
    });
    return { conversationService: svc } as unknown as WorkspaceContext;
  }

  it('isTurnActive tracks register/release; cancelTurn fires only the match', () => {
    const a = new AbortController();
    const b = new AbortController();
    registerTurnController('conv-a', a);
    expect(isTurnActive('conv-a')).toBe(true);
    expect(isTurnActive('conv-b')).toBe(false);
    expect(cancelTurn('conv-b')).toBe(false);
    expect(a.signal.aborted).toBe(false);
    expect(cancelTurn('conv-a')).toBe(true);
    expect(a.signal.aborted).toBe(true);
    // Releasing with a non-matching controller keeps the entry.
    releaseTurnController('conv-a', b);
    expect(isTurnActive('conv-a')).toBe(true);
    releaseTurnController('conv-a', a);
    expect(isTurnActive('conv-a')).toBe(false);
    expect(cancelTurn('conv-a')).toBe(false);
  });

  it('second POST /stream while in-flight returns 409 (no duplicate execution)', async () => {
    const ctx = ctxWithService();
    const conv = await ctx.conversationService.createConversation('local');
    const holder = new AbortController();
    registerTurnController(conv.id, holder);
    try {
      const { res, status, body } = jsonResponse();
      const handled = await handleConversationsRoute(
        'POST',
        `/api/conversations/${conv.id}/stream`,
        fakeRequest('POST', `/api/conversations/${conv.id}/stream`, JSON.stringify({ message: 'again' })),
        res,
        ctx,
      );
      expect(handled).toBe(true);
      expect(status()).toBe(409);
      expect((body() as { error: string }).error).toBe('conversation-busy');
    } finally {
      releaseTurnController(conv.id, holder);
    }
  });

  it('GET /active reports authoritative execution identity without creating work', async () => {
    const ctx = ctxWithService();
    const conv = await ctx.conversationService.createConversation('local');
    // Persist a runtime session id so discovery returns it.
    await ctx.conversationService.sendMessage(conv.id, 'hello');
    const stored = await ctx.conversationService.getConversation(conv.id, { limit: 0, offset: 0 });

    const idle = jsonResponse();
    await handleConversationsRoute(
      'GET',
      `/api/conversations/${conv.id}/active`,
      fakeRequest('GET', `/api/conversations/${conv.id}/active`),
      idle.res,
      ctx,
    );
    expect(idle.status()).toBe(200);
    expect((idle.body() as { active: boolean }).active).toBe(false);

    const holder = new AbortController();
    registerTurnController(conv.id, holder);
    try {
      const { res, status, body } = jsonResponse();
      await handleConversationsRoute(
        'GET',
        `/api/conversations/${conv.id}/active`,
        fakeRequest('GET', `/api/conversations/${conv.id}/active`),
        res,
        ctx,
      );
      expect(status()).toBe(200);
      const payload = body() as { active: boolean; runtimeSessionId?: string; conversationId: string };
      expect(payload.active).toBe(true);
      expect(payload.conversationId).toBe(conv.id);
      // When the conversation owns a runtime session, discovery surfaces it.
      if (stored?.runtimeSessionId) expect(payload.runtimeSessionId).toBe(stored.runtimeSessionId);
    } finally {
      releaseTurnController(conv.id, holder);
    }
  });
});
