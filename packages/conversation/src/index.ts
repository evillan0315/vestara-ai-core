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
import type { Logger } from '@vestara/logger';
import type {
  CompletionRequest,
  CompletionResponse,
  Conversation,
  ConversationSummary,
  Message,
  StreamChunk,
} from '@vestara/shared';
import { DefaultStreamProcessor } from '@vestara/stream';

export interface ProviderExecutor {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
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
  list(userId: string): Promise<ConversationSummary[]>;
  addMessage(conversationId: string, message: Message): Promise<void>;
  setStatus(id: string, status: Conversation['status']): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ConversationService {
  createConversation(userId?: string): Promise<Conversation>;
  sendMessage(conversationId: string, content: string, options?: SendOptions): Promise<SendResult>;
  closeConversation(conversationId: string): Promise<void>;
  listConversations(userId?: string): Promise<ConversationSummary[]>;
  getConversation(id: string): Promise<Conversation | null>;
  deleteConversation(id: string): Promise<void>;
  sendMessageStream(conversationId: string, content: string, options?: SendOptions): AsyncIterable<StreamChunk>;
}

export interface SendOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  /** Trusted turn-time surface context (GA-CONTEXT-002). Optional, turn-scoped. */
  surfaceContext?: import('@vestara/shared').TurnSurfaceContext;
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

  private async loadIntoMemory(id: string): Promise<Conversation | null> {
    if (!this.store) return this.conversations.get(id) ?? null;
    const persisted = await this.store.get(id);
    if (persisted) this.conversations.set(id, persisted);
    return persisted ?? this.conversations.get(id) ?? null;
  }

  async createConversation(userId = 'local'): Promise<Conversation> {
    const id = generateId('conv');
    const now = new Date().toISOString();

    const conversation: Conversation = {
      id,
      userId,
      title: `Conversation ${++conversationCounter}`,
      messages: [],
      status: 'active',
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

    await this.eventBus?.emit({
      type: 'conversation:message.sent',
      source: 'conversation-service',
      payload: { conversationId, messageId: userMessage.id, content },
      metadata: {},
    });

    this.logger?.info('Message sent', {
      conversationId,
      messageId: userMessage.id,
      contentLength: content.length,
    });

    // Build context and send to provider
    const request = this.contextAssembler.buildContext(conversation, content, options);

    await this.eventBus?.emit({
      type: 'conversation:provider.request.started',
      source: 'conversation-service',
      payload: { conversationId, model: request.model },
      metadata: {},
    });

    const startTime = performance.now();
    let responseContent = '';
    let responseTokens = 0;
    let responseProvider = 'opencode';
    let responseModel = request.model;

    try {
      const response = await this.providerExecutor.complete(request);
      responseContent = response.content;
      responseTokens = response.usage.totalTokens;
      responseProvider = response.provider ?? responseProvider;
      responseModel = response.model ?? responseModel;

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
      id: generateId('msg'),
      conversationId,
      role: 'assistant',
      content: responseContent,
      provider: responseProvider,
      model: responseModel,
      tokens: responseTokens,
      latency,
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(responseMessage);
    conversation.updatedAt = responseMessage.createdAt;
    await this.store?.addMessage(conversationId, responseMessage);

    await this.eventBus?.emit({
      type: 'conversation:response.completed',
      source: 'conversation-service',
      payload: {
        conversationId,
        messageId: responseMessage.id,
        contentLength: responseMessage.content.length,
        tokens: responseMessage.tokens,
        latency: responseMessage.latency,
      },
      metadata: {},
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

    await this.eventBus?.emit({
      type: 'conversation:message.sent',
      source: 'conversation-service',
      payload: { conversationId, messageId: userMessage.id, content },
      metadata: {},
    });

    // Build context
    const request = this.contextAssembler.buildContext(conversation, content, options);

    await this.eventBus?.emit({
      type: 'conversation:provider.request.started',
      source: 'conversation-service',
      payload: { conversationId, model: request.model },
      metadata: {},
    });

    let fullContent = '';
    let totalTokens = 0;
    let responseProvider = 'opencode';
    let responseModel = request.model;
    const startTime = performance.now();

    try {
      for await (const chunk of this.providerExecutor.stream(request)) {
        if (chunk.type === 'text' && chunk.content) {
          fullContent += chunk.content;
          responseProvider = chunk.metadata?.provider ?? responseProvider;
          responseModel = chunk.metadata?.model ?? responseModel;
          yield chunk;
        } else if (chunk.type === 'meta' && chunk.metadata.usage) {
          totalTokens = chunk.metadata.usage.totalTokens;
          yield chunk;
        } else if (chunk.type === 'error') {
          yield chunk;
        } else if (chunk.type === 'complete') {
          // Stream completed
        } else if (chunk.type === 'reasoning') {
          yield chunk; // pass through
        } else if (chunk.type === 'tool_call' || chunk.type === 'tool_result') {
          yield chunk; // pass through
        } else if (chunk.type === 'status' || chunk.type === 'citation') {
          yield chunk; // pass through
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Stream failed';
      yield new DefaultStreamProcessor().error(msg);
      fullContent = `Error: ${msg}`;
    }

    const latency = Math.round(performance.now() - startTime);

    // Create assistant response message
    const responseMessage: Message = {
      id: generateId('msg'),
      conversationId,
      role: 'assistant',
      content: fullContent,
      provider: responseProvider,
      model: responseModel,
      tokens: totalTokens,
      latency,
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(responseMessage);
    conversation.updatedAt = responseMessage.createdAt;
    await this.store?.addMessage(conversationId, responseMessage);

    await this.eventBus?.emit({
      type: 'conversation:response.completed',
      source: 'conversation-service',
      payload: {
        conversationId,
        messageId: responseMessage.id,
        contentLength: responseMessage.content.length,
        tokens: responseMessage.tokens,
        latency: responseMessage.latency,
      },
      metadata: {},
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
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getConversation(id: string): Promise<Conversation | null> {
    if (this.store) return this.loadIntoMemory(id);
    return this.conversations.get(id) ?? null;
  }

  async deleteConversation(id: string): Promise<void> {
    if (this.store) await this.store.remove(id);
    this.conversations.delete(id);
  }
}
