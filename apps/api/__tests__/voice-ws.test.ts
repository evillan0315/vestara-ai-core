/**
 * Voice streaming WebSocket (/ws/voice) — protocol contract tests.
 *
 * Proves auth gating, the start/audio/stop lifecycle, binary PCM intake,
 * and malformed-frame discipline against the deterministic fake streaming
 * provider (no whisper binary needed).
 */

import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { FakeStreamingSTTProvider } from '@vestara/stt';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { attachVoiceWss, VOICE_WS_CLOSE_UNAUTHORIZED, type VoiceWsSessionFactory } from '../src/routes/voice-ws';
import type { WorkspaceContext } from '../src/workspace-context';

class FakeSocket extends EventEmitter {
  readyState = WebSocket.OPEN;

  bufferedAmount = 0;

  sent: Record<string, unknown>[] = [];

  closed: { code: number; reason: string } | null = null;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(code = 1000, reason = ''): void {
    this.closed = { code, reason };
    this.emit('close');
  }

  ping(): void {}
}

function fakeCtx(): WorkspaceContext {
  return {
    users: {
      findByToken: (token: string) => (token === 'good-token' ? { id: 'u' } : undefined),
    },
  } as unknown as WorkspaceContext;
}

function fakeFactory(events?: { type: 'partial' | 'final'; text: string; delayMs?: number }[]): VoiceWsSessionFactory {
  const fake = new FakeStreamingSTTProvider(
    events
      ? { eventSequence: events }
      : {
          eventSequence: [
            { type: 'partial', text: 'hel', delayMs: 5 },
            { type: 'final', text: 'hello', delayMs: 5 },
          ],
        },
  );
  return {
    engine: 'fake-test',
    openSession: (sessionId: string, language?: string) =>
      fake.open({ sessionId, sourceId: 'ws-test', ...(language ? { language } : {}) }),
  };
}

function connect(factory?: VoiceWsSessionFactory, token = 'good-token'): { wss: EventEmitter; ws: FakeSocket } {
  const wss = new EventEmitter();
  attachVoiceWss(wss as never, fakeCtx(), factory ?? fakeFactory());
  const ws = new FakeSocket();
  const req = { url: `/ws/voice?token=${token}` } as unknown as http.IncomingMessage;
  wss.emit('connection', ws, req);
  return { wss, ws };
}

async function waitFor(fn: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (fn()) return;
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const ops = (ws: FakeSocket): string[] => ws.sent.map((m) => String(m.op));

const errors = (ws: FakeSocket): string[] => ws.sent.filter((m) => m.op === 'voice.error').map((m) => String(m.error));

const pcmB64 = (bytes = 320): string => Buffer.alloc(bytes).toString('base64');

describe('voice WS endpoint', () => {
  it('rejects connections without a valid token', async () => {
    const { ws } = connect(fakeFactory(), 'bad-token');
    await waitFor(() => ws.closed !== null);
    expect(ws.closed?.code).toBe(VOICE_WS_CLOSE_UNAUTHORIZED);
    expect(ops(ws)).toContain('voice.error');
  });

  it('runs start → audio → final → stop with the engine named in ready', async () => {
    const { ws } = connect();
    ws.emit('message', JSON.stringify({ op: 'voice.start', language: 'en' }));
    await waitFor(() => ops(ws).includes('voice.ready'));
    expect(ws.sent.find((m) => m.op === 'voice.ready')).toMatchObject({ engine: 'fake-test' });
    ws.emit('message', JSON.stringify({ op: 'voice.audio', data: pcmB64(), sampleRate: 16000 }));
    await waitFor(() => ops(ws).includes('voice.final'));
    expect(ops(ws)).toContain('voice.partial');
    const final = ws.sent.find((m) => m.op === 'voice.final') as Record<string, unknown>;
    expect(final.text).toBe('hello');
    ws.emit('message', JSON.stringify({ op: 'voice.stop' }));
    await waitFor(() => ops(ws).includes('voice.stopped'));
    expect(ws.closed).toBeNull();
  });

  it('treats Buffer-wrapped JSON as protocol frames (ws transport reality)', async () => {
    const { ws } = connect();
    // The ws library delivers text frames as Buffers — content, not the
    // JS type, decides protocol vs PCM.
    ws.emit('message', Buffer.from(JSON.stringify({ op: 'voice.start' })));
    await waitFor(() => ops(ws).includes('voice.ready'));
  });

  it('accepts binary int16 PCM frames after start', async () => {
    const { ws } = connect();
    ws.emit('message', JSON.stringify({ op: 'voice.start' }));
    await waitFor(() => ops(ws).includes('voice.ready'));
    ws.emit('message', Buffer.alloc(640));
    await waitFor(() => ops(ws).includes('voice.final'));
    expect(ops(ws).filter((op) => op === 'voice.error')).toHaveLength(0);
  });

  it('rejects audio before start without closing', async () => {
    const { ws } = connect();
    ws.emit('message', JSON.stringify({ op: 'voice.audio', data: pcmB64() }));
    await waitFor(() => ops(ws).includes('voice.error'));
    expect(ws.sent.find((m) => m.op === 'voice.error')).toMatchObject({ error: 'send voice.start first' });
    expect(ws.closed).toBeNull();
  });

  it('rejects malformed frames without closing', async () => {
    const { ws } = connect();
    ws.emit('message', 'not-json{{{');
    await waitFor(() => ops(ws).includes('voice.error'));
    expect(ws.closed).toBeNull();
  });

  it('rejects oversized audio frames', async () => {
    const { ws } = connect();
    ws.emit('message', JSON.stringify({ op: 'voice.start' }));
    await waitFor(() => ops(ws).includes('voice.ready'));
    ws.emit('message', JSON.stringify({ op: 'voice.audio', data: 'a'.repeat(600 * 1024) }));
    await waitFor(() => errors(ws).some((e) => e.includes('too large')));
    expect(ws.closed).toBeNull();
  });

  it('rejects a second start on the same socket', async () => {
    const { ws } = connect();
    ws.emit('message', JSON.stringify({ op: 'voice.start' }));
    await waitFor(() => ops(ws).includes('voice.ready'));
    ws.emit('message', JSON.stringify({ op: 'voice.start' }));
    await waitFor(() => errors(ws).some((e) => e.includes('already started')));
  });

  it('closes 4400 when the session cannot open', async () => {
    const failing: VoiceWsSessionFactory = {
      engine: 'broken',
      openSession: async () => {
        throw new Error('whisper exploded');
      },
    };
    const { ws } = connect(failing);
    ws.emit('message', JSON.stringify({ op: 'voice.start' }));
    await waitFor(() => ws.closed !== null);
    expect(ws.closed?.code).toBe(4400);
    expect(ops(ws)).toContain('voice.error');
  });

  it('forwards hints and flush without errors', async () => {
    const { ws } = connect();
    ws.emit('message', JSON.stringify({ op: 'voice.start' }));
    await waitFor(() => ops(ws).includes('voice.ready'));
    ws.emit('message', JSON.stringify({ op: 'voice.hint', type: 'speech-end' }));
    ws.emit('message', JSON.stringify({ op: 'voice.flush' }));
    ws.emit('message', JSON.stringify({ op: 'voice.bogus' }));
    await waitFor(() => errors(ws).some((e) => e.includes('unknown op')));
  });
});
