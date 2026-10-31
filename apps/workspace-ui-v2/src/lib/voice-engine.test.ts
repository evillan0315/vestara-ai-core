/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  listSystemVoices,
  pickSystemVoice,
  speakText,
  startRecognition,
  stopSpeaking,
  voiceEngineSupport,
} from './voice-engine';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

class FakeRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  started = 0;
  stopped = 0;

  start() {
    this.started += 1;
  }

  stop() {
    this.stopped += 1;
  }

  emit(name: 'result' | 'error' | 'end', payload?: unknown) {
    if (name === 'result' && this.onresult) this.onresult(payload);
    if (name === 'error' && this.onerror) this.onerror(payload);
    if (name === 'end' && this.onend) this.onend();
  }
}

const created: FakeRecognition[] = [];

class FakeSpeechRecognition extends FakeRecognition {
  constructor() {
    super();
    created.push(this);
  }
}

function stubSpeechRecognition() {
  created.length = 0;
  vi.stubGlobal('SpeechRecognition', FakeSpeechRecognition);
  return {
    instance: () => created[created.length - 1] as FakeRecognition,
  };
}

class FakeUtterance {
  text: string;
  lang = '';
  volume = 1;
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onboundary: ((event: { charIndex: number }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

describe('voiceEngineSupport', () => {
  it('reports no capabilities in bare jsdom', () => {
    expect(voiceEngineSupport()).toEqual({ speechRecognition: false, speechSynthesis: false, microphone: false });
  });

  it('detects the webkit recognition + synthesis + mic stack', () => {
    stubSpeechRecognition();
    vi.stubGlobal('webkitSpeechRecognition', vi.fn());
    vi.stubGlobal('speechSynthesis', { getVoices: () => [] });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      configurable: true,
    });
    expect(voiceEngineSupport().speechRecognition).toBe(true);
    expect(voiceEngineSupport().speechSynthesis).toBe(true);
    expect(voiceEngineSupport().microphone).toBe(true);
  });
});

describe('pickSystemVoice', () => {
  const voices = [
    { name: 'Google US English', lang: 'en-US', default: false },
    { name: 'Google español', lang: 'es-ES', default: false },
    { name: 'System Default', lang: 'en-GB', default: true },
  ] as SpeechSynthesisVoice[];

  it('matches exact lang, then prefix, then default', () => {
    expect(pickSystemVoice(voices, 'ES-us')?.name).toBe('Google español');
    expect(pickSystemVoice(voices, 'en-AU')?.name).toBe('Google US English');
    expect(pickSystemVoice(voices, 'fr-FR')?.name).toBe('System Default');
    expect(pickSystemVoice([], 'en-US')).toBeNull();
  });
});

describe('listSystemVoices', () => {
  it('resolves cached voices immediately', async () => {
    const cached = [{ name: 'cached' }] as SpeechSynthesisVoice[];
    vi.stubGlobal('speechSynthesis', { getVoices: () => cached });
    await expect(listSystemVoices()).resolves.toBe(cached);
  });

  it('resolves empty without synthesis', async () => {
    await expect(listSystemVoices()).resolves.toEqual([]);
  });
});

describe('speakText', () => {
  it('maps shell volume/rate/pitch onto the utterance and resolves on end', async () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    let utterance!: FakeUtterance;
    const synth = {
      cancel: vi.fn(),
      speak: vi.fn((u: FakeUtterance) => {
        utterance = u;
      }),
      getVoices: () => [],
    };
    vi.stubGlobal('speechSynthesis', synth);
    const handle = speakText({ text: 'hello', voice: null, lang: 'EN-US', volume: 85, rate: 1.5, pitch: 0 });
    expect(synth.cancel).toHaveBeenCalled();
    expect(utterance.lang).toBe('en-US');
    expect(utterance.volume).toBeCloseTo(0.85);
    expect(utterance.rate).toBe(1.5);
    expect(utterance.pitch).toBeCloseTo(1);
    utterance.onend?.({} as SpeechSynthesisEvent);
    await expect(handle.done).resolves.toBeUndefined();
    handle.stop();
    expect(synth.cancel).toHaveBeenCalledTimes(2);
  });

  it('rejects without synthesis', async () => {
    await expect(
      speakText({ text: 'hi', voice: null, lang: 'en-US', volume: 80, rate: 1, pitch: 0 }).done,
    ).rejects.toThrow('speechSynthesis unavailable');
  });

  it('stops synthesis globally', () => {
    const cancel = vi.fn();
    vi.stubGlobal('speechSynthesis', { cancel, getVoices: () => [] });
    stopSpeaking();
    expect(cancel).toHaveBeenCalled();
  });
});

describe('startRecognition', () => {
  it('throws when unsupported', () => {
    expect(() => startRecognition('en-US', () => {})).toThrow('speechRecognition unavailable');
  });

  it('streams interim then final results with normalized lang', () => {
    const { instance } = stubSpeechRecognition();
    const seen: Array<{ text: string; isFinal: boolean; confidence: number }> = [];
    const session = startRecognition('EN-US', (r) => seen.push(r));
    const rec = instance();
    expect(rec.lang).toBe('en-US');
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    rec.emit('result', {
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: 'hel', confidence: 0.6 } }],
    });
    rec.emit('result', {
      resultIndex: 1,
      results: [
        { isFinal: false, 0: { transcript: 'hel', confidence: 0.6 } },
        { isFinal: true, 0: { transcript: 'hello', confidence: 0.95 } },
      ],
    });
    expect(seen).toEqual([
      { text: 'hel', isFinal: false, confidence: 0.6 },
      { text: 'hello', isFinal: true, confidence: 0.95 },
    ]);
    session.stop();
    expect(rec.stopped).toBe(1);
  });
});
