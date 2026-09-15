/**
 * Telegram Bot API type definitions (internal).
 *
 * Shared between the adapter (index.ts) and webhook handler (webhook.ts).
 * These are NOT exported from the package — they are internal to
 * @vestara/telegram-integration.
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

export interface TelegramMessage {
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
  audio?: { file_id: string; duration?: number; mime_type?: string; file_name?: string };
  video?: { file_id: string; duration?: number; mime_type?: string; file_name?: string };
  sticker?: { file_id: string; type?: string };
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// ─── Normalization Helpers ────────────────────────────────────

import type {
  ChannelAction,
  ChannelAttachment,
  ChannelButton,
  ChannelConversationRef,
  ChannelDelivery,
  ChannelIdentity,
  ChannelMessage,
} from '@vestara/channel-types';

/**
 * Normalize a raw Telegram message to canonical ChannelMessage.
 */
export function normalizeTelegramMessage(msg: TelegramMessage): ChannelMessage {
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
  if (msg.audio) {
    attachments.push({
      id: msg.audio.file_id,
      type: 'audio',
      fileName: msg.audio.file_name ?? 'audio',
      mimeType: msg.audio.mime_type ?? 'audio/mpeg',
      size: 0,
      url: '',
    });
  }
  if (msg.video) {
    attachments.push({
      id: msg.video.file_id,
      type: 'video',
      fileName: msg.video.file_name ?? 'video.mp4',
      mimeType: msg.video.mime_type ?? 'video/mp4',
      size: 0,
      url: '',
    });
  }
  if (msg.sticker) {
    attachments.push({
      id: msg.sticker.file_id,
      type: 'sticker',
      fileName: 'sticker.webp',
      mimeType: 'image/webp',
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

/**
 * Normalize a raw Telegram callback query to canonical ChannelAction.
 */
export function normalizeTelegramCallbackQuery(cb: TelegramCallbackQuery): ChannelAction {
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

/**
 * Normalize a raw Telegram Update to canonical ChannelMessage or ChannelAction.
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

// ─── Command Parsing ──────────────────────────────────────────
// Telegram commands arrive as message text (e.g. "/status", "/model foo").
// These pure helpers translate them to canonical ChannelAction commands
// without changing the webhook message/update flow.

export interface ParsedTelegramCommand {
  readonly command: string;
  readonly args: readonly string[];
}

export function parseTelegramCommand(text: string | undefined): ParsedTelegramCommand | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const withoutSlash = trimmed.slice(1).trim();
  if (withoutSlash.length === 0) return null;
  // Strip optional "@botname" suffix: "/status@mybot arg" → command "status".
  const [rawCommand, ...args] = withoutSlash.split(/\s+/);
  const command = rawCommand.split('@')[0] ?? '';
  if (command.length === 0) return null;
  return { command, args };
}

export function normalizeTelegramCommand(msg: TelegramMessage): ChannelAction | null {
  const parsed = parseTelegramCommand(msg.text ?? msg.caption);
  if (!parsed) return null;
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
  return {
    id: `tg-cmd-${msg.message_id}`,
    channel: 'telegram',
    type: 'command',
    payload: { type: 'command', command: `/${parsed.command}`, args: [...parsed.args] },
    sender,
    conversation,
    externalMessageId: String(msg.message_id),
    timestamp: new Date(msg.date * 1000).toISOString(),
  };
}

// ─── Delivery Payload Builders ────────────────────────────────
// Pure builders translating canonical ChannelDelivery to Telegram Bot API
// request payloads. Kept side-effect free so adapter behavior is testable
// without network access.

export function buildReplyMarkup(keyboard?: readonly ChannelButton[][]): Record<string, unknown> | undefined {
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

export function buildTelegramSendPayload(delivery: ChannelDelivery): Record<string, unknown> {
  return {
    chat_id: delivery.conversation.externalId,
    text: delivery.content.text ?? '',
    reply_markup: buildReplyMarkup(delivery.content.inlineKeyboard),
  };
}

export function buildTelegramEditPayload(delivery: ChannelDelivery): Record<string, unknown> {
  return {
    chat_id: delivery.conversation.externalId,
    message_id: delivery.editMessageId,
    text: delivery.content.text ?? '',
    reply_markup: buildReplyMarkup(delivery.content.inlineKeyboard),
  };
}
