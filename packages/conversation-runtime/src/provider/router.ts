/**
 * ProviderRouter — Selects and manages the active conversation provider.
 *
 * Routes between online (OpenCode Cloud) and offline (local Ollama/vLLM)
 * providers with deterministic priority:
 *   1. User explicitly selected a provider
 *   2. OpenCode Cloud is available and reachable
 *   3. Local provider (Ollama/vLLM)
 *   4. If neither available, keep running with degraded status (never crash)
 *
 * Supports intent-based model selection for optimal task routing:
 *   greeting/conversation  → DeepSeek V4 Flash (fast, low-cost)
 *   explain/architecture   → Qwen3.7 Max (reasoning + large context)
 *   plan/implement         → DeepSeek V4 Pro (engineering reasoning)
 *   large-context          → GLM-5.2 (huge context window)
 *
 * Architecture Traceability:
 *   PCS-020 → Provider Router
 */

import type { ProviderExecutor } from '@vestara/conversation';
import type {
  ActiveRoute,
  CompletionRequest,
  CompletionResponse,
  ConversationIntent,
  ConversationProvider,
  ProviderRouterStatus,
  StreamChunk,
} from '@vestara/shared';

export type { ConversationProvider } from '@vestara/shared';

const DEFAULT_INTENT_MODELS: Record<ConversationIntent, string> = {
  greeting: 'deepseek-v4-flash-free',
  conversation: 'deepseek-v4-flash-free',
  explain: 'deepseek-v4-flash-free',
  plan: 'deepseek-v4-flash-free',
  implement: 'deepseek-v4-flash-free',
  architecture: 'deepseek-v4-flash-free',
  'large-context': 'deepseek-v4-flash-free',
};

export class ProviderRouter implements ProviderExecutor {
  readonly id = 'vestara-provider-router';
  private onlineProvider: ConversationProvider | null = null;
  private offlineProvider: ConversationProvider | null = null;
  private userSelectedProviderId: string | null = null;
  private userSelectedModel: string | null = null;
  private _activeId: string | null = null;
  private _activeModel: string | null = null;
  private _intentModels: Record<ConversationIntent, string> = { ...DEFAULT_INTENT_MODELS };
  private _currentIntent: ConversationIntent = 'conversation';

  get activeProviderId(): string | null {
    return this._activeId;
  }

  get activeModel(): string | null {
    return this._activeModel;
  }

  get currentIntent(): ConversationIntent {
    return this._currentIntent;
  }

  registerOnline(provider: ConversationProvider): void {
    this.onlineProvider = provider;
  }

  registerOffline(provider: ConversationProvider): void {
    this.offlineProvider = provider;
  }

  selectProvider(providerId: string): void {
    this.userSelectedProviderId = providerId;
  }

  selectModel(model: string): void {
    this.userSelectedModel = model;
  }

  clearSelection(): void {
    this.userSelectedProviderId = null;
    this.userSelectedModel = null;
  }

  setIntent(intent: ConversationIntent): void {
    this._currentIntent = intent;
  }

  overrideIntentModel(intent: ConversationIntent, model: string): void {
    this._intentModels[intent] = model;
  }

  resolveModel(intent?: ConversationIntent): string {
    if (this.userSelectedModel) return this.userSelectedModel;
    const i = intent ?? this._currentIntent;
    return this._intentModels[i] ?? this._intentModels.conversation;
  }

