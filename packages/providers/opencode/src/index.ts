/**
 * @vestara/provider-opencode — OpenCode AI Provider
 *
 * An implementation of the AIProvider interface for OpenCode.
 * The Kernel and Provider Runtime never import this directly —
 * it is loaded through the ProviderManager abstraction.
 *
 * Architecture Traceability:
 *   Foundation: PROVIDER-SDK.md → AIProvider
 *   Specification: AI-CON-004 → OpenCode
 */

import type {
  AIModel,
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  ProviderCapabilities,
  ProviderHealthStatus,
  ProviderStatus,
  StreamChunk,
  ToolDefinition,
} from '@vestara/shared';
import { DefaultStreamProcessor } from '@vestara/stream';

interface OpenCodeConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

const DEFAULT_MODELS: AIModel[] = [
  {
    id: 'deepseek-v4-flash-free',
    provider: 'opencode',
    name: 'DeepSeek V4 Flash (Free)',
    contextWindow: 128_000,
    maxOutput: 8_192,
    capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
    pricing: { inputPerMillionTokens: 0, outputPerMillionTokens: 0 },
    status: 'available',
  },
  {
    id: 'mimo-v2.5-free',
    provider: 'opencode',
    name: 'Mimo V2.5 (Free)',
    contextWindow: 128_000,
    maxOutput: 8_192,
    capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
    pricing: { inputPerMillionTokens: 0, outputPerMillionTokens: 0 },
    status: 'available',
  },
  {
    id: 'nemotron-3-ultra-free',
    provider: 'opencode',
    name: 'Nemotron 3 Ultra (Free)',
    contextWindow: 128_000,
    maxOutput: 8_192,
    capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
    pricing: { inputPerMillionTokens: 0, outputPerMillionTokens: 0 },
    status: 'available',
  },
  {
    id: 'north-mini-code-free',
    provider: 'opencode',
    name: 'North Mini Code (Free)',
    contextWindow: 128_000,
    maxOutput: 8_192,
    capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
    pricing: { inputPerMillionTokens: 0, outputPerMillionTokens: 0 },
    status: 'available',
  },
  {
    id: 'big-pickle',
    provider: 'opencode',
    name: 'Big Pickle',
    contextWindow: 128_000,
    maxOutput: 8_192,
    capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
    pricing: { inputPerMillionTokens: 0, outputPerMillionTokens: 0 },
    status: 'available',
  },
];

export class OpenCodeProvider implements AIProvider {
  readonly id = 'opencode';
  readonly name = 'OpenCode';
  readonly version = '0.1.0';
  models: AIModel[] = [...DEFAULT_MODELS];

  private _status: ProviderStatus = 'uninitialized';
  private config: OpenCodeConfig = {};
  private baseUrl = 'https://opencode.ai/zen/v1';

  get status(): ProviderStatus {
    return this._status;
  }

