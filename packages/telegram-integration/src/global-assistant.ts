/**
 * VES-TG-010: Global Assistant Text Interaction
 *
 * Routes Telegram messages to the Global Assistant via the existing
 * execution pipeline. Preserves the Conversation → Execution → Runtime
 * hierarchy and enforces execution governance.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-010)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { randomBytes } from 'node:crypto';
import type { ChannelDelivery, ChannelMessage } from '@vestara/channel-types';
import type { ConversationBinding } from './conversation-binding.js';
import type { TelegramIdentityBinding } from './pairing.js';
import type { WorkspaceBinding } from './workspace-binding.js';

// ─── Types ─────────────────────────────────────────────────────

/**
 * Execution backend interface. The router delegates actual LLM execution
 * to this interface, which is provided by the API composition root.
 *
 * This keeps the telegram-integration package independent of the
 * conversation service implementation.
 */
export interface ExecutionBackend {
  /**
   * Send a message to the Global Assistant and return the response.
   * @param conversationId - The Vestara conversation ID
   * @param content - The user message text
   * @param options - Optional model/provider overrides
   * @returns The execution result with response text
   */
  sendMessage(
    conversationId: string,
    content: string,
    options?: { model?: string; provider?: string },
  ): Promise<ExecutionResult>;
}

export type MessageRouteStatus = 'routed' | 'queued' | 'rejected' | 'failed' | 'executing';

export interface MessageRouteResult {
  /** Route result status */
  readonly status: MessageRouteStatus;

  /** Execution ID (if routed/queued) */
  readonly executionId?: string;

  /** Conversation ID */
  readonly conversationId?: string;

  /** Error message (if rejected/failed) */
  readonly error?: string;

  /** Whether message was queued due to rate limiting */
  readonly queued?: boolean;

  /** Response text from the execution backend (when available) */
  readonly response?: string;
}

export interface GlobalAssistantConfig {
  /** Maximum concurrent executions per principal */
  readonly maxConcurrentExecutions?: number;

  /** Maximum messages per minute per principal */
  readonly rateLimitPerMinute?: number;

  /** Default model for execution */
  readonly defaultModel?: string;

  /** Default provider for execution */
  readonly defaultProvider?: string;

  /** Whether to auto-resume paused conversations */
  readonly autoResumeConversation?: boolean;
}

export interface ExecutionRequest {
  /** Message to send */
  readonly message: ChannelMessage;

  /** Principal ID */
  readonly principalId: string;

  /** Workspace ID */
  readonly workspaceId: string;

  /** Conversation ID */
  readonly conversationId: string;

  /** Model to use */
  readonly model: string;

  /** Provider to use */
  readonly provider: string;

  /** ISO-8601 timestamp */
  readonly timestamp: string;
}

export interface ExecutionResult {
  /** Execution ID */
  readonly executionId: string;

  /** Whether execution succeeded */
  readonly success: boolean;

  /** Response text (if succeeded) */
  readonly response?: string;

  /** Error message (if failed) */
  readonly error?: string;

  /** Tokens used */
  readonly tokensUsed?: number;

  /** ISO-8601 timestamp */
  readonly completedAt: string;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<GlobalAssistantConfig> = {
  maxConcurrentExecutions: 3,
  rateLimitPerMinute: 20,
  defaultModel: 'mimo-v2.5-free',
  defaultProvider: 'opencode',
  autoResumeConversation: true,
};

// ─── Rate Limiter ──────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// ─── Global Assistant Text Router ──────────────────────────────

export class GlobalAssistantTextRouter {
  private config: Required<GlobalAssistantConfig>;
  private backend: ExecutionBackend | null;
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private activeExecutions: Map<string, number> = new Map();

  constructor(config?: GlobalAssistantConfig & { backend?: ExecutionBackend }) {
    this.config = {
      maxConcurrentExecutions: DEFAULT_CONFIG.maxConcurrentExecutions,
      rateLimitPerMinute: DEFAULT_CONFIG.rateLimitPerMinute,
      defaultModel: DEFAULT_CONFIG.defaultModel,
      defaultProvider: DEFAULT_CONFIG.defaultProvider,
      autoResumeConversation: DEFAULT_CONFIG.autoResumeConversation,
      ...config,
    };
    this.backend = config?.backend ?? null;
  }

