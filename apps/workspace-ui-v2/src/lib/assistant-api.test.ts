import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelAssistantTurn,
  createAssistantConversation,
  getLatestAssistantText,
  isAssistantTurnActive,
  loginAssistant,
  loginWithPassword,
  sendAssistantMessage,
  streamAssistantMessage,
  validateAssistantToken,
  verifyMfaCode,
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

describe('assistant-api', () => {
  it('logs in with a username', async () => {
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

  it('creates conversations by id', async () => {
    stubFetch(async (url, init) => {
      expect(url).toBe('/api/conversations');
      expect(init?.headers).toMatchObject({ authorization: 'Bearer t' });
      return ok({ conversation: { id: 'conv-9' } }, 201);
    });
    await expect(createAssistantConversation('t')).resolves.toBe('conv-9');
  });

  it('returns the assistant reply text with latency, never the user echo', async () => {
    stubFetch(async (url) => {
      expect(url).toBe('/api/conversations/conv-1/messages');
      return ok({ message: { content: 'hi' }, response: { content: 'Live answer' }, latency: 12 });
    });
    await expect(sendAssistantMessage('t', 'conv-1', 'hi')).resolves.toMatchObject({
      text: 'Live answer',
      latencyMs: 12,
    });
  });

  it('surfaces API error bodies with status', async () => {
    stubFetch(async () => err(400, { error: 'message is required' }));
    await expect(sendAssistantMessage('t', 'c', 'x')).rejects.toMatchObject({
      status: 400,
      message: 'message is required',
    });
  });

  it('reports transport failure as status 0', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(sendAssistantMessage('t', 'c', 'x')).rejects.toMatchObject({ status: 0 });
  });

  it('validates tokens and distinguishes offline from signed-out', async () => {
    stubFetch(async () => ok({ user: { id: 'u1' } }));
    await expect(validateAssistantToken('good')).resolves.toBe(true);
    stubFetch(async () => err(401, { error: 'Authentication is required.' }));
    await expect(validateAssistantToken('bad')).resolves.toBe(false);
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(validateAssistantToken('x')).rejects.toMatchObject({ status: 0 });
  });

  const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

  const frame = (event: unknown) => ({
    schemaVersion: 1,
    conversationId: 'c',
    messageId: 'm',
    sequence: 0,
    timestamp: 't',
    event,
  });

  it('streams deltas to done', async () => {
    stubFetch(
      async () =>
        new Response(
          sse([
            frame({ type: 'delta', content: 'Hel' }),
            frame({ type: 'delta', content: 'lo' }),
            frame({ type: 'done' }),
          ]),
        ),
    );
    const seen: string[] = [];
    const result = await streamAssistantMessage('t', 'c', 'hi', {
      signal: new AbortController().signal,
      onDelta: (d) => seen.push(d),
    });
    expect(result).toEqual({ ended: 'done', text: 'Hello' });
    expect(seen).toEqual(['Hel', 'lo']);
  });

  it('reports busy on 409 without duplicating turns', async () => {
    stubFetch(async () => new Response('{}', { status: 409 }));
    const result = await streamAssistantMessage('t', 'c', 'hi', {
      signal: new AbortController().signal,
      onDelta: () => {},
    });
    expect(result).toEqual({ ended: 'busy', text: '' });
  });

  it('reports aborted on an aborted signal', async () => {
    stubFetch(async (_url, init) => {
      if ((init?.signal as AbortSignal | undefined)?.aborted) {
        throw new DOMException('AbortError', 'AbortError');
      }
      throw new Error('unreachable');
    });
    const controller = new AbortController();
    controller.abort();
    const result = await streamAssistantMessage('t', 'c', 'hi', {
      signal: controller.signal,
      onDelta: () => {},
    });
    expect(result.ended).toBe('aborted');
  });

  it('surfaces stream error frames with partial text', async () => {
    stubFetch(
      async () =>
        new Response(sse([frame({ type: 'delta', content: 'part' }), frame({ type: 'error', content: 'boom' })])),
    );
    const result = await streamAssistantMessage('t', 'c', 'hi', {
      signal: new AbortController().signal,
      onDelta: () => {},
    });
    expect(result).toEqual({ ended: 'error', text: 'part', error: 'boom' });
  });

  it('cancels idempotently and never throws', async () => {
    stubFetch(async () => ok({ cancelled: true }));
    await expect(cancelAssistantTurn('t', 'c')).resolves.toBe(true);
    stubFetch(async () => err(500, { error: 'x' }));
    await expect(cancelAssistantTurn('t', 'c')).resolves.toBe(false);
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(cancelAssistantTurn('t', 'c')).resolves.toBe(false);
  });

  it('reads turn activity and the latest assistant text', async () => {
    stubFetch(async (url) => {
      if (url.endsWith('/active')) return ok({ conversationId: 'c', active: true });
      return ok({
        conversation: {
          messages: [
            { role: 'assistant', content: 'Second answer' },
            { role: 'user', content: 'q2' },
            { role: 'assistant', content: 'First answer' },
          ],
        },
      });
    });
    await expect(isAssistantTurnActive('t', 'c')).resolves.toBe(true);
    await expect(getLatestAssistantText('t', 'c')).resolves.toBe('Second answer');
  });

  it('logs in with a password or surfaces the MFA challenge', async () => {
    stubFetch(async (url, init) => {
      expect(url).toBe('/api/auth/password');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({ username: 'eddie', password: 's3cret' }));
      return ok({ user: { token: 'tok-2', username: 'eddie' } });
    });
    await expect(loginWithPassword('eddie', 's3cret')).resolves.toMatchObject({
      mfaRequired: false,
      session: { token: 'tok-2' },
    });
    stubFetch(async () => ok({ mfaRequired: true, username: 'eddie' }));
    await expect(loginWithPassword('eddie', 's3cret')).resolves.toMatchObject({ mfaRequired: true });
  });

  it('verifies MFA codes into a session', async () => {
    stubFetch(async (url, init) => {
      expect(url).toBe('/api/auth/mfa/verify');
      expect(init?.body).toBe(JSON.stringify({ username: 'eddie', code: '123456' }));
      return ok({ user: { token: 'tok-3', username: 'eddie' } });
    });
    await expect(verifyMfaCode('eddie', '123456')).resolves.toEqual({ token: 'tok-3', username: 'eddie' });
    stubFetch(async () => ok({ user: {} }));
    await expect(verifyMfaCode('eddie', '123456')).rejects.toMatchObject({ status: 500 });
  });
});
