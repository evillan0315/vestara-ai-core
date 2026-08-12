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

import {
  classifyOpenCodeExecutionEvent,
  type OpenCodeClient,
  OpenCodeHttpClient,
  OpenCodeIntegrationError,
  resolveOpenCodeConfig,
} from '@vestara/opencode-runtime';
import type {
  AIModel,
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  ProviderCapabilities,
  ProviderExecutionEvent,
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
  /** Model id within the preferred provider (default: none — provider default). */
  readonly modelId?: string;
  /** Native runtime agent (e.g. build/planner/reviewer) the sessions run as (default: runtime default). */
  readonly agent?: string;
  /**
   * Execution-liveness window: if no upstream event arrives for this long, the
   * turn is classified STALLED and terminated. Activity (message deltas,
   * session updates, server heartbeats) extends it. Default 60s.
   */
  readonly streamIdleTimeoutMs?: number;
  /**
   * Absolute safety ceiling for one agent turn, regardless of activity.
   * Default 30 minutes. A healthy long-running turn is terminated only when it
   * exceeds this ceiling, not on arbitrary wall-clock duration.
   */
  readonly streamMaxDurationMs?: number;
}

export type ProviderResolutionReason =
  | 'preferred'
  | 'preferred-unavailable'
  | 'explicit-model'
  | 'explicit-unresolvable'
  | 'default';

