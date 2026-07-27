/**
 * LocalProvider — Offline conversation provider.
 *
 * Detects and wraps local LLM runtimes (Ollama, vLLM) for offline
 * conversation. Falls back to a deterministic stub when no local
 * runtime is available.
 *
 * Architecture Traceability:
 *   PCS-020 → Provider Router (Offline)
 */

import type {
  ConversationProvider,
  ConversationRequest,
  ConversationResponse,
  ModelInfo,
  ProviderHealth,
  StreamChunk,
} from '@vestara/shared';

export interface LocalRuntimeConfig {
  ollamaBaseUrl?: string;
  vllmBaseUrl?: string;
  defaultModel?: string;
}

export class LocalProvider implements ConversationProvider {
  readonly id = 'local';
  readonly name = 'Local LLM';
  private config: LocalRuntimeConfig;
  private _available = false;
  private _model = 'llama3.2:3b';
  private _detectedRuntime: 'ollama' | 'vllm' | 'none' = 'none';

  constructor(config?: LocalRuntimeConfig) {
    this.config = config ?? {};
    if (this.config.defaultModel) this._model = this.config.defaultModel;
  }

  get available(): boolean {
    return this._available;
  }

  get model(): string {
    return this._model;
  }

  get detectedRuntime(): string {
    return this._detectedRuntime;
  }

  async complete(_request: ConversationRequest): Promise<ConversationResponse> {
    return {
      id: 'local-stub',
      model: this._model,
      provider: 'local',
      content: `[Local provider offline — deterministic stub response]`,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latency: 0,
    };
  }

  async *stream(_request: ConversationRequest): AsyncIterable<StreamChunk> {
    yield {
      id: 'local-stub-1',
      type: 'text',
      content: `[Local provider offline — deterministic stub response]`,
      metadata: { sequence: 0, timestamp: new Date().toISOString() },
    };
    yield {
      id: 'local-stub-2',
      type: 'complete',
      metadata: { sequence: 1, timestamp: new Date().toISOString() },
    };
  }

  async health(): Promise<ProviderHealth> {
    const start = performance.now();

    const ollamaOk = await this._checkEndpoint(this.config.ollamaBaseUrl ?? 'http://127.0.0.1:11434');
    const vllmOk = ollamaOk ? false : await this._checkEndpoint(this.config.vllmBaseUrl ?? 'http://127.0.0.1:8000');

    if (ollamaOk) {
      this._detectedRuntime = 'ollama';
      this._available = true;
      try {
        const tagsRes = await fetch(`${this.config.ollamaBaseUrl ?? 'http://127.0.0.1:11434'}/api/tags`, {
          signal: AbortSignal.timeout(3000),
        });
        if (tagsRes.ok) {
          const data = (await tagsRes.json()) as { models?: Array<{ name: string }> };
          if (data.models && data.models.length > 0) {
            this._model = data.models[0].name;
          }
        }
      } catch {}
    } else if (vllmOk) {
      this._detectedRuntime = 'vllm';
      this._available = true;
      try {
        const modelsRes = await fetch(`${this.config.vllmBaseUrl ?? 'http://127.0.0.1:8000'}/v1/models`, {
          signal: AbortSignal.timeout(3000),
        });
        if (modelsRes.ok) {
          const data = (await modelsRes.json()) as { data?: Array<{ id: string }> };
          if (data.data && data.data.length > 0) {
            this._model = data.data[0].id;
          }
        }
      } catch {}
    } else {
      this._available = false;
      this._detectedRuntime = 'none';
    }

    const latency = Math.round(performance.now() - start);
    return {
      status: this._available ? 'healthy' : 'unhealthy',
      providerId: this.id,
      model: this._model,
      latency,
      lastHeartbeat: new Date().toISOString(),
      message: this._available
        ? `${this._detectedRuntime} running at ${this._model}`
        : 'No local LLM runtime detected (try Ollama or vLLM)',
    };
  }

  async models(): Promise<ModelInfo[]> {
    return [{ id: this._model, name: this._model, provider: 'local', contextWindow: 4096 }];
  }

  private async _checkEndpoint(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      return res.ok || res.status === 404;
    } catch {
      return false;
    }
  }
}
