import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchVoiceEngines, fetchVoiceModels, isEngineAvailable, VoiceModelsApiError } from './voice-models';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown) => handler(String(url))),
  );
}

const sparkStt = {
  id: 'muse-spark-1.3',
  name: 'Muse Spark 1.3',
  family: 'muse-spark',
  capabilities: { input: { text: true, audio: true }, output: { text: true, audio: true } },
};

const textOnly = {
  id: 'muse-spark-1.3-text',
  name: 'Muse Spark 1.3 Text',
  family: 'muse-spark',
  capabilities: { input: { text: true }, output: { text: true } },
};

describe('fetchVoiceModels', () => {
  it('projects audio-capable models into stt/tts/providers and resolves the default duplex', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/opencode/config/providers')) {
        expect(url).toContain('limit=100');
        return ok({
          providers: [{ id: 'opencode', name: 'OpenCode', models: [sparkStt, textOnly, { name: 'nameless' }] }],
          default: { model: 'opencode/muse-spark-1.3' },
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    await expect(fetchVoiceModels()).resolves.toEqual({
      stt: [
        {
          providerId: 'opencode',
          providerName: 'OpenCode',
          modelId: 'muse-spark-1.3',
          modelName: 'Muse Spark 1.3',
          family: 'muse-spark',
          audioIn: true,
          audioOut: true,
        },
      ],
      tts: [
        {
          providerId: 'opencode',
          providerName: 'OpenCode',
          modelId: 'muse-spark-1.3',
          modelName: 'Muse Spark 1.3',
          family: 'muse-spark',
          audioIn: true,
          audioOut: true,
        },
      ],
      duplex: {
        providerId: 'opencode',
        providerName: 'OpenCode',
        modelId: 'muse-spark-1.3',
        modelName: 'Muse Spark 1.3',
        family: 'muse-spark',
        audioIn: true,
        audioOut: true,
      },
      providers: [{ id: 'opencode', name: 'OpenCode', audioModels: 1, totalModels: 2 }],
      totalConfigured: 2,
    });
  });

  it('returns an empty catalog when nothing is configured', async () => {
    stubFetch(async () => ok({ providers: [], default: {} }));
    await expect(fetchVoiceModels()).resolves.toEqual({
      stt: [],
      tts: [],
      duplex: null,
      providers: [],
      totalConfigured: 0,
    });
  });

  it('rejects with status 0 when unreachable', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    await expect(fetchVoiceModels()).rejects.toBeInstanceOf(VoiceModelsApiError);
  });
});

describe('fetchVoiceEngines', () => {
  it('projects server engine availability and Piper voices', async () => {
    stubFetch(async (url) => {
      expect(url).toContain('/api/voice/models');
      return ok({
        sttEngines: [{ id: 'whisper', name: 'Whisper (server)', available: true, detail: 'ready' }],
        ttsEngines: [{ id: 'server', name: 'Piper (server)', available: false, detail: 'no model' }],
        ttsVoices: [{ id: '/models/en.onnx', name: 'en', lang: 'en-US' }],
      });
    });
    await expect(fetchVoiceEngines()).resolves.toEqual({
      sttEngines: [{ id: 'whisper', name: 'Whisper (server)', available: true, detail: 'ready' }],
      ttsEngines: [{ id: 'server', name: 'Piper (server)', available: false, detail: 'no model' }],
      ttsVoices: [{ id: '/models/en.onnx', name: 'en', lang: 'en-US' }],
    });
  });

  it('tolerates missing sections and drops malformed entries', async () => {
    stubFetch(async () => ok({ sttEngines: [{ id: '' }, null, { id: 'whisper' }], ttsVoices: [{ name: 'x' }] }));
    await expect(fetchVoiceEngines()).resolves.toEqual({
      sttEngines: [{ id: 'whisper', name: 'whisper', available: null, detail: '' }],
      ttsEngines: [],
      ttsVoices: [],
    });
  });

  it('rejects with status 0 when unreachable', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    await expect(fetchVoiceEngines()).rejects.toBeInstanceOf(VoiceModelsApiError);
  });
});

describe('isEngineAvailable', () => {
  it('treats missing or false entries as unavailable, null as client-decided', () => {
    const engines = {
      sttEngines: [
        { id: 'whisper', name: 'w', available: true, detail: '' },
        { id: 'opencode', name: 'o', available: null, detail: '' },
      ],
      ttsEngines: [],
      ttsVoices: [],
    };
    expect(isEngineAvailable(engines, 'stt', 'whisper')).toBe(true);
    expect(isEngineAvailable(engines, 'stt', 'opencode')).toBe(true);
    expect(isEngineAvailable(engines, 'stt', 'missing')).toBe(false);
    expect(isEngineAvailable(engines, 'tts', 'server')).toBe(false);
  });
});
