/**
 * VES-TG-003: Canonical Channel Contracts
 *
 * Defines the generic channel abstraction for Vestara interaction channels.
 * Telegram, Slack, Discord, Mobile, CLI all use these contracts.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-003)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Channel Kind ──────────────────────────────────────────────

/**
 * The type of interaction channel.
 */
export type ChannelKind = 'web' | 'telegram' | 'mobile' | 'desktop' | 'cli' | 'slack' | 'discord' | 'other';

// ─── Channel Identity ──────────────────────────────────────────

/**
 * Identity of a sender on a channel.
 * Channel-specific, not Vestara principal.
 */
export interface ChannelIdentity {
  /** Channel kind */
  readonly channel: ChannelKind;

  /** External provider subject ID (e.g., Telegram numeric user ID) */
  readonly externalId: string;

  /** Display name (not authoritative) */
  readonly displayName?: string;

  /** Username (not authoritative) */
  readonly username?: string;

  /** Additional channel-specific metadata */
  readonly metadata?: Record<string, unknown>;
}

// ─── Channel Conversation Reference ────────────────────────────

/**
 * Reference to a conversation on a channel.
 * Maps to Vestara conversation via binding.
 */
export interface ChannelConversationRef {
  /** Channel kind */
  readonly channel: ChannelKind;

  /** External conversation ID (e.g., Telegram chat ID) */
  readonly externalId: string;

  /** Conversation type (direct, group, channel) */
  readonly type: 'direct' | 'group' | 'channel';

  /** Optional: group/channel title */
  readonly title?: string;
}

// ─── Channel Message ───────────────────────────────────────────

/**
 * Canonical message from a channel.
 * Translated from channel-specific format to Vestara format.
 */
export interface ChannelMessage {
  /** Unique message identifier */
  readonly id: string;

  /** Channel kind */
  readonly channel: ChannelKind;

  /** External message ID (for acknowledgement, editing, replies) */
  readonly externalMessageId?: string;

  /** Sender identity */
  readonly sender: ChannelIdentity;

  /** Conversation reference */
  readonly conversation: ChannelConversationRef;

  /** Message text */
  readonly text?: string;

  /** Message attachments */
  readonly attachments?: readonly ChannelAttachment[];

  /** ID of message being replied to */
  readonly replyTo?: string;

  /** Message timestamp (ISO-8601) */
  readonly timestamp: string;

  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

// ─── Channel Attachment ────────────────────────────────────────

/**
 * Attachment from a channel message.
 */
export interface ChannelAttachment {
  /** Attachment identifier */
  readonly id: string;

  /** Attachment type */
  readonly type: 'image' | 'document' | 'audio' | 'video' | 'voice' | 'sticker' | 'other';

  /** File name */
  readonly fileName: string;

  /** MIME type */
  readonly mimeType: string;

  /** File size in bytes */
  readonly size: number;

  /** URL to download the attachment */
  readonly url: string;

  /** Optional: caption or description */
  readonly caption?: string;
}

// ─── Channel Action ────────────────────────────────────────────

/**
 * Action initiated from a channel (e.g., button click, command).
 */
export interface ChannelAction {
  /** Action identifier */
  readonly id: string;

  /** Channel kind */
  readonly channel: ChannelKind;

  /** Action type */
  readonly type: 'button' | 'command' | 'callback' | 'inline_query';

  /** Action payload */
  readonly payload: ChannelActionPayload;

  /** Sender identity */
  readonly sender: ChannelIdentity;

  /** Conversation reference */
  readonly conversation: ChannelConversationRef;

  /** External message ID (for callback queries) */
  readonly externalMessageId?: string;

  /** External callback data */
  readonly callbackData?: string;

  /** Timestamp (ISO-8601) */
  readonly timestamp: string;
}

/**
 * Action payload based on type.
 */
export type ChannelActionPayload =
  | { type: 'button'; label: string; data: string }
  | { type: 'command'; command: string; args: string[] }
  | { type: 'callback'; data: string }
  | { type: 'inline_query'; query: string };

// ─── Channel Delivery ──────────────────────────────────────────

/**
 * Delivery request for sending a message to a channel.
 */
export interface ChannelDelivery {
  /** Delivery identifier */
  readonly id: string;

  /** Channel kind */
  readonly channel: ChannelKind;

  /** Target conversation */
  readonly conversation: ChannelConversationRef;

  /** Message content */
  readonly content: ChannelDeliveryContent;

  /** Optional: message ID to edit (for progressive updates) */
  readonly editMessageId?: string;

  /** Optional: reply to message ID */
  readonly replyToMessageId?: string;

  /** Delivery priority */
  readonly priority: 'low' | 'normal' | 'high';

  /** Delivery metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Delivery content.
 */
export interface ChannelDeliveryContent {
  /** Text content */
  readonly text?: string;

  /** Inline keyboard buttons */
  readonly inlineKeyboard?: readonly ChannelButton[][];

  /** Attachments to send */
  readonly attachments?: readonly ChannelAttachment[];
}

/**
 * Inline keyboard button.
 */
export interface ChannelButton {
  /** Button text */
  readonly text: string;

  /** Callback data */
  readonly callbackData: string;

  /** Optional: URL to open */
  readonly url?: string;
}

// ─── Channel Delivery Result ───────────────────────────────────

/**
 * Result of a channel delivery.
 */
export interface ChannelDeliveryResult {
  /** Delivery identifier */
  readonly deliveryId: string;

  /** Whether delivery was successful */
  readonly success: boolean;

  /** External message ID (if sent) */
  readonly externalMessageId?: string;

  /** Error message (if failed) */
  readonly error?: string;

  /** Timestamp (ISO-8601) */
  readonly timestamp: string;
}

// ─── Channel Configuration ─────────────────────────────────────

/**
 * Configuration for a channel integration.
 */
export interface ChannelConfig {
  /** Channel kind */
  readonly channel: ChannelKind;

  /** Whether channel is enabled */
  readonly enabled: boolean;

  /** Channel-specific configuration */
  readonly config: Record<string, unknown>;
}

// ─── Channel Event ─────────────────────────────────────────────

/**
 * Event from a channel.
 */
export interface ChannelEvent {
  /** Event identifier */
  readonly id: string;

  /** Channel kind */
  readonly channel: ChannelKind;

  /** Event type */
  readonly type: ChannelEventType;

  /** Event payload */
  readonly payload: unknown;

  /** Timestamp (ISO-8601) */
  readonly timestamp: string;
}

/**
 * Channel event types.
 */
export type ChannelEventType =
  | 'message.received'
  | 'message.edited'
  | 'message.deleted'
  | 'action.received'
  | 'delivery.completed'
  | 'delivery.failed'
  | 'typing.started'
  | 'typing.stopped'
  | 'member.joined'
  | 'member.left';
