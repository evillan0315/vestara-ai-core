/**
 * Binding tests for the v2 assistant transport layer.
 *
 * The protocol (SSE parsing, error mapping, retries) is owned and tested by
 * `@vestara/assistant`. These tests pin the v2 binding contract only:
 * token-first signatures, same-origin paths, and event/budget passthrough.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  answerQuestion,
  cancelAssistantTurn,
  createAssistantConversation,
  loginAssistant,
  respondToPermission,
  sendAssistantMessage,
  streamAssistantMessage,
  validateAssistantToken,
} from './assistant-api';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;
const err = (status: number, data: unknown) => ok(data, status);

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init?: RequestInit) => handler(String(url), init)),
  );
}

const sseResponse = (chunks: string[]) => {
  const queue = [...chunks];
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    body: {
      getReader: () => ({
        read: async () => {
          const next = queue.shift();
          if (next === undefined) return { done: true, value: undefined };
          return { done: false, value: new TextEncoder().encode(next) };
        },
        releaseLock: () => {},
      }),
    },
  } as unknown as Response;
};

const frame = (event: unknown) => `data: ${JSON.stringify({ schemaVersion: 1, event })}\n\n`;

describe('assistant-api binding', () => {
  it('logs in with a username against the same-origin base', async () => {
    stubFetch(async (url, init) => {
      expect(url).toBe('/api/auth/login');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({ username: 'eddie' }));
      return ok({ user: { token: 'tok-1', username: 'eddie' } }, 201);
    });
    await expect(loginAssistant('eddie')).resolves.toEqual({ token: 'tok-1', username: 'eddie' });
  });

  it('rejects login without a token', async () => {
    stubFetch(async () => ok({ user: {} }));
    await expect(loginAssistant('eddie')).rejects.toMatchObject({ status: 500 });
  });

  it('forwards non-delta frames to onEvent and the budget to the body', async () => {
    const seen: string[] = [];
    let body = '';
    stubFetch(async (_url, init) => {
      body = String(init?.body);
      return sseResponse([
        frame({ type: 'tool', name: 'read', execution: { kind: 'tool', operationId: 'op-1' } }),
        frame({ type: 'delta', content: 'hi' }),
        frame({ type: 'done' }),
      ]);
    });
    const deltas: string[] = [];
    const result = await streamAssistantMessage(
      'tok',
      'conv-1',
      'hello',
      {
        signal: new AbortController().signal,
        onDelta: (d) => deltas.push(d),
        onEvent: (type) => seen.push(type),
      },
      { maxToolCalls: 150 },
    );
    expect(result).toEqual({ ended: 'done', text: 'hi' });
    expect(deltas).toEqual(['hi']);
    expect(seen).toEqual(['tool', 'done']);
    expect(JSON.parse(body).executionConfig).toEqual({ maxToolCalls: 150 });
  });

  it('answers permission and question gates', async () => {
    const calls: { url: string; body: string }[] = [];
    stubFetch(async (url, init) => {
      calls.push({ url, body: String(init?.body) });
      return ok({ ok: true });
    });
    await expect(respondToPermission('tok', 'c', 'per-1', 'allow-once')).resolves.toBe(true);
    await expect(answerQuestion('tok', 'c', 'q-1', [['a']])).resolves.toBe(true);
    expect(calls[0]).toMatchObject({ url: '/api/conversations/c/permissions/per-1' });
    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({ decision: 'allow-once' });
    expect(calls[1]?.url).toBe('/api/conversations/c/questions/q-1');
  });

  it('reports busy on 409 and validates tokens', async () => {
    stubFetch(async (url) => {
      if (url.endsWith('/stream')) return err(409, { error: 'busy' });
      return ok({ user: { id: 'u1' } });
    });
    const handlers = { signal: new AbortController().signal, onDelta: () => {} };
    await expect(streamAssistantMessage('tok', 'c', 'hi', handlers)).resolves.toMatchObject({ ended: 'busy' });
    await expect(validateAssistantToken('tok')).resolves.toBe(true);
  });

  it('cancels idempotently and falls back to the messages call', async () => {
    stubFetch(async (url) => {
      if (url.endsWith('/cancel')) return ok({ cancelled: true });
      if (url.endsWith('/messages')) return ok({ response: { content: 'Fallback' }, latency: 7 });
      if (url.endsWith('/api/conversations')) return ok({ conversation: { id: 'c1' } }, 201);
      throw new Error(`unexpected ${url}`);
    });
    await expect(cancelAssistantTurn('tok', 'c1')).resolves.toBe(true);
    await expect(createAssistantConversation('tok')).resolves.toBe('c1');
    await expect(sendAssistantMessage('tok', 'c1', 'hi')).resolves.toEqual({ text: 'Fallback', latencyMs: 7 });
  });
});