  /**
   * Route a Telegram message to the Global Assistant.
   *
   * When an ExecutionBackend is configured, this method executes the message
   * through the pipeline and returns the result. When no backend is configured,
   * it returns a routing result for the caller to execute.
   */
  async routeMessage(
    message: ChannelMessage,
    identity: TelegramIdentityBinding,
    workspace: WorkspaceBinding,
    conversation: ConversationBinding,
  ): Promise<MessageRouteResult> {
    const principalId = identity.principalId;

    // 1. Check rate limit
    if (this.isRateLimited(principalId)) {
      return {
        status: 'queued',
        queued: true,
        executionId: undefined,
        conversationId: conversation.vestaraConversationId,
      };
    }

    // 2. Check concurrent execution limit
    const activeCount = this.activeExecutions.get(principalId) ?? 0;
    if (activeCount >= this.config.maxConcurrentExecutions) {
      return {
        status: 'rejected',
        error: 'Maximum concurrent executions reached',
        conversationId: conversation.vestaraConversationId,
      };
    }

    // 3. Check conversation status
    if (conversation.status === 'closed') {
      return {
        status: 'rejected',
        error: 'Conversation is closed',
        conversationId: conversation.vestaraConversationId,
      };
    }

    // 4. Build execution request
    const executionId = `exec-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const model = conversation.defaultModel ?? this.config.defaultModel;
    const provider = conversation.defaultProvider ?? this.config.defaultProvider;

    // 5. Record execution
    this.activeExecutions.set(principalId, activeCount + 1);
    this.recordMessage(principalId);

    // 6. Execute through backend if available
    if (this.backend && message.text) {
      try {
        const result = await this.backend.sendMessage(
          conversation.vestaraConversationId,
          message.text,
          { model, provider },
        );
        return {
          status: 'routed',
          executionId: result.executionId ?? executionId,
          conversationId: conversation.vestaraConversationId,
          response: result.response,
        };
      } catch (error) {
        return {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Execution failed',
          conversationId: conversation.vestaraConversationId,
        };
      } finally {
        this.completeExecution(principalId);
      }
    }

    // 7. No backend — return routing info for caller to execute
    return {
      status: 'routed',
      executionId,
      conversationId: conversation.vestaraConversationId,
    };
  }

  /**
   * Mark an execution as complete.
   */
  completeExecution(principalId: string): void {
    const current = this.activeExecutions.get(principalId) ?? 0;
    if (current > 1) {
      this.activeExecutions.set(principalId, current - 1);
    } else {
      this.activeExecutions.delete(principalId);
    }
  }

  /**
   * Build a delivery response for Telegram.
   */
  buildDeliveryResponse(executionResult: ExecutionResult, conversation: ConversationBinding): ChannelDelivery {
    return {
      id: `delivery-${Date.now()}-${randomBytes(4).toString('hex')}`,
      channel: 'telegram',
      conversation: {
        channel: 'telegram',
        externalId: conversation.telegramChatId,
        type: conversation.telegramChatType,
        title: conversation.telegramChatTitle,
      },
      content: {
        text: executionResult.response ?? executionResult.error ?? 'No response',
      },
      priority: 'normal',
    };
  }

  /**
   * Check if a principal is rate limited.
   */
  private isRateLimited(principalId: string): boolean {
    const entry = this.rateLimits.get(principalId);
    if (!entry) return false;

    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute

    if (now - entry.windowStart > windowMs) {
      // Window expired, reset
      this.rateLimits.delete(principalId);
      return false;
    }

    return entry.count >= this.config.rateLimitPerMinute;
  }

  /**
   * Record a message for rate limiting.
   */
  private recordMessage(principalId: string): void {
    const now = Date.now();
    const entry = this.rateLimits.get(principalId);

    if (!entry || now - entry.windowStart > 60 * 1000) {
      this.rateLimits.set(principalId, { count: 1, windowStart: now });
    } else {
      this.rateLimits.set(principalId, { ...entry, count: entry.count + 1 });
    }
  }

  /**
   * Get active execution count for a principal.
   */
  getActiveExecutionCount(principalId: string): number {
    return this.activeExecutions.get(principalId) ?? 0;
  }

  /**
   * Get rate limit status for a principal.
   */
  getRateLimitStatus(principalId: string): { count: number; limit: number; resetsAt: string } {
    const entry = this.rateLimits.get(principalId);
    const count = entry?.count ?? 0;
    const resetsAt = entry ? new Date(entry.windowStart + 60 * 1000).toISOString() : new Date().toISOString();

    return {
      count,
      limit: this.config.rateLimitPerMinute,
      resetsAt,
    };
  }
}
