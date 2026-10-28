// Incremental voice streaming client (WS /ws/voice).
// Contract: apps/api/src/routes/voice-ws.ts — voice.start/audio/hint/
// flush/stop frames out, voice.ready/partial/final/correction/session/
// stopped/error frames in. Transport failures reject so callers fall back
// to batch POST /api/stt (offline-first).

import { apiBaseUrl } from './assistant-api';
import { floatToInt16B64, resampleTo16k } from './pcm-capture';

/** WS origin: configured API base with ws scheme, else the page origin (dev proxy). */
export function wsBaseUrl(): string {
  const api = apiBaseUrl();
  if (api) return api.replace(/^http/, 'ws');
  if (typeof window !== 'undefined' && window.location?.host) {
    return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
  }
  return '';
}

export class VoiceSocketApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceSocketApiError';
  }
}

export interface VoiceSocketEvents {
  onReady?: (info: { sessionId: string; engine: string }) => void;
  onPartial?: (text: string) => void;
  onFinal?: (text: string, confidence: number) => void;
  onSession?: (type: string) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

export interface VoiceSocket {
  /** Resolves on voice.ready; rejects on error/close before ready. */
  readonly ready: Promise<void>;
  /** Resolves on voice.stopped after stop() (or rejects on failure). */
  readonly stopped: Promise<void>;
  pushPcm(samples: Float32Array, sampleRate: number): void;
  flush(): void;
  stop(): void;
  close(): void;
}

/**
 * Open an incremental streaming session. The socket stays usable across
 * VAD-bounded utterances until stop() (finalize) + close().
 * `readyTimeoutMs` bounds the voice.ready wait — a proxy that swallows the
 * upgrade (or a stale server that never answers) rejects instead of hanging
 * the caller on Record forever.
 */
export function openVoiceSocket(
  token: string,
  events: VoiceSocketEvents,
  language = 'en',
  readyTimeoutMs = 8000,
): VoiceSocket {
  const base = wsBaseUrl();
  if (!base) throw new VoiceSocketApiError('Voice streaming needs an HTTP(S) origin');
  if (typeof WebSocket === 'undefined') throw new VoiceSocketApiError('WebSocket unavailable in this browser');
  const socket = new WebSocket(`${base}/ws/voice?token=${encodeURIComponent(token)}`);

  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  let resolveStopped!: () => void;
  let rejectStopped!: (error: Error) => void;
  const stopped = new Promise<void>((resolve, reject) => {
    resolveStopped = resolve;
    rejectStopped = reject;
  });
  let readySettled = false;
  let stoppedSettled = false;
  let closed = false;
  const readyTimer = setTimeout(() => {
    if (!readySettled) {
      settleReady(new VoiceSocketApiError('Voice streaming handshake timed out'));
      try {
        socket.close(1001, 'handshake timeout');
      } catch {
        // Already gone.
      }
    }
  }, readyTimeoutMs);
  if (typeof readyTimer === 'object') readyTimer.unref?.();
  // Internal sink: early failures reject stopped too, and consumers that
  // only await ready must not trigger unhandled rejections. Awaiting
  // stopped elsewhere still observes the rejection via its own handler.
  void stopped.catch(() => {});
  // Frames pushed before voice.ready are queued (bounded — live tail wins).
  const pending: string[] = [];

  const settleReady = (error?: Error): void => {
    if (readySettled) return;
    readySettled = true;
    clearTimeout(readyTimer);
    if (error) rejectReady(error);
    else resolveReady();
  };

  const send = (message: unknown): void => {
    if (closed || socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(message));
    } catch {
      // Send failures surface as socket error/close.
    }
  };

  socket.onopen = () => {
    send({ op: 'voice.start', language });
  };

  socket.onmessage = (event: MessageEvent) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(String(event.data)) as Record<string, unknown>;
    } catch {
      return;
    }
    if (message.op === 'voice.ready') {
      for (const queued of pending.splice(0)) send({ op: 'voice.audio', data: queued, sampleRate: 16000 });
      settleReady();
      events.onReady?.({
        sessionId: typeof message.sessionId === 'string' ? message.sessionId : '',
        engine: typeof message.engine === 'string' ? message.engine : '',
      });
    } else if (message.op === 'voice.partial') {
      if (typeof message.text === 'string') events.onPartial?.(message.text);
    } else if (message.op === 'voice.final') {
      if (typeof message.text === 'string') {
        events.onFinal?.(message.text, typeof message.confidence === 'number' ? message.confidence : 0.9);
      }
    } else if (message.op === 'voice.session') {
      if (typeof message.type === 'string') events.onSession?.(message.type);
    } else if (message.op === 'voice.stopped') {
      if (!stoppedSettled) {
        stoppedSettled = true;
        resolveStopped();
      }
    } else if (message.op === 'voice.error') {
      const text = typeof message.error === 'string' ? message.error : 'Voice streaming error';
      if (!readySettled) settleReady(new VoiceSocketApiError(text));
      else events.onError?.(text);
      if (!stoppedSettled && closed) {
        stoppedSettled = true;
        rejectStopped(new VoiceSocketApiError(text));
      }
    }
  };

  const failPending = (error: Error): void => {
    settleReady(error);
    if (!stoppedSettled) {
      stoppedSettled = true;
      rejectStopped(error);
    }
  };

  socket.onerror = () => {
    failPending(new VoiceSocketApiError('Voice streaming socket failed'));
    events.onError?.('Voice streaming socket failed');
  };

  socket.onclose = (event: CloseEvent) => {
    closed = true;
    if (!readySettled) settleReady(new VoiceSocketApiError(`Voice streaming closed (${event.code})`));
    else if (event.code !== 1000) events.onError?.(`Voice streaming closed (${event.code})`);
    if (!stoppedSettled) {
      stoppedSettled = true;
      if (event.code === 1000) resolveStopped();
      else rejectStopped(new VoiceSocketApiError(`Voice streaming closed (${event.code})`));
    }
    events.onClose?.();
  };

  return {
    ready,
    stopped,
    pushPcm(samples: Float32Array, sampleRate: number): void {
      if (closed) return;
      try {
        const encoded = floatToInt16B64(resampleTo16k(samples, sampleRate));
        if (!readySettled) {
          pending.push(encoded);
          while (pending.length > 150) pending.shift();
          return;
        }
        send({ op: 'voice.audio', data: encoded, sampleRate: 16000 });
      } catch {
        // A bad frame must never kill the session — skip it.
      }
    },
    flush(): void {
      send({ op: 'voice.flush' });
    },
    stop(): void {
      send({ op: 'voice.stop' });
    },
    close(): void {
      closed = true;
      try {
        socket.close(1000, 'done');
      } catch {
        // Already gone.
      }
    },
  };
}
