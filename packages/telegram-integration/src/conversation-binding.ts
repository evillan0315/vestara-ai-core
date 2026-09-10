/**
 * VES-TG-009: Telegram Conversation Binding
 *
 * Manages the binding between Telegram chats and Vestara conversations.
 * Preserves the Conversation → Execution → Runtime hierarchy.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-009)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { randomBytes } from 'node:crypto';

// ─── Types ─────────────────────────────────────────────────────

export type ConversationBindingStatus = 'active' | 'paused' | 'closed';

export interface ConversationBinding {
  /** Binding ID */
  readonly id: string;

  /** Principal ID */
  readonly principalId: string;

  /** Workspace ID */
  readonly workspaceId: string;

  /** Telegram chat ID */
  readonly telegramChatId: string;

  /** Telegram chat type */
  readonly telegramChatType: 'direct' | 'group';

  /** Telegram chat title (for groups) */
  readonly telegramChatTitle?: string;

  /** Vestara conversation ID */
  readonly vestaraConversationId: string;

  /** Vestara conversation title */
  readonly vestaraConversationTitle?: string;

  /** Current status */
  readonly status: ConversationBindingStatus;

  /** ISO-8601 timestamp when binding was created */
  readonly createdAt: string;

  /** ISO-8601 timestamp of last activity */
  readonly lastActivityAt: string;

  /** Optional: default model for this conversation */
  readonly defaultModel?: string;

  /** Optional: default provider for this conversation */
  readonly defaultProvider?: string;
}

export interface ConversationBindingConfig {
  /** Maximum conversations per Telegram chat */
  readonly maxConversationsPerChat?: number;

  /** Whether to auto-create conversations on first message */
  readonly autoCreateConversation?: boolean;

  /** Default model for new conversations */
  readonly defaultModel?: string;

  /** Default provider for new conversations */
  readonly defaultProvider?: string;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<ConversationBindingConfig> = {
  maxConversationsPerChat: 5,
  autoCreateConversation: true,
  defaultModel: 'mimo-v2.5-free',
  defaultProvider: 'opencode',
};

// ─── Conversation Binding Service ──────────────────────────────

export class TelegramConversationBindingService {
  private config: Required<ConversationBindingConfig>;
  private bindings: Map<string, ConversationBinding> = new Map();

  constructor(config?: ConversationBindingConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new conversation binding.
   */
  createBinding(params: {
    principalId: string;
    workspaceId: string;
    telegramChatId: string;
    telegramChatType: 'direct' | 'group';
    telegramChatTitle?: string;
    vestaraConversationId: string;
    vestaraConversationTitle?: string;
  }): ConversationBinding {
    const now = new Date().toISOString();

    const binding: ConversationBinding = {
      id: `conv-${Date.now()}-${randomBytes(4).toString('hex')}`,
      principalId: params.principalId,
      workspaceId: params.workspaceId,
      telegramChatId: params.telegramChatId,
      telegramChatType: params.telegramChatType,
      telegramChatTitle: params.telegramChatTitle,
      vestaraConversationId: params.vestaraConversationId,
      vestaraConversationTitle: params.vestaraConversationTitle,
      status: 'active',
      createdAt: now,
      lastActivityAt: now,
      defaultModel: this.config.defaultModel,
      defaultProvider: this.config.defaultProvider,
    };

    this.bindings.set(binding.id, binding);
    return binding;
  }

  /**
   * Get binding by ID.
   */
  getBinding(bindingId: string): ConversationBinding | undefined {
    return this.bindings.get(bindingId);
  }

  /**
   * Get active binding for a Telegram chat and principal.
   */
  getActiveBinding(telegramChatId: string, principalId: string): ConversationBinding | undefined {
    for (const binding of this.bindings.values()) {
      if (
        binding.telegramChatId === telegramChatId &&
        binding.principalId === principalId &&
        binding.status === 'active'
      ) {
        return binding;
      }
    }
    return undefined;
  }

  /**
   * Get all bindings for a Telegram chat.
   */
  getBindingsByChat(telegramChatId: string): readonly ConversationBinding[] {
    return Array.from(this.bindings.values()).filter((b) => b.telegramChatId === telegramChatId);
  }

  /**
   * Get all bindings for a principal.
   */
  getBindingsByPrincipal(principalId: string): readonly ConversationBinding[] {
    return Array.from(this.bindings.values()).filter((b) => b.principalId === principalId);
  }

  /**
   * Get binding by Vestara conversation ID.
   */
  getBindingByConversationId(vestaraConversationId: string): ConversationBinding | undefined {
    for (const binding of this.bindings.values()) {
      if (binding.vestaraConversationId === vestaraConversationId) {
        return binding;
      }
    }
    return undefined;
  }

  /**
   * Pause a conversation binding.
   */
  pauseBinding(bindingId: string): void {
    const binding = this.bindings.get(bindingId);
    if (binding) {
      this.bindings.set(bindingId, { ...binding, status: 'paused' });
    }
  }

  /**
   * Resume a conversation binding.
   */
  resumeBinding(bindingId: string): void {
    const binding = this.bindings.get(bindingId);
    if (binding) {
      this.bindings.set(bindingId, {
        ...binding,
        status: 'active',
        lastActivityAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Close a conversation binding.
   */
  closeBinding(bindingId: string): void {
    const binding = this.bindings.get(bindingId);
    if (binding) {
      this.bindings.set(bindingId, { ...binding, status: 'closed' });
    }
  }

  /**
   * Update last activity timestamp.
   */
  touchBinding(bindingId: string): void {
    const binding = this.bindings.get(bindingId);
    if (binding) {
      this.bindings.set(bindingId, {
        ...binding,
        lastActivityAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Update conversation title.
   */
  updateConversationTitle(bindingId: string, title: string): void {
    const binding = this.bindings.get(bindingId);
    if (binding) {
      this.bindings.set(bindingId, {
        ...binding,
        vestaraConversationTitle: title,
      });
    }
  }

  /**
   * Check if a chat can create a new conversation.
   */
  canCreateConversation(telegramChatId: string): boolean {
    const activeBindings = this.getBindingsByChat(telegramChatId).filter((b) => b.status === 'active');
    return activeBindings.length < this.config.maxConversationsPerChat;
  }

  /**
   * Get the default model/provider for a chat.
   */
  getChatDefaults(telegramChatId: string): { model: string; provider: string } {
    const activeBinding = this.getBindingsByChat(telegramChatId).find((b) => b.status === 'active');

    return {
      model: activeBinding?.defaultModel ?? this.config.defaultModel,
      provider: activeBinding?.defaultProvider ?? this.config.defaultProvider,
    };
  }

  /**
   * Resolve Telegram chat to Vestara conversation ID.
   * Returns the most recent active binding.
   */
  resolveConversationId(telegramChatId: string, principalId: string): string | undefined {
    return this.getActiveBinding(telegramChatId, principalId)?.vestaraConversationId;
  }
}
