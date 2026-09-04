import { OpenCodeHttpClient, type OpenCodeRuntimeConfig } from '@vestara/opencode-runtime';
import type {
  ConversationProvider,
  ConversationRequest,
  ConversationResponse,
  ModelInfo,
  ProviderHealth,
  StreamChunk,
} from '@vestara/shared';

/**
 * GA-RECOVERY-001: the local OpenCode server is the execution authority.
 *
 * This provider talks ONLY to the local OpenCode runtime
 * (`http://127.0.0.1:4096`) through the canonical `OpenCodeHttpClient`
 * transport — `POST /session` then `POST /session/:id/message?directory=...`.
 * It NEVER calls opencode.ai (the direct-cloud transport was removed).
 * Upstream model/provider selection happens inside the local OpenCode
 * runtime; no upstream API key is ever handled here.
 */
export interface OpenCodeConfig {
  /** Local OpenCode server base URL (default http://127.0.0.1:4096). */
  baseUrl?: string;
  username?: string;
  password?: string;
  /** Canonical repository directory authority (`?directory=...`), never `.vestara`. */
  directory?: string;
  workspaceId?: string;
  /** Runtime agent executed by the local server (e.g. `vestara-assistant`). */
  agent?: string;
  /** Upstream provider selected inside the local OpenCode execution. */
  provider?: string;
  /** Upstream model selected inside the local OpenCode execution. */
  model?: string;
  timeout?: number;
}

export class OpenCodeProvider implements ConversationProvider {
  readonly id = 'opencode';
  readonly name = 'OpenCode (local)';
  private config: OpenCodeConfig;
  private client: OpenCodeHttpClient;
  private _available = false;
  private _model: string;
  private _models: ModelInfo[] = [];