export interface ProviderResolution {
  readonly providerId?: string;
  readonly reason: ProviderResolutionReason;
  readonly defaultResolution: boolean;
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
  private readonly modelId?: string;
  private readonly agent?: string;
  private readonly streamIdleTimeoutMs: number;
  private readonly streamMaxDurationMs: number;
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
    this.modelId = options.modelId ?? process.env.OPENCODE_RUNTIME_MODEL_ID;
    this.agent = options.agent ?? process.env.OPENCODE_RUNTIME_AGENT;
    this.streamIdleTimeoutMs = positiveInt(
      options.streamIdleTimeoutMs,
      process.env.OPENCODE_STREAM_IDLE_TIMEOUT_MS,
      60_000,
    );
    this.streamMaxDurationMs = positiveInt(
      options.streamMaxDurationMs,
      process.env.OPENCODE_STREAM_MAX_DURATION_MS,
      1_800_000,
    );
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
    const resolved = this.resolveProvider(request.model);
    const sessionId = await this.createSession(resolved.providerId, this.modelId);
    try {
      const text = await this.streamReply(sessionId, renderPrompt(request), request.signal, request.onExecutionEvent);
      return {
        id: `ocrt-${Date.now()}`,
        model: resolved.providerId ?? request.model,
        provider: this.id,
        content: text,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        latency: Math.round(Date.now() - started),
        resolution: {
          providerId: resolved.providerId,
          reason: resolved.reason,
          defaultResolution: resolved.defaultResolution,
        },
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

  /**
   * Resolve which runtime provider executes a completion. Discovery order never
   * determines execution identity: only an explicit, demonstrably-resolvable
   * assignment selects a provider; otherwise the runtime's configured default
   * is used (the session is created without forcing a provider).
   */
  private resolveProvider(modelId: string | undefined): ProviderResolution {
    const discovered = new Set(this.models.map((model) => model.id));
    if (this.preferredProviderId) {
      if (discovered.has(this.preferredProviderId)) {
        return { providerId: this.preferredProviderId, reason: 'preferred', defaultResolution: false };
      }
      return { providerId: undefined, reason: 'preferred-unavailable', defaultResolution: true };
    }
    const explicit = explicitProviderOf(modelId);
    if (explicit !== undefined && discovered.has(explicit)) {
      return { providerId: explicit, reason: 'explicit-model', defaultResolution: false };
    }
    if (explicit !== undefined) {
      return { providerId: undefined, reason: 'explicit-unresolvable', defaultResolution: true };
    }
    return { providerId: undefined, reason: 'default', defaultResolution: true };
  }

  private async createSession(providerId?: string, modelId?: string): Promise<string> {
    const session = await this.client().createSession(
      {
        title: `vestara-agent-${Date.now()}`,
        agent: this.agent,
        providerID: providerId ?? undefined,
        modelID: modelId ?? undefined,
      },
      { workspaceId: this.workspaceId },
    );
    return session.id;
  }

  /**
   * Stream a turn under an execution-liveness contract. The turn is ACTIVE
   * while upstream events arrive (message deltas, session updates, server
   * heartbeats); each event extends the idle window. It is terminated when:
   *   - no event arrives within `streamIdleTimeoutMs`       → STALLED
   *   - the turn exceeds `streamMaxDurationMs`              → MAX DURATION
   *   - the caller's signal aborts                          → CANCELLED
   *   - the runtime emits `session.idle` / `session.error`  → terminal
   *   - the SSE stream ends without a terminal event        → CONNECTION LOST
   * Termination reasons are observable through thrown typed errors; caller
   * cancellation returns an empty completion so the harness classifies it as
   * cancelled rather than provider-failed.
   */
  private async streamReply(
    sessionId: string,
    prompt: string,
    externalSignal?: AbortSignal,
    onExecutionEvent?: (event: ProviderExecutionEvent) => void,
  ): Promise<string> {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (externalSignal?.aborted) onExternalAbort();
    else externalSignal?.addEventListener('abort', onExternalAbort, { once: true });
    const context = { workspaceId: this.workspaceId, sessionId };
    const stream = this.client().openEventStream(context, controller.signal);
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let maxTimer: ReturnType<typeof setTimeout> | undefined;
    let terminationReason: 'stalled' | 'max-duration' | undefined;
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        terminationReason = 'stalled';
        controller.abort();
      }, this.streamIdleTimeoutMs);
    };
    try {
      await this.client().sendMessageAsync(sessionId, { parts: [{ type: 'text', text: prompt }] }, context);
      armIdle();
      maxTimer = setTimeout(() => {
        terminationReason = 'max-duration';
        controller.abort();
      }, this.streamMaxDurationMs);
      let text = '';
      let terminal: 'idle' | 'error' | undefined;
      try {
        for await (const event of stream) {
          armIdle();
          // Normalize the upstream SSE event into a Vestara execution event and
          // stream it out for live observation (never binds the room to
          // OpenCode's schema).
          const normalized = classifyOpenCodeExecutionEvent(event);
          if (normalized) {
            onExecutionEvent?.({
              type: normalized.type,
              state: normalized.executionState,
              activity: normalized.activity,
              at: normalized.at,
              sessionId: normalized.sessionId ?? sessionId,
            });
          }
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
      } catch (error) {
        if (externalSignal?.aborted) return ''; // caller cancellation → harness classifies cancelled
        if (terminationReason === 'stalled') throw stalledTurnError(this.streamIdleTimeoutMs);
        if (terminationReason === 'max-duration') throw maxDurationTurnError(this.streamMaxDurationMs);
        throw error; // genuine stream failure (connection/network)
      }
      if (terminationReason === 'stalled') throw stalledTurnError(this.streamIdleTimeoutMs);
      if (terminationReason === 'max-duration') throw maxDurationTurnError(this.streamMaxDurationMs);
      if (!text && terminal !== 'idle') {
        text = await this.lastMessageText(sessionId).catch(() => '');
      }
      if (!text && terminal !== 'idle') throw connectionLostError();
      return text;
    } finally {
      clearTimeout(idleTimer);
      clearTimeout(maxTimer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
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

/**
 * Extract an explicit provider assignment from a model id. Only a
 * slash-qualified id (`provider/model`) is treated as an explicit assignment;
 * a bare model id carries no provider intent.
 */
function explicitProviderOf(modelId: string | undefined): string | undefined {
  if (!modelId) return undefined;
  const slash = modelId.indexOf('/');
  if (slash <= 0) return undefined;
  const provider = modelId.slice(0, slash);
  return provider.length > 0 ? provider : undefined;
}

function sessionOf(event: { payload?: Record<string, unknown> }): string | undefined {
  const value = event.payload?.sessionID;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function positiveInt(...candidates: Array<number | string | undefined>): number {
  for (const candidate of candidates) {
    const parsed = typeof candidate === 'number' ? candidate : Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  throw new Error('A positive integer is required');
}

function stalledTurnError(idleMs: number): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError(
    'OPENCODE_TIMEOUT',
    `OpenCode execution stalled: no upstream events for ${idleMs}ms.`,
    504,
    true,
  );
}

function maxDurationTurnError(maxMs: number): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError(
    'OPENCODE_TIMEOUT',
    `OpenCode execution exceeded the maximum duration of ${maxMs}ms.`,
    504,
    true,
  );
}

function connectionLostError(): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError(
    'OPENCODE_UNAVAILABLE',
    'OpenCode stream ended without a terminal event (connection lost).',
    503,
    true,
  );
}
