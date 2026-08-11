/**
 * @vestara/provider-opencode — OpenCodeRuntimeProvider
 *
 * An `AIProvider` implementation that drives the OpenCode headless runtime
 * directly — the same mechanism the governed live trials use. Each `complete()`
 * creates a runtime session, sends the prompt asynchronously, and streams the
 * assistant reply over the `/event` SSE endpoint until `session.idle`. The
 * OpenCode runtime runs the agent (including its own tool loop); the reply is
 * returned as plain text so the harness records it as the durable outcome.
 *
 * Provider/model are NOT hardcoded: available providers are discovered from the
 * runtime (`listProviders`, the same source as `GET /api/opencode/providers`)
 * and the session is created without forcing a model — the runtime's configured
 * default provider/model runs the agent. Credentials resolve from the
 * environment at construction and are never persisted or logged. A missing
 * credential or unreachable server surfaces as a provider failure — never a
 * crash and never a secret leak.
 */

import { type OpenCodeClient, OpenCodeHttpClient, resolveOpenCodeConfig } from '@vestara/opencode-runtime';
import type {
  AIModel,
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  ProviderCapabilities,
  ProviderHealthStatus,
  ProviderStatus,
  StreamChunk,
} from '@vestara/shared';

export interface OpenCodeRuntimeProviderOptions {
  readonly id?: string;
  readonly name?: string;
  readonly client?: OpenCodeClient;
  readonly timeoutMs?: number;
  readonly workspaceId?: string;
  /** Prefer this discovered provider id when creating sessions (default: none — runtime default). */
  readonly preferredProviderId?: string;
  /** Native runtime agent (e.g. build/planner/reviewer) the sessions run as (default: runtime default). */
  readonly agent?: string;
}