  constructor(config: OpenCodeConfig = {}) {
    this.config = config;
    // Model/provider are NEVER hardcoded here — they come from the caller's
    // authoritative configuration (agent registry / manifest). An empty model
    // means the local OpenCode runtime agent decides.
    this._model = config.model ?? '';
    // Build the local client config directly (tolerant of a missing password —
    // the local server may not require Basic auth). Base URL defaults to the
    // canonical local runtime.
    const runtimeConfig: OpenCodeRuntimeConfig = {
      baseUrl: new URL(config.baseUrl ?? 'http://127.0.0.1:4096'),
      username: config.username ?? 'opencode',
      password: config.password ?? '',
      requestTimeoutMs: config.timeout ?? 30_000,
      healthTimeoutMs: 3_000,
      reconnectDelayMs: 2_000,
      maxReconnectDelayMs: 30_000,
      policies: {
        allowShell: false,
        allowConfigWrite: false,
        allowProviderAuth: false,
        allowInstanceDispose: false,
      },
    };
    this.client = new OpenCodeHttpClient(runtimeConfig);
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

  private get context(): { workspaceId: string; directory: string } {
    return {
      workspaceId: this.config.workspaceId ?? 'cli',
      directory: this.config.directory ?? process.cwd(),
    };
  }

  /**
   * Resolve the upstream model ref ONLY from authoritative caller configuration
   * (AgentDefinition provider/model). No hidden fallback: when `config.provider`
   * is absent, the model binding is deliberately OMITTED and the local
   * `vestara-assistant` runtime agent configuration decides.
   */
  private modelRef(request: ConversationRequest): { providerID: string; modelID: string } | undefined {
    const modelId = request.model || this._model;
    if (!modelId || !this.config.provider) return undefined;
    return { providerID: this.config.provider, modelID: modelId };
  }

  private lastUserText(request: ConversationRequest): string {
    for (let i = request.messages.length - 1; i >= 0; i -= 1) {
      const message = request.messages[i];
      if (message && message.role === 'user' && typeof message.content === 'string') {
        return message.content;
      }
    }
    return '';
  }

  async complete(request: ConversationRequest): Promise<ConversationResponse> {
    const start = performance.now();
    const text = this.lastUserText(request);
    if (!text) {
      throw new Error('OpenCode (local) requires a user message');
    }
    const session = await this.client.createSession({ title: 'Conversation' }, this.context);
    const result = await this.client.sendMessage(
      session.id,
      { parts: [{ type: 'text', text }], agent: this.config.agent, model: this.modelRef(request) },
      this.context,
    );
    return {
      id: result.messageId ?? session.id,
      model: this._model || request.model || '',
      provider: this.id,
      content: result.text ?? '',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latency: Math.round(performance.now() - start),
    };
  }

  async *stream(request: ConversationRequest): AsyncIterable<StreamChunk> {
    const text = this.lastUserText(request);
    if (!text) {
      yield {
        id: 'opencode-local-error',
        type: 'error',
        content: 'OpenCode (local) requires a user message',
        metadata: { sequence: 0, timestamp: new Date().toISOString() },
      };
      return;
    }

    // Canonical local pattern: session-scoped event queue (events may arrive
    // before sendMessage resolves), then drain until the runtime goes idle.
    const session = await this.client.createSession({ title: 'Conversation' }, this.context);
    const controller = new AbortController();
    const queue: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const waiters: Array<() => void> = [];
    let readerDone = false;
    const wake = () => waiters.splice(0).forEach((w) => w());
    const readerPromise = (async () => {
      try {
        for await (const event of this.client.openEventStream(this.context, controller.signal)) {
          const payload = (event.payload ?? {}) as Record<string, unknown>;
          if (payload.sessionID === session.id) {
            queue.push({ type: event.type, payload });
            wake();
          }
        }
      } catch {
        // stream closed — the drain loop observes readerDone
      } finally {
        readerDone = true;
        wake();
      }
    })();

    let seq = 0;
    const meta = { sequence: 0, timestamp: new Date().toISOString() };
    try {
      await this.client.sendMessage(
        session.id,
        { parts: [{ type: 'text', text }], agent: this.config.agent, model: this.modelRef(request) },
        this.context,
      );

      let turnDone = false;
      const deadline = Date.now() + (this.config.timeout ?? 30_000) * 4;
      while (!turnDone && Date.now() < deadline) {
        while (queue.length === 0 && !readerDone && !turnDone) {
          if (Date.now() >= deadline) break;
          await new Promise<void>((resolve) => waiters.push(resolve));
        }
        const event = queue.shift();
        if (!event) break;
        if (event.type === 'message.part.delta' || event.type === 'session.next.text.delta') {
          const delta = event.payload.delta;
          if (typeof delta === 'string' && delta) {
            yield { id: `oc-token-${seq}`, type: 'text', content: delta, metadata: { ...meta, sequence: seq++ } };
          }
        } else if (event.type === 'session.status') {
          const status = event.payload.status as { type?: string } | undefined;
          if (status && status.type === 'idle') turnDone = true;
        } else if (event.type === 'session.error') {
          yield {
            id: `oc-error-${seq}`,
            type: 'error',
            content: 'OpenCode local session error',
            metadata: { ...meta, sequence: seq++ },
          };
          turnDone = true;
        }
      }
      yield { id: `oc-complete-${seq}`, type: 'complete', metadata: { ...meta, sequence: seq++ } };
    } finally {
      controller.abort();
      await readerPromise.catch(() => undefined);
    }
  }

  async health(): Promise<ProviderHealth> {
    const start = performance.now();
    try {
      const health = await this.client.getHealth();
      this._available = health.healthy;
      return {
        status: health.healthy ? 'healthy' : 'unhealthy',
        providerId: this.id,
        model: this._model,
        latency: Math.round(performance.now() - start),
        lastHeartbeat: new Date().toISOString(),
        message: health.healthy ? 'Local OpenCode reachable' : 'Local OpenCode not reachable',
      };
    } catch {
      this._available = false;
      return {
        status: 'unhealthy',
        providerId: this.id,
        model: this._model,
        latency: Math.round(performance.now() - start),
        lastHeartbeat: new Date().toISOString(),
        message: 'Local OpenCode not reachable',
      };
    }
  }

  async models(): Promise<ModelInfo[]> {
    if (this._models.length > 0) return this._models;
    try {
      const providers = await this.client.listProviders();
      this._models = providers.flatMap((p) =>
        (p.models ?? []).map((modelId) => ({
          id: modelId,
          name: modelId,
          provider: p.id,
          contextWindow: 128_000,
        })),
      );
    } catch {
      this._models = [];
    }
    return this._models;
  }
}
