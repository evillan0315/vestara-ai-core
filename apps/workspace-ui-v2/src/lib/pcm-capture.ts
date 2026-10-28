// Browser PCM capture for WS voice streaming (/ws/voice).
// Captures mono float32 frames, resamples to 16 kHz, and encodes int16
// base64 — the exact frame shape the server session expects. ScriptProcessor
// is deprecated but remains the only capture primitive that works without a
// separate worklet module in every Chromium/Firefox/Safari target.

/** Linear resample of mono float32 to 16 kHz. */
export function resampleTo16k(samples: Float32Array, fromRate: number): Float32Array {
  if (!Number.isFinite(fromRate) || fromRate <= 0) throw new Error('resample needs a positive rate');
  if (fromRate === 16000) return samples.slice();
  const ratio = fromRate / 16000;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const lo = Math.floor(pos);
    const frac = pos - lo;
    const a = samples[lo] ?? 0;
    const b = samples[Math.min(samples.length - 1, lo + 1)] ?? 0;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Clamp float32 to int16 and base64-encode (chunked — no stack blowups). */
export function floatToInt16B64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export interface PcmCapture {
  close: () => void;
}

/**
 * Capture live PCM from a mic stream. Throws when the Web Audio stack is
 * unavailable (callers fall back to batch MediaRecorder upload).
 */
export function capturePcm(
  stream: MediaStream,
  onFrame: (samples: Float32Array, sampleRate: number) => void,
): PcmCapture {
  const Ctor =
    typeof window !== 'undefined'
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (typeof Ctor !== 'function') throw new Error('audio capture unavailable in this browser');
  const context = new Ctor();
  const source = context.createMediaStreamSource(stream);
  // 4096-sample buffer ≈ 85 ms at 48 kHz — small enough for interim latency.
  const processor = context.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (event: AudioProcessingEvent) => {
    onFrame(event.inputBuffer.getChannelData(0).slice(), context.sampleRate);
  };
  // Muted sink: the processor only runs while connected downstream.
  const sink = context.createGain();
  sink.gain.value = 0;
  source.connect(processor);
  processor.connect(sink);
  sink.connect(context.destination);
  void context.resume().catch(() => {});
  return {
    close: () => {
      try {
        source.disconnect();
        processor.disconnect();
        sink.disconnect();
      } catch {
        // Already torn down — ignore.
      }
      void context.close().catch(() => {});
    },
  };
}
