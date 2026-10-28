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

  // Availability is resolved by the provider per call (binaries/models may
  // appear after boot); the provider throws a specific unavailability error.
  async synthesize(
    text: string,
    options?: { voice?: string; speed?: number },
  ): Promise<{ audio: ArrayBuffer; duration: number }> {
    if (!this.provider) throw new Error('No TTS provider registered');
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

/**
 * Resolve the piper CLI binary. `VESTARA_PIPER_BIN` overrides PATH lookup
 * (`piper` → `piper-tts`). Re-resolved per call so installs after boot are
 * picked up without a restart.
 */
export function resolvePiperBinary(): string | null {
  const override = process.env.VESTARA_PIPER_BIN?.trim();
  if (override) return override;
  try {
    const { execSync } = require('node:child_process');
    const result = execSync('which piper 2>/dev/null || which piper-tts 2>/dev/null', {
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
 * Resolve the piper voice model (`.onnx`). `VESTARA_PIPER_MODEL` wins;
 * otherwise the first `.onnx` under `VESTARA_PIPER_VOICES_DIR` is used.
 */
export function resolvePiperModel(voice?: string): string | null {
  const fs = require('node:fs');
  const path = require('node:path');
  const explicit = (voice?.trim() || process.env.VESTARA_PIPER_MODEL?.trim() || '') as string;
  if (explicit) {
    try {
      if (fs.existsSync(explicit)) return explicit;
    } catch {
      // Fall through to directory scan.
    }
  }
  const dir = process.env.VESTARA_PIPER_VOICES_DIR?.trim();
  if (dir) {
    try {
      const match = fs
        .readdirSync(dir)
        .filter((entry: string) => entry.endsWith('.onnx'))
        .sort()[0] as string | undefined;
      if (match) return path.join(dir, match);
    } catch {
      // Unreadable voices dir — reported via describePiperAvailability.
    }
  }
  return null;
}

export interface PiperAvailability {
  readonly available: boolean;
  readonly binary: string | null;
  readonly model: string | null;
  readonly detail: string;
}

/** Machine-readable availability for `/api/voice/health` — never throws. */
export function describePiperAvailability(): PiperAvailability {
  const binary = resolvePiperBinary();
  if (!binary) {
    return {
      available: false,
      binary: null,
      model: null,
      detail: 'No piper binary on PATH (piper, piper-tts) — set VESTARA_PIPER_BIN to override',
    };
  }
  const model = resolvePiperModel();
  if (!model) {
    return {
      available: false,
      binary,
      model: null,
      detail: 'Piper binary present but no voice model — set VESTARA_PIPER_MODEL (.onnx) or VESTARA_PIPER_VOICES_DIR',
    };
  }
  return { available: true, binary, model, detail: `Piper ready (${model})` };
}

export interface PiperVoiceDef {
  readonly id: string;
  readonly name: string;
  readonly lang: string;
}

/**
 * Server TTS voice catalog. Explicit `VESTARA_TTS_VOICES` JSON wins
 * (`[{id,name,lang}]`); otherwise configured `.onnx` models are projected;
 * empty when piper has no model (callers fall back to system voices).
 */
export function listPiperVoices(): PiperVoiceDef[] {
  const raw = process.env.VESTARA_TTS_VOICES?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Array<{ id?: unknown; name?: unknown; lang?: unknown }>;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((entry) => typeof entry?.id === 'string' && entry.id)
          .map((entry) => ({
            id: entry.id as string,
            name: typeof entry.name === 'string' && entry.name ? entry.name : (entry.id as string),
            lang: typeof entry.lang === 'string' && entry.lang ? entry.lang : 'en-US',
          }));
      }
    } catch {
      // Malformed JSON — fall through to model projection.
    }
  }
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = process.env.VESTARA_PIPER_VOICES_DIR?.trim();
  if (dir) {
    try {
      return fs
        .readdirSync(dir)
        .filter((entry: string) => entry.endsWith('.onnx'))
        .sort()
        .map((entry: string) => ({
          id: path.join(dir, entry),
          name: path.parse(entry).name,
          lang: 'en-US',
        }));
    } catch {
      return [];
    }
  }
  const model = resolvePiperModel();
  if (!model) return [];
  return [{ id: model, name: path.parse(model).name, lang: 'en-US' }];
}

/** Best-effort WAV duration from the RIFF header; 0 when unparseable. */
function _wavDurationSeconds(wav: Buffer): number {
  try {
    if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') return 0;
    const sampleRate = wav.readUInt32LE(24);
    const byteRate = wav.readUInt32LE(28);
    const dataSize = wav.length - 44;
    if (!sampleRate || !byteRate) return 0;
    return dataSize / byteRate;
  } catch {
    return 0;
  }
}

/** Max server-side synthesis input (Piper CLI is batch, not streaming). */
export const PIPER_MAX_TEXT = 2000;

export class PiperTTSProvider implements TTSProvider {
  readonly id = 'vestara.tts.piper';
  readonly name = 'Piper TTS';
  readonly available = _detectPiper();

  async synthesize(
    text: string,
    options?: { voice?: string; speed?: number },
  ): Promise<{ audio: ArrayBuffer; duration: number }> {
    const trimmed = text?.trim() ?? '';
    if (!trimmed) throw new Error('Piper TTS requires non-empty text');
    if (trimmed.length > PIPER_MAX_TEXT) {
      throw new Error(`Piper TTS input capped at ${PIPER_MAX_TEXT} characters (got ${trimmed.length})`);
    }
    const binary = resolvePiperBinary();
    if (!binary) throw new Error('Piper TTS not available: no piper binary on PATH (set VESTARA_PIPER_BIN)');
    const model = resolvePiperModel(options?.voice);
    if (!model) {
      throw new Error('Piper TTS not available: no voice model (set VESTARA_PIPER_MODEL or VESTARA_PIPER_VOICES_DIR)');
    }
    const { execFileSync } = require('node:child_process');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-tts-'));
    try {
      const outPath = path.join(dir, 'speech.wav');
      const args = ['--model', model, '--output_file', outPath];
      if (options?.speed && Number.isFinite(options.speed)) args.push('--length_scale', String(1 / options.speed));
      execFileSync(binary, args, {
        input: trimmed,
        encoding: 'utf-8',
        timeout: 60_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const wav = fs.readFileSync(outPath) as Buffer;
      const copy = new ArrayBuffer(wav.byteLength);
      new Uint8Array(copy).set(wav);
      return {
        audio: copy,
        duration: _wavDurationSeconds(wav),
      };
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort temp cleanup — never fail synthesis over it.
      }
    }
  }

  async *synthesizeStream(
    text: string,
    options?: { voice?: string; speed?: number },
  ): AsyncIterable<{ audio: ArrayBuffer; duration: number; isFinal: boolean }> {
    // Bounded CLI limitation: Piper synthesizes the full utterance, then the
    // single WAV is emitted as one final chunk. True incremental TTS needs a
    // streaming provider, not the batch CLI.
    const { audio, duration } = await this.synthesize(text, options);
    yield { audio, duration, isFinal: true };
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }> {
    const start = performance.now();
    return {
      status: describePiperAvailability().available ? 'healthy' : 'unhealthy',
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
