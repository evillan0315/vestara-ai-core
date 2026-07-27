import type {
  ConversationProvider,
  ConversationRequest,
  ConversationResponse,
  ModelInfo,
  ProviderHealth,
  StreamChunk,
} from '@vestara/shared';

export interface OllamaConfig {
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
}

export class OllamaProvider implements ConversationProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama';
  private config: OllamaConfig;
  private _available = false;
  private _model: string;
  private _models: ModelInfo[] = [];

  constructor(config?: OllamaConfig) {
    this.config = config ?? {};
    this._model = config?.defaultModel ?? 'llama3.2:3b';
  }

  get available(): boolean {
    return this._available;
  }

  get model(): string {
    return this._model;
  }

  setModel(model: string): void {
    this._model = model;
  }

  private get baseUrl(): string {
    return this.config.baseUrl ?? 'http://127.0.0.1:11434';
  }

  private get timeout(): number {
    return this.config.timeout ?? 30000;
  }

  async complete(request: ConversationRequest): Promise<ConversationResponse> {
    if (!this._available) {
      return {
        id: 'ollama-stub',
        model: this._model,
        provider: 'ollama',
        content: '[Ollama offline — deterministic stub]',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: 0,
      };
    }

    const start = performance.now();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model ?? this._model,
        messages: request.messages,
        options: { temperature: request.temperature, num_predict: request.maxTokens },
        stream: false,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      message: { content: string };
      total_duration?: number;
    };

    return {
      id: `ollama-${Date.now()}`,
      model: this._model,
      provider: 'ollama',
      content: data.message?.content ?? '',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latency: Math.round(performance.now() - start),
    };
  }

  async *stream(request: ConversationRequest): AsyncIterable<StreamChunk> {
    if (!this._available) {
      yield {
        id: 'ollama-stub-1',
        type: 'text',
        content: '[Ollama offline — deterministic stub]',
        metadata: { sequence: 0, timestamp: new Date().toISOString() },
      };
      yield {
        id: 'ollama-stub-2',
        type: 'complete',
        metadata: { sequence: 1, timestamp: new Date().toISOString() },
      };
      return;
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model ?? this._model,
        messages: request.messages,
        options: { temperature: request.temperature, num_predict: request.maxTokens },
        stream: true,
      }),
      signal: AbortSignal.timeout(this.timeout * 2),
    });

    if (!res.ok) {
      yield {
        id: 'ollama-error',
        type: 'error',
        content: `Ollama API error ${res.status}`,
        metadata: { sequence: 0, timestamp: new Date().toISOString() },
      };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    let seq = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as {
            message?: { content: string };
            done?: boolean;
            error?: string;
          };
          if (parsed.error) {
            yield {
              id: `ollama-error-${seq}`,
              type: 'error',
              content: parsed.error,
              metadata: { sequence: seq++, timestamp: new Date().toISOString() },
            };
            return;
          }
          const content = parsed.message?.content;
          if (content) {
            yield {
              id: `ollama-token-${seq}`,
              type: 'text',
              content,
              metadata: { sequence: seq++, timestamp: new Date().toISOString() },
            };
          }
          if (parsed.done) {
            yield {
              id: `ollama-complete-${seq}`,
              type: 'complete',
              metadata: { sequence: seq++, timestamp: new Date().toISOString() },
            };
          }
        } catch {
          // skip malformed
        }
      }
    }
  }

  async health(): Promise<ProviderHealth> {
    const start = performance.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      this._available = res.ok;
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        if (data.models && data.models.length > 0) {
          this._model = data.models[0].name;
          this._models = data.models.map((m) => ({
            id: m.name,
            name: m.name,
            provider: 'ollama',
            contextWindow: 4096,
          }));
        }
      }
    } catch {
      this._available = false;
    }
    return {
      status: this._available ? 'healthy' : 'unhealthy',
      providerId: this.id,
      model: this._model,
      latency: Math.round(performance.now() - start),
      lastHeartbeat: new Date().toISOString(),
      message: this._available ? `Ollama running at ${this.baseUrl}` : 'Ollama not detected',
    };
  }

  async models(): Promise<ModelInfo[]> {
    if (this._models.length > 0) return this._models;
    await this.health();
    return this._models;
  }
}
