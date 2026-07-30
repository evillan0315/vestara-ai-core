// ─── Audio Pipeline (v4.0 Conversational Onboarding) ────────

export interface AudioConfig {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  deviceName?: string;
  bufferSize?: number;
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
