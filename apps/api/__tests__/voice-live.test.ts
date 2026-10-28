/**
 * Voice live endpoints — P0 server slice.
 *
 * Proves the no-browser-runtime contract for the new voice surface:
 * GET /api/voice/health, GET /api/voice/models, POST /api/tts. The TTS
 * synthesis path degrades to 503 (not 500) when Piper is unavailable, and
 * the intent route still requires the governed browser runtime.
 */

import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { describe, expect, it } from 'vitest';
import { handleMiscRoute } from '../src/routes/misc';
import { handleVoiceRoute } from '../src/routes/voice';
import type { WorkspaceContext } from '../src/workspace-context';

const ctx = {} as unknown as WorkspaceContext;

function fakeRes(): {
  res: http.ServerResponse;
  status: () => number;
  headers: () => Record<string, string | number | undefined>;
  body: () => unknown;
  raw: () => Buffer;
} {
  const chunks: Buffer[] = [];
  let status = 0;
  let headers: Record<string, string | number | undefined> = {};
  const res = {
    writableEnded: false,
    headersSent: false,
    req: { headers: {} },
    writeHead(s: number, h?: Record<string, string | number | undefined>): void {
      status = s;
      headers = h ?? {};
    },
    setHeader(): void {},
    end(data?: unknown): void {
      if (typeof data === 'string') chunks.push(Buffer.from(data));
      else if (Buffer.isBuffer(data)) chunks.push(data);
      else if (data instanceof Uint8Array) chunks.push(Buffer.from(data));
      (res as { writableEnded: boolean }).writableEnded = true;
    },
  };
  return {
    res: res as unknown as http.ServerResponse,
    status: () => status,
    headers: () => headers,
    body: () => JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown,
    raw: () => Buffer.concat(chunks),
  };
}

function fakeGetReq(): http.IncomingMessage {
  return { headers: {}, method: 'GET', url: '/' } as unknown as http.IncomingMessage;
}

function fakePostReq(payload: unknown): http.IncomingMessage {
  const emitter = new EventEmitter() as EventEmitter & { headers: Record<string, string> };
  emitter.headers = { 'content-type': 'application/json' };
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  setImmediate(() => {
    emitter.emit('data', Buffer.from(text));
    emitter.emit('end');
  });
  return emitter as unknown as http.IncomingMessage;
}

describe('voice live endpoints', () => {
  it('reports STT/TTS health without a browser runtime', async () => {
    const f = fakeRes();
    expect(await handleVoiceRoute('GET', '/api/voice/health', fakeGetReq(), f.res, ctx, 0, new URL('http://x/'))).toBe(
      true,
    );
    const body = f.body() as {
      stt: { available: boolean; provider: string; detail: string };
      tts: { available: boolean; provider: string; detail: string };
      streaming: { supported: boolean };
    };
    expect(f.status()).toBe(200);
    expect(body.stt.provider).toBe('Whisper.cpp');
    expect(body.tts.provider).toBe('Piper TTS');
    expect(typeof body.stt.available).toBe('boolean');
    expect(typeof body.tts.available).toBe('boolean');
    // Incremental streaming rides whisper — unavailable on images without it.
    expect(body.streaming.supported).toBe(body.stt.available);
    expect(body.streaming.endpoint).toBe('/ws/voice');
  });

  it('lists selectable STT/TTS engines and server voices', async () => {
    const f = fakeRes();
    expect(await handleVoiceRoute('GET', '/api/voice/models', fakeGetReq(), f.res, ctx, 0, new URL('http://x/'))).toBe(
      true,
    );
    const body = f.body() as {
      sttEngines: { id: string }[];
      ttsEngines: { id: string }[];
      ttsVoices: unknown[];
    };
    expect(f.status()).toBe(200);
    expect(body.sttEngines.map((e) => e.id)).toEqual(['browser', 'whisper', 'opencode']);
    expect(body.ttsEngines.map((e) => e.id)).toEqual(['system', 'server', 'opencode']);
    expect(Array.isArray(body.ttsVoices)).toBe(true);
  });

  it('degrades POST /api/tts to 503 when Piper is unavailable', async () => {
    const f = fakeRes();
    const handled = await handleVoiceRoute(
      'POST',
      '/api/tts',
      fakePostReq({ text: 'hello' }),
      f.res,
      ctx,
      0,
      new URL('http://x/'),
    );
    expect(handled).toBe(true);
    // No piper binary/model on CI images — the endpoint must fail as
    // "unavailable" (503), never crash (500) or claim success.
    expect(f.status()).toBe(503);
    expect(f.body()).toMatchObject({ error: expect.stringContaining('Piper') });
  });

  it('rejects empty TTS text as 400', async () => {
    const f = fakeRes();
    await handleVoiceRoute('POST', '/api/tts', fakePostReq({ text: '  ' }), f.res, ctx, 0, new URL('http://x/'));
    expect(f.status()).toBe(400);
  });

  it('still requires the browser runtime for voice intent', async () => {
    const f = fakeRes();
    expect(
      await handleVoiceRoute(
        'POST',
        '/api/voice/intent',
        fakePostReq({ text: 'go back' }),
        f.res,
        ctx,
        0,
        new URL('http://x/'),
      ),
    ).toBe(true);
    expect(f.status()).toBe(400);
    expect(f.body()).toMatchObject({ error: 'browser runtime not configured' });
  });

  it('requires base64 audio JSON for server STT', async () => {
    const f = fakeRes();
    expect(
      await handleMiscRoute('POST', '/api/stt', fakePostReq({ language: 'en' }), f.res, ctx, 0, new URL('http://x/')),
    ).toBe(true);
    expect(f.status()).toBe(200);
    expect(f.body()).toMatchObject({ text: '', error: expect.stringContaining('base64') });
  });

  it('rejects empty audio payloads without calling the provider', async () => {
    const f = fakeRes();
    expect(
      await handleMiscRoute(
        'POST',
        '/api/stt',
        // Whitespace-only base64 decodes to zero bytes → provider guard fires
        // before any binary is touched (no whisper needed on CI).
        fakePostReq({ audio: '   ', language: 'en' }),
        f.res,
        ctx,
        0,
        new URL('http://x/'),
      ),
    ).toBe(true);
    expect(f.status()).toBe(200);
    expect(f.body()).toMatchObject({ text: '', error: expect.stringContaining('non-empty') });
  });

  it('routes unknown voice paths to the governed browser gate', async () => {
    const f = fakeRes();
    expect(await handleVoiceRoute('GET', '/api/voice/unknown', fakeGetReq(), f.res, ctx, 0, new URL('http://x/'))).toBe(
      true,
    );
    expect(f.status()).toBe(400);
    expect(f.body()).toMatchObject({ error: 'browser runtime not configured' });
  });
});
