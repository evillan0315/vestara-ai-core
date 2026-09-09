/**
 * VES-TG-006: Telegram Webhook Handler
 *
 * Handles incoming Telegram webhooks with deduplication,
 * authentication, and normalization to canonical channel types.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-006)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type {
  ChannelMessage,
  ChannelAction,
  ChannelEvent,
} from '@vestara/channel-types';

// ─── Telegram Types (internal) ─────────────────────────────────

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  date: number;
  reply_to_message?: { message_id: number };
  photo?: Array<{ file_id: string; file_size?: number }>;
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; duration?: number; mime_type?: string };
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// ─── Types ─────────────────────────────────────────────────────

export interface WebhookConfig {
  /** Telegram bot token for secret validation */
  readonly botToken: string;

  /** Webhook secret (for X-Telegram-Bot-Api-Secret-Token header) */
  readonly webhookSecret?: string;

  /** Maximum update ID to keep in dedup cache */
  readonly maxDedupSize?: number;

  /** Dedup cache TTL in milliseconds */
  readonly dedupTtlMs?: number;
}

export interface WebhookResult {
  /** Whether the update was processed */
  readonly processed: boolean;

  /** Whether the update was a duplicate */
  readonly duplicate: boolean;

  /** The normalized message (if message update) */
  readonly message?: ChannelMessage;

  /** The normalized action (if callback query) */
  readonly action?: ChannelAction;

  /** The normalized event */
  readonly event?: ChannelEvent;

  /** Error message (if processing failed) */
  readonly error?: string;
}

// ─── Deduplication Cache ───────────────────────────────────────

interface DedupEntry {
  updateId: number;
  timestamp: number;
}

// ─── Webhook Handler ───────────────────────────────────────────

