import type {
  ConversationProvider,
  ConversationRequest,
  ConversationResponse,
  ModelInfo,
  ProviderHealth,
  StreamChunk,
} from '@vestara/shared';

export interface GeminiConfig {
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
}

export class GeminiProvider implements ConversationProvider {
  readonly id = 'gemini';
  readonly name = 'Gemini';
  private config: GeminiConfig;
  private _available = false;
  private _model: string;

  constructor(config?: GeminiConfig) {
    this.config = config ?? {};
    this._model = config?.defaultModel ?? 'gemini-2.0-flash';
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
    return this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  private get apiKey(): string {
    return this.config.apiKey ?? process.env.GEMINI_API_KEY ?? '';
  }

  private get timeout(): number {
    return this.config.timeout ?? 30000;
  }

  private buildContents(messages: ConversationRequest['messages']) {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');
    const contents = otherMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    return {
      contents,
      systemInstruction:
        systemMessages.length > 0 ? { parts: [{ text: systemMessages.map((s) => s.content).join('\n') }] } : undefined,
    };
  }

  async complete(request: ConversationRequest): Promise<ConversationResponse> {
    const start = performance.now();
    const { contents, systemInstruction } = this.buildContents(request.messages);
    const url = `${this.baseUrl}/models/${request.model ?? this._model}:generateContent?key=${this.apiKey}`;

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    if (request.maxTokens) body.generationConfig = { maxOutputTokens: request.maxTokens };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };

    const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';

    return {
      id: `gemini-${Date.now()}`,
      model: request.model ?? this._model,
      provider: 'gemini',
      content,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
      },
      latency: Math.round(performance.now() - start),
    };
  }

  async *stream(request: ConversationRequest): AsyncIterable<StreamChunk> {
    const { contents, systemInstruction } = this.buildContents(request.messages);
    const url = `${this.baseUrl}/models/${request.model ?? this._model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    if (request.maxTokens) body.generationConfig = { maxOutputTokens: request.maxTokens };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout * 2),
    });

    if (!res.ok) {
      yield {
        id: 'gemini-error',
        type: 'error',
        content: `Gemini API error ${res.status}`,
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
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (!payload || payload === '[DONE]') {
          yield {
            id: `gm-complete-${seq}`,
            type: 'complete',
            metadata: { sequence: seq++, timestamp: new Date().toISOString() },
          };
          continue;
        }
        try {
          const parsed = JSON.parse(payload) as {
            candidates?: Array<{ content: { parts: Array<{ text: string }> }; finishReason?: string }>;
          };
          const text = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
          if (text) {
            yield {
              id: `gm-token-${seq}`,
              type: 'text',
              content: text,
              metadata: { sequence: seq++, timestamp: new Date().toISOString() },
            };
          }
          if (parsed.candidates?.[0]?.finishReason === 'STOP') {
            yield {
              id: `gm-complete-${seq}`,
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
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
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
      message: this._available ? 'Gemini API reachable' : 'Gemini API not reachable (set GEMINI_API_KEY)',
    };
  }

  async models(): Promise<ModelInfo[]> {
    try {
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as {
          models?: Array<{ name: string; displayName?: string; description?: string }>;
        };
        if (data.models) {
          return data.models
            .filter((m) => m.name.includes('gemini'))
            .map((m) => ({
              id: m.name.replace('models/', ''),
              name: m.displayName ?? m.name,
              provider: 'gemini',
              contextWindow: 128000,
            }));
        }
      }
    } catch {
      // fall through
    }
    return [{ id: this._model, name: this._model, provider: 'gemini', contextWindow: 128000 }];
  }
}
