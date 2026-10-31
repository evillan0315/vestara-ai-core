import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantApiError, createAssistantTransport } from '../src/transport';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;
const err = (status: number, data: unknown) => ok(data, status);

// Minimal SSE reader stub: yields the given chunks then done.
function sseResponse(chunks: string[], status = 200) {
  const queue = [...chunks];
  return {
    ok: status >= 200 && status < 300,
    status,
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
}

const frame = (event: unknown) => `data: ${JSON.stringify({ schemaVersion: 1, event })}\n\n`;

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  return vi.fn((url: unknown, init?: RequestInit) => handler(String(url), init)) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('assistant transport', () => {
  it('logs in and strips trailing slashes from the base URL', async () => {
    const fetchFn = stubFetch(async (url, init) => {
      expect(url).toBe('https://api.example.com/api/auth/login');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({ username: 'eddie' }));
      return ok({ user: { token: 'tok-1', username: 'eddie' } }, 201);
    });
    const t = createAssistantTransport({ baseUrl: 'https://api.example.com///', fetchFn });
    await expect(t.loginAssistant('eddie')).resolves.toEqual({ token: 'tok-1', username: 'eddie' });
  });

  it('rejects login without a token', async () => {
    const t = createAssistantTransport({ fetchFn: stubFetch(async () => ok({ user: {} })) });
    await expect(t.loginAssistant('eddie')).rejects.toThrow('Login returned no token');
  });

  it('returns false on 401 token validation but rethrows offline', async () => {
    const bad = createAssistantTransport({ fetchFn: stubFetch(async () => err(401, { error: 'expired' })) });
    await expect(bad.validateAssistantToken('stale')).resolves.toBe(false);
    const offline = createAssistantTransport({
      fetchFn: stubFetch(async () => {
        throw new TypeError('fetch failed');
      }),
    });
    await expect(offline.validateAssistantToken('tok')).rejects.toMatchObject({ status: 0 });
  });

  it('creates a conversation and reads messages with tool observations', async () => {
    const fetchFn = stubFetch(async (url) => {
      if (url === '/api/conversations') return ok({ conversation: { id: 'conv-1' } }, 201);
      return ok({
        conversation: {
          messages: [
            {
              id: 'm-1',
              conversationId: 'conv-1',
              role: 'assistant',
              content: 'done',
              createdAt: '2026-10-26T00:00:00.000Z',
              toolObservations: [
                { toolCallId: 'c-1', operationId: 'op-1', toolName: 'read', status: 'completed', content: 'ok' },
              ],
            },
          ],
        },
      });
    });
    const t = createAssistantTransport({ fetchFn });
    await expect(t.createAssistantConversation('tok')).resolves.toBe('conv-1');
    const messages = await t.getConversation('tok', 'conv-1');
    expect(messages[0]?.toolObservations?.[0]?.operationId).toBe('op-1');
  });

  it('streams deltas and forwards tool/status frames to onEvent', async () => {
    const seen: { type: string; content: string }[] = [];
    const fetchFn = stubFetch(async () =>
      sseResponse([
        frame({ type: 'delta', content: 'hi ' }),
        frame({ type: 'tool', name: 'read', execution: { kind: 'tool', operationId: 'op-1' } }),
        frame({ type: 'status', content: 'Reading…', execution: { kind: 'tool' } }),
        frame({ type: 'delta', content: 'there' }),
        frame({ type: 'done' }),
      ]),
    );
    const t = createAssistantTransport({ fetchFn });
    const deltas: string[] = [];
    const result = await t.streamAssistantMessage(
      'tok',
      'conv-1',
      'hello',
      {
        signal: new AbortController().signal,
        onDelta: (d) => deltas.push(d),
        onEvent: (type, content) => seen.push({ type, content }),
      },
      { maxToolCalls: 150 },
    );
    expect(result).toEqual({ ended: 'done', text: 'hi there' });
    expect(deltas).toEqual(['hi ', 'there']);
    expect(seen.map((e) => e.type)).toEqual(['tool', 'status', 'done']);
  });

  it('sends executionConfig only when maxToolCalls is set', async () => {
    const bodies: string[] = [];
    const fetchFn = stubFetch(async (_url, init) => {
      bodies.push(String(init?.body));
      return sseResponse([frame({ type: 'done' })]);
    });
    const t = createAssistantTransport({ fetchFn });
    const handlers = { signal: new AbortController().signal, onDelta: () => {} };
    await t.streamAssistantMessage('tok', 'c', 'hi', handlers);
    expect(bodies[0]).not.toContain('executionConfig');
    await t.streamAssistantMessage('tok', 'c', 'hi', handlers, { maxToolCalls: 0 });
    expect(JSON.parse(bodies[1] ?? '{}').executionConfig).toEqual({ maxToolCalls: 0 });
  });

  it('returns busy on 409 and surfaces stream errors', async () => {
    const busy = createAssistantTransport({ fetchFn: stubFetch(async () => err(409, { error: 'busy' })) });
    const handlers = { signal: new AbortController().signal, onDelta: () => {} };
    await expect(busy.streamAssistantMessage('tok', 'c', 'hi', handlers)).resolves.toEqual({ ended: 'busy', text: '' });

    const failed = createAssistantTransport({
      fetchFn: stubFetch(async () => sseResponse([frame({ type: 'error', content: 'boom' })])),
    });
    await expect(failed.streamAssistantMessage('tok', 'c', 'hi', handlers)).resolves.toMatchObject({
      ended: 'error',
      error: 'boom',
    });
  });

  it('cancel/active/latest-text behave idempotently', async () => {
    const fetchFn = stubFetch(async (url) => {
      if (url.endsWith('/cancel')) return ok({ cancelled: true });
      if (url.endsWith('/active')) return ok({ active: false });
      return ok({ conversation: { messages: [{ role: 'assistant', content: '  latest  ' }] } });
    });
    const t = createAssistantTransport({ fetchFn });
    await expect(t.cancelAssistantTurn('tok', 'c')).resolves.toBe(true);
    await expect(t.isAssistantTurnActive('tok', 'c')).resolves.toBe(false);
    await expect(t.getLatestAssistantText('tok', 'c')).resolves.toBe('latest');
  });

  it('falls back to the messages call and surfaces HTTP errors', async () => {
    const fetchFn = stubFetch(async (url) => {
      if (url.endsWith('/messages')) return ok({ response: { content: 'fallback' }, latency: 12 });
      return err(500, { error: 'nope' });
    });
    const t = createAssistantTransport({ fetchFn });
    await expect(t.sendAssistantMessage('tok', 'c', 'hi')).resolves.toEqual({ text: 'fallback', latencyMs: 12 });
    await expect(t.getConversation('tok', 'missing')).rejects.toBeInstanceOf(AssistantApiError);
  });
});
