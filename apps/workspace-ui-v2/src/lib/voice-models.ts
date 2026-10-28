// Live voice-model catalog — OpenCode configured providers, audio-capable only.
// Contracts: apps/api/src/routes/opencode.ts
// (GET /api/opencode/config/providers → { providers, default, pagination }).
// Model voice capability rides on OpenCode model capabilities
// (capabilities.input.audio → STT, capabilities.output.audio → TTS).
// The Bearer token rides via assistantFetch (gateway VES-AUTH-001
// authenticates every /api/*); transport failures reject so callers fall
// back to fixtures (offline-first).

import { apiBaseUrl } from './assistant-api';
import { assistantFetch } from './auth';

export interface VoiceProviderModel {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  family: string;
  audioIn: boolean;
  audioOut: boolean;
}

export interface VoiceProviderEntry {
  id: string;
  name: string;
  audioModels: number;
  totalModels: number;
}

export interface VoiceModelCatalog {
  /** Models with audio input — transcription / streaming STT. */
  stt: VoiceProviderModel[];
  /** Models with audio output — speech synthesis voices. */
  tts: VoiceProviderModel[];
  /** Server default model, when it resolves to a catalog entry. */
  duplex: VoiceProviderModel | null;
  /** Providers behind the catalog, audio-capable first. */
  providers: VoiceProviderEntry[];
  totalConfigured: number;
}

export const VOICE_MODELS_EMPTY: VoiceModelCatalog = {
  stt: [],
  tts: [],
  duplex: null,
  providers: [],
  totalConfigured: 0,
};

export interface VoiceEngineEntry {
  id: string;
  name: string;
  /** Null = the client decides (e.g. OpenCode audio depends on the model catalog). */
  available: boolean | null;
  detail: string;
}

export interface ServerTtsVoice {
  id: string;
  name: string;
  lang: string;
}

export interface VoiceEngines {
  /** `whisper` (server batch STT) plus the client-side `browser` source. */
  sttEngines: VoiceEngineEntry[];
  /** `system` (speechSynthesis) vs `server` (Piper WAV) vs `opencode` (catalog persona). */
  ttsEngines: VoiceEngineEntry[];
  /** Piper voices configured server-side; empty when Piper has no model. */
  ttsVoices: ServerTtsVoice[];
}

export const VOICE_ENGINES_EMPTY: VoiceEngines = {
  sttEngines: [],
  ttsEngines: [],
  ttsVoices: [],
};

/** True when the named engine id is reported available (null = client decides). */
export function isEngineAvailable(engines: VoiceEngines, kind: 'stt' | 'tts', id: string): boolean {
  const list = kind === 'stt' ? engines.sttEngines : engines.ttsEngines;
  const entry = list.find((e) => e.id === id);
  if (!entry) return false;
  return entry.available !== false;
}

export class VoiceModelsApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'VoiceModelsApiError';
    this.status = status;
  }
}

interface RawCapabilities {
  input?: { audio?: unknown };
  output?: { audio?: unknown };
}

function normalizeModel(
  providerId: string,
  providerName: string,
  raw: { id?: unknown; name?: unknown; family?: unknown; capabilities?: unknown },
): VoiceProviderModel | null {
  if (typeof raw.id !== 'string' || !raw.id) return null;
  const capabilities = (raw.capabilities ?? {}) as RawCapabilities;
  return {
    providerId,
    providerName,
    modelId: raw.id,
    modelName: typeof raw.name === 'string' && raw.name ? raw.name : raw.id,
    family: typeof raw.family === 'string' ? raw.family : '',
    audioIn: capabilities.input?.audio === true,
    audioOut: capabilities.output?.audio === true,
  };
}

function resolveDefault(models: VoiceProviderModel[], fallback: unknown): VoiceProviderModel | null {
  if (fallback === null || typeof fallback !== 'object') return null;
  const values = Object.values(fallback as Record<string, unknown>);
  for (const value of values) {
    if (typeof value !== 'string' || !value) continue;
    const slash = value.indexOf('/');
    if (slash > 0) {
      const hit = models.find((m) => m.providerId === value.slice(0, slash) && m.modelId === value.slice(slash + 1));
      if (hit) return hit;
    }
    const direct = models.find((m) => m.modelId === value);
    if (direct) return direct;
  }
  return null;
}

/**
 * GET /api/opencode/config/providers — configured (key-stripped) providers,
 * projected to the audio-capable voice catalog.
 */
