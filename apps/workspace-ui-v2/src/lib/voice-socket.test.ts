/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openVoiceSocket, VoiceSocketApiError, wsBaseUrl } from './voice-socket';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

class FakeSocket {
  static instances: FakeSocket[] = [];

  url: string;

  readyState = 0;

  onopen: (() => void) | null = null;

  onmessage: ((event: { data: string }) => void) | null = null;

  onerror: (() => void) | null = null;

  onclose: ((event: { code: number }) => void) | null = null;

  sent: string[] = [];

  closed: { code: number; reason: string } | null = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = 3;
    this.closed = { code, reason };
    this.onclose?.({ code });
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  fail(): void {
    this.onerror?.();
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function stubSocket(): void {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
}

describe('wsBaseUrl', () => {
  it('derives the ws origin from the page when no API base is configured', () => {
    expect(wsBaseUrl()).toMatch(/^ws(s)?:\/\//);
  });
});

describe('openVoiceSocket', () => {
  it('starts with the token and language, then routes server frames', async () => {
    stubSocket();
    const events: string[] = [];
    const socket = openVoiceSocket(
      'tok',
      {
        onReady: (info) => events.push(`ready:${info.engine}`),
        onPartial: (text) => events.push(`partial:${text}`),
        onFinal: (text) => events.push(`final:${text}`),
        onSession: (type) => events.push(`session:${type}`),
        onError: (message) => events.push(`error:${message}`),
      },
      'en-US',
    );
    const ws = FakeSocket.instances[0];
    expect(ws.url).toContain('/ws/voice?token=tok');
    ws.open();
    expect(JSON.parse(ws.sent[0])).toEqual({ op: 'voice.start', language: 'en-US' });
    ws.receive({ op: 'voice.ready', sessionId: 's', engine: 'whisper-chunked' });
    await socket.ready;
    expect(events).toContain('ready:whisper-chunked');
    ws.receive({ op: 'voice.partial', text: 'hel' });
    ws.receive({ op: 'voice.final', text: 'hello', confidence: 0.9 });
    ws.receive({ op: 'voice.session', type: 'backpressure' });
    expect(events).toContain('partial:hel');
    expect(events).toContain('final:hello');
    expect(events).toContain('session:backpressure');
    socket.stop();
    expect(JSON.parse(ws.sent.at(-1) as string)).toEqual({ op: 'voice.stop' });
    ws.receive({ op: 'voice.stopped' });
    await socket.stopped;
    socket.close();
    expect(ws.closed?.code).toBe(1000);
  });

  it('queues PCM pushed before ready and resamples to 16 kHz', async () => {
    stubSocket();
    const socket = openVoiceSocket('tok', {});
    const ws = FakeSocket.instances[0];
    // 48 kHz sine pushed before the socket opens.
    const sine = new Float32Array(4800).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.5);
    socket.pushPcm(sine, 48000);
    ws.open();
    ws.receive({ op: 'voice.ready', sessionId: 's', engine: 'x' });
    await socket.ready;
    const audio = ws.sent.map((s) => JSON.parse(s)).filter((m) => m.op === 'voice.audio');
    expect(audio).toHaveLength(1);
    expect(audio[0].sampleRate).toBe(16000);
    expect(typeof audio[0].data).toBe('string');
    // 4800 @ 48 kHz → 1600 samples → 3200 bytes base64.
    expect((audio[0].data as string).length).toBeGreaterThan(4000);
  });

  it('rejects ready when the socket fails first', async () => {
    stubSocket();
    const errors: string[] = [];
    const socket = openVoiceSocket('tok', { onError: (m) => errors.push(m) });
    FakeSocket.instances[0].fail();
    await expect(socket.ready).rejects.toBeInstanceOf(VoiceSocketApiError);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('surfaces server errors after ready without closing', async () => {
    stubSocket();
    const errors: string[] = [];
    const socket = openVoiceSocket('tok', { onError: (m) => errors.push(m) });
    const ws = FakeSocket.instances[0];
    ws.open();
    ws.receive({ op: 'voice.ready', sessionId: 's', engine: 'x' });
    await socket.ready;
    ws.receive({ op: 'voice.error', error: 'whisper exploded' });
    expect(errors).toEqual(['whisper exploded']);
    expect(ws.closed).toBeNull();
  });
});
