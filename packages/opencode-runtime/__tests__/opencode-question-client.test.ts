import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeHttpClient } from '../src/client/opencode-http-client';
import { resolveOpenCodeConfig } from '../src/config';

const requestId = 'que_0df33ddba0011s551em374V2C6';
const sessionId = 'ses_f20cc3dcfffe3sRYVpCg2Th48L';

function createClient() {
  return new OpenCodeHttpClient(
    resolveOpenCodeConfig({
      baseUrl: 'http://opencode.test:4096',
      password: 'test-password',
      requestTimeoutMs: 1_000,
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OpenCode question delivery contract', () => {
  it('routes a question.asked reply by exact request ID through the global registry', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(true), { status: 200, headers: { 'content-type': 'application/json' } }),
      );

    await expect(createClient().replyToQuestion(sessionId, requestId, { answers: [['Something else']] })).resolves.toBe(
      true,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://opencode.test:4096/question/${requestId}/reply`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ answers: [['Something else']] }));
  });

  it('recognizes the authoritative global reject response without a session route fallback', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(true), { status: 200, headers: { 'content-type': 'application/json' } }),
      );

    await expect(createClient().rejectQuestion(sessionId, requestId)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://opencode.test:4096/question/${requestId}/reject`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('fails closed on question-not-found and never treats 404 as delivery success', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('QuestionNotFoundError', { status: 404 }));

    await expect(
      createClient().replyToQuestion(sessionId, requestId, { answers: [['Something else']] }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`http://opencode.test:4096/question/${requestId}/reply`);
  });

  it('fails closed on non-success responses and does not retry another question family', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid answer', { status: 400 }));

    await expect(createClient().replyToQuestion(sessionId, requestId, { answers: [['']] })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`http://opencode.test:4096/question/${requestId}/reply`);
  });

  it('does not interpret a malformed answer response as successful delivery', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid answer', { status: 400 }));

    await expect(
      createClient().replyToQuestion(sessionId, requestId, { answers: [['Something else']] }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('treats a terminal or duplicate request as failure when OpenCode returns 404', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('QuestionNotFoundError', { status: 404 }));

    await expect(createClient().rejectQuestion(sessionId, requestId)).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`http://opencode.test:4096/question/${requestId}/reject`);
  });
});
