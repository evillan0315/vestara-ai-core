/**
 * @vestara/conversation — Conversation Service
 *
 * Orchestrates the conversation lifecycle: create, sendMessage,
 * receiveResponse, closeConversation, listConversations. Wires
 * through the Context Assembler and AI Provider. Emits events
 * at every stage.
 *
 * Architecture Traceability:
 *   Foundation: VESTARA-OBJECT-MODEL.md → VOM-Conversation, VOM-Message
 *   Specification: CAP-001 → Workspace.Chat
 *   Runtime: LIFECYCLE-SPECIFICATION.md → Conversation Lifecycle
 */

import type { ContextAssembler } from '@vestara/context';
import type { EventBus } from '@vestara/event-bus';
import type {
  AssistantExecutionObservationReference,
  AssistantExecutionRecord,
  AssistantRuntimeCorrelation,
  ExecutionActor,
  ExecutionId,
  ExecutionResult,
  ExecutionStatus,
  RuntimeSessionId,
} from '@vestara/execution-types';
import type { Logger } from '@vestara/logger';
import type {
  CompletionRequest,
  CompletionResponse,
  Conversation,
  ConversationSummary,
  Message,
  StreamChunk,
  ToolObservation,
} from '@vestara/shared';
import { truncateReasoning } from '@vestara/shared';
import { DefaultStreamProcessor } from '@vestara/stream';

/**
 * REASONING-BOUNDARY-001: bound helper for accumulating provider-emitted
 * reasoning. Content and reasoning accumulate on disjoint chunk types —
 * reasoning never enters the conversational content, content never enters
 * reasoning. No parsing, no heuristics.
 */
function appendReasoning(current: string, delta: string): string {
  return truncateReasoning(current + delta);
}

export interface ProviderExecutor {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
}

/** Durable execution persistence capability owned by the conversation store. */
export interface AssistantExecutionStore {
  createExecution(record: AssistantExecutionRecord): Promise<void>;
  getExecution(executionId: ExecutionId): Promise<AssistantExecutionRecord | null>;
  listActiveExecutions(conversationId: string): Promise<readonly AssistantExecutionRecord[]>;
  updateExecutionStatus(executionId: ExecutionId, status: ExecutionStatus, updatedAt: string): Promise<void>;
  updateExecutionRuntime(
    executionId: ExecutionId,
    runtime: AssistantRuntimeCorrelation,
    updatedAt: string,
  ): Promise<void>;
  updateExecutionObservation(
    executionId: ExecutionId,
    observation: AssistantExecutionObservationReference,
    updatedAt: string,
  ): Promise<void>;
  attachExecutionResult(executionId: ExecutionId, result: ExecutionResult, updatedAt: string): Promise<void>;
}

/**
 * Persistence boundary for conversations. `DefaultConversationService` keeps an
 * in-memory map by default; pass a store (e.g. the SQLite store in
 * `@vestara/conversation-runtime`) to survive restart. All mutations flow
 * through the service as the single writer.
 */
