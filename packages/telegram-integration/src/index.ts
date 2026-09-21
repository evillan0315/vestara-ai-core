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
  AttachmentPolicy,
  AttachmentReason,
  AttachmentValidation,
  TelegramAttachmentServiceConfig,
} from './attachments.js';
export {
  buildAttachmentStorageKey,
  DEFAULT_ATTACHMENT_POLICY,
  sanitizeFileName,
  TelegramAttachmentService,
  validateAttachment,
} from './attachments.js';
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
  DeepLinkAction,
  DeepLinkInput,
  DeepLinkStatus,
  DeepLinkVerification,
  ParsedDeepLink,
} from './deep-links.js';
export {
  buildDeepLink,
  buildDeepLinkPayload,
  DEEP_LINK_ACTIONS,
  isDeepLinkValid,
  parseDeepLink,
  signDeepLinkPayload,
  verifyDeepLink,
} from './deep-links.js';
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
  ExecutionBackend,
  ExecutionRequest,
  ExecutionResult,
  GlobalAssistantConfig,
  MessageRouteResult,
  MessageRouteStatus,
  StreamSink,
} from './global-assistant.js';
export { GlobalAssistantTextRouter, TELEGRAM_ASSISTANT_AGENT_ID } from './global-assistant.js';
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
export { TELEGRAM_MANIFEST, TELEGRAM_MIGRATIONS } from './migrations.js';
export type {
  NotificationDecision,
  NotificationDecisionReason,
  NotificationEvent,
  NotificationEventDescriptor,
  NotificationEventType,
  NotificationFilters,
  NotificationPreferences,
  NotificationSeverity,
  QuietHours,
} from './notifications.js';
export {
  buildNotificationDelivery,
  defaultNotificationPreferences,
  isWithinQuietHours,
  NOTIFICATION_EVENT_CATALOG,
  normalizeNotificationPreferences,
  TelegramNotificationPolicy,
} from './notifications.js';
export type {
  PairingConfig,
  PairingRequest,
  PairingStatus,
  TelegramIdentityBinding,
} from './pairing.js';
export { TelegramPairingService } from './pairing.js';
export { TelegramPersistentStore } from './persistent-store.js';
export type {
  DeliveryFailure,
  DeliveryFailureKind,
  RateLimitDecision,
} from './reliability.js';
export {
  classifyDeliveryError,
  computeRetryDelayMs,
  TelegramDeliveryCoalescer,
  TokenBucketRateLimiter,
} from './reliability.js';
export type {
  ExecutionCardInput,
  ExecutionCardOptions,
  ExecutionStep,
  StepState,
} from './rich-cards.js';
export {
  buildExecutionCardDelivery,
  buildExecutionCardKeyboard,
  executionUpdateToCardInput,
  formatDuration,
  isTerminalStatus,
  renderExecutionCard,
  renderProgressBar,
} from './rich-cards.js';
export type {
  CallbackRecord,
  PairingTokenState,
  SecurityDecision,
  SecurityReason,
  TelegramSecurityConfig,
} from './security.js';
export { TelegramAccessDeniedError, TelegramSecurityGuard } from './security.js';
export type {
  CorrelationContext,
  TelegramTelemetryConfig,
  TelegramTelemetryEvent,
  TelemetryChannel,
  TelemetryRecord,
  TelemetrySink,
} from './telemetry.js';
export {
  createCorrelationContext,
  redactTelemetryData,
  TELEGRAM_TELEMETRY_EVENTS,
  TelegramTelemetry,
  withCorrelation,
} from './telemetry.js';
export type {
  HostResolutionOptions,
  ProcessTunnelProviderConfig,
  PublicUrlValidation,
  TelegramTunnelConfig,
  TelegramWebhookRegistrar,
  TunnelConfig,
  TunnelConfigPatch,
  TunnelProvider,
  TunnelProviderKind,
  TunnelStartResult,
  TunnelState,
  TunnelStatus,
  WebhookRegistrationResult,
} from './tunnel.js';
export {
  buildTelegramWebhookUrl,
  cloudflaredArgs,
  DEFAULT_TUNNEL_CONFIG,
  extractTunnelUrl,
  isCommandAvailable,
  isTunnelHost,
  ngrokArgs,
  ProcessTunnelProvider,
  StaticTunnelProvider,
  TelegramTunnelService,
  TunnelProviderUnavailableError,
  validatePublicUrl,
  waitForHostResolution,
} from './tunnel.js';
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
  ChannelDelivery,
  ChannelDeliveryResult,
  ChannelEvent,
  ChannelKind,
  ChannelMessage,
} from '@vestara/channel-types';
import { buildTelegramEditPayload, buildTelegramSendPayload } from './telegram-types.js';

// Re-export channel types used by the API route
export type { ChannelMessage } from '@vestara/channel-types';
// Re-export canonical Telegram translators for external consumers.
// Raw Telegram Bot API types stay inside telegram-types.ts and are
// intentionally NOT re-exported here.
export {
  buildReplyMarkup,
  buildTelegramEditPayload,
  buildTelegramSendPayload,
  normalizeTelegramCallbackQuery,
  normalizeTelegramCommand,
  normalizeTelegramMessage,
  normalizeTelegramUpdate,
  parseTelegramCommand,
} from './telegram-types.js';

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
      if (delivery.editMessageId) {
        // Edit existing message
        const result = await this.apiCall('editMessageText', buildTelegramEditPayload(delivery));
        return {
          deliveryId: delivery.id,
          success: true,
          externalMessageId: String(result.message_id),
          timestamp: new Date().toISOString(),
        };
      }

      // Send new message
      const result = await this.apiCall('sendMessage', buildTelegramSendPayload(delivery));

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

  /**
   * Send a chat action (e.g. `typing`) so the user sees activity while
   * the assistant thinks. Best-effort: Telegram expires the indicator
   * after ~5s, so long executions must refresh it. Never throws.
   */
  async sendChatAction(chatId: string, action = 'typing'): Promise<boolean> {
    try {
      await this.apiCall('sendChatAction', { chat_id: chatId, action });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Send a plain-text message, returning the Telegram message_id.
   * Returns undefined on failure. Never throws.
   */
  async sendTextMessage(chatId: string, text: string): Promise<string | undefined> {
    try {
      const result = await this.apiCall('sendMessage', { chat_id: chatId, text });
      return String(result.message_id);
    } catch {
      return undefined;
    }
  }

  /**
   * Edit a previously sent message (VES-TG-STREAM live updates).
   * The Bot API rejects edits with identical text — callers must skip
   * no-op edits; a `message is not modified` rejection is still treated
   * as success (idempotent) and returns true. Never throws.
   */
  async editTextMessage(chatId: string, messageId: string, text: string): Promise<boolean> {
    try {
      await this.apiCall('editMessageText', { chat_id: chatId, message_id: messageId, text });
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('message is not modified')) return true;
      return false;
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
}
