// ─── Audio Pipeline (v4.0 Conversational Onboarding) ────────

export interface AudioConfig {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  deviceName?: string;
  bufferSize?: number;
}

// ─── Streaming STT Contracts (OVR-009B) ───────────────────────
// Generic AudioFrame-free metadata/contracts.
// AudioFrame-aware interfaces live in @vestara/stt.

export type TranscriptEventType = 'partial' | 'final' | 'correction';

export interface TranscriptEvent {
  readonly type: TranscriptEventType;
  readonly segmentId: string;
  readonly text: string;
  readonly isFinal: boolean;
  readonly confidence: number | undefined;
  readonly timestamp: number;
  readonly durationMs: number | undefined;
  readonly language: string | undefined;
  readonly sourceId: string;
  readonly replacesSegmentId: string | undefined; // for 'correction' events
}

export type StreamingSessionEventType =
  | 'backpressure'
  | 'buffer-overflow'
  | 'provider-error'
  | 'session-reset'
  | 'cancelled'
  | 'closed';

export interface StreamingSessionEvent {
  readonly type: StreamingSessionEventType;
  readonly sessionId: string;
  readonly timestamp: number;
  readonly frameCount: number | undefined; // for backpressure/buffer-overflow
  readonly dropped: boolean | undefined; // for buffer-overflow
  readonly error: Error | undefined; // for provider-error
}

export interface StreamingSTTConfig {
  readonly sessionId: string;
  readonly sourceId: string;
  readonly language?: string;
  readonly interimPartialEnabled?: boolean;
  readonly punctuationEnabled?: boolean;
  readonly languageDetectionEnabled?: boolean;
  readonly maxBufferFrames?: number;
  readonly maxBufferDurationMs?: number;
  readonly overflowPolicy?: 'FIFO_drop' | 'block' | 'cancel';
}

export interface StreamingTranscriptionSessionInfo {
  readonly sessionId: string;
  readonly sourceId: string;
  readonly createdAt: number;
  readonly language?: string;
}

export type SpeechBoundaryHintType = 'speech-start' | 'speech-end' | 'speech-state';

export interface SpeechBoundaryHint {
  readonly type: SpeechBoundaryHintType;
  readonly timestamp: number;
  readonly state?: 'silence' | 'speech'; // for 'speech-state'
}

export interface BoundedBufferPolicy {
  readonly maxBufferFrames: number;
  readonly maxBufferDurationMs: number;
  readonly overflowPolicy: 'FIFO_drop' | 'block' | 'cancel';
}

export interface VADConfig {
  mode: 'aggressive' | 'balanced' | 'sensitive';
  silenceTimeoutMs: number;
  minSpeechDurationMs: number;
}

export type VADState = 'idle' | 'listening' | 'speaking' | 'processing' | 'error';

export interface VADProvider {
  readonly id: string;
  readonly name: string;
  readonly status: VADState;

  configure(config: VADConfig): Promise<void>;
  processAudio(audioBuffer: ArrayBuffer): Promise<{ isSpeech: boolean; confidence: number }>;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }>;
}

export interface STTProvider {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;

  transcribe(
    audioBuffer: ArrayBuffer,
    language?: string,
  ): Promise<{ text: string; confidence: number; duration: number }>;
  transcribeStream(
    audioBuffer: AsyncIterable<ArrayBuffer>,
    language?: string,
  ): AsyncIterable<{ text: string; isFinal: boolean; confidence: number }>;
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }>;
}

export interface TTSProvider {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;

  synthesize(
    text: string,
    options?: { voice?: string; speed?: number },
  ): Promise<{ audio: ArrayBuffer; duration: number }>;
  synthesizeStream(
    text: string,
    options?: { voice?: string; speed?: number },
  ): AsyncIterable<{ audio: ArrayBuffer; duration: number; isFinal: boolean }>;
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }>;
}

export interface AudioPipelineStatus {
  microphone: { available: boolean; deviceName?: string; latency: number };
  speakers: { available: boolean; deviceName?: string; latency: number };
  vad: { status: VADState; provider: string; latency: number };
  stt: { available: boolean; provider: string; latency: number };
  tts: { available: boolean; provider: string; latency: number };
}
