// Server voice transport — batch STT upload + Piper TTS playback.
// Contracts: apps/api/src/routes/voice.ts (POST /api/tts → audio/wav,
// GET /api/voice/models) and apps/api/src/routes/misc.ts (POST /api/stt).
// The Bearer token rides via assistantFetch; transport failures reject so
// callers fall back to browser engines (offline-first).

import { apiBaseUrl } from './assistant-api';
import { assistantFetch } from './auth';

export class ServerVoiceApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ServerVoiceApiError';
    this.status = status;
  }
}

export interface ServerTranscript {
  text: string;
  confidence: number;
  duration: number;
}

interface SttBody {
  text?: string;
  confidence?: number;
  duration?: number;
  error?: string;
}

/** ArrayBuffer → base64 without blowing the call stack on large blobs. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * POST /api/stt — upload a recorded utterance as JSON {audio: base64,
 * language}, receive the transcript. Base64 (not raw bytes) because the
 * API body reader decodes text, which corrupts binary WAVs in transit.
 * Throws when the server reports an error without text (e.g. whisper
 * missing) so the UI can note it instead of appending an empty row.
 */
export async function transcribeServerAudio(blob: Blob, language = 'en'): Promise<ServerTranscript> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/stt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audio: toBase64(await blob.arrayBuffer()), language }),
    });
  } catch {
    throw new ServerVoiceApiError(0, 'Server STT unreachable');
  }
  if (!res.ok) throw new ServerVoiceApiError(res.status, `Server STT failed (${res.status})`);
  const data = (await res.json()) as SttBody;
  if (data?.error && !data?.text) throw new ServerVoiceApiError(res.status, data.error);
  return {
    text: typeof data?.text === 'string' ? data.text : '',
    confidence: typeof data?.confidence === 'number' ? data.confidence : 0.9,
    duration: typeof data?.duration === 'number' ? data.duration : 0,
  };
}

export interface ServerSpeech {
  /** Revocable object URL for the synthesized WAV. */
  url: string;
  /** Server-reported audio duration in seconds (0 when unknown). */
  duration: number;
  revoke: () => void;
}

/**
 * POST /api/tts — synthesize text server-side (Piper) into a WAV object URL.
 * The caller owns `revoke()` (called on stop/unmount/replace).
 */
export async function synthesizeServerSpeech(options: {
  text: string;
  voice?: string;
  speed?: number;
}): Promise<ServerSpeech> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/tts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options),
    });
  } catch {
    throw new ServerVoiceApiError(0, 'Server TTS unreachable');
  }
  if (!res.ok) {
    let message = `Server TTS failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the fallback.
    }
    throw new ServerVoiceApiError(res.status, message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const duration = Number(res.headers.get('x-audio-duration') ?? 0) || 0;
  return { url, duration, revoke: () => URL.revokeObjectURL(url) };
}

export interface ServerSpeakHandle {
  stop: () => void;
  done: Promise<void>;
}

/**
 * Play a synthesized object URL through an audio element. Resolves when
 * playback ends (or errors); `stop()` halts it. Callers revoke the URL
 * after `done` settles.
 */
export function playServerAudio(objectUrl: string): ServerSpeakHandle {
  const audio = new Audio(objectUrl);
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  audio.onended = () => resolveDone();
  audio.onerror = () => resolveDone();
  void audio.play().catch(() => resolveDone());
  return {
    stop: () => {
      audio.pause();
      resolveDone();
    },
    done,
  };
}
