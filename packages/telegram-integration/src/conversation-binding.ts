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
import type { TelegramPersistentStore } from './persistent-store';

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
}

export interface ConversationBindingConfig {
  /** Maximum conversations per Telegram chat */
  readonly maxConversationsPerChat?: number;

  /** Whether to auto-create conversations on first message */
  readonly autoCreateConversation?: boolean;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<ConversationBindingConfig> = {
  maxConversationsPerChat: 5,
  autoCreateConversation: true,
};

// ─── Conversation Binding Service ──────────────────────────────

export class TelegramConversationBindingService {
  private config: Required<ConversationBindingConfig>;
  private store: TelegramPersistentStore | null;
  private bindings: Map<string, ConversationBinding> = new Map();

  constructor(config?: ConversationBindingConfig & { store?: TelegramPersistentStore }) {
    this.config = {
      maxConversationsPerChat: config?.maxConversationsPerChat ?? DEFAULT_CONFIG.maxConversationsPerChat,
      autoCreateConversation: config?.autoCreateConversation ?? DEFAULT_CONFIG.autoCreateConversation,
    };
    this.store = config?.store ?? null;
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
    // A Vestara conversation is a distinct canonical entity — it must never
    // be double-bound to a second Telegram chat. Chats reference
    // conversations; they are not conversations. The principal-scoped merge
    // covers rows persisted before a restart.
    const alreadyBound =
      this.getBindingByConversationId(params.vestaraConversationId) ??
      this.getBindingsByPrincipal(params.principalId).find(
        (b) => b.vestaraConversationId === params.vestaraConversationId,
      );
    if (alreadyBound) {
      throw new Error('Vestara conversation is already bound to a Telegram chat');
    }
    const now = new Date().toISOString();

    // ROUTING-CONVERGENCE-001A: bindings carry identity only (chat ↔
    // conversation). Provider/model binding is resolved per turn from the
    // canonical AgentDefinition — it is never stamped here, so a binding
    // created under one model can never pin a future execution to it.
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
    };

    this.bindings.set(binding.id, binding);
    this.store?.saveConversationBinding(binding);
    return binding;
  }

  /**
   * Hydrate a binding from SQLite when this instance never cached it
   * (e.g. after a restart). Returns undefined when unknown.
   */
  private requireBinding(bindingId: string): ConversationBinding | undefined {
    const cached = this.bindings.get(bindingId);
    if (cached) return cached;
    if (this.store) {
      const stored = this.store.getConversationBinding(bindingId);
      if (stored) this.bindings.set(stored.id, stored);
      return stored;
    }
    return undefined;
  }

  /**
   * Merge in-memory bindings over SQLite rows (memory wins per-id).
   * The memory map is a write-through cache that point lookups can
   * partially populate, so SQLite is the source of truth for listings.
   */
  private mergedList(stored: readonly ConversationBinding[]): ConversationBinding[] {
    const merged = new Map<string, ConversationBinding>();
    for (const b of stored) merged.set(b.id, b);
    for (const b of this.bindings.values()) merged.set(b.id, b);
    for (const b of merged.values()) this.bindings.set(b.id, b);
    return Array.from(merged.values());
  }

  /**
   * Get binding by ID.
   */
  getBinding(bindingId: string): ConversationBinding | undefined {
    return this.requireBinding(bindingId);
  }

  /**
   * Get active binding for a Telegram chat and principal.
   * When several active bindings exist, the most recently active wins
   * deterministically. Pass workspaceId to scope resolution to one
   * workspace — a chat bound under another workspace must not resolve.
   */
  getActiveBinding(telegramChatId: string, principalId: string, workspaceId?: string): ConversationBinding | undefined {
    const candidates = this.getBindingsByChat(telegramChatId).filter(
      (b) =>
        b.principalId === principalId &&
        b.status === 'active' &&
        (workspaceId === undefined || b.workspaceId === workspaceId),
    );
    candidates.sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
    return candidates[0];
  }

  /**
   * Get all bindings for a Telegram chat.
   */
  getBindingsByChat(telegramChatId: string): readonly ConversationBinding[] {
    if (!this.store) {
      return Array.from(this.bindings.values()).filter((b) => b.telegramChatId === telegramChatId);
    }
    return this.mergedList(this.store.getConversationBindingsByChat(telegramChatId)).filter(
      (b) => b.telegramChatId === telegramChatId,
    );
  }

  /**
   * Get all bindings for a principal.
   */
  getBindingsByPrincipal(principalId: string): readonly ConversationBinding[] {
    if (!this.store) {
      return Array.from(this.bindings.values()).filter((b) => b.principalId === principalId);
    }
    return this.mergedList(this.store.getConversationBindingsByPrincipal(principalId)).filter(
      (b) => b.principalId === principalId,
    );
  }

  /**
   * List active bindings, most recently active first. Pass workspaceId to
   * scope to one workspace — a chat bound elsewhere must never resolve.
   * Backs the Activity Room forward picker (no principal available there).
   */
  listActiveBindings(workspaceId?: string): readonly ConversationBinding[] {
    const stored = this.store ? this.store.listConversationBindings() : [];
    const merged = this.mergedList(stored);
    return merged
      .filter((b) => b.status === 'active' && (workspaceId === undefined || b.workspaceId === workspaceId))
      .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
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
    const binding = this.requireBinding(bindingId);
    if (binding) {
      const updated = { ...binding, status: 'paused' as const };
      this.bindings.set(bindingId, updated);
      this.store?.saveConversationBinding(updated);
    }
  }

  /**
   * Resume a conversation binding.
   */
  resumeBinding(bindingId: string): void {
    const binding = this.requireBinding(bindingId);
    if (binding) {
      const updated = {
        ...binding,
        status: 'active' as const,
        lastActivityAt: new Date().toISOString(),
      };
      this.bindings.set(bindingId, updated);
      this.store?.saveConversationBinding(updated);
    }
  }

  /**
   * Close a conversation binding.
   */
  closeBinding(bindingId: string): void {
    const binding = this.requireBinding(bindingId);
    if (binding) {
      const updated = { ...binding, status: 'closed' as const };
      this.bindings.set(bindingId, updated);
      this.store?.saveConversationBinding(updated);
    }
  }

  /**
   * Update last activity timestamp.
   */
  touchBinding(bindingId: string): void {
    const binding = this.requireBinding(bindingId);
    if (binding) {
      const updated = { ...binding, lastActivityAt: new Date().toISOString() };
      this.bindings.set(bindingId, updated);
      this.store?.saveConversationBinding(updated);
    }
  }

  /**
   * Update conversation title.
   */
  updateConversationTitle(bindingId: string, title: string): void {
    const binding = this.requireBinding(bindingId);
    if (binding) {
      const updated = { ...binding, vestaraConversationTitle: title };
      this.bindings.set(bindingId, updated);
      this.store?.saveConversationBinding(updated);
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
   * Resolve Telegram chat to Vestara conversation ID.
   * Returns the most recent active binding. Pass workspaceId to scope
   * resolution — cross-workspace chat reuse must not resolve.
   */
  resolveConversationId(telegramChatId: string, principalId: string, workspaceId?: string): string | undefined {
    return this.getActiveBinding(telegramChatId, principalId, workspaceId)?.vestaraConversationId;
  }
}
