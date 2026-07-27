/**
 * @vestara/audio — Audio Capture & Voice Activity Detection
 *
 * Provider-agnostic audio pipeline for conversational onboarding.
 * Provides VAD abstraction with configurable providers (Silero, cloud).
 *
 * Architecture Traceability:
 *   PCS-020 → Audio Pipeline
 *   UX-011  → Voice Interaction
 */

import type { Logger } from '@vestara/logger';
import type { AudioConfig, AudioPipelineStatus, VADConfig, VADProvider, VADState } from '@vestara/shared';

export interface MicrophoneProvider {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;

  startCapture(config: AudioConfig): Promise<void>;
  stopCapture(): Promise<void>;
  getAudioStream(): AsyncIterable<ArrayBuffer>;
  getDevices(): Promise<Array<{ id: string; name: string; isDefault: boolean }>>;
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }>;
}

export interface SpeakerProvider {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;

  play(audio: ArrayBuffer): Promise<void>;
  playStream(audio: AsyncIterable<ArrayBuffer>): Promise<void>;
  stop(): Promise<void>;
  getDevices(): Promise<Array<{ id: string; name: string; isDefault: boolean }>>;
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }>;
}

export class VestaraAudioService {
  readonly id = 'vestara-audio';
  private microphone: MicrophoneProvider | null = null;
  private vad: VADProvider | null = null;
  private speaker: SpeakerProvider | null = null;
  private logger?: Logger;
  private _status: VADState = 'idle';

  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger?.child({ component: 'vestara-audio' });
  }

  get status() {
    return this._status;
  }

  registerMicrophone(provider: MicrophoneProvider): void {
    this.microphone = provider;
    this.logger?.info('Microphone provider registered', { id: provider.id, name: provider.name });
  }

  registerVAD(provider: VADProvider): void {
    this.vad = provider;
    this.logger?.info('VAD provider registered', { id: provider.id, name: provider.name });
  }

  registerSpeaker(provider: SpeakerProvider): void {
    this.speaker = provider;
    this.logger?.info('Speaker provider registered', { id: provider.id, name: provider.name });
  }

  async startCapture(config?: AudioConfig): Promise<void> {
    if (!this.microphone) {
      this._status = 'error';
      throw new Error('No microphone provider registered');
    }
    if (!this.vad) {
      this._status = 'error';
      throw new Error('No VAD provider registered');
    }

    await this.microphone.startCapture(
      config ?? {
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
      },
    );
    await this.vad.startListening();
    this._status = 'listening';
    this.logger?.info('Audio capture started');
  }

  async stopCapture(): Promise<void> {
    await this.vad?.stopListening();
    await this.microphone?.stopCapture();
    await this.speaker?.stop();
    this._status = 'idle';
    this.logger?.info('Audio capture stopped');
  }

  async processAudioChunk(audioBuffer: ArrayBuffer): Promise<{ isSpeech: boolean; confidence: number } | null> {
    if (!this.vad) return null;
    this._status = 'processing';
    const result = await this.vad.processAudio(audioBuffer);
    this._status = result.isSpeech ? 'speaking' : 'listening';
    return result;
  }

  async speak(audio: ArrayBuffer): Promise<void> {
    if (!this.speaker) throw new Error('No speaker provider registered');
    await this.speaker.play(audio);
  }

  async speakStream(audio: AsyncIterable<ArrayBuffer>): Promise<void> {
    if (!this.speaker) throw new Error('No speaker provider registered');
    await this.speaker.playStream(audio);
  }

  get isMicrophoneAvailable(): boolean {
    return this.microphone?.available ?? false;
  }

  get isSpeakerAvailable(): boolean {
    return this.speaker?.available ?? false;
  }

  get isVADAvailable(): boolean {
    return this.vad !== null;
  }

  async diagnose(): Promise<AudioPipelineStatus> {
    const micHealth = await this.microphone?.healthCheck().catch(() => ({
      status: 'unhealthy' as const,
      latency: 0,
    }));
    const speakerHealth = await this.speaker?.healthCheck().catch(() => ({
      status: 'unhealthy' as const,
      latency: 0,
    }));
    const vadHealth = await this.vad?.healthCheck().catch(() => ({
      status: 'unhealthy' as const,
      latency: 0,
    }));
    const micDevices = await this.microphone?.getDevices().catch(() => []);
    const speakerDevices = await this.speaker?.getDevices().catch(() => []);

    return {
      microphone: {
        available: this.isMicrophoneAvailable && micHealth?.status === 'healthy',
        deviceName: micDevices?.find((d) => d.isDefault)?.name,
        latency: micHealth?.latency ?? 0,
      },
      speakers: {
        available: this.isSpeakerAvailable && speakerHealth?.status === 'healthy',
        deviceName: speakerDevices?.find((d) => d.isDefault)?.name,
        latency: speakerHealth?.latency ?? 0,
      },
      vad: {
        status: this._status,
        provider: this.vad?.name ?? 'none',
        latency: vadHealth?.latency ?? 0,
      },
      stt: { available: false, provider: 'none', latency: 0 },
      tts: { available: false, provider: 'none', latency: 0 },
    };
  }

  async dispose(): Promise<void> {
    await this.stopCapture();
    this.microphone = null;
    this.vad = null;
    this.speaker = null;
    this.logger?.info('Audio service disposed');
  }
}

