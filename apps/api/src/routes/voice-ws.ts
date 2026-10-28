/**
 * @vestara/api — Voice streaming WebSocket (/ws/voice)
 *
 * Incremental utterance streaming over the StreamingSTTProvider contracts
 * (@vestara/stt): the client pushes PCM frames, the server segments
 * utterances behind an energy VAD and forwards partial/final transcript
 * events as they resolve. Batch POST /api/stt + /api/tts remain the
 * fallback when whisper is absent or the socket is unreachable.
 *
 * Auth: browser WebSockets cannot set headers, so the Bearer token rides
 * `?token=` and is validated against the user store (VES-AUTH-001).
 *
 * Client frames (JSON text, or binary int16 LE mono 16 kHz PCM):
 *   {op:'voice.start', language?, sampleRate?} → opens a session
 *   {op:'voice.audio', data: base64-int16, sampleRate?, channels?}
 *   {op:'voice.hint', type:'speech-start'|'speech-end'}
 *   {op:'voice.flush'} → transcribe the in-progress utterance as partial
 *   {op:'voice.stop'} → finalize (last transcribe) + voice.stopped
 *
 * Server frames:
 *   voice.ready | voice.partial | voice.final | voice.correction |
 *   voice.session | voice.stopped | voice.error
 */

import type * as http from 'node:http';
import type { AudioFrame } from '@vestara/media-conference';
import { type StreamingTranscriptionSession, WhisperChunkedStreamingProvider } from '@vestara/stt';
import { type RawData, WebSocket, type WebSocketServer } from 'ws';
import type { WorkspaceContext } from '../workspace-context';

export const VOICE_WS_PATH = '/ws/voice';
export const VOICE_WS_CLOSE_UNAUTHORIZED = 4401;
export const VOICE_WS_CLOSE_UNAVAILABLE = 4400;

/** Max base64 audio payload per frame (~5 s of 16 kHz int16 mono). */
const MAX_AUDIO_B64 = 512 * 1024;

export interface VoiceWsSessionFactory {
  readonly engine: string;
  openSession(sessionId: string, language?: string): Promise<StreamingTranscriptionSession>;
}

export function defaultVoiceSessionFactory(): VoiceWsSessionFactory {
  const provider = new WhisperChunkedStreamingProvider();
  return {
    engine: 'whisper-chunked',
    openSession: (sessionId: string, language?: string) =>
      provider.open({
        sessionId,
        sourceId: 'ws-voice',
        ...(language ? { language } : {}),
      }),
  };
}

function wsSendJson(ws: WebSocket, message: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  if (ws.bufferedAmount > 256 * 1024) return;
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // Send failures surface as socket errors/close — nothing to do here.
  }
}

function base64ToFloat32(b64: string): Float32Array {
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength % 2 !== 0) throw new Error('voice.audio needs int16 PCM data');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

function int16BufferToFloat32(data: Buffer): Float32Array {
  if (data.byteLength === 0 || data.byteLength % 2 !== 0) throw new Error('binary frames need int16 PCM data');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out = new Float32Array(data.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

function downmix(samples: Float32Array, channels: number): Float32Array {
  if (channels <= 1 || samples.length % channels !== 0) return samples;
  const frames = samples.length / channels;
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += samples[f * channels + c] ?? 0;
    out[f] = sum / channels;
  }
  return out;
}

export function attachVoiceWss(wss: WebSocketServer, ctx: WorkspaceContext, factory?: VoiceWsSessionFactory): void {
  const sessions = factory ?? defaultVoiceSessionFactory();
  wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    void handleVoiceConnection(ws, req, ctx, sessions);
  });
}

