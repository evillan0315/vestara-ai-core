/**
 * OpenCodeCloudProvider — Adapter wrapping OpenCodeProvider as a ConversationProvider.
 *
 * Translates between the AIProvider interface (used by provider-runtime)
 * and the ConversationProvider interface (used by ProviderRouter).
 *
 * Architecture Traceability:
 *   PCS-020 → Provider Router (Online)
 */

import type {
  AIProvider,
  ConversationProvider,
  ConversationRequest,
  ConversationResponse,
  ModelInfo,
  ProviderHealth,
  StreamChunk,
} from '@vestara/shared';

export class OpenCodeCloudProvider implements ConversationProvider {
  readonly id = 'opencode-cloud';
  readonly name = 'OpenCode Cloud';
  private provider: AIProvider;
  private _model = 'deepseek-v4-flash-free';
  private _available = false;

  constructor(provider: AIProvider) {
    this.provider = provider;
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
    const result = await this.provider.complete({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    });
    return {
      id: result.id,
      model: result.model,
      provider: 'opencode-cloud',
      content: result.content,
      usage: result.usage,
      latency: result.latency,
    };
  }

  async *stream(request: ConversationRequest): AsyncIterable<StreamChunk> {
    const aiRequest = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    };
    for await (const chunk of this.provider.stream(aiRequest)) {
      yield chunk;
    }
  }

  async health(): Promise<ProviderHealth> {
    const result = await this.provider.healthCheck();
    this._available = result.status === 'healthy';
    return {
      status: result.status,
      providerId: this.id,
      model: this._model,
      latency: result.latency,
      lastHeartbeat: result.lastHeartbeat,
      message: result.message,
    };
  }

  async models(): Promise<ModelInfo[]> {
    const list = await this.provider.listModels();
    return list.map((m) => ({
      id: m.id,
      name: m.name,
      provider: 'opencode-cloud',
      contextWindow: m.contextWindow,
    }));
  }
}
