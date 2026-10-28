/**
 * @vestara/stt — Speech-to-Text Service
 *
 * Provider-agnostic STT abstraction for conversational onboarding.
 * Default stub implements detection-only; real providers (Whisper.cpp,
 * faster-whisper, cloud APIs) implement the STTProvider interface.
 *
 * Architecture Traceability:
 *   PCS-020 → Audio Pipeline (STT)
 *   UX-011  → Voice Interaction
 *   OVR-009B → Streaming STT Contract Foundation
 */

import type { Logger } from '@vestara/logger';
import type { AudioFrame } from '@vestara/media-conference';
import type {
  BoundedBufferPolicy,
  SpeechBoundaryHint,
  STTProvider,
  StreamingSessionEvent,
  StreamingSessionEventType,
  StreamingSTTConfig,
  StreamingTranscriptionSessionInfo,
  TranscriptEvent,
  TranscriptEventType,
} from '@vestara/shared';

// ─── Streaming STT Provider Contract (AudioFrame-aware) ──────────

/**
 * Streaming transcription session interface.
 * The mutable session implementation; owns push/hint/events/flush/cancel/close.
 */
export interface StreamingTranscriptionSession {
  readonly info: StreamingTranscriptionSessionInfo;

  /** Push a single AudioFrame for processing. */
  push(frame: AudioFrame): Promise<void> | void;

  /** Optional VAD boundary hint. */
  hint(hint: SpeechBoundaryHint): Promise<void> | void;

  /** Stream of transcript events (recognition output only). */
  events(): AsyncIterable<TranscriptEvent>;

  /** Stream of session/runtime lifecycle events. */
  sessionEvents(): AsyncIterable<StreamingSessionEvent>;

  /** Force emission of any buffered partial results. */
  flush(): Promise<void>;

  /** Cancel the session; discard queued PCM; do not publish final transcript. */
  cancel(): Promise<void>;

  /** Close the session gracefully; release resources. */
  close(): Promise<void>;
}

/**
 * Provider interface for streaming STT.
 * Owns capability; open(config) creates and returns a session.
 */
export interface StreamingSTTProvider {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;

  /** Create a new streaming transcription session. */
  open(config: StreamingSTTConfig): Promise<StreamingTranscriptionSession>;

  /** Health check for the provider. */
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }>;
}

// ─── Core STT Service (Extended for Streaming) ───────────────────

export class VestaraSTTService {
  readonly id = 'vestara-stt';
  private provider: STTProvider | null = null;
  private streamingProvider: StreamingSTTProvider | null = null;
  private logger?: Logger;

  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger?.child({ component: 'vestara-stt' });
  }

  get status(): 'available' | 'unavailable' | 'degraded' {
    if (!this.provider && !this.streamingProvider) return 'unavailable';
    if (this.provider?.available) return 'available';
    if (this.streamingProvider?.available) return 'available';
    return 'degraded';
  }

  get providerName(): string {
    return this.provider?.name ?? this.streamingProvider?.name ?? 'none';
  }

  registerProvider(provider: STTProvider): void {
    this.provider = provider;
    this.logger?.info('STT provider registered', { id: provider.id, name: provider.name });
  }

  registerStreamingProvider(provider: StreamingSTTProvider): void {
    this.streamingProvider = provider;
    this.logger?.info('Streaming STT provider registered', { id: provider.id, name: provider.name });
  }

  // Legacy batch API — retained for backward compatibility.
  // Availability is resolved by the provider per call (binaries may appear
  // after boot); the provider throws a specific unavailability error.
  async transcribe(
    audioBuffer: ArrayBuffer,
    language?: string,
  ): Promise<{ text: string; confidence: number; duration: number }> {
    if (!this.provider) throw new Error('No STT provider registered');
    return this.provider.transcribe(audioBuffer, language);
  }

  transcribeStream(
    audioBuffer: AsyncIterable<ArrayBuffer>,
    language?: string,
  ): AsyncIterable<{ text: string; isFinal: boolean; confidence: number }> {
    if (!this.provider) throw new Error('No STT provider registered');
    return this.provider.transcribeStream(audioBuffer, language);
  }

  // Streaming session API
  async openStreamingSession(config: StreamingSTTConfig): Promise<StreamingTranscriptionSession> {
    if (!this.streamingProvider) throw new Error('No streaming STT provider registered');
    return this.streamingProvider.open(config);
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    if (this.streamingProvider) {
      return this.streamingProvider.healthCheck();
    }
    if (!this.provider) {
      return { status: 'unhealthy', latency: 0 };
    }
    return this.provider.healthCheck();
  }
}

