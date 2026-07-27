import type {
  ConversationProvider,
  ConversationRequest,
  ConversationResponse,
  ModelInfo,
  ProviderHealth,
  StreamChunk,
} from '@vestara/shared';

export interface OpenAICompatConfig {
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
}

export class OpenAICompatibleProvider implements ConversationProvider {
  readonly id = 'openai-compat';
  readonly name = 'OpenAI Compatible';
  private config: OpenAICompatConfig;
  private _available = false;
  private _model: string;

  constructor(config?: OpenAICompatConfig) {
    this.config = config ?? {};
    this._model = config?.defaultModel ?? 'gpt-4o-mini';
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

  async complete(request: ConversationRequest): Promise<ConversationResponse> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY ?? '';

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model ?? this._model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 200)}`);
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
      provider: 'openai-compat',
      content: data.choices[0]?.message?.content ?? '',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      latency: 0,
    };
  }

  async *stream(request: ConversationRequest): AsyncIterable<StreamChunk> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY ?? '';

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model ?? this._model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const _text = await res.text().catch(() => '');
      yield {
        id: 'openai-error',
        type: 'error',
        content: `OpenAI API error ${res.status}`,
        metadata: { sequence: 0, timestamp: new Date().toISOString() },
      };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield {
        id: 'openai-error',
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
            id: `openai-complete-${seq}`,
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
              id: `openai-token-${seq}`,
              type: 'text',
              content,
              metadata: { sequence: seq++, timestamp: new Date().toISOString() },
            };
          }
          if (parsed.choices?.[0]?.finish_reason === 'stop') {
            yield {
              id: `openai-complete-${seq}`,
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
      const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';
      const res = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey ?? process.env.OPENAI_API_KEY ?? ''}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      this._available = res.ok;
    } catch {
      this._available = false;
    }
    return {
      status: this._available ? 'healthy' : 'unhealthy',
      providerId: this.id,
      model: this._model,
      latency: Math.round(performance.now() - start),
      lastHeartbeat: new Date().toISOString(),
      message: this._available ? 'OpenAI-compatible endpoint reachable' : 'OpenAI-compatible endpoint not reachable',
    };
  }

  async models(): Promise<ModelInfo[]> {
    return [{ id: this._model, name: this._model, provider: 'openai-compat', contextWindow: 128000 }];
  }
}
