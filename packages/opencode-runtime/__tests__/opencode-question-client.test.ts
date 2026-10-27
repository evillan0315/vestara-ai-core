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

function okTrue() {
  return new Response(JSON.stringify(true), { status: 200, headers: { 'content-type': 'application/json' } });
}

function noContent() {
  return new Response(null, { status: 204 });
}

function notFound() {
  return new Response('QuestionNotFoundError', { status: 404 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OpenCode question delivery contract', () => {
  it('sends a structured format through the synchronous message endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          info: {
            id: 'msg-1',
            role: 'assistant',
            finish: 'stop',
          },
          parts: [
            { type: 'text', text: '{"status":"ready"}' },
            {
              type: 'tool',
              tool: 'structured_output',
              state: { status: 'completed', output: '{"status":"ready"}' },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await createClient().sendMessage(
      'ses-1',
      {
        parts: [{ type: 'text', text: 'Return JSON' }],
        format: { type: 'json_schema', schema: { type: 'object' } },
      },
      { workspaceId: 'workspace-1', directory: '/repo', sessionId: 'ses-1' },
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      'http://opencode.test:4096/session/ses-1/message?directory=%2Frepo',
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toMatchObject({
      format: { type: 'json_schema', schema: { type: 'object' } },
    });
    expect(result.structuredOutput).toEqual({ status: 'ready' });
  });

  it('starts the SSE request when the event stream is created', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        },
      ),
    );

    const stream = createClient().openEventStream({ workspaceId: 'workspace-1', directory: '/repo' });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('http://opencode.test:4096/event?directory=%2Frepo');
    await expect(
      (async () => {
        for await (const _event of stream) {
          // The stream is intentionally empty; creation is the behavior under test.
        }
      })(),
    ).resolves.toBeUndefined();
  });

  it('replies through the session-scoped v2 route first', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(noContent());

    await expect(createClient().replyToQuestion(sessionId, requestId, { answers: [['Something else']] })).resolves.toBe(
      true,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://opencode.test:4096/api/session/${sessionId}/question/${requestId}/reply`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ answers: [['Something else']] }));
  });

  it('falls back to the global registry when the v2 route 404s', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(notFound()).mockResolvedValueOnce(okTrue());

    await expect(createClient().replyToQuestion(sessionId, requestId, { answers: [['Something else']] })).resolves.toBe(
      true,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      `http://opencode.test:4096/api/session/${sessionId}/question/${requestId}/reply`,
    );
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(`http://opencode.test:4096/question/${requestId}/reply`);
  });

  it('rejects through the session-scoped v2 route first', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(noContent());

    await expect(createClient().rejectQuestion(sessionId, requestId)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://opencode.test:4096/api/session/${sessionId}/question/${requestId}/reject`);
    expect(init.method).toBe('POST');
  });

  it('falls back to the global reject registry when the v2 route 404s', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(notFound()).mockResolvedValueOnce(okTrue());

    await expect(createClient().rejectQuestion(sessionId, requestId)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      `http://opencode.test:4096/api/session/${sessionId}/question/${requestId}/reject`,
    );
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(`http://opencode.test:4096/question/${requestId}/reject`);
  });

  it('uses the global registry directly when no session identity is available', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okTrue());

    await expect(createClient().replyToQuestion('', requestId, { answers: [['Something else']] })).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(`http://opencode.test:4096/question/${requestId}/reply`);
  });

  it('fails closed with the question identity when both families 404', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(notFound());

    await expect(
      createClient().replyToQuestion(sessionId, requestId, { answers: [['Something else']] }),
    ).rejects.toThrow(requestId);

    // v2 attempt + v1 fallback, both 404.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never reports an unknown identity on question-not-found', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(notFound());

    const error = await createClient()
      .replyToQuestion(sessionId, requestId, { answers: [['Something else']] })
      .catch((error: unknown) => error as Error);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).message)).toContain(requestId);
    expect(String((error as Error).message)).not.toContain('unknown');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not fall back on non-404 failures', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid answer', { status: 400 }));

    await expect(createClient().replyToQuestion(sessionId, requestId, { answers: [['']] })).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      `http://opencode.test:4096/api/session/${sessionId}/question/${requestId}/reply`,
    );
  });

  it('does not interpret a malformed answer response as successful delivery', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid answer', { status: 400 }));

    await expect(
      createClient().replyToQuestion(sessionId, requestId, { answers: [['Something else']] }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('treats a terminal or duplicate reject as failure when both families 404', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(notFound());

    await expect(createClient().rejectQuestion(sessionId, requestId)).rejects.toThrow(requestId);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(`http://opencode.test:4096/question/${requestId}/reject`);
  });
});
