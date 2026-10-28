/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerVoiceApiError, synthesizeServerSpeech, transcribeServerAudio } from './server-voice';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init?: unknown) => handler(String(url), init as RequestInit | undefined)),
  );
}

describe('transcribeServerAudio', () => {
  it('posts base64 JSON and returns the transcript', async () => {
    let seen: RequestInit | undefined;
    stubFetch(async (url, init) => {
      seen = init;
      expect(url).toContain('/api/stt');
      return ok({ text: 'hello server', confidence: 0.95, duration: 1.2 });
    });
    const result = await transcribeServerAudio(new Blob(['bytes'], { type: 'audio/webm' }), 'en-US');
    expect(result).toEqual({ text: 'hello server', confidence: 0.95, duration: 1.2 });
    expect(seen?.method).toBe('POST');
    // assistantFetch normalizes headers into a Headers instance.
    expect(new Headers(seen?.headers as HeadersInit).get('content-type')).toBe('application/json');
    // Binary-safe transport: base64 JSON, never raw bytes.
    const body = JSON.parse(String(seen?.body)) as { audio?: string; language?: string };
    expect(body.language).toBe('en-US');
    expect(typeof body.audio).toBe('string');
    expect(atob(body.audio as string)).toBe('bytes');
  });

  it('throws when the server reports an error without text', async () => {
    stubFetch(async () => ok({ text: '', error: 'No whisper binary on PATH' }));
    await expect(transcribeServerAudio(new Blob(['bytes']))).rejects.toMatchObject({
      message: 'No whisper binary on PATH',
    });
  });

  it('rejects with status 0 when unreachable', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    await expect(transcribeServerAudio(new Blob(['bytes']))).rejects.toBeInstanceOf(ServerVoiceApiError);
  });
});

describe('synthesizeServerSpeech', () => {
  it('returns an object URL with the server duration', async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    Object.defineProperty(URL, 'createObjectURL', {
      value: (blob: Blob) => {
        expect(blob.size).toBeGreaterThan(0);
        created.push('blob:tts');
        return 'blob:tts';
      },
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: (url: string) => {
        revoked.push(url);
      },
      configurable: true,
    });
    stubFetch(async (url) => {
      expect(url).toContain('/api/tts');
      return new Response(new Blob(['RIFF-fake-wav']), { headers: { 'x-audio-duration': '1.5' } });
    });
    const speech = await synthesizeServerSpeech({ text: 'hello', speed: 1 });
    expect(speech.url).toBe('blob:tts');
    expect(speech.duration).toBeCloseTo(1.5);
    speech.revoke();
    expect(revoked).toEqual(['blob:tts']);
  });

  it('surfaces the server error (e.g. Piper missing) with its status', async () => {
    stubFetch(
      async () =>
        ({
          ok: false,
          status: 503,
          headers: new Headers(),
          json: async () => ({ error: 'Piper TTS not available: no voice model' }),
        }) as Response,
    );
    const error = await synthesizeServerSpeech({ text: 'hello' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ServerVoiceApiError);
    expect((error as ServerVoiceApiError).status).toBe(503);
    expect((error as Error).message).toContain('Piper');
  });
});