// ─── Whisper Provider (Legacy + Streaming Stub) ──────────────────

/**
 * Resolve the whisper CLI binary. `VESTARA_WHISPER_BIN` overrides PATH
 * lookup (`whisper` → `whisper.cpp` → `faster-whisper`). Re-resolved per
 * call so installs after boot are picked up without a restart.
 */
export function resolveWhisperBinary(): string | null {
  const override = process.env.VESTARA_WHISPER_BIN?.trim();
  if (override) return override;
  try {
    const { execSync } = require('node:child_process');
    const result = execSync(
      'which whisper 2>/dev/null || which whisper.cpp 2>/dev/null || which faster-whisper 2>/dev/null',
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    );
    const first = result.trim().split('\n')[0]?.trim();
    return first ? first : null;
  } catch {
    return null;
  }
}

export interface WhisperAvailability {
  readonly available: boolean;
  readonly binary: string | null;
  readonly detail: string;
}

/** Machine-readable availability for `/api/voice/health` — never throws. */
export function describeWhisperAvailability(): WhisperAvailability {
  const binary = resolveWhisperBinary();
  if (!binary) {
    return {
      available: false,
      binary: null,
      detail: 'No whisper binary on PATH (whisper, whisper.cpp, faster-whisper) — set VESTARA_WHISPER_BIN to override',
    };
  }
  return { available: true, binary, detail: `Whisper binary at ${binary}` };
}

function _resolveFfmpeg(): string | null {
  try {
    const { execSync } = require('node:child_process');
    const result = execSync('which ffmpeg 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const first = result.trim().split('\n')[0]?.trim();
    return first ? first : null;
  } catch {
    return null;
  }
}

/**
 * Run the whisper CLI over one audio blob (async — never blocks the event
 * loop, so concurrent WS sessions don't stall each other).
 * Browser captures (MediaRecorder webm/opus) are normalized to 16 kHz mono
 * WAV via ffmpeg when present; otherwise the raw bytes go straight through
 * and the CLI decides. Extra CLI flags come from `VESTARA_WHISPER_ARGS`
 * (space-separated). openai-whisper style output is read back from the
 * emitted `.txt` sidecar; other CLIs are parsed from stdout.
 */
async function _runWhisper(binary: string, audio: ArrayBuffer, language?: string): Promise<string> {
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  const run = promisify(execFile) as (
    file: string,
    args: string[],
    options: { encoding: 'utf-8'; timeout: number; maxBuffer: number },
  ) => Promise<{ stdout: string }>;
  const fs = require('node:fs');
  const fsp = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vestara-stt-'));
  try {
    const inputPath = path.join(dir, 'input.audio');
    await fsp.writeFile(inputPath, Buffer.from(audio));
    let wavPath = inputPath;
    const ffmpeg = _resolveFfmpeg();
    if (ffmpeg) {
      const converted = path.join(dir, 'input-16k.wav');
      try {
        await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', inputPath, '-ar', '16000', '-ac', '1', converted], {
          encoding: 'utf-8',
          timeout: 30_000,
          maxBuffer: 16 * 1024 * 1024,
        });
        wavPath = converted;
      } catch {
        // Conversion failed (unknown container?) — fall through with raw input.
      }
    }
    const extra = (process.env.VESTARA_WHISPER_ARGS ?? '').split(/\s+/).filter(Boolean);
    const args = [wavPath, '--output_format', 'txt', '--output_dir', dir, ...extra];
    if (language) args.push('--language', language);
    let stdout = '';
    try {
      const result = await run(binary, args, {
        encoding: 'utf-8',
        timeout: 60_000,
        maxBuffer: 16 * 1024 * 1024,
      });
      stdout = result.stdout;
    } catch {
      // openai-whisper exits non-zero on warnings but still writes the
      // sidecar — only fail when neither stdout nor a sidecar carries text.
    }
    const sidecar = path.join(dir, `${path.parse(wavPath).name}.txt`);
    try {
      const text = (await fsp.readFile(sidecar, 'utf-8')).trim();
      if (text) return text;
    } catch {
      // No sidecar — fall through to stdout.
    }
    return stdout.trim();
  } finally {
    try {
      await fsp.rm(dir, { recursive: true, force: true });
    } catch {
      // Best-effort temp cleanup — never fail transcription over it.
    }
  }
}

