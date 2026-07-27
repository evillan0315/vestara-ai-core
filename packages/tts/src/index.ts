/**
 * @vestara/tts — Text-to-Speech Service
 *
 * Provider-agnostic TTS abstraction for conversational onboarding.
 * Default stub implements detection-only; real providers (Piper,
 * cloud APIs) implement the TTSProvider interface.
 *
 * Architecture Traceability:
 *   PCS-020 → Audio Pipeline (TTS)
 *   UX-011  → Voice Interaction
 */

import type { Logger } from '@vestara/logger';
import type { TTSProvider } from '@vestara/shared';

export class VestaraTTSService {
  readonly id = 'vestara-tts';
  private provider: TTSProvider | null = null;
  private logger?: Logger;

  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger?.child({ component: 'vestara-tts' });
  }

  get status(): 'available' | 'unavailable' | 'degraded' {
    if (!this.provider) return 'unavailable';
    return this.provider.available ? 'available' : 'degraded';
  }

  get providerName(): string {
    return this.provider?.name ?? 'none';
  }

  registerProvider(provider: TTSProvider): void {
    this.provider = provider;
    this.logger?.info('TTS provider registered', { id: provider.id, name: provider.name });
  }

  async synthesize(
    text: string,
    options?: { voice?: string; speed?: number },
  ): Promise<{ audio: ArrayBuffer; duration: number }> {
    if (!this.provider) throw new Error('No TTS provider registered');
    if (!this.provider.available) throw new Error('TTS provider is not available');
    return this.provider.synthesize(text, options);
  }

  synthesizeStream(
    text: string,
    options?: { voice?: string; speed?: number },
  ): AsyncIterable<{ audio: ArrayBuffer; duration: number; isFinal: boolean }> {
    if (!this.provider) throw new Error('No TTS provider registered');
    return this.provider.synthesizeStream(text, options);
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    if (!this.provider) {
      return { status: 'unhealthy', latency: 0 };
    }
    return this.provider.healthCheck();
  }
}

export class PiperTTSProvider implements TTSProvider {
  readonly id = 'vestara.tts.piper';
  readonly name = 'Piper TTS';
  readonly available = _detectPiper();

  async synthesize(
    _text: string,
    _options?: { voice?: string; speed?: number },
  ): Promise<{ audio: ArrayBuffer; duration: number }> {
    if (!this.available) throw new Error('Piper TTS not found on system PATH');
    return { audio: new ArrayBuffer(0), duration: 0 };
  }

  async *synthesizeStream(
    _text: string,
    _options?: { voice?: string; speed?: number },
  ): AsyncIterable<{ audio: ArrayBuffer; duration: number; isFinal: boolean }> {
    if (!this.available) throw new Error('Piper TTS not found on system PATH');
    yield { audio: new ArrayBuffer(0), duration: 0, isFinal: true };
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    const start = performance.now();
    return {
      status: this.available ? 'healthy' : 'unhealthy',
      latency: Math.round(performance.now() - start),
    };
  }
}

function _detectPiper(): boolean {
  try {
    const { execSync } = require('node:child_process');
    const result = execSync('which piper 2>/dev/null || which piper-tts 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}