async function handleVoiceConnection(
  ws: WebSocket,
  req: http.IncomingMessage,
  ctx: WorkspaceContext,
  factory: VoiceWsSessionFactory,
): Promise<void> {
  const fail = (code: number, reason: string): void => {
    wsSendJson(ws, { op: 'voice.error', error: reason });
    try {
      ws.close(code, reason);
    } catch {
      // Already gone — nothing to do.
    }
  };

  let token = '';
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    token = url.searchParams.get('token') ?? '';
  } catch {
    fail(1008, 'bad request');
    return;
  }
  if (!token || !ctx.users?.findByToken(token)) {
    fail(VOICE_WS_CLOSE_UNAUTHORIZED, 'voice streaming requires a valid token');
    return;
  }

  let session: StreamingTranscriptionSession | null = null;
  let sessionId: string | null = null;
  let loopsDone: Promise<void> | null = null;
  let settled = false;

  const finish = (): void => {
    if (settled) return;
    settled = true;
    clearTimeout(startTimer);
    clearInterval(ping);
    if (session) void session.cancel().catch(() => {});
    session = null;
  };

  // Idle sockets that never start must not linger.
  const startTimer = setTimeout(() => {
    if (!session) {
      wsSendJson(ws, { op: 'voice.error', error: 'voice.start timeout' });
      try {
        ws.close(1008, 'voice.start timeout');
      } catch {
        // Already gone.
      }
    }
  }, 15_000);
  startTimer.unref?.();

  const ping = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.ping();
    } catch {
      /* swept on close */
    }
  }, 25_000);
  ping.unref?.();

  ws.on('close', finish);
  ws.on('error', finish);

  const pump = async (): Promise<void> => {
    const current = session;
    if (!current) return;
    const forwardEvents = (async () => {
      try {
        for await (const event of current.events()) {
          if (event.type === 'partial') {
            wsSendJson(ws, {
              op: 'voice.partial',
              sessionId,
              segmentId: event.segmentId,
              text: event.text,
              confidence: event.confidence,
            });
          } else if (event.type === 'final') {
            wsSendJson(ws, {
              op: 'voice.final',
              sessionId,
              segmentId: event.segmentId,
              text: event.text,
              confidence: event.confidence,
              durationMs: event.durationMs,
            });
          } else {
            wsSendJson(ws, {
              op: 'voice.correction',
              sessionId,
              segmentId: event.segmentId,
              text: event.text,
              confidence: event.confidence,
              replacesSegmentId: event.replacesSegmentId,
            });
          }
        }
      } catch {
        // Session torn down mid-iteration — loops exit via finalize.
      }
    })();
    const forwardSession = (async () => {
      try {
        for await (const event of current.sessionEvents()) {
          wsSendJson(ws, {
            op: 'voice.session',
            sessionId,
            type: event.type,
            frameCount: event.frameCount,
            dropped: event.dropped,
            error: event.error ? String(event.error instanceof Error ? event.error.message : event.error) : undefined,
          });
        }
      } catch {
        // Session torn down mid-iteration.
      }
    })();
    await Promise.all([forwardEvents, forwardSession]);
  };

  ws.on('message', (data: RawData) => {
    void (async () => {
      // The ws transport delivers text frames as Buffer/Uint8Array too, so
      // protocol detection is by content: valid JSON with a string op is a
      // protocol frame, everything else is raw int16 LE mono 16 kHz PCM.
      let asText: string | null = null;
      if (typeof data === 'string') {
        asText = data;
      } else if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
        asText = Buffer.from(data).toString('utf8');
      } else if (Array.isArray(data)) {
        asText = Buffer.concat(data).toString('utf8');
      } else if (data instanceof ArrayBuffer) {
        asText = Buffer.from(data).toString('utf8');
      }
      let parsed: unknown;
      let isProtocol = false;
      if (asText !== null) {
        try {
          parsed = JSON.parse(asText);
          isProtocol =
            parsed !== null && typeof parsed === 'object' && typeof (parsed as Record<string, unknown>).op === 'string';
        } catch {
          isProtocol = false;
        }
      }
      if (!isProtocol) {
        if (!session) {
          wsSendJson(ws, { op: 'voice.error', error: 'send voice.start first' });
          return;
        }
        const bytes =
          typeof data === 'string'
            ? Buffer.from(data, 'utf8')
            : Buffer.isBuffer(data)
              ? data
              : data instanceof Uint8Array
                ? Buffer.from(data)
                : data instanceof ArrayBuffer
                  ? Buffer.from(data)
                  : Buffer.concat(data);
        try {
          const samples = int16BufferToFloat32(bytes);
          const frame: AudioFrame = {
            sourceId: 'ws-voice',
            sampleRate: 16000,
            channels: 1,
            timestamp: Date.now(),
            peak: 0,
            data: samples,
          };
          await session.push(frame);
        } catch (error) {
          wsSendJson(ws, { op: 'voice.error', error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      if (parsed === null || typeof parsed !== 'object') return;
      const message = parsed as Record<string, unknown>;

      if (message.op === 'voice.start') {
        if (session) {
          wsSendJson(ws, { op: 'voice.error', error: 'session already started' });
          return;
        }
        const language = typeof message.language === 'string' && message.language.trim() ? message.language : 'en';
        const id = `voice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        try {
          session = await factory.openSession(id, language);
        } catch (error) {
          fail(VOICE_WS_CLOSE_UNAVAILABLE, error instanceof Error ? error.message : 'voice streaming unavailable');
          return;
        }
        sessionId = id;
        clearTimeout(startTimer);
        loopsDone = pump();
        wsSendJson(ws, { op: 'voice.ready', sessionId: id, engine: factory.engine, sampleRate: 16000 });
        return;
      }

      if (!session) {
        wsSendJson(ws, { op: 'voice.error', error: 'send voice.start first' });
        return;
      }

      if (message.op === 'voice.audio') {
        if (typeof message.data !== 'string' || message.data.length === 0) {
          wsSendJson(ws, { op: 'voice.error', error: 'voice.audio needs base64 int16 data' });
          return;
        }
        if (message.data.length > MAX_AUDIO_B64) {
          wsSendJson(ws, { op: 'voice.error', error: 'voice.audio frame too large' });
          return;
        }
        const sampleRate =
          typeof message.sampleRate === 'number' && Number.isFinite(message.sampleRate)
            ? Math.floor(message.sampleRate)
            : 16000;
        if (sampleRate < 8000 || sampleRate > 96000) {
          wsSendJson(ws, { op: 'voice.error', error: 'voice.audio sampleRate out of range' });
          return;
        }
        const channels =
          typeof message.channels === 'number' && Number.isFinite(message.channels) ? Math.floor(message.channels) : 1;
        if (channels < 1 || channels > 2) {
          wsSendJson(ws, { op: 'voice.error', error: 'voice.audio supports 1-2 channels' });
          return;
        }
        try {
          const frame: AudioFrame = {
            sourceId: 'ws-voice',
            sampleRate,
            channels,
            timestamp: Date.now(),
            peak: 0,
            data: downmix(base64ToFloat32(message.data), channels),
          };
          await session.push(frame);
        } catch (error) {
          wsSendJson(ws, { op: 'voice.error', error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (message.op === 'voice.hint') {
        if (message.type !== 'speech-start' && message.type !== 'speech-end' && message.type !== 'speech-state') {
          wsSendJson(ws, { op: 'voice.error', error: 'voice.hint needs a speech boundary type' });
          return;
        }
        try {
          await session.hint({ type: message.type, timestamp: Date.now() });
        } catch (error) {
          wsSendJson(ws, { op: 'voice.error', error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (message.op === 'voice.flush') {
        try {
          await session.flush();
        } catch (error) {
          wsSendJson(ws, { op: 'voice.error', error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      if (message.op === 'voice.stop') {
        const current = session;
        session = null;
        try {
          await current.close();
          if (loopsDone) await loopsDone;
        } catch (error) {
          wsSendJson(ws, { op: 'voice.error', error: error instanceof Error ? error.message : String(error) });
          return;
        }
        wsSendJson(ws, { op: 'voice.stopped', sessionId });
        sessionId = null;
        return;
      }

      wsSendJson(ws, { op: 'voice.error', error: `unknown op: ${String(message.op)}` });
    })();
  });
}
