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
 */

import type { Logger } from '@vestara/logger';
import type { STTProvider } from '@vestara/shared';

export class VestaraSTTService {
  readonly id = 'vestara-stt';
  private provider: STTProvider | null = null;
  private logger?: Logger;

  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger?.child({ component: 'vestara-stt' });
  }

  get status(): 'available' | 'unavailable' | 'degraded' {
    if (!this.provider) return 'unavailable';
    return this.provider.available ? 'available' : 'degraded';
  }

  get providerName(): string {
    return this.provider?.name ?? 'none';
  }

  registerProvider(provider: STTProvider): void {
    this.provider = provider;
    this.logger?.info('STT provider registered', { id: provider.id, name: provider.name });
  }

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

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    if (!this.provider) {
      return { status: 'unhealthy', latency: 0 };
    }
    return this.provider.healthCheck();
  }
}

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