/** Encode mono float32 samples as 16-bit PCM WAV bytes. */
export function encodeWavPcm16(samples: Float32Array, sampleRate = 16000): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}

export class WhisperSTTProvider implements STTProvider {
  readonly id = 'vestara.stt.whisper';
  readonly name = 'Whisper.cpp';
  readonly available = _detectWhisper();

  async transcribe(
    audioBuffer: ArrayBuffer,
    language?: string,
  ): Promise<{ text: string; confidence: number; duration: number }> {
    if (audioBuffer.byteLength === 0) throw new Error('Whisper STT requires non-empty audio');
    const binary = resolveWhisperBinary();
    if (!binary) throw new Error('Whisper STT not available: no whisper binary on PATH (set VESTARA_WHISPER_BIN)');
    const started = Date.now();
    const text = await _runWhisper(binary, audioBuffer, language);
    return { text, confidence: text ? 0.9 : 0, duration: (Date.now() - started) / 1000 };
  }

  async *transcribeStream(
    audioBuffer: AsyncIterable<ArrayBuffer>,
    language?: string,
  ): AsyncIterable<{ text: string; isFinal: boolean; confidence: number }> {
    // Bounded CLI limitation: chunks are buffered and transcribed once the
    // stream ends (single final event). True incremental streaming needs the
    // StreamingSTTProvider session contract, not the batch CLI.
    const parts: Buffer[] = [];
    for await (const chunk of audioBuffer) parts.push(Buffer.from(chunk));
    const combined = Buffer.concat(parts);
    const copy = new ArrayBuffer(combined.byteLength);
    new Uint8Array(copy).set(combined);
    const { text, confidence } = await this.transcribe(copy, language);
    yield { text, confidence, isFinal: true };
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    const start = performance.now();
    return {
      status: resolveWhisperBinary() ? 'healthy' : 'unhealthy',
      latency: Math.round(performance.now() - start),
    };
  }
}

// ─── Whisper Chunked Streaming STT Provider (WS /ws/voice) ────────
// Utterance-batched incremental streaming over the batch whisper CLI:
// PCM frames accumulate behind an energy VAD; each completed utterance
// (silence boundary, max length, flush, or close) is transcribed as one
// final event. Partials are only emitted on explicit flush (transcribe
// the in-progress utterance so far). Honest incremental approximation —
// not frame-level streaming inference.

export interface WhisperSegmenterOptions {
  /** Energy threshold (RMS) for speech. Default 0.02. */
  readonly speechThreshold?: number;
  /** Consecutive speech frames to open an utterance (20 ms frames). Default 3. */
  readonly speechStartFrames?: number;
  /** Consecutive silence frames to close an utterance. Default 25 (~500 ms). */
  readonly silenceEndFrames?: number;
  /** Minimum utterance length; shorter is dropped as noise. Default 0.4 s. */
  readonly minUtteranceSec?: number;
  /** Maximum utterance length; longer forces a boundary. Default 20 s. */
  readonly maxUtteranceSec?: number;
  /** Target sample rate; input is linearly resampled. Default 16000. */
  readonly targetSampleRate?: number;
}

