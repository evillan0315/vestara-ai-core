/**
 * @vestara/voice-browser — Voice Agent Pipeline
 *
 * Full bidirectional voice conversation with an AI agent:
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │                    CONVERSATION LOOP                     │
 *   │                                                         │
 *   │  🎤 Mic ──→ STT ──→ Agent ──→ TTS ──→ 🔊 Speaker      │
 *   │       ↑                                    │            │
 *   │       └────────────────────────────────────┘            │
 *   │                                                         │
 *   │  🔊 Speaker ──→ SpeakerCapture ──→ Agent (context)     │
 *   └─────────────────────────────────────────────────────────┘
 *
 * The agent can hear both:
 *   1. What the USER says (via microphone → STT)
 *   2. What the DEVICE plays (via speaker loopback capture)
 *
 * This enables the agent to respond to voice commands AND
 * understand audio context from the user's device.
 *
 * Architecture Traceability:
 *   PCS-020 → Voice Interaction Pipeline
 *   UX-011  → Voice-Driven Conversational Agent
 */

import type { OpenViduAudioSource, WebRTCAudioSource } from '@vestara/audio';
import {
  MultiSourceAudioCapture,
  OpenViduAudioCaptureProvider,
  VestaraAudioService,
  WebRTCAudioCaptureProvider,
} from '@vestara/audio';
import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import { VestaraSTTService } from '@vestara/stt';
import { VestaraTTSService } from '@vestara/tts';

// ─── Types ────────────────────────────────────────────────────

export type VoiceAgentState =
  | 'idle'
  | 'listening'
  | 'capturing_speaker'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error';

export interface VoiceAgentEvent {
  readonly type: string;
  readonly timestamp: number;
  readonly data: Record<string, unknown>;
}

export interface VoiceAgentConfig {
  /** Language for STT transcription. Default: 'en' */
  readonly language?: string;
  /** Voice for TTS synthesis. */
  readonly voice?: string;
  /** TTS speed multiplier. */
  readonly speed?: number;
  /** Max seconds to wait for agent response. Default: 30 */
  readonly agentTimeoutMs?: number;
  /** Whether to capture speaker output for context. Default: false */
  readonly captureSpeakerOutput?: boolean;
  /** Sample rate for audio capture. Default: 16000 */
  readonly sampleRate?: number;
  /** Enable voice activity detection gating. Default: true */
  readonly vadGating?: boolean;
}

export interface VoiceAgentCallbacks {
  /** Called when the user's speech is transcribed. */
  onUserSpeech?: (text: string, isFinal: boolean) => void;
  /** Called when the agent produces a response. */
  onAgentResponse?: (text: string, isFinal: boolean) => void;
  /** Called when the agent's response is being spoken. */
  onAgentSpeaking?: (text: string) => void;
  /** Called on state changes. */
  onStateChange?: (from: VoiceAgentState, to: VoiceAgentState) => void;
  /** Called on errors. */
  onError?: (error: Error) => void;
  /** Called when speaker output is captured. */
  onSpeakerCapture?: (audioChunk: ArrayBuffer) => void;
}

export interface VoiceAgentPipeline {
  readonly state: VoiceAgentState;
  readonly isRunning: boolean;

  start(): Promise<void>;
  stop(): Promise<void>;
  /** Send a text message to the agent (skip STT). */
  sendText(text: string): Promise<string>;
  /** Send audio to the agent (runs STT then processes). */
  sendAudio(audio: ArrayBuffer): Promise<string>;
  /** Manually trigger one listen→respond cycle. */
  listenOnce(): Promise<string>;
}

// ─── Pipeline Implementation ──────────────────────────────────

interface VoiceAgentPipelineOptions {
  config?: VoiceAgentConfig;
  logger?: Logger;
  eventBus?: EventBus;
  /** Injected conversation function — sends text to agent, returns response text. */
  agentHandler: (text: string, context?: string) => Promise<string>;
}

