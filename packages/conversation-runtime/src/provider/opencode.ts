import type {
  ConversationProvider,
  ConversationRequest,
  ConversationResponse,
  ModelInfo,
  ProviderHealth,
  StreamChunk,
} from '@vestara/shared';

export interface OpenCodeConfig {
  endpoint?: string;
  apiKey?: string | null;
  timeout?: number;
  model?: string;
}

export class OpenCodeProvider implements ConversationProvider {
  readonly id = 'opencode';
  readonly name = 'OpenCode';
  private config: OpenCodeConfig;
  private _available = false;
  private _model: string;
  private _models: ModelInfo[] = [];

  constructor(config?: OpenCodeConfig) {
    this.config = config ?? {};
    this._model = config?.model ?? 'deepseek-v4-flash-free';
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
    return this.config.endpoint ?? 'https://opencode.ai/zen/v1';
  }

  private get timeout(): number {
    return this.config.timeout ?? 30000;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) h.Authorization = `Bearer ${this.config.apiKey}`;
    return h;
  }

  async complete(request: ConversationRequest): Promise<ConversationResponse> {
    const start = performance.now();
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: request.model ?? this._model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenCode API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      id: string;
      model: string;
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    return {
      id: data.id,
      model: data.model,
      provider: 'opencode',
      content: data.choices[0]?.message?.content ?? '',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      latency: Math.round(performance.now() - start),
    };
  }

  async *stream(request: ConversationRequest): AsyncIterable<StreamChunk> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: request.model ?? this._model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
      signal: AbortSignal.timeout(this.timeout * 2),
    });

    if (!res.ok) {
      const _text = await res.text().catch(() => '');
      yield {
        id: 'opencode-error',
        type: 'error',
        content: `OpenCode API error ${res.status}`,
        metadata: { sequence: 0, timestamp: new Date().toISOString() },
      };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield {
        id: 'opencode-error',
        type: 'error',
        content: 'No response body',
        metadata: { sequence: 0, timestamp: new Date().toISOString() },
      };
      return;
    }

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
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          yield {
            id: `oc-complete-${seq}`,
            type: 'complete',
            metadata: { sequence: seq++, timestamp: new Date().toISOString() },
          };
          continue;
        }
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta: { content?: string }; finish_reason?: string }>;
          };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield {
              id: `oc-token-${seq}`,
              type: 'text',
              content,
              metadata: { sequence: seq++, timestamp: new Date().toISOString() },
            };
          }
          if (parsed.choices?.[0]?.finish_reason === 'stop') {
            yield {
              id: `oc-complete-${seq}`,
              type: 'complete',
              metadata: { sequence: seq++, timestamp: new Date().toISOString() },
            };
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  }

  async health(): Promise<ProviderHealth> {
    const start = performance.now();
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      this._available = res.ok;
      if (res.ok) {
        const data = (await res.json()) as { data?: Array<{ id: string; name?: string; context_window?: number }> };
        if (data.data && data.data.length > 0) {
          this._models = data.data.map((m) => ({
            id: m.id,
            name: m.name ?? m.id,
            provider: 'opencode',
            contextWindow: m.context_window ?? 128000,
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
      message: this._available ? 'OpenCode API reachable' : 'OpenCode API not reachable',
    };
  }

  async models(): Promise<ModelInfo[]> {
    if (this._models.length > 0) return this._models;
    await this.health();
    return this._models;
  }
}