export async function fetchVoiceModels(): Promise<VoiceModelCatalog> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/opencode/config/providers?limit=100`);
  } catch {
    throw new VoiceModelsApiError(0, 'Voice models API unreachable');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the fallback.
    }
    throw new VoiceModelsApiError(res.status, message);
  }
  const data = (await res.json()) as {
    providers?: Array<{
      id?: unknown;
      name?: unknown;
      models?: unknown;
    }>;
    default?: unknown;
  };
  const rawProviders = Array.isArray(data?.providers) ? data.providers : [];
  const models: VoiceProviderModel[] = [];
  // The same model id can appear under several providers (e.g. aliases) or
  // twice within one provider (variants). Rows are keyed
  // `${providerId}/${modelId}` downstream, so collapse exact duplicates here
  // (first wins) — otherwise sibling rows share a React key and the list
  // corrupts on update.
  const seenModels = new Set<string>();
  for (const provider of rawProviders) {
    if (typeof provider?.id !== 'string' || !provider.id) continue;
    const name = typeof provider.name === 'string' && provider.name ? provider.name : provider.id;
    const rawModels = Array.isArray(provider.models)
      ? provider.models
      : provider.models !== null && typeof provider.models === 'object'
        ? Object.values(provider.models as Record<string, unknown>)
        : [];
    for (const raw of rawModels) {
      const normalized = normalizeModel(provider.id, name, (raw ?? {}) as Parameters<typeof normalizeModel>[2]);
      if (!normalized) continue;
      const key = `${normalized.providerId}/${normalized.modelId}`;
      if (seenModels.has(key)) continue;
      seenModels.add(key);
      models.push(normalized);
    }
  }
  const byProvider = new Map<string, { name: string; audio: number; total: number }>();
  for (const m of models) {
    const entry = byProvider.get(m.providerId) ?? { name: m.providerName, audio: 0, total: 0 };
    entry.total += 1;
    if (m.audioIn || m.audioOut) entry.audio += 1;
    byProvider.set(m.providerId, entry);
  }
  const providers: VoiceProviderEntry[] = [...byProvider.entries()]
    .map(([id, entry]) => ({ id, name: entry.name, audioModels: entry.audio, totalModels: entry.total }))
    .sort((a, b) => b.audioModels - a.audioModels || a.name.localeCompare(b.name));
  return {
    stt: models.filter((m) => m.audioIn),
    tts: models.filter((m) => m.audioOut),
    duplex: resolveDefault(models, data?.default),
    providers,
    totalConfigured: models.length,
  };
}

/**
 * GET /api/voice/models — server voice engines (Whisper/Piper availability)
 * plus the server TTS voice catalog. Transport failures reject so callers
 * fall back to client-only engines (offline-first).
 */
export async function fetchVoiceEngines(): Promise<VoiceEngines> {
  let res: Response;
  try {
    res = await assistantFetch(`${apiBaseUrl()}/api/voice/models`);
  } catch {
    throw new VoiceModelsApiError(0, 'Voice engines API unreachable');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the fallback.
    }
    throw new VoiceModelsApiError(res.status, message);
  }
  const data = (await res.json()) as {
    sttEngines?: unknown;
    ttsEngines?: unknown;
    ttsVoices?: unknown;
  };
  const engines = (raw: unknown): VoiceEngineEntry[] =>
    Array.isArray(raw)
      ? raw
          .filter(
            (entry): entry is { id: unknown; name?: unknown; available?: unknown; detail?: unknown } =>
              typeof entry === 'object' && entry !== null,
          )
          .filter((entry) => typeof entry.id === 'string' && entry.id)
          .map((entry) => ({
            id: entry.id as string,
            name: typeof entry.name === 'string' && entry.name ? entry.name : (entry.id as string),
            available: entry.available === null || typeof entry.available === 'boolean' ? entry.available : null,
            detail: typeof entry.detail === 'string' ? entry.detail : '',
          }))
      : [];
  const voices = Array.isArray(data?.ttsVoices)
    ? (data.ttsVoices as Array<{ id?: unknown; name?: unknown; lang?: unknown }>)
        .filter((entry) => typeof entry?.id === 'string' && entry.id)
        .map((entry) => ({
          id: entry.id as string,
          name: typeof entry.name === 'string' && entry.name ? entry.name : (entry.id as string),
          lang: typeof entry.lang === 'string' && entry.lang ? entry.lang : 'en-US',
        }))
    : [];
  return { sttEngines: engines(data?.sttEngines), ttsEngines: engines(data?.ttsEngines), ttsVoices: voices };
}