  get capabilities(): ProviderCapabilities {
    return {
      maxConcurrentRequests: 10,
      features: ['chat', 'streaming', 'function-calling'],
    };
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    this._status = 'initializing';
    this.config = config as unknown as OpenCodeConfig;

    if (this.config.baseUrl) {
      this.baseUrl = this.config.baseUrl;
    }

    // Verify connectivity
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        signal: AbortSignal.timeout(5000),
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : undefined,
      });

      if (response.ok) {
        const data = (await response.json()) as { data?: Array<{ id: string }> };
        if (data.data && data.data.length > 0) {
          this.models = data.data.map((m: { id: string }) => ({
            id: m.id,
            provider: 'opencode',
            name: m.id,
            contextWindow: 128_000,
            maxOutput: 8_192,
            capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
            status: 'available' as const,
          }));
        }
      }
      this._status = 'available';
    } catch {
      // Offline or unreachable — use default model list
      this._status = this.config.baseUrl ? 'unavailable' : 'available';
    }
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    const start = performance.now();
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        signal: AbortSignal.timeout(5000),
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : undefined,
      });

      return {
        status: response.ok ? 'healthy' : 'degraded',
        providerId: this.id,
        modelCount: this.models.length,
        latency: Math.round(performance.now() - start),
        lastHeartbeat: new Date().toISOString(),
        message: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch {
      return {
        status: 'unhealthy',
        providerId: this.id,
        modelCount: this.models.length,
        latency: Math.round(performance.now() - start),
        lastHeartbeat: new Date().toISOString(),
        message: 'Cannot reach OpenCode API',
      };
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const start = performance.now();
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
      stream: false,
    };
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.id,
          description: t.description,
          parameters: {
            type: t.inputSchema?.type ?? 'object',
            properties: (t.inputSchema?.properties as Record<string, unknown>) ?? {},
            required: (t.inputSchema?.required as string[]) ?? [],
          },
        },
      }));
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenCode API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as {
      id: string;
      model: string;
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
      }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const choice = data.choices?.[0]?.message;
    const content = choice?.content ?? '';
    const toolCalls = choice?.tool_calls;

    return {
      id: data.id,
      model: data.model,
      provider: this.id,
      content,
      ...(toolCalls && toolCalls.length > 0
        ? {
            toolCalls: toolCalls.map((tc) => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments })),
          }
        : {}),
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      latency: Math.round(performance.now() - start),
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
      stream: true,
    };
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.id,
          description: t.description,
          parameters: {
            type: t.inputSchema?.type ?? 'object',
            properties: (t.inputSchema?.properties as Record<string, unknown>) ?? {},
            required: (t.inputSchema?.required as string[]) ?? [],
          },
        },
      }));
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    const processor = new DefaultStreamProcessor();
    const streamOptions = {
      conversationId: `req-${Date.now()}`,
      provider: this.id,
      model: request.model,
    };
    let seq = 0;

    if (!response.ok) {
      const text = await response.text();
      yield processor.error(`OpenCode API error (${response.status}): ${text}`, {
        sequence: seq++,
        ...streamOptions,
      });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield processor.error('No response body', { sequence: seq++, ...streamOptions });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let _fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              yield processor.complete({ sequence: seq++, ...streamOptions });
              return;
            }
            try {
              const parsed = JSON.parse(data) as {
                choices?: Array<{
                  delta?: {
                    content?: string;
                    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
                  };
                  finish_reason?: string;
                }>;
                usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
              };
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                _fullContent += content;
                yield processor.text(content, { sequence: seq++, ...streamOptions });
              }
              const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;
              if (toolCalls && toolCalls.length > 0) {
                for (const tc of toolCalls) {
                  if (tc.function?.name) {
                    yield processor.toolCall(tc.function.name, tc.function.arguments ?? '{}', {
                      sequence: seq++,
                      ...streamOptions,
                    });
                  }
                }
              }
              if (
                parsed.choices?.[0]?.finish_reason === 'stop' ||
                parsed.choices?.[0]?.finish_reason === 'tool_calls'
              ) {
                if (parsed.usage) {
                  yield processor.meta(
                    {
                      promptTokens: parsed.usage.prompt_tokens,
                      completionTokens: parsed.usage.completion_tokens,
                      totalTokens: parsed.usage.total_tokens,
                    },
                    undefined,
                    { sequence: seq++, ...streamOptions },
                  );
                }
                yield processor.complete({ sequence: seq++, ...streamOptions });
                return;
              }
            } catch {
              // Skip malformed SSE lines
            }
          }
        }
      }
    } catch (error) {
      yield processor.error(error instanceof Error ? error.message : 'Stream error', {
        sequence: seq++,
        ...streamOptions,
      });
    }

    yield processor.complete({ sequence: seq++, ...streamOptions });
  }

  async listModels(): Promise<AIModel[]> {
    return [...this.models];
  }
}