export interface ConversationStore {
  create(conversation: Conversation): Promise<void>;
  get(id: string): Promise<Conversation | null>;
  getConversation(
    id: string,
    options?: { limit?: number; offset?: number; order?: 'asc' | 'desc' },
  ): Promise<Conversation | null>;
  list(userId: string): Promise<ConversationSummary[]>;
  /** VES-PERF-001C: bounded summary page for conversation history. */
  listPage(userId: string, options?: { limit?: number; offset?: number }): Promise<ConversationListPage>;
  addMessage(conversationId: string, message: Message): Promise<void>;
  setStatus(id: string, status: Conversation['status']): Promise<void>;
  updateTitle(id: string, title: string): Promise<void>;
  updateRuntimeSessionId(id: string, runtimeSessionId: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Optional for legacy/in-memory consumers; required by the API store. */
  readonly executionStore?: AssistantExecutionStore;
}

/**
 * VES-PERF-001C: a bounded, metadata-only page of conversation summaries.
 * Never contains message bodies — history stays a lightweight projection.
 */
export interface ConversationListPage {
  conversations: ConversationSummary[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface ConversationService {
  createConversation(userId?: string, options?: { runtimeSessionId?: string; agentId?: string }): Promise<Conversation>;
  sendMessage(conversationId: string, content: string, options?: SendOptions): Promise<SendResult>;
  closeConversation(conversationId: string): Promise<void>;
  listConversations(userId?: string): Promise<ConversationSummary[]>;
  /** VES-PERF-001C: bounded summary page (metadata only; never message bodies). */
  listConversationsPage(userId?: string, options?: { limit?: number; offset?: number }): Promise<ConversationListPage>;
  getConversation(
    id: string,
    options?: { limit?: number; offset?: number; order?: 'asc' | 'desc' },
  ): Promise<Conversation | null>;
  deleteConversation(id: string): Promise<void>;
  sendMessageStream(conversationId: string, content: string, options?: SendOptions): AsyncIterable<StreamChunk>;
}

export interface SendOptions {
  model?: string;
  /** Selected assistant execution runtime. Defaults to OpenCode. */
  assistantRuntime?: 'opencode' | 'codex';
  /**
   * Target agent identity (e.g. 'agent-planner') — who the turn is addressed
   * to. Selects execution configuration only; NEVER the message author.
   * The author is always the conversation's userId (human principal).
   */
  agentId?: string;
  /**
   * Client/surface attribution (e.g. 'workspace-ui') — where the human
   * principal acted from. Informational only; never principal identity.
   */
  surface?: string;
  /**
   * GA-RUNTIME-001: requested upstream provider ID (browser selection).
   * Bounded server-side; never trusted as execution authority.
   */
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** Trusted turn-time surface context (GA-CONTEXT-002). Optional, turn-scoped. */
  surfaceContext?: import('@vestara/shared').TurnSurfaceContext;
  /** OpenCode session ID for session reuse. When set, the adapter reuses the existing session. */
  runtimeSessionId?: string;
  /** GA-RUNTIME-001: caller-controlled cancellation (client disconnect / stop). */
  signal?: AbortSignal;
  /**
   * GA-EXEC-001: per-turn execution configuration (turnTimeoutMs,
   * maxOperations, maxToolCalls). Passed through to the provider executor
   * so the adapter can enforce Vestara-owned limits.
   */
  executionConfig?: import('@vestara/shared').GAExecutionConfig;
  /** Canonical initiator attribution; never an authorization grant. */
  actor?: ExecutionActor;
  /** Authorized, bounded identity projection; absent remains UNKNOWN. */
  assistantIdentity?: import('@vestara/shared').AssistantIdentityContext;
}

export interface SendResult {
  message: Message;
  response: Message;
  latency: number;
}

let conversationCounter = 0;
let messageCounter = 0;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++messageCounter}`;
}

function generateExecutionId(): ExecutionId {
  return generateId('exec') as ExecutionId;
}

function terminalStatusFor(
  executionResult: Message['executionResult'] | undefined,
  signal: AbortSignal | undefined,
): 'completed' | 'failed' | 'cancelled' | 'timed_out' {
  if (signal?.aborted) return 'cancelled';
  switch (executionResult?.termination) {
    case 'cancelled':
      return 'cancelled';
    case 'timeout':
      return 'timed_out';
    case 'failed':
      return 'failed';
    default:
      return 'completed';
  }
}

function runtimeCorrelation(
  runtime: SendOptions['assistantRuntime'],
  runtimeSessionId: string,
  providerId?: string,
  modelId?: string,
): AssistantRuntimeCorrelation {
  if (runtime === 'codex') {
    const threadId = runtimeSessionId.startsWith('codex:') ? runtimeSessionId.slice('codex:'.length) : undefined;
    return {
      runtimeId: 'codex',
      ...(threadId ? { threadId } : {}),
      runtimeSessionId: runtimeSessionId as RuntimeSessionId,
      ...(providerId ? { providerId } : {}),
      ...(modelId ? { modelId } : {}),
    };
  }
  return {
    runtimeId: 'opencode',
    sessionId: runtimeSessionId,
    runtimeSessionId: runtimeSessionId as RuntimeSessionId,
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
  };
}

export class DefaultConversationService implements ConversationService {
  private conversations: Map<string, Conversation> = new Map();
  private contextAssembler: ContextAssembler;
  private providerExecutor: ProviderExecutor;
  private eventBus?: EventBus;
  private logger?: Logger;
  private store?: ConversationStore;

  constructor(options: {
    contextAssembler: ContextAssembler;
    providerExecutor: ProviderExecutor;
    eventBus?: EventBus;
    logger?: Logger;
    store?: ConversationStore;
  }) {
    this.contextAssembler = options.contextAssembler;
    this.providerExecutor = options.providerExecutor;
    this.eventBus = options.eventBus;
    this.logger = options.logger?.child({ component: 'conversation' });
    this.store = options.store;
  }

  /** Unbounded load — caches the complete conversation for internal operations. */
  private async loadIntoMemory(id: string): Promise<Conversation | null> {
    if (!this.store) return this.conversations.get(id) ?? null;
    const persisted = await this.store.get(id);
    if (persisted) this.conversations.set(id, persisted);
    return persisted ?? this.conversations.get(id) ?? null;
  }

  /**
   * VES-PERF-001B: bounded window read. Never overwrites the in-memory cache
   * with a partial window — the cache must always hold the complete conversation.
   */
  private async loadConversationWindow(
    id: string,
    options: { limit?: number; offset?: number; order?: 'asc' | 'desc' },
  ): Promise<Conversation | null> {
    if (!this.store) {
      const cached = this.conversations.get(id) ?? null;
      return cached ? windowConversation(cached, options) : null;
    }
    return this.store.getConversation(id, options);
  }

  /**
   * Allocate and durably register the assistant response before runtime
   * submission. Store-less consumers retain their legacy behavior; the API's
   * persistent conversation store supplies this capability.
   */
  private async beginAssistantExecution(
    conversationId: string,
    assistantMessageId: string,
  ): Promise<{ executionId: ExecutionId; requestedAt: string } | undefined> {
    const store = this.store?.executionStore;
    if (!store) return undefined;
    const executionId = generateExecutionId();
    const requestedAt = new Date().toISOString();
    await store.createExecution({
      executionId,
      conversationId,
      assistantMessageId,
      status: 'requested',
      requestedAt,
      updatedAt: requestedAt,
    });
    await store.updateExecutionStatus(executionId, 'binding', new Date().toISOString());
    await store.updateExecutionStatus(executionId, 'ready', new Date().toISOString());
    return { executionId, requestedAt };
  }

  private async markExecutionRunning(executionId: ExecutionId, store: AssistantExecutionStore): Promise<void> {
    await store.updateExecutionStatus(executionId, 'running', new Date().toISOString());
  }

  private async attachRuntimeCorrelation(
    executionId: ExecutionId,
    store: AssistantExecutionStore,
    runtime: SendOptions['assistantRuntime'],
    runtimeSessionId: string | undefined,
    providerId?: string,
    modelId?: string,
  ): Promise<void> {
    if (!runtimeSessionId) return;
    await store.updateExecutionRuntime(
      executionId,
      runtimeCorrelation(runtime, runtimeSessionId, providerId, modelId),
      new Date().toISOString(),
    );
  }

  private async settleExecution(
    executionId: ExecutionId,
    store: AssistantExecutionStore,
    input: {
      readonly status: 'completed' | 'failed' | 'cancelled' | 'timed_out';
      readonly requestedAt: string;
      readonly startedAt: string;
      readonly output?: string;
      readonly error?: string;
    },
  ): Promise<void> {
    const completedAt = new Date().toISOString();
    const result: ExecutionResult = {
      id: executionId,
      status: input.status,
      ...(input.output ? { output: input.output } : {}),
      artifacts: [],
      evidence: [],
      timing: {
        requestedAt: input.requestedAt,
        startedAt: input.startedAt,
        completedAt,
        durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(input.startedAt)),
      },
      ...(input.error
        ? { error: { code: input.status, message: input.error, recoverable: input.status === 'failed' } }
        : {}),
    };
    await store.attachExecutionResult(executionId, result, completedAt);
  }

  async createConversation(
    userId = 'local',
    options?: { runtimeSessionId?: string; agentId?: string },
  ): Promise<Conversation> {
    const id = generateId('conv');
    const now = new Date().toISOString();

    const conversation: Conversation = {
      id,
      userId,
      // GA-4.4: target/owning agent recorded separately — userId stays the human principal.
      ...(options?.agentId ? { agentId: options.agentId } : {}),
      title: `Conversation ${++conversationCounter}`,
      messages: [],
      status: 'active',
      ...(options?.runtimeSessionId ? { runtimeSessionId: options.runtimeSessionId } : {}),
      createdAt: now,
      updatedAt: now,
    };

    this.conversations.set(id, conversation);
    await this.store?.create(conversation);

    await this.eventBus?.emit({
      type: 'conversation:created',
      source: 'conversation-service',
      payload: { conversationId: id, userId, title: conversation.title },
      // ARX-015 M2: conversationId is not an execution identity — correlation absent (fail-closed)
      metadata: {},
    });

    this.logger?.info('Conversation created', {
      conversationId: id,
      title: conversation.title,
    });

    return conversation;
  }

  async sendMessage(conversationId: string, content: string, options: SendOptions = {}): Promise<SendResult> {
    const conversation = await this.loadIntoMemory(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);
    if (conversation.status !== 'active') throw new Error('Conversation is not active');

    // Create user message
    const userMessage: Message = {
      id: generateId('msg'),
      conversationId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(userMessage);
    conversation.updatedAt = userMessage.createdAt;
    await this.store?.addMessage(conversationId, userMessage);

    // Allocate and persist execution authority immediately after the human
    // message and before any runtime-facing event or invocation.
    const assistantMessageId = generateId('msg');
    const execution = await this.beginAssistantExecution(conversationId, assistantMessageId);
    const executionStore = this.store?.executionStore;

    await this.eventBus?.emit({
      type: 'conversation:message.sent',
      source: 'conversation-service',
      // Principal (conversation.userId) stays the author; target/surface ride
      // the payload so ingestion never conflates them into authorship.
      payload: {
        conversationId,
        messageId: userMessage.id,
        content,
        ...(options.agentId ? { targetAgentId: options.agentId } : {}),
        ...(options.surface ? { surface: options.surface } : {}),
      },
      actor: { id: conversation.userId, role: 'user' },
      metadata: execution ? { executionId: execution.executionId } : {},
    });

    this.logger?.info('Message sent', {
      conversationId,
      messageId: userMessage.id,
      contentLength: content.length,
    });

    // Build context and send to provider
    // GA-RUNTIME-001: feed the stored runtime session ID (if the caller did not
    // supply one) so subsequent turns reuse the conversation's OpenCode session.
    const runtimeSessionId = options.runtimeSessionId ?? conversation.runtimeSessionId;
    const request = this.contextAssembler.buildContext(conversation, content, {
      ...options,
      runtimeSessionId,
      ...(execution ? { executionId: execution.executionId, assistantMessageId } : {}),
    });

    await this.eventBus?.emit({
      type: 'conversation:provider.request.started',
      source: 'conversation-service',
      payload: {
        conversationId,
        model: request.model,
        ...(options.agentId ? { agentId: options.agentId } : {}),
      },
      metadata: execution ? { executionId: execution.executionId } : {},
    });

    const startTime = performance.now();
    const executionStartedAt = new Date().toISOString();
    let responseContent = '';
    let responseTokens = 0;
    let responseProvider = 'opencode';
    let responseModel: string | undefined;
    let responseExecutionResult: Message['executionResult'];
    let responseError: string | undefined;
    // REASONING-BOUNDARY-001: provider-emitted reasoning, structurally
    // separate from content (complete-path executor returns it on the
    // response envelope, never inside content).
    let responseReasoning: string | undefined;
    // GA-RUNTIME-001: the session actually used for this turn (may be created
    // by the executor on the first turn). Persisted so later turns reuse it.
    let turnRuntimeSessionId = runtimeSessionId;

    if (execution && executionStore) await this.markExecutionRunning(execution.executionId, executionStore);
    if (execution && executionStore && turnRuntimeSessionId) {
      await this.attachRuntimeCorrelation(
        execution.executionId,
        executionStore,
        options.assistantRuntime,
        turnRuntimeSessionId,
      );
    }
    try {
      const response = await this.providerExecutor.complete(request);
      responseContent = response.content;
      responseTokens = response.usage.totalTokens;
      responseProvider = response.provider ?? responseProvider;
      responseModel = response.model;
      responseReasoning = response.reasoning ? truncateReasoning(response.reasoning) : undefined;
      responseExecutionResult = response.executionResult;
      turnRuntimeSessionId = response.resolution?.runtimeSessionId ?? turnRuntimeSessionId;

      if (execution && executionStore) {
        await this.attachRuntimeCorrelation(
          execution.executionId,
          executionStore,
          options.assistantRuntime,
          turnRuntimeSessionId,
          response.provider,
          response.model,
        );
      }

      await this.eventBus?.emit({
        type: 'conversation:provider.response.completed',
        source: 'conversation-service',
        payload: {
          conversationId,
          model: response.model,
          provider: response.provider,
          latency: response.latency,
          tokens: response.usage.totalTokens,
        },
        metadata: {},
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Provider call failed';
      responseContent = `Error: ${msg}`;
      responseError = msg;

      await this.eventBus?.emit({
        type: 'conversation:provider.error',
        source: 'conversation-service',
        payload: { conversationId, error: msg },
        metadata: {},
      });
    }

    const latency = Math.round(performance.now() - startTime);

    // Create assistant response message
    const responseMessage: Message = {
      id: assistantMessageId,
      conversationId,
      role: 'assistant',
      content: responseContent,
      provider: responseProvider,
      ...(responseModel ? { model: responseModel } : {}),
      tokens: responseTokens,
      latency,
      createdAt: new Date().toISOString(),
      // REASONING-BOUNDARY-001: diagnostic reasoning rides alongside the
      // message, never inside the conversational content.
      ...(responseReasoning ? { reasoning: responseReasoning } : {}),
      ...(responseExecutionResult ? { executionResult: responseExecutionResult } : {}),
    };
    conversation.messages.push(responseMessage);
    conversation.updatedAt = responseMessage.createdAt;
    await this.store?.addMessage(conversationId, responseMessage);

    // GA-RUNTIME-001: persist the OpenCode session that carried this turn so
    // later turns reuse it (conversation identity owns continuity).
    if (turnRuntimeSessionId && turnRuntimeSessionId !== conversation.runtimeSessionId) {
      conversation.runtimeSessionId = turnRuntimeSessionId;
      await this.store?.updateRuntimeSessionId(conversationId, turnRuntimeSessionId);
    }

    if (execution && executionStore) {
      const terminalStatus = responseError
        ? options.signal?.aborted
          ? 'cancelled'
          : 'failed'
        : terminalStatusFor(responseExecutionResult, options.signal);
      await this.settleExecution(execution.executionId, executionStore, {
        status: terminalStatus,
        requestedAt: execution.requestedAt,
        startedAt: executionStartedAt,
        output: responseContent,
        ...(responseError ? { error: responseError } : {}),
      });
      await executionStore.updateExecutionStatus(execution.executionId, terminalStatus, new Date().toISOString());
    }

    await this.eventBus?.emit({
      type: 'conversation:response.completed',
      source: 'conversation-service',
      payload: {
        conversationId,
        messageId: responseMessage.id,
        ...(options.agentId ? { agentId: options.agentId } : {}),
        contentLength: responseMessage.content.length,
        tokens: responseMessage.tokens,
        latency: responseMessage.latency,
        contentPreview: boundedContentPreview(responseMessage.content),
      },
      metadata: execution ? { executionId: execution.executionId } : {},
    });

    this.logger?.info('Response completed', {
      conversationId,
      messageId: responseMessage.id,
      latency: `${latency}ms`,
      tokens: responseTokens,
    });

    return { message: userMessage, response: responseMessage, latency };
  }

  async *sendMessageStream(
    conversationId: string,
    content: string,
    options: SendOptions = {},
  ): AsyncIterable<StreamChunk> {
    const conversation = await this.loadIntoMemory(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);
    if (conversation.status !== 'active') throw new Error('Conversation is not active');

    // Create user message
    const userMessage: Message = {
      id: generateId('msg'),
      conversationId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(userMessage);
    conversation.updatedAt = userMessage.createdAt;
    await this.store?.addMessage(conversationId, userMessage);

    const assistantMessageId = generateId('msg');
    const execution = await this.beginAssistantExecution(conversationId, assistantMessageId);
    const executionStore = this.store?.executionStore;

    // Persist resolved title: if title is still the counter default ("Conversation N"),
    // derive a meaningful title from the first user message and write it back to SQLite.
    if (/^Conversation \d+$/.test(conversation.title) && content.trim()) {
      const singleLine = content.replace(/\s+/g, ' ').trim();
      const resolvedTitle = singleLine.length <= 48 ? singleLine : `${singleLine.slice(0, 48).trimEnd()}…`;
      conversation.title = resolvedTitle;
      await this.store?.updateTitle(conversationId, resolvedTitle);
    }

    await this.eventBus?.emit({
      type: 'conversation:message.sent',
      source: 'conversation-service',
      // Same principal/target/surface split as sendMessage (streaming path).
      payload: {
        conversationId,
        messageId: userMessage.id,
        content,
        ...(options.agentId ? { targetAgentId: options.agentId } : {}),
        ...(options.surface ? { surface: options.surface } : {}),
      },
      actor: { id: conversation.userId, role: 'user' },
      metadata: execution ? { executionId: execution.executionId } : {},
    });

    // Build context
    // GA-RUNTIME-001: feed the stored runtime session ID (if the caller did not
    // supply one) so subsequent turns reuse the conversation's OpenCode session.
    const runtimeSessionId = options.runtimeSessionId ?? conversation.runtimeSessionId;
    const request = this.contextAssembler.buildContext(conversation, content, {
      ...options,
      runtimeSessionId,
      ...(execution ? { executionId: execution.executionId, assistantMessageId } : {}),
    });

    await this.eventBus?.emit({
      type: 'conversation:provider.request.started',
      source: 'conversation-service',
      payload: {
        conversationId,
        model: request.model,
        ...(options.agentId ? { agentId: options.agentId } : {}),
      },
      metadata: execution ? { executionId: execution.executionId } : {},
    });

    let fullContent = '';
    let totalTokens = 0;
    let responseProvider = 'opencode';
    let responseModel: string | undefined;
    let responseExecutionResult: Message['executionResult'];
    let responseError: string | undefined;
    // REASONING-BOUNDARY-001: provider-emitted reasoning accumulates on a
    // disjoint channel — fullContent (final text) never receives it.
    let reasoningContent = '';
    // GA-RUNTIME-001: the session actually used for this turn (may be created
    // by the executor on the first turn). Persisted so later turns reuse it.
    let turnRuntimeSessionId = runtimeSessionId;
    // GA-CTX-001: collect tool observations across the turn
    const toolObservations: ToolObservation[] = [];
    const startTime = performance.now();
    const executionStartedAt = new Date().toISOString();

    if (execution && executionStore) await this.markExecutionRunning(execution.executionId, executionStore);
    if (execution && executionStore && turnRuntimeSessionId) {
      await this.attachRuntimeCorrelation(
        execution.executionId,
        executionStore,
        options.assistantRuntime,
        turnRuntimeSessionId,
      );
    }
    try {
      for await (const chunk of this.providerExecutor.stream(request)) {
        if (chunk.metadata?.runtimeSessionId) {
          turnRuntimeSessionId = chunk.metadata.runtimeSessionId;
          if (execution && executionStore) {
            await this.attachRuntimeCorrelation(
              execution.executionId,
              executionStore,
              options.assistantRuntime,
              turnRuntimeSessionId,
              chunk.metadata.provider,
              chunk.metadata.model,
            );
          }
        }
        if (chunk.type === 'text' && chunk.content) {
          fullContent += chunk.content;
          responseProvider = chunk.metadata?.provider ?? responseProvider;
          responseModel = chunk.metadata?.model ?? responseModel;
          yield chunk;
        } else if (chunk.type === 'meta' && chunk.metadata.usage) {
          totalTokens = chunk.metadata.usage.totalTokens;
          responseProvider = chunk.metadata.provider ?? responseProvider;
          responseModel = chunk.metadata.model ?? responseModel;
          responseExecutionResult = chunk.metadata.executionResult ?? responseExecutionResult;
          yield chunk;
        } else if (chunk.type === 'error') {
          responseError = chunk.content ?? 'Stream failed';
          yield chunk;
        } else if (chunk.type === 'complete') {
          responseProvider = chunk.metadata.provider ?? responseProvider;
          responseModel = chunk.metadata.model ?? responseModel;
          responseExecutionResult = chunk.metadata.executionResult ?? responseExecutionResult;
        } else if (chunk.type === 'reasoning') {
          // REASONING-BOUNDARY-001: accumulate separately (bounded) and pass
          // through for live diagnostic display — never into fullContent.
          if (chunk.content) reasoningContent = appendReasoning(reasoningContent, chunk.content);
          yield chunk;
        } else if (chunk.type === 'tool_call' || chunk.type === 'tool_result') {
          // GA-CTX-001: collect tool observations for persistence.
          // GA-TOOL-UX-001B: explicit lifecycle upsert — a terminal
          // observation for a known operationId replaces its running
          // projection (one durable snapshot per operation; running
          // evidence persists only when no terminal arrived).
          const observation = chunkToObservation(chunk);
          if (observation) upsertObservation(toolObservations, observation);
          yield chunk; // pass through
        } else if (chunk.type === 'status' || chunk.type === 'citation') {
          yield chunk; // pass through
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Stream failed';
      yield new DefaultStreamProcessor().error(msg);
      fullContent = `Error: ${msg}`;
      responseError = msg;
    }

    const latency = Math.round(performance.now() - startTime);

    // Create assistant response message
    const responseMessage: Message = {
      id: assistantMessageId,
      conversationId,
      role: 'assistant',
      content: fullContent,
      provider: responseProvider,
      ...(responseModel ? { model: responseModel } : {}),
      tokens: totalTokens,
      latency,
      createdAt: new Date().toISOString(),
      // GA-CTX-001: persist tool observations for subsequent-turn context
      ...(toolObservations.length > 0 ? { toolObservations } : {}),
      // REASONING-BOUNDARY-001: diagnostic reasoning alongside the message,
      // never inside the conversational content.
      ...(reasoningContent ? { reasoning: reasoningContent } : {}),
      ...(responseExecutionResult ? { executionResult: responseExecutionResult } : {}),
    };
    conversation.messages.push(responseMessage);
    conversation.updatedAt = responseMessage.createdAt;
    await this.store?.addMessage(conversationId, responseMessage);

    // GA-RUNTIME-001: persist the OpenCode session that carried this turn so
    // later turns reuse it (conversation identity owns continuity).
    if (turnRuntimeSessionId && turnRuntimeSessionId !== conversation.runtimeSessionId) {
      conversation.runtimeSessionId = turnRuntimeSessionId;
      await this.store?.updateRuntimeSessionId(conversationId, turnRuntimeSessionId);
    }

    if (execution && executionStore) {
      const terminalStatus = responseError
        ? options.signal?.aborted
          ? 'cancelled'
          : 'failed'
        : terminalStatusFor(responseExecutionResult, options.signal);
      await this.settleExecution(execution.executionId, executionStore, {
        status: terminalStatus,
        requestedAt: execution.requestedAt,
        startedAt: executionStartedAt,
        output: fullContent,
        ...(responseError ? { error: responseError } : {}),
      });
      await executionStore.updateExecutionStatus(execution.executionId, terminalStatus, new Date().toISOString());
    }

    await this.eventBus?.emit({
      type: 'conversation:response.completed',
      source: 'conversation-service',
      payload: {
        conversationId,
        messageId: responseMessage.id,
        ...(options.agentId ? { agentId: options.agentId } : {}),
        contentLength: responseMessage.content.length,
        tokens: responseMessage.tokens,
        latency: responseMessage.latency,
        contentPreview: boundedContentPreview(responseMessage.content),
      },
      metadata: execution ? { executionId: execution.executionId } : {},
    });

    yield new DefaultStreamProcessor().complete({
      conversationId,
      provider: responseMessage.provider,
      model: responseMessage.model,
    });
  }

  async closeConversation(conversationId: string): Promise<void> {
    const conversation = await this.loadIntoMemory(conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    conversation.status = 'archived';
    conversation.updatedAt = new Date().toISOString();
    await this.store?.setStatus(conversationId, 'archived');

    await this.eventBus?.emit({
      type: 'conversation:archived',
      source: 'conversation-service',
      payload: { conversationId, messageCount: conversation.messages.length },
      metadata: {},
    });
  }

  async listConversations(userId = 'local'): Promise<ConversationSummary[]> {
    if (this.store) return this.store.list(userId);
    return Array.from(this.conversations.values())
      .filter((c) => c.status !== 'deleted')
      .map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c.messages.length,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        runtimeSessionId: c.runtimeSessionId,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listConversationsPage(
    userId = 'local',
    options?: { limit?: number; offset?: number },
  ): Promise<ConversationListPage> {
    if (this.store) return this.store.listPage(userId, options);

    const all = Array.from(this.conversations.values())
      .filter((c) => c.status !== 'deleted')
      .map<ConversationSummary>((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c.messages.length,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        runtimeSessionId: c.runtimeSessionId,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const limit = options?.limit ?? 25;
    const offset = options?.offset ?? 0;
    return {
      conversations: all.slice(offset, offset + limit),
      total: all.length,
      offset,
      limit,
      hasMore: offset + limit < all.length,
    };
  }

  async getConversation(
    id: string,
    options?: { limit?: number; offset?: number; order?: 'asc' | 'desc' },
  ): Promise<Conversation | null> {
    return this.loadConversationWindow(id, options ?? {});
  }

  async deleteConversation(id: string): Promise<void> {
    if (this.store) await this.store.remove(id);
    this.conversations.delete(id);
  }
}

/**
 * VES-PERF-001B: apply a bounded window to an in-memory conversation.
 *
 * Mirrors the SQL semantics used by the persistent store so the in-memory
 * (store-less) path returns the same shape and ordering.
 */
function windowConversation(
  conversation: Conversation,
  options: { limit?: number; offset?: number; order?: 'asc' | 'desc' },
): Conversation {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  const newestFirst = (options.order ?? 'desc') === 'desc';

  // Newest-first: reverse → window → reverse back, so the window is always
  // returned in chronological order.
  const window = newestFirst
    ? [...conversation.messages]
        .reverse()
        .slice(offset, offset + limit)
        .reverse()
    : conversation.messages.slice(offset, offset + limit);

  const total = conversation.messages.length;
  return {
    ...conversation,
    messages: window,
    _pagination: {
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    },
  };
}

// ─── GA-CTX-001: Tool Observation Helpers ────────────────────

/**
 * Maximum content length for a tool observation.
 * Large outputs are truncated to bounded context.
 */
const MAX_OBSERVATION_CONTENT = 2000;

/**
 * Convert a StreamChunk (tool_call or tool_result) into a ToolObservation.
 * Bounded: large content is truncated, not copied verbatim.
 *
 * GA-TOOL-UX-001B lifecycle model (explicit domain decision):
 * - Durable operation identity is `detail.operationId` (the OpenCode
 *   `callID` when the runtime supplied it) — never the transport chunk id.
 *   `toolCallId` carries the operationId when known, else the chunk id.
 * - `tool_call` projects a `running` observation (request context only);
 *   `tool_result` projects the terminal observation. The caller upserts by
 *   operationId so one operation persists one terminal snapshot.
 * - Structured `read` evidence rides `detail` (kind `read`); every other
 *   tool stays `generic`. Unknown tools remain generic — never guessed.
 */
export function chunkToObservation(chunk: StreamChunk): ToolObservation | undefined {
  const detail = chunk.detail;
  const operationId = detail?.operationId;
  const toolName = chunk.name ?? detail?.tool ?? 'unknown';
  const timestamp = chunk.metadata.timestamp;
  const readDetail = detail?.kind === 'read' ? detail : undefined;
  const editDetail = detail?.kind === 'edit' ? detail : undefined;
  const writeDetail = detail?.kind === 'write' ? detail : undefined;

  if (chunk.type === 'tool_call') {
    return {
      toolCallId: operationId ?? chunk.id,
      ...(operationId ? { operationId } : {}),
      ...(readDetail ? { observationKind: 'read' as const, read: readDetail } : {}),
      ...(editDetail ? { observationKind: 'edit' as const, edit: editDetail } : {}),
      ...(writeDetail ? { observationKind: 'write' as const, write: writeDetail } : {}),
      toolName,
      status: 'running',
      timestamp,
      content: '',
    };
  }

  if (chunk.type === 'tool_result') {
    const state = detail?.state;
    const status: ToolObservation['status'] =
      state === 'failed'
        ? 'failed'
        : state === 'running'
          ? 'running'
          : state === 'completed'
            ? 'completed'
            : chunk.content?.startsWith('Error:')
              ? 'failed'
              : 'completed';
    // Read evidence comes from the structured detail (parsed server-side),
    // never from the bounded chunk-content projection.
    const content = readDetail?.contentPreview ?? truncate(chunk.content ?? '', MAX_OBSERVATION_CONTENT);
    const error =
      status === 'failed'
        ? truncate(
            detail && 'error' in detail && typeof detail.error === 'string' ? detail.error : content,
            MAX_OBSERVATION_CONTENT,
          )
        : undefined;
    return {
      toolCallId: operationId ?? chunk.id,
      ...(operationId ? { operationId } : {}),
      ...(readDetail ? { observationKind: 'read' as const, read: readDetail } : {}),
      ...(editDetail ? { observationKind: 'edit' as const, edit: editDetail } : {}),
      ...(writeDetail ? { observationKind: 'write' as const, write: writeDetail } : {}),
      toolName,
      status,
      timestamp,
      content,
      ...(error ? { error } : {}),
    };
  }

  return undefined;
}

/**
 * Explicit lifecycle upsert for persisted tool observations.
 *
 * One durable entry per `operationId`: a newer observation for a known
 * operation replaces the earlier one, except a stale `running` projection
 * never clobbers terminal evidence. The runtime may emit several running
 * projections for one operation (progress updates) before the terminal —
 * only the latest running projection is kept until the terminal arrives.
 * Running projections without a later terminal (aborted/detached turns)
 * are preserved. Observations without an operationId (legacy
 * transport-only identity) always append.
 */
function hasStructuredEdit(observation: ToolObservation): observation is ToolObservation & {
  readonly observationKind: 'edit';
  readonly edit: NonNullable<ToolObservation['edit']>;
} {
  return (
    observation.observationKind === 'edit' &&
    observation.edit?.kind === 'edit' &&
    observation.operationId !== undefined &&
    observation.edit.operationId === observation.operationId
  );
}

function hasStructuredWrite(observation: ToolObservation): observation is ToolObservation & {
  readonly observationKind: 'write';
  readonly write: NonNullable<ToolObservation['write']>;
} {
  return (
    observation.observationKind === 'write' &&
    observation.write?.kind === 'write' &&
    observation.operationId !== undefined &&
    observation.write.operationId === observation.operationId
  );
}

function hasStructuredFileMutation(observation: ToolObservation): boolean {
  return hasStructuredEdit(observation) || hasStructuredWrite(observation);
}

/** Upsert one lifecycle snapshot without discarding same-operation edit evidence. */
export function upsertObservation(list: ToolObservation[], observation: ToolObservation): void {
  const operationId = observation.operationId;
  if (operationId) {
    const index = list.findIndex((entry) => entry.operationId === operationId);
    if (index >= 0) {
      const existing = list[index];
      const existingTerminal =
        existing.status === 'completed' || existing.status === 'failed' || existing.status === 'denied';
      const incomingTerminal =
        observation.status === 'completed' || observation.status === 'failed' || observation.status === 'denied';
      if (incomingTerminal || !existingTerminal) {
        list[index] =
          !hasStructuredFileMutation(observation) && hasStructuredFileMutation(existing)
            ? hasStructuredEdit(existing)
              ? { ...observation, observationKind: 'edit', edit: existing.edit }
              : { ...observation, observationKind: 'write', write: existing.write }
            : observation;
        return;
      }
      return;
    }
  }
  list.push(observation);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [truncated, ${text.length} chars total]`;
}

/**
 * AR-DOGFOOD-009: Bounded content preview for Activity Room projection.
 * Maximum 200 characters, cut at word boundary when practical.
 * Empty/whitespace-only content returns undefined (caller falls back to neutral message).
 */
const CONTENT_PREVIEW_MAX = 200;

function boundedContentPreview(content: string): string | undefined {
  const trimmed = content.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length <= CONTENT_PREVIEW_MAX) return trimmed;
  const slice = trimmed.slice(0, CONTENT_PREVIEW_MAX);
  const boundary = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
  return boundary > CONTENT_PREVIEW_MAX * 0.5 ? slice.slice(0, boundary) : slice;
}