export class TelegramWebhookHandler {
  private config: WebhookConfig;
  private dedupCache: Map<number, DedupEntry> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WebhookConfig) {
    this.config = {
      maxDedupSize: 10000,
      dedupTtlMs: 24 * 60 * 60 * 1000, // 24 hours
      ...config,
    };

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => this.cleanupDedupCache(), 60 * 60 * 1000); // hourly
  }

  /**
   * Destroy the handler and cleanup resources.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Process a raw Telegram webhook request.
   * Returns the normalized result or duplicate indication.
   */
  async handleWebhook(
    body: string,
    headers?: Record<string, string>,
  ): Promise<WebhookResult> {
    // 1. Validate secret token (if configured)
    if (this.config.webhookSecret) {
      const secretToken = headers?.['x-telegram-bot-api-secret-token'];
      if (secretToken !== this.config.webhookSecret) {
        return { processed: false, duplicate: false, error: 'Invalid webhook secret' };
      }
    }

    // 2. Parse update
    let update: TelegramUpdate;
    try {
      update = JSON.parse(body);
    } catch {
      return { processed: false, duplicate: false, error: 'Invalid JSON' };
    }

    // 3. Deduplication check
    if (this.isDuplicate(update.update_id)) {
      return { processed: false, duplicate: true };
    }

    // 4. Record update ID
    this.recordUpdateId(update.update_id);

    // 5. Normalize to canonical types
    try {
      if (update.message) {
        const message = this.normalizeMessage(update.message);
        const event: ChannelEvent = {
          id: `tg-evt-${update.update_id}`,
          channel: 'telegram',
          type: 'message.received',
          payload: message,
          timestamp: new Date().toISOString(),
        };
        return { processed: true, duplicate: false, message, event };
      }

      if (update.callback_query) {
        const action = this.normalizeCallbackQuery(update.callback_query);
        const event: ChannelEvent = {
          id: `tg-evt-${update.update_id}`,
          channel: 'telegram',
          type: 'action.received',
          payload: action,
          timestamp: new Date().toISOString(),
        };
        return { processed: true, duplicate: false, action, event };
      }

      // Unknown update type — still mark as processed to avoid retries
      return { processed: true, duplicate: false };
    } catch (error) {
      return {
        processed: false,
        duplicate: false,
        error: error instanceof Error ? error.message : 'Normalization failed',
      };
    }
  }

  // ─── Deduplication ──────────────────────────────────────────

  private isDuplicate(updateId: number): boolean {
    return this.dedupCache.has(updateId);
  }

  private recordUpdateId(updateId: number): void {
    this.dedupCache.set(updateId, {
      updateId,
      timestamp: Date.now(),
    });

    // Evict oldest if cache is full
    if (this.dedupCache.size > (this.config.maxDedupSize ?? 10000)) {
      const oldest = this.dedupCache.keys().next().value;
      if (oldest !== undefined) {
        this.dedupCache.delete(oldest);
      }
    }
  }

  private cleanupDedupCache(): void {
    const now = Date.now();
    const ttl = this.config.dedupTtlMs ?? 24 * 60 * 60 * 1000;

    for (const [updateId, entry] of this.dedupCache) {
      if (now - entry.timestamp > ttl) {
        this.dedupCache.delete(updateId);
      }
    }
  }

  // ─── Normalization ──────────────────────────────────────────

  private normalizeMessage(msg: TelegramMessage): ChannelMessage {
    const sender = {
      channel: 'telegram' as const,
      externalId: String(msg.from?.id ?? 0),
      displayName: msg.from ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') : undefined,
      username: msg.from?.username,
    };

    const conversation = {
      channel: 'telegram' as const,
      externalId: String(msg.chat.id),
      type: (msg.chat.type === 'private' ? 'direct' : 'group') as 'direct' | 'group',
      title: msg.chat.title,
    };

    const attachments: Array<{ id: string; type: 'image' | 'document' | 'voice' | 'audio' | 'video' | 'sticker' | 'other'; fileName: string; mimeType: string; size: number; url: string }> = [];

    if (msg.photo && msg.photo.length > 0) {
      const largest = msg.photo[msg.photo.length - 1];
      attachments.push({
        id: largest.file_id,
        type: 'image',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: largest.file_size ?? 0,
        url: '',
      });
    }

    if (msg.document) {
      attachments.push({
        id: msg.document.file_id,
        type: 'document',
        fileName: msg.document.file_name ?? 'document',
        mimeType: msg.document.mime_type ?? 'application/octet-stream',
        size: msg.document.file_size ?? 0,
        url: '',
      });
    }

    if (msg.voice) {
      attachments.push({
        id: msg.voice.file_id,
        type: 'voice',
        fileName: 'voice.ogg',
        mimeType: msg.voice.mime_type ?? 'audio/ogg',
        size: 0,
        url: '',
      });
    }

    return {
      id: `tg-msg-${msg.message_id}`,
      channel: 'telegram',
      externalMessageId: String(msg.message_id),
      sender,
      conversation,
      text: msg.text ?? msg.caption,
      attachments: attachments.length > 0 ? attachments : undefined,
      replyTo: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
      timestamp: new Date(msg.date * 1000).toISOString(),
    };
  }

  private normalizeCallbackQuery(cb: TelegramCallbackQuery): ChannelAction {
    const sender = {
      channel: 'telegram' as const,
      externalId: String(cb.from.id),
      displayName: [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' '),
      username: cb.from.username,
    };

    const conversation = {
      channel: 'telegram' as const,
      externalId: cb.message ? String(cb.message.chat.id) : '',
      type: (cb.message?.chat.type === 'private' ? 'direct' : 'group') as 'direct' | 'group',
      title: cb.message?.chat.title,
    };

    return {
      id: `tg-action-${cb.id}`,
      channel: 'telegram',
      type: 'callback',
      payload: { type: 'callback', data: cb.data ?? '' },
      sender,
      conversation,
      externalMessageId: cb.message ? String(cb.message.message_id) : undefined,
      callbackData: cb.data,
      timestamp: new Date().toISOString(),
    };
  }
}