export class DefaultVoiceAgentPipeline implements VoiceAgentPipeline {
  private _state: VoiceAgentState = 'idle';
  private _isRunning = false;
  private audio: VestaraAudioService;
  private stt: VestaraSTTService;
  private tts: VestaraTTSService;
  private config: VoiceAgentConfig;
  private logger?: Logger;
  private eventBus?: EventBus;
  private agentHandler: (text: string, context?: string) => Promise<string>;
  private callbacks: VoiceAgentCallbacks = {};
  private eventHistory: VoiceAgentEvent[] = [];
  private speakerContextBuffer: string[] = [];

  constructor(options: VoiceAgentPipelineOptions) {
    this.config = {
      language: 'en',
      voice: 'default',
      speed: 1.0,
      agentTimeoutMs: 30_000,
      captureSpeakerOutput: false,
      sampleRate: 16_000,
      vadGating: true,
      ...options.config,
    };
    this.logger = options.logger;
    this.eventBus = options.eventBus;
    this.agentHandler = options.agentHandler;

    this.audio = new VestaraAudioService({ logger: this.logger });
    this.stt = new VestaraSTTService({ logger: this.logger });
    this.tts = new VestaraTTSService({ logger: this.logger });
  }

  get state(): VoiceAgentState {
    return this._state;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Register callbacks for pipeline events. */
  on(callbacks: VoiceAgentCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Starts the pipeline: initializes audio capture, begins listening.
   */
  async start(): Promise<void> {
    if (this._isRunning) return;
    this._isRunning = true;
    this._setState('idle');
    this.logger?.info('Voice agent pipeline starting');

    // Start microphone capture
    try {
      await this.audio.startCapture({
        sampleRate: this.config.sampleRate ?? 16_000,
        channels: 1,
        bitDepth: 16,
      });
    } catch {
      this.logger?.warn('Microphone not available — text-only mode');
    }

    // Start speaker capture if enabled
    if (this.config.captureSpeakerOutput) {
      try {
        await this.audio.startSpeakerCapture({
          sampleRate: this.config.sampleRate ?? 16_000,
          channels: 1,
          bitDepth: 16,
        });
        this._startSpeakerContextCapture();
      } catch {
        this.logger?.warn('Speaker capture not available');
      }
    }

    this._emitEvent('pipeline:started', {});
    this.logger?.info('Voice agent pipeline ready');
  }

  /**
   * Stops the pipeline.
   */
  async stop(): Promise<void> {
    this._isRunning = false;
    this._setState('idle');
    await this.audio.stopCapture();
    await this.audio.stopSpeakerCapture();
    this._emitEvent('pipeline:stopped', {});
    this.logger?.info('Voice agent pipeline stopped');
  }

  /**
   * Send a text message directly to the agent (bypasses STT).
   * Returns the agent's text response.
   */
  async sendText(text: string): Promise<string> {
    this._setState('thinking');
    this._emitEvent('user:text', { text });

    const context = this.speakerContextBuffer.length > 0 ? this.speakerContextBuffer.join('\n') : undefined;

    let response: string;
    try {
      response = await Promise.race([
        this.agentHandler(text, context),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Agent timed out after ${this.config.agentTimeoutMs}ms`)),
            this.config.agentTimeoutMs ?? 30_000,
          ),
        ),
      ]);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this._setState('error');
      this.callbacks.onError?.(err);
      throw err;
    }

    this._emitEvent('agent:response', { text: response });
    this.callbacks.onAgentResponse?.(response, true);

    // Speak the response
    await this._speakResponse(response);

    return response;
  }

  /**
   * Send raw audio to the agent (runs STT, then processes).
   * Returns the agent's text response.
   */
  async sendAudio(audio: ArrayBuffer): Promise<string> {
    this._setState('transcribing');
    this._emitEvent('user:audio', { size: audio.byteLength });

    const transcription = await this.stt.transcribe(audio, this.config.language);
    this.callbacks.onUserSpeech?.(transcription.text, true);
    this._emitEvent('user:transcribed', {
      text: transcription.text,
      confidence: transcription.confidence,
    });

    return this.sendText(transcription.text);
  }

  /**
   * Manually trigger one listen→respond cycle.
   * Captures one utterance from the mic, transcribes, sends to agent,
   * and speaks the response.
   */
  async listenOnce(): Promise<string> {
    this._setState('listening');
    this._emitEvent('listen:started', {});

    // Collect one utterance from the mic stream
    const audioStream = this.audio.getAudioStream();
    if (!audioStream) {
      throw new Error('No microphone available');
    }

    const audioChunks: ArrayBuffer[] = [];
    let silenceCount = 0;
    const maxSilence = 10; // 1 second of silence = end of utterance

    for await (const chunk of audioStream) {
      if (!this._isRunning) break;

      // Simple VAD: check if chunk is mostly silent
      const isSilent = this._isSilentChunk(chunk);
      if (isSilent) {
        silenceCount++;
        if (silenceCount >= maxSilence && audioChunks.length > 0) break;
      } else {
        silenceCount = 0;
        audioChunks.push(chunk);
      }

      // Safety: don't listen forever
      if (audioChunks.length > 300) break; // ~30 seconds at 10 chunks/sec
    }

    if (audioChunks.length === 0) {
      this._setState('idle');
      return '';
    }

    // Combine chunks into a single buffer
    const totalLength = audioChunks.reduce((sum, c) => sum + c.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
      combined.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    return this.sendAudio(combined.buffer);
  }

  /**
   * Registers audio providers on the underlying audio service.
   */
  get audioService(): VestaraAudioService {
    return this.audio;
  }

  get sttService(): VestaraSTTService {
    return this.stt;
  }

  get ttsService(): VestaraTTSService {
    return this.tts;
  }

  // ─── WebRTC & OpenVidu Integration ─────────────────────────

  /**
   * Attach a WebRTC peer connection as an audio source.
   * Audio from the remote peer will be captured and available
   * for STT processing and agent context.
   *
   * @example
   * ```ts
   * pipeline.attachWebRTC({ peerConnection: myRTCPeerConnection });
   * ```
   */
  attachWebRTC(source: WebRTCAudioSource): WebRTCAudioCaptureProvider {
    const provider = new WebRTCAudioCaptureProvider({ logger: this.logger });
    provider.attachSource(source);
    this.audio.registerSpeakerCapture(provider);
    this._emitEvent('source:webrtc-attached', {});
    this.logger?.info('WebRTC audio source attached');
    return provider;
  }

  /**
   * Attach an OpenVidu session as an audio source.
   * Audio from publishers and/or subscribers will be captured.
   *
   * @example
   * ```ts
   * pipeline.attachOpenVidu({
   *   session: ovSession,
   *   publisher: ovPublisher,
   *   subscribers: ovSubscribers,
   * });
   * ```
   */
  attachOpenVidu(source: OpenViduAudioSource): OpenViduAudioCaptureProvider {
    const provider = new OpenViduAudioCaptureProvider({ logger: this.logger });
    provider.attachSource(source);
    this.audio.registerSpeakerCapture(provider);
    this._emitEvent('source:openvidu-attached', {});
    this.logger?.info('OpenVidu audio source attached');
    return provider;
  }

  /**
   * Set up multi-source capture from multiple audio inputs
   * (mic + WebRTC + OpenVidu + speaker) merged into one stream.
   *
   * @example
   * ```ts
   * const merger = pipeline.setupMultiSource({
   *   microphone: myMicProvider,
   *   webrtc: { peerConnection: pc },
   *   openvidu: { session: ovSession },
   * });
   * ```
   */
  setupMultiSource(sources: {
    microphone?: import('@vestara/audio').MicrophoneProvider;
    webrtc?: WebRTCAudioSource;
    openvidu?: OpenViduAudioSource;
    speaker?: import('@vestara/audio').SpeakerCaptureProvider;
  }): MultiSourceAudioCapture {
    const merger = new MultiSourceAudioCapture({ logger: this.logger });

    if (sources.microphone) {
      this.audio.registerMicrophone(sources.microphone);
    }

    if (sources.webrtc) {
      const p = new WebRTCAudioCaptureProvider({ logger: this.logger });
      p.attachSource(sources.webrtc);
      merger.addSource('webrtc', p);
    }

    if (sources.openvidu) {
      const p = new OpenViduAudioCaptureProvider({ logger: this.logger });
      p.attachSource(sources.openvidu);
      merger.addSource('openvidu', p);
    }

    if (sources.speaker) {
      merger.addSource('speaker', sources.speaker);
    }

    this._emitEvent('source:multi-source-configured', {});
    this.logger?.info('Multi-source audio capture configured');
    return merger;
  }

  // ─── Private ────────────────────────────────────────────────

  private async _speakResponse(text: string): Promise<void> {
    this._setState('speaking');
    this.callbacks.onAgentSpeaking?.(text);
    this._emitEvent('agent:speaking', { text });

    try {
      // Try streaming TTS for lower latency
      const audioStream = this.tts.synthesizeStream(text, {
        voice: this.config.voice,
        speed: this.config.speed,
      });

      // Play each chunk as it becomes available
      for await (const chunk of audioStream) {
        if (chunk.audio.byteLength > 0) {
          await this.audio.speak(chunk.audio);
        }
        if (chunk.isFinal) break;
      }
    } catch {
      // Fallback to single-shot TTS
      try {
        const { audio } = await this.tts.synthesize(text, {
          voice: this.config.voice,
          speed: this.config.speed,
        });
        if (audio.byteLength > 0) {
          await this.audio.speak(audio);
        }
      } catch {
        this.logger?.warn('TTS not available — response text only');
      }
    }

    this._emitEvent('agent:spoken', { text });
    this._setState('idle');
  }

  private _startSpeakerContextCapture(): void {
    const stream = this.audio.getSpeakerCaptureStream();
    if (!stream) return;

    // Background task: capture speaker output for agent context
    (async () => {
      const chunks: ArrayBuffer[] = [];
      for await (const chunk of stream) {
        if (!this._isRunning) break;
        chunks.push(chunk);
        this.callbacks.onSpeakerCapture?.(chunk);

        // Every ~5 seconds, try to transcribe speaker context
        if (chunks.length >= 50) {
          const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
          const combined = new Uint8Array(totalLength);
          let offset = 0;
          for (const c of chunks) {
            combined.set(new Uint8Array(c), offset);
            offset += c.byteLength;
          }
          chunks.length = 0;

          try {
            const result = await this.stt.transcribe(combined.buffer, this.config.language);
            if (result.text.trim()) {
              this.speakerContextBuffer.push(`[device audio]: ${result.text}`);
              // Keep context buffer manageable
              if (this.speakerContextBuffer.length > 10) {
                this.speakerContextBuffer = this.speakerContextBuffer.slice(-5);
              }
              this._emitEvent('speaker:context', { text: result.text });
            }
          } catch {
            // STT failed on speaker audio — not critical
          }
        }
      }
    })();
  }

  private _isSilentChunk(chunk: ArrayBuffer): boolean {
    // Simple energy-based VAD: check if samples are near zero
    const view = new Int16Array(chunk);
    let sum = 0;
    for (let i = 0; i < view.length; i++) {
      sum += Math.abs(view[i]);
    }
    const avg = sum / view.length;
    return avg < 200; // threshold for silence
  }

  private _setState(state: VoiceAgentState): void {
    const prev = this._state;
    this._state = state;
    if (prev !== state) {
      this.callbacks.onStateChange?.(prev, state);
      this._emitEvent('pipeline:state', { from: prev, to: state });
    }
  }

  private _emitEvent(type: string, data: Record<string, unknown>): void {
    const event: VoiceAgentEvent = { type, timestamp: Date.now(), data };
    this.eventHistory.push(event);
    if (this.eventHistory.length > 200) {
      this.eventHistory = this.eventHistory.slice(-100);
    }
    if (this.eventBus) {
      this.eventBus
        .emit({
          type: `voice-agent:${type}`,
          source: 'voice-agent',
          payload: data,
        })
        .catch(() => {});
    }
  }
}