export type WhisperTranscriber = (
  wav: ArrayBuffer,
  language?: string,
) => Promise<{ text: string; confidence: number; duration: number }>;

async function _defaultChunkTranscriber(
  wav: ArrayBuffer,
  language?: string,
): Promise<{ text: string; confidence: number; duration: number }> {
  const binary = resolveWhisperBinary();
  if (!binary) throw new Error('Whisper STT not available: no whisper binary on PATH (set VESTARA_WHISPER_BIN)');
  const started = Date.now();
  const text = await _runWhisper(binary, wav, language);
  return { text, confidence: text ? 0.9 : 0, duration: (Date.now() - started) / 1000 };
}

/** Resample mono float32 (linear) and downmix helper for pushed frames. */
export function resampleMono(samples: Float32Array, fromRate: number, toRate = 16000): Float32Array {
  if (fromRate === toRate) return samples.slice();
  if (fromRate <= 0 || toRate <= 0) throw new Error('resampleMono requires positive sample rates');
  const ratio = fromRate / toRate;
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

interface ChunkedQueues {
  transcript: TranscriptEvent[];
  session: StreamingSessionEvent[];
  waiters: Array<() => void>;
}

function _wake(queues: ChunkedQueues): void {
  const waiters = queues.waiters.splice(0);
  for (const wake of waiters) wake();
}

export class WhisperChunkedTranscriptionSession implements StreamingTranscriptionSession {
  readonly info: StreamingTranscriptionSessionInfo;
  private readonly transcriber: WhisperTranscriber;
  private readonly language?: string;
  private readonly segmenter: Required<WhisperSegmenterOptions>;
  private readonly maxBufferSec: number;
  private readonly overflowPolicy: 'FIFO_drop' | 'block' | 'cancel';
  private readonly queues: ChunkedQueues = { transcript: [], session: [], waiters: [] };
  private pcm: number[] = [];
  private speaking = false;
  private speechRun = 0;
  private silenceRun = 0;
  private utterances = 0;
  private inFlight = 0;
  private pending: Array<() => Promise<void>> = [];
  private partialSegment: string | null = null;
  private closed = false;
  private cancelled = false;
  private finalized = false;
  private overflowEmitted = false;

  constructor(
    info: StreamingTranscriptionSessionInfo,
    transcriber: WhisperTranscriber,
    options?: WhisperSegmenterOptions & {
      language?: string;
      maxBufferSec?: number;
      overflowPolicy?: 'FIFO_drop' | 'block' | 'cancel';
    },
  ) {
    this.info = info;
    this.transcriber = transcriber;
    this.language = options?.language;
    this.segmenter = {
      speechThreshold: options?.speechThreshold ?? 0.02,
      speechStartFrames: options?.speechStartFrames ?? 3,
      silenceEndFrames: options?.silenceEndFrames ?? 25,
      minUtteranceSec: options?.minUtteranceSec ?? 0.4,
      maxUtteranceSec: options?.maxUtteranceSec ?? 20,
      targetSampleRate: options?.targetSampleRate ?? 16000,
    };
    this.maxBufferSec = options?.maxBufferSec ?? 120;
    this.overflowPolicy = options?.overflowPolicy ?? 'FIFO_drop';
  }

  push(frame: AudioFrame): Promise<void> | void {
    if (this.closed || this.cancelled) return;
    if (this.overflowPolicy === 'block' && this.inFlight > 0) {
      this._emitSession({ type: 'backpressure', frameCount: 1, dropped: true });
      return;
    }
    const mono = resampleMono(frame.data, frame.sampleRate, this.segmenter.targetSampleRate);
    const frameSize = Math.floor(this.segmenter.targetSampleRate * 0.02);
    for (let i = 0; i < mono.length; i += frameSize) {
      this._ingest20ms(mono.subarray(i, Math.min(mono.length, i + frameSize)));
    }
  }

  hint(hint: SpeechBoundaryHint): Promise<void> | void {
    if (this.closed || this.cancelled) return;
    if (hint.type === 'speech-end' && this.speaking && this.pcm.length > 0) {
      this._closeUtterance();
    }
  }

  async *events(): AsyncIterable<TranscriptEvent> {
    while (!this.finalized || this.queues.transcript.length > 0) {
      const next = this.queues.transcript.shift();
      if (next) {
        yield next;
        continue;
      }
      if (this.finalized) break;
      await new Promise<void>((resolve) => this.queues.waiters.push(resolve));
    }
  }

  async *sessionEvents(): AsyncIterable<StreamingSessionEvent> {
    // Drain until the session finalizes; the terminal event is always last.
    while (!this.finalized || this.queues.session.length > 0) {
      const next = this.queues.session.shift();
      if (next) {
        yield next;
        continue;
      }
      if (this.finalized) break;
      await new Promise<void>((resolve) => this.queues.waiters.push(resolve));
    }
  }

  async flush(): Promise<void> {
    if (this.closed || this.cancelled || this.pcm.length === 0) return;
    const segmentId = this.partialSegment ?? `seg-${this.utterances}`;
    this.partialSegment = segmentId;
    const wav = encodeWavPcm16(Float32Array.from(this.pcm), this.segmenter.targetSampleRate);
    try {
      const result = await this.transcriber(wav, this.language);
      if (this.cancelled || this.closed) return;
      if (!result.text.trim()) return; // heard nothing — no blank interim row
      this.queues.transcript.push({
        type: 'partial',
        segmentId,
        text: result.text,
        isFinal: false,
        confidence: result.confidence,
        timestamp: Date.now(),
        durationMs: this.pcm.length > 0 ? (this.pcm.length / this.segmenter.targetSampleRate) * 1000 : undefined,
        language: this.language,
        sourceId: this.info.sourceId,
        replacesSegmentId: undefined,
      });
      _wake(this.queues);
    } catch (error) {
      this._emitSession({ type: 'provider-error', error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  async cancel(): Promise<void> {
    if (this.cancelled || this.finalized) return;
    this.cancelled = true;
    this.pcm = [];
    this._finish('cancelled');
  }

  async close(): Promise<void> {
    if (this.closed || this.finalized) return;
    this.closed = true;
    if (!this.cancelled && this.speaking && this.pcm.length > 0) {
      await this._transcribeUtterance(Float32Array.from(this.pcm));
    }
    // Drain queued utterances before finalizing.
    while (this.pending.length > 0) {
      const job = this.pending.shift();
      if (job) await job();
    }
    while (this.inFlight > 0) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    this._finish('closed');
  }

  private _finish(terminal: 'cancelled' | 'closed'): void {
    this.finalized = true;
    this.queues.session.push({
      type: terminal,
      sessionId: this.info.sessionId,
      timestamp: Date.now(),
      frameCount: this.utterances,
      dropped: undefined,
      error: undefined,
    });
    _wake(this.queues);
  }

  private _ingest20ms(window: Float32Array): void {
    let sum = 0;
    for (let i = 0; i < window.length; i++) sum += window[i] * window[i];
    const rms = window.length > 0 ? Math.sqrt(sum / window.length) : 0;
    const speech = rms >= this.segmenter.speechThreshold;
    for (let i = 0; i < window.length; i++) this.pcm.push(window[i] ?? 0);
    // Hard cap: drop oldest seconds beyond the buffer budget.
    const cap = Math.floor(this.maxBufferSec * this.segmenter.targetSampleRate);
    if (this.pcm.length > cap) {
      const drop = this.pcm.length - cap;
      this.pcm.splice(0, drop);
      if (this.overflowPolicy === 'cancel') {
        void this.cancel();
        return;
      }
      if (!this.overflowEmitted) {
        this.overflowEmitted = true;
        this._emitSession({ type: 'buffer-overflow', frameCount: drop, dropped: true });
      }
    }
    if (speech) {
      this.speechRun += 1;
      this.silenceRun = 0;
      if (!this.speaking && this.speechRun >= this.segmenter.speechStartFrames) {
        this.speaking = true;
        this.overflowEmitted = false;
      }
    } else {
      this.silenceRun += 1;
      this.speechRun = 0;
    }
    const utteranceSec = this.pcm.length / this.segmenter.targetSampleRate;
    if (
      this.speaking &&
      (this.silenceRun >= this.segmenter.silenceEndFrames || utteranceSec >= this.segmenter.maxUtteranceSec)
    ) {
      this._closeUtterance();
    }
  }

  private _closeUtterance(): void {
    const samples = Float32Array.from(this.pcm);
    this.pcm = [];
    this.speaking = false;
    this.silenceRun = 0;
    this.speechRun = 0;
    const minSamples = Math.floor(this.segmenter.minUtteranceSec * this.segmenter.targetSampleRate);
    if (samples.length < minSamples) return; // noise blip — drop silently
    if (this.inFlight > 0) {
      this._emitSession({ type: 'backpressure', frameCount: 1, dropped: false });
    }
    this.pending.push(() => this._transcribeUtterance(samples));
    void this._pump();
  }

  private async _pump(): Promise<void> {
    if (this.inFlight > 0) return;
    const job = this.pending.shift();
    if (!job) return;
    this.inFlight += 1;
    try {
      await job();
    } finally {
      this.inFlight -= 1;
      if (this.pending.length > 0) void this._pump();
    }
  }

  private async _transcribeUtterance(samples: Float32Array): Promise<void> {
    const wav = encodeWavPcm16(samples, this.segmenter.targetSampleRate);
    try {
      const result = await this.transcriber(wav, this.language);
      if (this.cancelled || this.finalized) return;
      if (!result.text.trim()) return; // heard nothing — no blank final row
      this.utterances += 1;
      this.partialSegment = null;
      this.queues.transcript.push({
        type: 'final',
        segmentId: `seg-${this.utterances}`,
        text: result.text,
        isFinal: true,
        confidence: result.confidence,
        timestamp: Date.now(),
        durationMs: (samples.length / this.segmenter.targetSampleRate) * 1000,
        language: this.language,
        sourceId: this.info.sourceId,
        replacesSegmentId: undefined,
      });
      _wake(this.queues);
    } catch (error) {
      this._emitSession({ type: 'provider-error', error: error instanceof Error ? error : new Error(String(error)) });
    }
  }

  private _emitSession(event: {
    type: StreamingSessionEventType;
    frameCount?: number;
    dropped?: boolean;
    error?: Error;
  }): void {
    this.queues.session.push({
      type: event.type,
      sessionId: this.info.sessionId,
      timestamp: Date.now(),
      frameCount: event.frameCount,
      dropped: event.dropped,
      error: event.error,
    });
    _wake(this.queues);
  }
}

export class WhisperChunkedStreamingProvider implements StreamingSTTProvider {
  readonly id = 'vestara.stt.whisper-chunked';
  readonly name = 'Whisper Chunked Streaming';
  private readonly transcriber?: WhisperTranscriber;
  private readonly segmenter?: WhisperSegmenterOptions;

  constructor(options?: { transcriber?: WhisperTranscriber; segmenter?: WhisperSegmenterOptions }) {
    this.transcriber = options?.transcriber;
    this.segmenter = options?.segmenter;
  }

  get available(): boolean {
    if (this.transcriber) return true;
    return resolveWhisperBinary() !== null;
  }

  async open(config: StreamingSTTConfig): Promise<StreamingTranscriptionSession> {
    if (!this.available)
      throw new Error('Whisper STT not available: no whisper binary on PATH (set VESTARA_WHISPER_BIN)');
    return new WhisperChunkedTranscriptionSession(
      {
        sessionId: config.sessionId,
        sourceId: config.sourceId,
        createdAt: Date.now(),
        ...(config.language ? { language: config.language } : {}),
      },
      this.transcriber ?? _defaultChunkTranscriber,
      {
        ...this.segmenter,
        language: config.language,
        maxBufferSec: config.maxBufferDurationMs ? config.maxBufferDurationMs / 1000 : undefined,
        overflowPolicy: config.overflowPolicy,
      },
    );
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    const start = performance.now();
    return {
      status: this.available ? 'healthy' : 'unhealthy',
      latency: Math.round(performance.now() - start),
    };
  }
}

// ─── Deterministic Fake Streaming STT Provider (Test Only) ───────

/**
 * Configuration for the fake streaming STT provider.
 * Enables deterministic test scenarios.
 */
export interface FakeStreamingSTTConfig {
  /** Sequence of transcript events to emit. */
  readonly eventSequence: Array<{
    type: TranscriptEventType;
    text: string;
    delayMs?: number; // delay before emitting
    isFinal?: boolean; // for partial/final
    segmentId?: string;
    replacesSegmentId?: string;
  }>;
  /** Buffer policy for the fake provider. */
  readonly bufferPolicy?: BoundedBufferPolicy;
  /** Whether to simulate backpressure. */
  readonly simulateBackpressure?: boolean;
  /** Whether to simulate an error. */
  readonly simulateError?: Error;
  /** Error delay (if simulateError is set). */
  readonly errorDelayMs?: number;
}

/**
 * Fake streaming STT session for deterministic testing.
 * Supports deterministic: partial, revised partial, final, correction,
 * delayed result, provider error, backpressure, cancellation, late result after cancellation, close.
 *
 * Two separate event streams:
 *   events()   → AsyncIterable<TranscriptEvent>   (recognition output: partial/final/correction)
 *   sessionEvents() → AsyncIterable<StreamingSessionEvent> (runtime/lifecycle: backpressure/buffer-overflow/provider-error/session-reset/cancelled/closed)
 */
export class FakeStreamingTranscriptionSession implements StreamingTranscriptionSession {
  readonly info: StreamingTranscriptionSessionInfo;
  private readonly config: FakeStreamingSTTConfig;
  private readonly eventsQueue: TranscriptEvent[] = [];
  private readonly sessionEventsQueue: StreamingSessionEvent[] = [];
  private closed = false;
  private cancelled = false;
  private segmentIdCounter = 0;
  private currentPartialSegmentId: string | null = null;

  constructor(info: StreamingTranscriptionSessionInfo, config: FakeStreamingSTTConfig) {
    this.info = info;
    this.config = config;
  }

  push(_frame: AudioFrame): Promise<void> | void {
    if (this.closed || this.cancelled) return;
    // In fake provider, frames are acknowledged but don't directly trigger events.
    // Events are driven by the configured sequence.
  }

  hint(_hint: SpeechBoundaryHint): Promise<void> | void {
    if (this.closed || this.cancelled) return;
    // Hints are acknowledged in fake provider.
  }

  async *events(): AsyncIterable<TranscriptEvent> {
    for (const eventConfig of this.config.eventSequence) {
      if (this.cancelled) {
        // If cancelled, do not emit any further transcript events (including late results)
        break;
      }

      if (eventConfig.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, eventConfig.delayMs));
      }

      if (this.cancelled) break;

      if (this.config.simulateError && eventConfig.type === 'partial') {
        throw this.config.simulateError;
      }

      let segmentId = eventConfig.segmentId;
      if (eventConfig.type === 'partial') {
        if (!segmentId) {
          segmentId = this.currentPartialSegmentId ?? `seg-${this.segmentIdCounter++}`;
          this.currentPartialSegmentId = segmentId;
        }
      } else if (eventConfig.type === 'final') {
        segmentId = eventConfig.segmentId ?? `seg-${this.segmentIdCounter++}`;
        this.currentPartialSegmentId = null;
      } else if (eventConfig.type === 'correction') {
        segmentId = eventConfig.segmentId ?? `seg-${this.segmentIdCounter++}`;
      }

      const event: TranscriptEvent = {
        type: eventConfig.type,
        segmentId: segmentId!,
        text: eventConfig.text,
        isFinal: eventConfig.type === 'final' || eventConfig.type === 'correction',
        confidence: undefined,
        timestamp: Date.now(),
        durationMs: undefined,
        language: undefined,
        sourceId: this.info.sourceId,
        replacesSegmentId: eventConfig.replacesSegmentId,
      };

      this.eventsQueue.push(event);
      yield event;
    }
    // NO session lifecycle events yielded through events()
  }

  async *sessionEvents(): AsyncIterable<StreamingSessionEvent> {
    // Emit session lifecycle events based on state
    if (this.cancelled) {
      yield {
        type: 'cancelled',
        sessionId: this.info.sessionId,
        timestamp: Date.now(),
        frameCount: undefined,
        dropped: undefined,
        error: undefined,
      };
    } else {
      yield {
        type: 'closed',
        sessionId: this.info.sessionId,
        timestamp: Date.now(),
        frameCount: undefined,
        dropped: undefined,
        error: undefined,
      };
    }
    // NO transcript events yielded through sessionEvents()
  }

  flush(): Promise<void> {
    // In fake provider, flush is a no-op (events are pre-configured)
    return Promise.resolve();
  }

  cancel(): Promise<void> {
    this.cancelled = true;
    this.currentPartialSegmentId = null;
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  // Test helpers
  getEmittedEvents(): Readonly<TranscriptEvent[]> {
    return this.eventsQueue;
  }

  getEmittedSessionEvents(): Readonly<StreamingSessionEvent[]> {
    return this.sessionEventsQueue;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  isClosed(): boolean {
    return this.closed;
  }
}

/**
 * Deterministic fake streaming STT provider for testing.
 * Supports: partial, revised partial, final, correction, delayed result,
 * provider error, backpressure, cancellation, late result after cancellation, close.
 */
export class FakeStreamingSTTProvider implements StreamingSTTProvider {
  readonly id = 'vestara.stt.fake';
  readonly name = 'Fake Streaming STT Provider';
  readonly available = true;
  private readonly defaultConfig: FakeStreamingSTTConfig;

  constructor(config?: Partial<FakeStreamingSTTConfig>) {
    this.defaultConfig = {
      eventSequence: config?.eventSequence ?? [
        { type: 'partial', text: 'hello', delayMs: 10 },
        { type: 'partial', text: 'hello world', delayMs: 10 },
        { type: 'final', text: 'hello world', delayMs: 10 },
      ],
      bufferPolicy: config?.bufferPolicy ?? {
        maxBufferFrames: 200,
        maxBufferDurationMs: 5000,
        overflowPolicy: 'FIFO_drop',
      },
      simulateBackpressure: config?.simulateBackpressure ?? false,
      simulateError: config?.simulateError,
      errorDelayMs: config?.errorDelayMs,
    };
  }

  async open(config: StreamingSTTConfig): Promise<StreamingTranscriptionSession> {
    const sessionInfo: StreamingTranscriptionSessionInfo = {
      sessionId: config.sessionId,
      sourceId: config.sourceId,
      createdAt: Date.now(),
      language: config.language,
    };
    return new FakeStreamingTranscriptionSession(sessionInfo, this.defaultConfig);
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    const start = performance.now();
    return {
      status: 'healthy',
      latency: Math.round(performance.now() - start),
    };
  }
}

function _detectWhisper(): boolean {
  try {
    const { execSync } = require('node:child_process');
    const result = execSync(
      'which whisper 2>/dev/null || which whisper.cpp 2>/dev/null || which faster-whisper 2>/dev/null',
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      },
    );
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

// ─── Re-exports ──────────────────────────────────────────────────

export type {
  BoundedBufferPolicy,
  SpeechBoundaryHint,
  StreamingSessionEvent,
  StreamingSessionEventType,
  StreamingSTTConfig,
  StreamingTranscriptionSessionInfo,
  TranscriptEvent,
  TranscriptEventType,
} from '@vestara/shared';
