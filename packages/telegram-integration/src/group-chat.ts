/**
 * VES-TG-017: Telegram Group Chat Support
 *
 * Handles multi-user group chat interactions with the Global Assistant.
 * Manages participant tracking, mention detection, and message routing.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-017)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

// ─── Types ─────────────────────────────────────────────────────

export type GroupParticipantRole = 'owner' | 'admin' | 'member' | 'restricted' | 'left' | 'kicked';

export interface GroupParticipant {
  /** Telegram user ID */
  readonly userId: string;

  /** Display name */
  readonly displayName: string;

  /** Username (if available) */
  readonly username?: string;

  /** Participant role */
  readonly role: GroupParticipantRole;

  /** Whether user is paired with Vestara */
  readonly paired: boolean;

  /** Vestara principal ID (if paired) */
  readonly principalId?: string;

  /** ISO-8601 timestamp when participant joined */
  readonly joinedAt: string;

  /** ISO-8601 timestamp of last activity */
  readonly lastActivityAt?: string;
}

export interface GroupChat {
  /** Telegram chat ID */
  readonly chatId: string;

  /** Chat title */
  readonly title: string;

  /** Chat type ('group' | 'supergroup') */
  readonly chatType: 'group' | 'supergroup';

  /** Whether bot is admin in this group */
  readonly botIsAdmin: boolean;

  /** Whether bot is paired with a workspace */
  readonly workspacePaired: boolean;

  /** Workspace ID (if paired) */
  readonly workspaceId?: string;

  /** Participants */
  readonly participants: GroupParticipant[];

  /** ISO-8601 timestamp when chat was created */
  readonly createdAt: string;

  /** ISO-8601 timestamp of last activity */
  readonly lastActivityAt?: string;
}

export interface GroupMessageContext {
  /** Chat ID */
  readonly chatId: string;

  /** Sender user ID */
  readonly senderUserId: string;

  /** Sender display name */
  readonly senderDisplayName: string;

  /** Whether bot was mentioned */
  readonly botMentioned: boolean;

  /** Whether message is a reply to bot */
  readonly isReplyToBot: boolean;

  /** Whether message contains a command */
  readonly hasCommand: boolean;

  /** Mention text (if bot mentioned) */
  readonly mentionText?: string;

  /** Reply to message ID (if reply) */
  readonly replyToMessageId?: string;
}

export interface GroupChatConfig {
  /** Bot username (for mention detection) */
  readonly botUsername?: string;

  /** Whether to respond to all messages in group */
  readonly respondToAll?: boolean;

  /** Whether to require mention to respond */
  readonly requireMention?: boolean;

  /** Maximum participants per group */
  readonly maxParticipants?: number;

  /** Whether to track participant activity */
  readonly trackActivity?: boolean;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<GroupChatConfig> = {
  botUsername: '',
  respondToAll: false,
  requireMention: true,
  maxParticipants: 1000,
  trackActivity: true,
};

// ─── Group Chat Handler ────────────────────────────────────────

export class TelegramGroupChatHandler {
  private config: Required<GroupChatConfig>;
  private groupChats: Map<string, GroupChat> = new Map();