  async resolve(): Promise<ConversationProvider> {
    if (this.userSelectedProviderId) {
      const selected = this._findProvider(this.userSelectedProviderId);
      if (selected?.available) {
        this._activeId = selected.id;
        return selected;
      }
    }

    if (this.onlineProvider?.available) {
      this._activeId = this.onlineProvider.id;
      return this.onlineProvider;
    }

    if (this.offlineProvider?.available) {
      this._activeId = this.offlineProvider.id;
      return this.offlineProvider;
    }

    if (this.onlineProvider) {
      this._activeId = this.onlineProvider.id;
      return this.onlineProvider;
    }

    if (this.offlineProvider) {
      this._activeId = this.offlineProvider.id;
      return this.offlineProvider;
    }

    throw new Error('No conversation provider available');
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const provider = await this.resolve();
    const model = this._resolveModelFromRequest(request.model);
    this._activeModel = model;
    const result = await provider.complete({
      model,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    });
    return {
      id: result.id,
      model: result.model,
      provider: result.provider,
      content: result.content,
      usage: result.usage,
      latency: result.latency,
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const provider = await this.resolve();
    const model = this._resolveModelFromRequest(request.model);
    this._activeModel = model;
    for await (const chunk of provider.stream({
      model,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      stream: true,
    })) {
      yield chunk;
    }
  }

  async getStatus(): Promise<ProviderRouterStatus> {
    const onlineHealth = this.onlineProvider
      ? await this.onlineProvider.health().catch(() => ({
          status: 'unhealthy' as const,
          providerId: this.onlineProvider!.id,
          model: this.onlineProvider!.model,
          latency: 0,
          lastHeartbeat: new Date().toISOString(),
          message: 'Health check failed',
        }))
      : null;

    const offlineHealth = this.offlineProvider
      ? await this.offlineProvider.health().catch(() => ({
          status: 'unhealthy' as const,
          providerId: this.offlineProvider!.id,
          model: this.offlineProvider!.model,
          latency: 0,
          lastHeartbeat: new Date().toISOString(),
          message: 'Health check failed',
        }))
      : null;

    const active = this._getActiveFromHealth(onlineHealth, offlineHealth);

    return {
      online: onlineHealth
        ? {
            source: 'online',
            providerId: onlineHealth.providerId,
            model: onlineHealth.model,
            connected: onlineHealth.status === 'healthy',
            latency: onlineHealth.latency,
          }
        : null,
      offline: offlineHealth
        ? {
            source: 'offline',
            providerId: offlineHealth.providerId,
            model: offlineHealth.model,
            connected: offlineHealth.status === 'healthy',
            latency: offlineHealth.latency,
          }
        : null,
      active,
      failoverEnabled: !!(this.onlineProvider && this.offlineProvider),
    };
  }

  private _resolveModelFromRequest(requestedModel: string): string {
    if (this.userSelectedModel) return this.userSelectedModel;
    if (requestedModel && requestedModel !== 'deepseek-v4-flash-free') return requestedModel;
    return this._intentModels[this._currentIntent] ?? this._intentModels.conversation;
  }

  private _getActiveFromHealth(
    onlineHealth: { status: string; providerId: string; latency: number; model?: string } | null,
    offlineHealth: { status: string; providerId: string; latency: number; model?: string } | null,
  ): ActiveRoute | null {
    if (this.userSelectedProviderId && this._activeId === this.userSelectedProviderId) {
      const health = this._findHealth(this.userSelectedProviderId, onlineHealth, offlineHealth);
      if (health) return health;
    }

    if (onlineHealth?.status === 'healthy') {
      return {
        source: 'online',
        providerId: onlineHealth.providerId,
        model: this._activeModel ?? onlineHealth.model ?? '',
        connected: true,
        latency: onlineHealth.latency,
      };
    }

    if (offlineHealth?.status === 'healthy') {
      return {
        source: 'offline',
        providerId: offlineHealth.providerId,
        model: this._activeModel ?? offlineHealth.model ?? '',
        connected: true,
        latency: offlineHealth.latency,
      };
    }

    if (onlineHealth) {
      return {
        source: 'online',
        providerId: onlineHealth.providerId,
        model: this._activeModel ?? onlineHealth.model ?? '',
        connected: false,
        latency: onlineHealth.latency,
      };
    }

    if (offlineHealth) {
      return {
        source: 'offline',
        providerId: offlineHealth.providerId,
        model: this._activeModel ?? offlineHealth.model ?? '',
        connected: false,
        latency: offlineHealth.latency,
      };
    }

    return null;
  }

  private _findProvider(id: string): ConversationProvider | null {
    if (this.onlineProvider?.id === id) return this.onlineProvider;
    if (this.offlineProvider?.id === id) return this.offlineProvider;
    return null;
  }

  private _findHealth(
    id: string,
    online: { status: string; providerId: string; latency: number; model?: string } | null,
    offline: { status: string; providerId: string; latency: number; model?: string } | null,
  ): ActiveRoute | null {
    const match = online?.providerId === id ? online : offline?.providerId === id ? offline : null;
    if (!match) return null;
    const provider = this._findProvider(id);
    return {
      source: match === online ? 'online' : 'offline',
      providerId: id,
      model: provider?.model ?? '',
      connected: match.status === 'healthy',
      latency: match.latency ?? 0,
    };
  }
}
