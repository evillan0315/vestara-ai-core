import type { AudioFrame } from '@vestara/media-conference';
import type { StreamingSessionEvent, StreamingSTTConfig, TranscriptEvent } from '@vestara/shared';
import { describe, expect, it } from 'vitest';
import { encodeWavPcm16, resampleMono, WhisperChunkedStreamingProvider, type WhisperTranscriber } from '../src/index';

function frame(samples: Float32Array, sampleRate = 16000): AudioFrame {
  return { sourceId: 'test', sampleRate, channels: 1, timestamp: 0, peak: 0.5, data: samples };
}

function tone(seconds: number, sampleRate = 16000): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sampleRate));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
  return out;
}

function silence(seconds: number, sampleRate = 16000): Float32Array {
  return new Float32Array(Math.floor(seconds * sampleRate));
}

const stubTranscriber: WhisperTranscriber = async (wav) => ({
  text: `heard-${wav.byteLength}`,
  confidence: 0.9,
  duration: 1,
});

const config: StreamingSTTConfig = {
  sessionId: 's1',
  sourceId: 'mic',
  language: 'en',
};

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iter) out.push(item);
  return out;
}

describe('WhisperChunkedStreamingProvider', () => {
  it('reports stub availability without a binary', () => {
    expect(new WhisperChunkedStreamingProvider({ transcriber: stubTranscriber }).available).toBe(true);
    expect(typeof new WhisperChunkedStreamingProvider().available).toBe('boolean');
  });

  it('emits a final event per silence-bounded utterance', async () => {
    const provider = new WhisperChunkedStreamingProvider({
      transcriber: stubTranscriber,
      segmenter: { silenceEndFrames: 5 },
    });
    const session = await provider.open(config);
    const transcripts = collect<TranscriptEvent>(session.events());
    const lifecycle = collect<StreamingSessionEvent>(session.sessionEvents());
    session.push(frame(tone(1)));
    session.push(frame(silence(0.5)));
    await session.close();
    const events = await transcripts;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'final', segmentId: 'seg-1', isFinal: true, confidence: 0.9 });
    expect(events[0].text).toContain('heard-');
    const life = await lifecycle;
    expect(life.map((e) => e.type)).toEqual(['closed']);
  });

  it('drops sub-minimum noise blips', async () => {
    const provider = new WhisperChunkedStreamingProvider({
      transcriber: stubTranscriber,
      segmenter: { silenceEndFrames: 5 },
    });
    const session = await provider.open(config);
    const transcripts = collect<TranscriptEvent>(session.events());
    session.push(frame(tone(0.1)));
    session.push(frame(silence(0.5)));
    await session.close();
    expect(await transcripts).toHaveLength(0);
  });

  it('emits partials on flush, then the final on close', async () => {
    const provider = new WhisperChunkedStreamingProvider({
      transcriber: stubTranscriber,
      segmenter: { silenceEndFrames: 1000 },
    });
    const session = await provider.open(config);
    const transcripts = collect<TranscriptEvent>(session.events());
    session.push(frame(tone(0.6)));
    await session.flush();
    await session.close();
    const events = await transcripts;
    expect(events.map((e) => e.type)).toEqual(['partial', 'final']);
    expect(events[0].isFinal).toBe(false);
    expect(events[1]).toMatchObject({ isFinal: true });
  });

  it('discards buffered audio on cancel', async () => {
    const provider = new WhisperChunkedStreamingProvider({ transcriber: stubTranscriber });
    const session = await provider.open(config);
    const transcripts = collect<TranscriptEvent>(session.events());
    const lifecycle = collect<StreamingSessionEvent>(session.sessionEvents());
    session.push(frame(tone(0.6)));
    await session.cancel();
    expect(await transcripts).toHaveLength(0);
    expect((await lifecycle).map((e) => e.type)).toEqual(['cancelled']);
  });

  it('emits buffer-overflow past the budget and keeps the tail', async () => {
    const provider = new WhisperChunkedStreamingProvider({ transcriber: stubTranscriber });
    const session = await provider.open({ ...config, maxBufferDurationMs: 1000 });
    const lifecycle = collect<StreamingSessionEvent>(session.sessionEvents());
    const transcripts = collect<TranscriptEvent>(session.events());
    session.push(frame(tone(3)));
    await session.close();
    const life = await lifecycle;
    expect(life.map((e) => e.type)).toContain('buffer-overflow');
    // The capped tail still transcribes on close.
    expect((await transcripts).map((e) => e.type)).toEqual(['final']);
  });

  it('surfaces transcriber failures as session events, not throws', async () => {
    const failing: WhisperTranscriber = async () => {
      throw new Error('whisper exploded');
    };
    const provider = new WhisperChunkedStreamingProvider({
      transcriber: failing,
      segmenter: { silenceEndFrames: 5 },
    });
    const session = await provider.open(config);
    const lifecycle = collect<StreamingSessionEvent>(session.sessionEvents());
    const transcripts = collect<TranscriptEvent>(session.events());
    session.push(frame(tone(1)));
    session.push(frame(silence(0.5)));
    await session.close();
    expect(await transcripts).toHaveLength(0);
    const life = await lifecycle;
    expect(life.map((e) => e.type)).toContain('provider-error');
    expect(life.map((e) => e.type)).toContain('closed');
  });
});

describe('chunked helpers', () => {
  it('encodes a valid 16-bit WAV', () => {
    const wav = encodeWavPcm16(new Float32Array([0, 0.5, -0.5]), 16000);
    const view = new DataView(wav);
    const ascii = (offset: number, length: number): string =>
      Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(wav.byteLength).toBe(44 + 3 * 2);
    expect(view.getUint32(24, true)).toBe(16000);
  });

  it('resamples 48 kHz to 16 kHz linearly', () => {
    const up = tone(0.1, 48000);
    const down = resampleMono(up, 48000, 16000);
    expect(down.length).toBe(1600);
    // Peak preserved through linear interpolation.
    let peak = 0;
    for (const v of down) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.4);
  });
});