export class OpenCodeRuntimeProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly version = '0.1.0';
  readonly capabilities: ProviderCapabilities = { maxConcurrentRequests: 4, features: ['chat', 'streaming'] };
  models: AIModel[] = [];

  private _status: ProviderStatus = 'uninitialized';
  private readonly externalClient?: OpenCodeClient;
  private clientInstance?: OpenCodeClient;
  private clientError?: unknown;
  private readonly timeoutMs: number;
  private readonly workspaceId: string;
  private readonly preferredProviderId?: string;
  private readonly agent?: string;
  private providersPromise?: Promise<string[]>;
  private providersLoadedAt = 0;

  constructor(options: OpenCodeRuntimeProviderOptions = {}) {
    this.id = options.id ?? 'opencode-runtime';
    this.name = options.name ?? 'OpenCode Runtime';
    // Credentials/config resolve lazily on first use so constructing the
    // provider never crashes the API when the integration env is missing — the
    // harness degrades to a controlled provider failure instead.
    this.externalClient = options.client;
    this.timeoutMs = options.timeoutMs ?? 300_000;
    this.workspaceId = options.workspaceId ?? 'vestara';
    this.preferredProviderId = options.preferredProviderId ?? process.env.OPENCODE_RUNTIME_PROVIDER_ID;
    this.agent = options.agent ?? process.env.OPENCODE_RUNTIME_AGENT;
  }

  /** Lazily resolve the runtime client; caches the config on success or the error. */
  private client(): OpenCodeClient {
    if (this.clientInstance) return this.clientInstance;
    if (this.clientError) throw this.clientError;
    if (this.externalClient) {
      this.clientInstance = this.externalClient;
      return this.clientInstance;
    }
    try {
      this.clientInstance = new OpenCodeHttpClient(resolveOpenCodeConfig({ requestTimeoutMs: this.timeoutMs }));
      return this.clientInstance;
    } catch (error) {
      this.clientError = error;
      throw error;
    }
  }

  get status(): ProviderStatus {
    return this._status;
  }

  /** Discover providers from the runtime and expose each as an AI model entry. */
  async initialize(_config: Record<string, unknown>): Promise<void> {
    try {
      await this.discoverProviders();
      this._status = this.models.length > 0 ? 'available' : 'degraded';
    } catch {
      this._status = 'unavailable';
    }
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    const started = Date.now();
    try {
      const health = await this.client().getHealth();
      await this.discoverProviders().catch(() => {});
      this._status = health.healthy ? 'available' : 'degraded';
      return {
        status: health.healthy ? 'healthy' : 'degraded',
        providerId: this.id,
        modelCount: this.models.length,
        latency: Math.round(Date.now() - started),
        lastHeartbeat: new Date().toISOString(),
        message: health.healthy ? undefined : 'upstream unhealthy',
      };
    } catch {
      this._status = 'unavailable';
      return {
        status: 'unhealthy',
        providerId: this.id,
        modelCount: this.models.length,
        latency: Math.round(Date.now() - started),
        lastHeartbeat: new Date().toISOString(),
        message: 'Cannot reach OpenCode runtime',
      };
    }
  }

  async listModels(): Promise<AIModel[]> {
    await this.discoverProviders().catch(() => {});
    return this.models;
  }

  /**
   * Run one agent turn through the OpenCode runtime: a fresh session is created
   * (using a discovered provider when available, otherwise the runtime's own
   * default), the full request context is sent, and the reply is streamed to
   * `session.idle`. No tool calls are surfaced — the runtime agent runs its own
   * tool loop.
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const started = Date.now();
    await this.discoverProviders().catch(() => {});
    const resolvedProvider = this.resolveProvider();
    const sessionId = await this.createSession(resolvedProvider);
    try {
      const text = await this.streamReply(sessionId, renderPrompt(request));
      return {
        id: `ocrt-${Date.now()}`,
        model: resolvedProvider ?? request.model,
        provider: this.id,
        content: text,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: Math.round(Date.now() - started),
      };
    } finally {
      // Sessions are created per invocation so agent turns never share history.
      await this.client()
        .abortSession(sessionId, { workspaceId: this.workspaceId, sessionId })
        .catch(() => {});
    }
  }

  async *stream(_request: CompletionRequest): AsyncIterable<StreamChunk> {
    // The harness executes turns through complete(); the runtime stream is
    // consumed inside this provider. Exposed for interface conformance.
    yield {
      id: `ocrt-${Date.now()}`,
      type: 'text',
      content: '',
      metadata: { sequence: 0, timestamp: new Date().toISOString() },
    };
  }

  private async discoverProviders(): Promise<readonly string[]> {
    if (this.providersPromise && Date.now() - this.providersLoadedAt < 30_000) return this.providersPromise;
    this.providersPromise = (async () => {
      const providers = await this.client().listProviders();
      const ids = providers.map((provider) => provider.id).filter((id): id is string => Boolean(id));
      this.models = ids.map((providerId) => ({
        id: providerId,
        provider: this.id,
        name: `OpenCode ${providerId} (runtime default model)`,
        contextWindow: 128_000,
        maxOutput: 8_192,
        capabilities: { chat: true, streaming: true, functionCalling: true, vision: false, embeddings: false },
        status: 'available' as const,
      }));
      this.providersLoadedAt = Date.now();
      return ids;
    })();
    return this.providersPromise;
  }

  /** Prefer the configured provider id, else the first discovered provider, else the runtime default. */
  private resolveProvider(): string | undefined {
    if (this.preferredProviderId) return this.preferredProviderId;
    return this.models[0]?.id;
  }

  private async createSession(providerId?: string): Promise<string> {
    const session = await this.client().createSession(
      {
        title: `vestara-agent-${Date.now()}`,
        agent: this.agent,
        model: providerId ? { providerID: providerId } : undefined,
      },
      { workspaceId: this.workspaceId },
    );
    return session.id;
  }

  private async streamReply(sessionId: string, prompt: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const context = { workspaceId: this.workspaceId, sessionId };
    const stream = this.client().openEventStream(context, controller.signal);
    try {
      await this.client().sendMessageAsync(sessionId, { parts: [{ type: 'text', text: prompt }] }, context);
      let text = '';
      let terminal: 'idle' | 'error' | undefined;
      for await (const event of stream) {
        if (sessionOf(event) !== sessionId) continue;
        if (event.type === 'session.idle') {
          terminal = 'idle';
          break;
        }
        if (event.type === 'session.error' || event.type === 'session.unavailable') {
          terminal = 'error';
          break;
        }
        if (event.type.startsWith('message.') && typeof event.payload?.delta === 'string') {
          text += event.payload.delta;
        }
      }
      if (!text && terminal !== 'idle') {
        text = await this.lastMessageText(sessionId);
      }
      if (!text) throw new Error('no assistant reply within timeout');
      return text;
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  private async lastMessageText(sessionId: string): Promise<string> {
    const messages = await this.client().listMessages(sessionId, { workspaceId: this.workspaceId, sessionId });
    const last = [...messages].reverse().find((message) => message.role !== 'user' && message.text?.trim());
    return last?.text ?? '';
  }
}

/** Render the harness conversation into a single runtime prompt (ordered). */
function renderPrompt(request: CompletionRequest): string {
  return request.messages
    .map((message) => {
      const label = message.role === 'assistant' ? 'Assistant' : message.role === 'system' ? 'System' : 'User';
      return `[${label}]\n${message.content}`;
    })
    .join('\n\n');
}

function sessionOf(event: { payload?: Record<string, unknown> }): string | undefined {
  const value = event.payload?.['sessionID'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
