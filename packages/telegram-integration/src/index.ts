/**
 * @vestara/telegram-integration — Telegram Adapter
 *
 * Telegram Bot API adapter implementing the ChannelAdapter interface.
 * Translates Telegram-specific types to canonical channel types.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-005, TG-006, TG-007, TG-008)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Re-exports ────────────────────────────────────────────────

export { TelegramWebhookHandler } from './webhook.js';
export { TelegramPairingService } from './pairing.js';
export { TelegramWorkspaceBindingService } from './workspace-binding.js';
export { TelegramConversationBindingService } from './conversation-binding.js';
export { GlobalAssistantTextRouter } from './global-assistant.js';
export { TelegramDeliveryQueue } from './delivery-queue.js';
export { TelegramCommandRegistry } from './commands.js';
export { TelegramExecutionProjection } from './execution-projection.js';

export type { WebhookConfig, WebhookResult } from './webhook.js';
export type {
  PairingRequest,
  PairingStatus,
  PairingConfig,
  TelegramIdentityBinding,
} from './pairing.js';
export type {
  WorkspaceBinding,
  WorkspaceBindingConfig,
} from './workspace-binding.js';
export type {
  ConversationBinding,
  ConversationBindingStatus,
  ConversationBindingConfig,
} from './conversation-binding.js';
export type {
  GlobalAssistantConfig,
  MessageRouteResult,
  MessageRouteStatus,
  ExecutionRequest,
  ExecutionResult,
} from './global-assistant.js';
export type {
  DeliveryQueueConfig,
  DeliveryRecord,
  DeliveryStatus,
  DeliveryPriority,
} from './delivery-queue.js';
export type {
  CommandCategory,
  TelegramCommand,
  CommandContext,
  CommandResult,
  CommandHandler,
} from './commands.js';
export type {
  ExecutionStatus,
  ProgressLevel,
  ExecutionUpdate,
  ExecutionProjectionConfig,
} from './execution-projection.js';

import type {
  ChannelKind,
  ChannelMessage,
  ChannelAction,
  ChannelDelivery,
  ChannelDeliveryResult,
  ChannelEvent,
  ChannelIdentity,
  ChannelConversationRef,
  ChannelAttachment,
  ChannelButton,
} from '@vestara/channel-types';
import type { ChannelAdapter } from '@vestara/channel-runtime';

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

// ─── Telegram Adapter ──────────────────────────────────────────

export class TelegramAdapter implements ChannelAdapter {
  readonly kind: ChannelKind = 'telegram';

  private botToken: string;
  private apiBase: string;

  constructor(config: { botToken: string; apiBase?: string }) {
    this.botToken = config.botToken;
    this.apiBase = config.apiBase ?? 'https://api.telegram.org';
  }

  /**
   * Translate Telegram Update to ChannelMessage.
   */
  async processMessage(message: ChannelMessage): Promise<ChannelEvent> {
    // Telegram message is already normalized to ChannelMessage
    // by the webhook handler before reaching the adapter.
    return {
      id: `tg-evt-${Date.now()}`,
      channel: 'telegram',
      type: 'message.received',
      payload: message,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Translate Telegram CallbackQuery to ChannelAction.
   */
  async processAction(action: ChannelAction): Promise<ChannelEvent> {
    return {
      id: `tg-evt-${Date.now()}`,
      channel: 'telegram',
      type: 'action.received',
      payload: action,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Send delivery to Telegram.
   */
  async sendDelivery(delivery: ChannelDelivery): Promise<ChannelDeliveryResult> {
    try {
      const chatId = delivery.conversation.externalId;

      if (delivery.editMessageId) {
        // Edit existing message
        const result = await this.apiCall('editMessageText', {
          chat_id: chatId,
          message_id: delivery.editMessageId,
          text: delivery.content.text ?? '',
          reply_markup: this.buildReplyMarkup(delivery.content.inlineKeyboard),
        });
        return {
          deliveryId: delivery.id,
          success: true,
          externalMessageId: String(result.message_id),
          timestamp: new Date().toISOString(),
        };
      }

      // Send new message
      const result = await this.apiCall('sendMessage', {
        chat_id: chatId,
        text: delivery.content.text ?? '',
        reply_markup: this.buildReplyMarkup(delivery.content.inlineKeyboard),
      });

      return {
        deliveryId: delivery.id,
        success: true,
        externalMessageId: String(result.message_id),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        deliveryId: delivery.id,
        success: false,
        error: error instanceof Error ? error.message : 'Telegram API error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ─── Telegram API Helpers ──────────────────────────────────

  private async apiCall(method: string, params: Record<string, unknown>): Promise<any> {
    const response = await fetch(`${this.apiBase}/bot${this.botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json();
    if (!data.ok) {
      throw new Error(data.description ?? 'Telegram API error');
    }
    return data.result;
  }

  private buildReplyMarkup(
    keyboard?: readonly ChannelButton[][],
  ): Record<string, unknown> | undefined {
    if (!keyboard || keyboard.length === 0) return undefined;

    return {
      inline_keyboard: keyboard.map((row) =>
        row.map((btn) => ({
          text: btn.text,
          callback_data: btn.callbackData,
        })),
      ),
    };
  }
}

// ─── Telegram Update Normalizer ────────────────────────────────

/**
 * Normalize a raw Telegram Update to canonical ChannelMessage.
 * This is the boundary between Telegram-specific and Vestara canonical.
 */
export function normalizeTelegramUpdate(update: TelegramUpdate): ChannelMessage | ChannelAction | null {
  if (update.message) {
    return normalizeTelegramMessage(update.message);
  }
  if (update.callback_query) {
    return normalizeTelegramCallbackQuery(update.callback_query);
  }
  return null;
}

function normalizeTelegramMessage(msg: TelegramMessage): ChannelMessage {
  const sender: ChannelIdentity = {
    channel: 'telegram',
    externalId: String(msg.from?.id ?? 0),
    displayName: msg.from ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') : undefined,
    username: msg.from?.username,
  };

  const conversation: ChannelConversationRef = {
    channel: 'telegram',
    externalId: String(msg.chat.id),
    type: msg.chat.type === 'private' ? 'direct' : 'group',
    title: msg.chat.title,
  };

  const attachments: ChannelAttachment[] = [];
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

function normalizeTelegramCallbackQuery(cb: TelegramCallbackQuery): ChannelAction {
  const sender: ChannelIdentity = {
    channel: 'telegram',
    externalId: String(cb.from.id),
    displayName: [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' '),
    username: cb.from.username,
  };

  const conversation: ChannelConversationRef = {
    channel: 'telegram',
    externalId: cb.message ? String(cb.message.chat.id) : '',
    type: cb.message?.chat.type === 'private' ? 'direct' : 'group',
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