  constructor(config?: GroupChatConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register or update a group chat.
   */
  registerChat(params: {
    chatId: string;
    title: string;
    chatType: 'group' | 'supergroup';
    botIsAdmin: boolean;
    workspaceId?: string;
  }): GroupChat {
    const existing = this.groupChats.get(params.chatId);

    const chat: GroupChat = {
      chatId: params.chatId,
      title: params.title,
      chatType: params.chatType,
      botIsAdmin: params.botIsAdmin,
      workspacePaired: !!params.workspaceId,
      workspaceId: params.workspaceId,
      participants: existing?.participants ?? [],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    this.groupChats.set(params.chatId, chat);
    return chat;
  }

  /**
   * Add or update a participant in a group.
   */
  addParticipant(chatId: string, participant: Omit<GroupParticipant, 'joinedAt'>): void {
    const chat = this.groupChats.get(chatId);
    if (!chat) return;

    const existingIndex = chat.participants.findIndex((p) => p.userId === participant.userId);

    const fullParticipant: GroupParticipant = {
      ...participant,
      joinedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      // Update existing participant
      const updated = [...chat.participants];
      updated[existingIndex] = fullParticipant;
      this.groupChats.set(chatId, { ...chat, participants: updated });
    } else {
      // Add new participant
      this.groupChats.set(chatId, {
        ...chat,
        participants: [...chat.participants, fullParticipant],
      });
    }
  }

  /**
   * Remove a participant from a group.
   */
  removeParticipant(chatId: string, userId: string): void {
    const chat = this.groupChats.get(chatId);
    if (!chat) return;

    this.groupChats.set(chatId, {
      ...chat,
      participants: chat.participants.filter((p) => p.userId !== userId),
    });
  }

  /**
   * Analyze a group message for context.
   */
  analyzeMessage(params: {
    chatId: string;
    senderUserId: string;
    senderDisplayName: string;
    text: string;
    replyToMessageId?: string;
    mentionedUsernames?: string[];
  }): GroupMessageContext {
    const chat = this.groupChats.get(params.chatId);

    // Detect bot mention
    const botMentioned = params.mentionedUsernames?.includes(this.config.botUsername) ?? false;

    // Detect reply to bot
    const isReplyToBot = params.replyToMessageId
      ? this.isReplyToBotMessage(params.chatId, params.replyToMessageId)
      : false;

    // Detect command
    const hasCommand = params.text.startsWith('/');

    // Extract mention text
    const mentionText = botMentioned ? this.extractMentionText(params.text, this.config.botUsername) : undefined;

    return {
      chatId: params.chatId,
      senderUserId: params.senderUserId,
      senderDisplayName: params.senderDisplayName,
      botMentioned,
      isReplyToBot,
      hasCommand,
      mentionText,
      replyToMessageId: params.replyToMessageId,
    };
  }

  /**
   * Check if bot should respond to a message.
   */
  shouldRespond(context: GroupMessageContext): boolean {
    // Always respond to commands
    if (context.hasCommand) return true;

    // Respond if mentioned
    if (context.botMentioned) return true;

    // Respond if reply to bot
    if (context.isReplyToBot) return true;

    // Respond to all if configured
    if (this.config.respondToAll) return true;

    // Default: don't respond
    return false;
  }

  /**
   * Get a group chat.
   */
  getChat(chatId: string): GroupChat | undefined {
    return this.groupChats.get(chatId);
  }

  /**
   * Get all participants in a group.
   */
  getParticipants(chatId: string): readonly GroupParticipant[] {
    return this.groupChats.get(chatId)?.participants ?? [];
  }

  /**
   * Get paired participants in a group.
   */
  getPairedParticipants(chatId: string): readonly GroupParticipant[] {
    return this.getParticipants(chatId).filter((p) => p.paired);
  }

  /**
   * Get participant by user ID.
   */
  getParticipant(chatId: string, userId: string): GroupParticipant | undefined {
    return this.getParticipants(chatId).find((p) => p.userId === userId);
  }

  /**
   * Check if a user is an admin in a group.
   */
  isAdmin(chatId: string, userId: string): boolean {
    const participant = this.getParticipant(chatId, userId);
    return participant?.role === 'owner' || participant?.role === 'admin';
  }

  /**
   * Get all groups the bot is in.
   */
  getAllGroups(): readonly GroupChat[] {
    return Array.from(this.groupChats.values());
  }

  /**
   * Get groups where bot is admin.
   */
  getAdminGroups(): readonly GroupChat[] {
    return Array.from(this.groupChats.values()).filter((c) => c.botIsAdmin);
  }

  // ─── Internal Methods ───────────────────────────────────────

  private isReplyToBotMessage(chatId: string, replyToMessageId: string): boolean {
    // In production, would check if the replied-to message was from the bot
    // For now, return false as we don't track all messages
    return false;
  }

  private extractMentionText(text: string, botUsername: string): string | undefined {
    const mentionPattern = new RegExp(`@${botUsername}\\s+(.*)`, 'i');
    const match = text.match(mentionPattern);
    return match?.[1]?.trim();
  }
}
