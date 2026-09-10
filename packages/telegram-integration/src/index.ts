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

export type {
  CommandCategory,
  CommandContext,
  CommandHandler,
  CommandResult,
  TelegramCommand,
} from './commands.js';
export { TelegramCommandRegistry } from './commands.js';
export type {
  ConversationBinding,
  ConversationBindingConfig,
  ConversationBindingStatus,
} from './conversation-binding.js';
export { TelegramConversationBindingService } from './conversation-binding.js';
export type {
  DeliveryPriority,
  DeliveryQueueConfig,
  DeliveryRecord,
  DeliveryStatus,
} from './delivery-queue.js';
export { TelegramDeliveryQueue } from './delivery-queue.js';
export type {
  ExecutionProjectionConfig,
  ExecutionStatus,
  ExecutionUpdate,
  ProgressLevel,
} from './execution-projection.js';
export { TelegramExecutionProjection } from './execution-projection.js';
export type {
  FileCategory,
  FileDownloadResult,
  FileUploadParams,
  FileUploadResult,
  TelegramFile,
  TelegramFileHandlerConfig,
} from './file-handler.js';
export { TelegramFileHandler } from './file-handler.js';
export type {
  ExecutionRequest,
  ExecutionResult,
  GlobalAssistantConfig,
  MessageRouteResult,
  MessageRouteStatus,
} from './global-assistant.js';
export { GlobalAssistantTextRouter } from './global-assistant.js';
export type {
  GroupChat,
  GroupChatConfig,
  GroupMessageContext,
  GroupParticipant,
  GroupParticipantRole,
} from './group-chat.js';
export { TelegramGroupChatHandler } from './group-chat.js';
export type {
  InlineKeyboard,
  InlineKeyboardButton,
  KeyboardType,
} from './inline-keyboard.js';
export { TelegramInlineKeyboard } from './inline-keyboard.js';
export type {
  PairingConfig,
  PairingRequest,
  PairingStatus,
  TelegramIdentityBinding,
} from './pairing.js';
export { TelegramPairingService } from './pairing.js';
export type {
  TranscriptionResult,
  TranscriptionStatus,
  VoiceHandlerConfig,
  VoiceMessage,
} from './voice-handler.js';
export { TelegramVoiceHandler } from './voice-handler.js';
export type { WebhookConfig, WebhookResult } from './webhook.js';
export { TelegramWebhookHandler } from './webhook.js';
export type {
  WorkspaceBinding,
  WorkspaceBindingConfig,
} from './workspace-binding.js';
export { TelegramWorkspaceBindingService } from './workspace-binding.js';

import type { ChannelAdapter } from '@vestara/channel-runtime';
import type {
  ChannelAction,
  ChannelButton,
  ChannelDelivery,
  ChannelDeliveryResult,
  ChannelEvent,
  ChannelKind,
  ChannelMessage,
} from '@vestara/channel-types';
import { normalizeTelegramCallbackQuery, normalizeTelegramMessage } from './telegram-types.js';

// Re-export normalizeTelegramUpdate for external consumers
export { normalizeTelegramUpdate } from './telegram-types.js';

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

  private buildReplyMarkup(keyboard?: readonly ChannelButton[][]): Record<string, unknown> | undefined {
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
