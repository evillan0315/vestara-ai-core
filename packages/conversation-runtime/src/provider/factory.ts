import type { ConversationProvider } from '@vestara/shared';
import { type GeminiConfig, GeminiProvider } from './gemini';
import { LocalProvider, type LocalRuntimeConfig } from './local';
import { type OllamaConfig, OllamaProvider } from './ollama';
import { type OpenAICompatConfig, OpenAICompatibleProvider } from './openai-compat';
import { type OpenCodeConfig, OpenCodeProvider } from './opencode';
import { OpenCodeCloudProvider } from './opencode-adapter';

export type ProviderKind = 'opencode' | 'ollama' | 'gemini' | 'openai-compat' | 'opencode-cloud' | 'local';

export interface ProviderConfig {
  kind: ProviderKind;
  opencode?: OpenCodeConfig;
  ollama?: OllamaConfig;
  gemini?: GeminiConfig;
  openai?: OpenAICompatConfig;
  local?: LocalRuntimeConfig;
}

export class ProviderFactory {
  static create(config: ProviderConfig): ConversationProvider {
    switch (config.kind) {
      case 'opencode':
        return new OpenCodeProvider(config.opencode);
      case 'ollama':
        return new OllamaProvider(config.ollama);
      case 'gemini':
        return new GeminiProvider(config.gemini);
      case 'openai-compat':
        return new OpenAICompatibleProvider(config.openai);
      case 'opencode-cloud':
        return new OpenCodeCloudProvider(config as any);
      case 'local':
        return new LocalProvider(config.local);
      default:
        throw new Error(`Unknown provider kind: ${config.kind}`);
    }
  }

  static async healthCheckAll(providers: ConversationProvider[]): Promise<Record<string, ProviderHealthSimple>> {
    const results: Record<string, ProviderHealthSimple> = {};
    for (const p of providers) {
      try {
        const h = await p.health();
        results[p.id] = { status: h.status, latency: h.latency, message: h.message };
      } catch {
        results[p.id] = { status: 'unhealthy', latency: 0, message: 'Health check threw' };
      }
    }
    return results;
  }
}

interface ProviderHealthSimple {
  status: string;
  latency: number;
  message?: string;
}
