/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { capturePcm, floatToInt16B64, resampleTo16k } from './pcm-capture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).AudioContext;
});

describe('resampleTo16k', () => {
  it('passes 16 kHz through as a copy', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    const out = resampleTo16k(input, 16000);
    expect(out).not.toBe(input);
    expect(out.length).toBe(3);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeCloseTo([0.1, 0.2, 0.3][i] as number);
  });

  it('downsamples 48 kHz linearly', () => {
    const input = new Float32Array(4800).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.5);
    const out = resampleTo16k(input, 48000);
    expect(out.length).toBe(1600);
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.4);
  });

  it('rejects non-positive rates', () => {
    expect(() => resampleTo16k(new Float32Array([0]), 0)).toThrow('positive rate');
  });
});

describe('floatToInt16B64', () => {
  it('round-trips through int16 quantization', () => {
    const encoded = floatToInt16B64(new Float32Array([0, 0.5, -0.5, 1, -1]));
    const bytes = Buffer.from(encoded, 'base64');
    expect(bytes.byteLength).toBe(10);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(2, true)).toBe(16383);
    expect(view.getInt16(4, true)).toBe(-16384);
    expect(view.getInt16(6, true)).toBe(32767);
    expect(view.getInt16(8, true)).toBe(-32768);
  });
});

describe('capturePcm', () => {
  it('throws without a Web Audio stack', () => {
    expect(() => capturePcm({} as MediaStream, () => {})).toThrow('audio capture unavailable');
  });

  it('forwards copied channel frames and tears down cleanly', () => {
    const source = { connect: vi.fn(), disconnect: vi.fn() };
    const processor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null as ((event: unknown) => void) | null,
    };
    const sink = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
    const fakeContext = {
      sampleRate: 48000,
      createMediaStreamSource: vi.fn(() => source),
      createScriptProcessor: vi.fn(() => processor),
      createGain: vi.fn(() => sink),
      destination: {},
      resume: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    Object.defineProperty(window, 'AudioContext', {
      // new-able: arrow implementations are not constructible.
      value: vi.fn(function () {
        return fakeContext;
      }),
      configurable: true,
    });
    const seen: Array<{ samples: Float32Array; rate: number }> = [];
    const capture = capturePcm({} as MediaStream, (samples, rate) => seen.push({ samples, rate }));
    const live = new Float32Array([0.1, 0.2]);
    processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => live } });
    // The frame is a copy — mutating the source afterwards is safe.
    live[0] = 9;
    expect(seen).toHaveLength(1);
    expect(seen[0].samples[0]).toBeCloseTo(0.1);
    expect(seen[0].samples[1]).toBeCloseTo(0.2);
    expect(seen[0].rate).toBe(48000);
    // Muted sink: capture never plays the mic back.
    expect(sink.gain.value).toBe(0);
    capture.close();
    expect(source.disconnect).toHaveBeenCalled();
    expect(fakeContext.close).toHaveBeenCalled();
  });
});
