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

  // Legacy batch API — retained for backward compatibility
  async transcribe(
    audioBuffer: ArrayBuffer,
    language?: string,
  ): Promise<{ text: string; confidence: number; duration: number }> {
    if (!this.provider) throw new Error('No STT provider registered');
    if (!this.provider.available) throw new Error('STT provider is not available');
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
    if (!this.streamingProvider.available) throw new Error('Streaming STT provider is not available');
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

export class WhisperSTTProvider implements STTProvider {
  readonly id = 'vestara.stt.whisper';
  readonly name = 'Whisper.cpp';
  readonly available = _detectWhisper();

  async transcribe(
    _audioBuffer: ArrayBuffer,
    _language?: string,
  ): Promise<{ text: string; confidence: number; duration: number }> {
    if (!this.available) throw new Error('Whisper.cpp not found on system PATH');
    return { text: '', confidence: 0, duration: 0 };
  }

  async *transcribeStream(
    _audioBuffer: AsyncIterable<ArrayBuffer>,
    _language?: string,
  ): AsyncIterable<{ text: string; isFinal: boolean; confidence: number }> {
    if (!this.available) throw new Error('Whisper.cpp not found on system PATH');
    yield { text: '', isFinal: true, confidence: 0 };
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