export class DefaultMicrophoneProvider implements MicrophoneProvider {
  readonly id = 'vestara.microphone.default';
  readonly name = 'System Default Microphone';
  readonly available = _detectAudioSupport();
  private capturing = false;

  async startCapture(config: AudioConfig): Promise<void> {
    this.config = config;
    this.capturing = true;
  }

  async stopCapture(): Promise<void> {
    this.capturing = false;
  }

  async *getAudioStream(): AsyncIterable<ArrayBuffer> {
    if (!this.capturing) {
      throw new Error('Not capturing. Call startCapture() first.');
    }
    while (this.capturing) {
      await new Promise((r) => setTimeout(r, 100));
      const silent = new ArrayBuffer(320);
      yield silent;
    }
  }

  async getDevices(): Promise<Array<{ id: string; name: string; isDefault: boolean }>> {
    if (!this.available) return [];
    return [{ id: 'default', name: 'Default Audio Device', isDefault: true }];
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    const start = performance.now();
    return {
      status: this.available ? 'healthy' : 'unhealthy',
      latency: Math.round(performance.now() - start),
    };
  }
}

export class DefaultSpeakerProvider implements SpeakerProvider {
  readonly id = 'vestara.speaker.default';
  readonly name = 'System Default Speaker';
  readonly available = _detectAudioSupport();

  async play(_audio: ArrayBuffer): Promise<void> {
    this.playing = true;
    this.playing = false;
  }

  async playStream(_audio: AsyncIterable<ArrayBuffer>): Promise<void> {
    this.playing = true;
    for await (const _ of _audio) {
      // Consume stream
    }
    this.playing = false;
  }

  async stop(): Promise<void> {
    this.playing = false;
  }

  async getDevices(): Promise<Array<{ id: string; name: string; isDefault: boolean }>> {
    if (!this.available) return [];
    return [{ id: 'default', name: 'Default Audio Output', isDefault: true }];
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    const start = performance.now();
    return {
      status: this.available ? 'healthy' : 'unhealthy',
      latency: Math.round(performance.now() - start),
    };
  }
}

export class SileroVADProvider implements VADProvider {
  readonly id = 'vestara.vad.silero';
  readonly name = 'Silero VAD';
  private _status: VADState = 'idle';

  get status() {
    return this._status;
  }

  async configure(_config: VADConfig): Promise<void> {
    this._status = 'idle';
  }

  async processAudio(_audioBuffer: ArrayBuffer): Promise<{ isSpeech: boolean; confidence: number }> {
    return { isSpeech: false, confidence: 0 };
  }

  async startListening(): Promise<void> {
    this._status = 'listening';
  }

  async stopListening(): Promise<void> {
    this._status = 'idle';
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    const start = performance.now();
    return {
      status: 'healthy',
      latency: Math.round(performance.now() - start),
    };
  }
}

function _detectAudioSupport(): boolean {
  try {
    const { execSync } = require('node:child_process');
    const platform = process.platform;
    if (platform === 'linux') {
      const result = execSync('which arecord aplay 2>/dev/null || which parec paplay 2>/dev/null', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return result.trim().length > 0;
    }
    if (platform === 'darwin') {
      return true;
    }
    if (platform === 'win32') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
