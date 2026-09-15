/**
 * VES-TG-012: Telegram Basic Commands
 *
 * Handles Telegram bot commands for workspace management, conversation
 * control, and help. Commands are prefixed with '/' per Telegram convention.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-012)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { TelegramConversationBindingService } from './conversation-binding';
import type { TelegramWorkspaceBindingService } from './workspace-binding';

// ─── Types ─────────────────────────────────────────────────────

export type CommandCategory = 'workspace' | 'conversation' | 'help' | 'admin';

export interface TelegramCommand {
  /** Command name (without /) */
  readonly name: string;

  /** Command description */
  readonly description: string;

  /** Command category */
  readonly category: CommandCategory;

  /** Usage string */
  readonly usage: string;

  /** Whether command requires authentication */
  readonly requiresAuth: boolean;

  /** Whether command is admin-only */
  readonly adminOnly: boolean;
}

export interface CommandContext {
  /** Telegram user ID */
  readonly telegramUserId: string;

  /** Telegram chat ID */
  readonly telegramChatId: string;

  /** Telegram chat type */
  readonly telegramChatType: 'direct' | 'group';

  /** Principal ID (if authenticated) */
  readonly principalId?: string;

  /** Workspace ID (if workspace selected) */
  readonly workspaceId?: string;

  /** Command arguments */
  readonly args: string[];
}

export interface CommandResult {
  /** Whether command was successful */
  readonly success: boolean;

  /** Response text to send to Telegram */
  readonly response: string;

  /** Whether to send as markdown */
  readonly markdown?: boolean;

  /** Whether to send as reply to original message */
  readonly replyToMessage?: boolean;
}

export interface CommandHandler {
  /** Execute the command */
  execute(context: CommandContext): Promise<CommandResult> | CommandResult;
}

/**
 * Authoritative read sources for basic commands (TG-012).
 *
 * Commands are read-only projections over the TG-008 workspace binding
 * and TG-009 conversation binding authorities. They never own
 * conversations, executions, or permissions (TG-S1/S2/S3) and never
 * invoke execution — non-command text still enters the natural-language
 * Global Assistant path (TG-010).
 */
export interface CommandServiceProviders {
  /** TG-008 workspace binding authority (read-only projection) */
  readonly workspaceBindings?: Pick<
    TelegramWorkspaceBindingService,
    'getBindingsByPrincipal' | 'getPreferredWorkspace'
  >;
  /** TG-009 conversation binding authority (read-only projection) */
  readonly conversationBindings?: Pick<
    TelegramConversationBindingService,
    'getBindingsByPrincipal' | 'getActiveBinding'
  >;
}

export interface CommandRegistryConfig {
  /** Authoritative services backing /status, /workspace, /conversations */
  readonly providers?: CommandServiceProviders;
}

// ─── Built-in Commands ─────────────────────────────────────────

const BUILTIN_COMMANDS: TelegramCommand[] = [
  {
    name: 'start',
    description: 'Start a conversation with the Global Assistant',
    category: 'help',
    usage: '/start',
    requiresAuth: false,
    adminOnly: false,
  },
  {
    name: 'help',
    description: 'Show available commands',
    category: 'help',
    usage: '/help [command]',
    requiresAuth: false,
    adminOnly: false,
  },
  {
    name: 'workspace',
    description: 'Select or list workspaces',
    category: 'workspace',
    usage: '/workspace [list|select|info]',
    requiresAuth: true,
    adminOnly: false,
  },
  {
    name: 'new',
    description: 'Start a new conversation',
    category: 'conversation',
    usage: '/new [title]',
    requiresAuth: true,
    adminOnly: false,
  },
  {
    name: 'switch',
    description: 'Switch to an existing conversation',
    category: 'conversation',
    usage: '/switch <conversation-id>',
    requiresAuth: true,
    adminOnly: false,
  },
  {
    name: 'history',
    description: 'Show recent conversation history',
    category: 'conversation',
    usage: '/history [count]',
    requiresAuth: true,
    adminOnly: false,
  },
  {
    name: 'conversations',
    description: 'List conversations bound to your chats',
    category: 'conversation',
    usage: '/conversations',
    requiresAuth: true,
    adminOnly: false,
  },
  {
    name: 'model',
    description: 'Change the AI model',
    category: 'conversation',
    usage: '/model [model-name]',
    requiresAuth: true,
    adminOnly: false,
  },
  {
    name: 'status',
    description: 'Show current session status',
    category: 'help',
    usage: '/status',
    requiresAuth: true,
    adminOnly: false,
  },
  {
    name: 'reset',
    description: 'Reset the current conversation',
    category: 'conversation',
    usage: '/reset',
    requiresAuth: true,
    adminOnly: false,
  },
  {
    name: 'pair',
    description: 'Pair Telegram account with Vestara',
    category: 'help',
    usage: '/pair',
    requiresAuth: false,
    adminOnly: false,
  },
  {
    name: 'admin',
    description: 'Admin commands (admin only)',
    category: 'admin',
    usage: '/admin <subcommand>',
    requiresAuth: true,
    adminOnly: true,
  },
];

// ─── Command Registry ──────────────────────────────────────────

export class TelegramCommandRegistry {
  private commands: Map<string, TelegramCommand> = new Map();
  private handlers: Map<string, CommandHandler> = new Map();
  private providers: CommandServiceProviders;

  constructor(config?: CommandRegistryConfig) {
    this.providers = config?.providers ?? {};
    // Register built-in commands
    for (const cmd of BUILTIN_COMMANDS) {
      this.commands.set(cmd.name, cmd);
    }
  }

  /**
   * Register a custom command.
   */
  register(command: TelegramCommand, handler: CommandHandler): void {
    this.commands.set(command.name, command);
    this.handlers.set(command.name, handler);
  }

  /**
   * Parse a message for a command.
   */
  parseCommand(text: string): { command: string; args: string[] } | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith('/')) return null;

    const parts = trimmed.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    return { command, args };
  }

  /**
   * Execute a command.
   */
  async executeCommand(commandName: string, context: CommandContext): Promise<CommandResult> {
    const command = this.commands.get(commandName);
    if (!command) {
      return {
        success: false,
        response: `Unknown command: /${commandName}\nType /help for available commands.`,
      };
    }

    // Check authentication
    if (command.requiresAuth && !context.principalId) {
      return {
        success: false,
        response: 'You need to pair your Telegram account first. Use /pair to get started.',
      };
    }

    // Check admin
    if (command.adminOnly) {
      // In production, would check admin status
      return {
        success: false,
        response: 'This command is admin-only.',
      };
    }

    // Get handler
    const handler = this.handlers.get(commandName);
    if (!handler) {
      // Built-in command without custom handler — provide default responses
      return this.executeBuiltinCommand(commandName, context);
    }

    return handler.execute(context);
  }

  /**
   * Get all available commands for a user.
   */
  getAvailableCommands(isAuthenticated: boolean): readonly TelegramCommand[] {
    return BUILTIN_COMMANDS.filter((cmd) => {
      if (cmd.adminOnly) return false;
      if (cmd.requiresAuth && !isAuthenticated) return false;
      return true;
    });
  }

  /**
   * Get help text for a specific command.
   */
  getCommandHelp(commandName: string): string | null {
    const command = this.commands.get(commandName);
    if (!command) return null;

    return [
      `/${command.name} — ${command.description}`,
      `Usage: ${command.usage}`,
      command.requiresAuth ? '🔒 Requires authentication' : '🔓 No authentication required',
    ].join('\n');
  }

  /**
   * Get full help text.
   */
  getFullHelp(isAuthenticated: boolean): string {
    const commands = this.getAvailableCommands(isAuthenticated);
    const lines: string[] = ['🤖 Vestara Bot Commands\n'];

    const categories = new Map<CommandCategory, TelegramCommand[]>();
    for (const cmd of commands) {
      const list = categories.get(cmd.category) ?? [];
      list.push(cmd);
      categories.set(cmd.category, list);
    }

    for (const [category, cmds] of categories) {
      lines.push(`**${this.formatCategory(category)}:**`);
      for (const cmd of cmds) {
        lines.push(`  /${cmd.name} — ${cmd.description}`);
      }
      lines.push('');
    }

    lines.push('Type /help <command> for detailed usage.');
    return lines.join('\n');
  }

  // ─── Internal Methods ───────────────────────────────────────

  private executeBuiltinCommand(commandName: string, context: CommandContext): CommandResult {
    switch (commandName) {
      case 'start':
        return {
          success: true,
          response: [
            '👋 Welcome to Vestara!',
            '',
            'I am your Global Assistant. I can help you with:',
            '• Workspace management',
            '• Code analysis and generation',
            '• Task planning and execution',
            '',
            'Use /help to see available commands.',
            'Use /pair to link your Telegram account.',
          ].join('\n'),
        };

      case 'help':
        return {
          success: true,
          response: this.getFullHelp(!!context.principalId),
        };

      case 'status':
        return {
          success: true,
          response: this.buildStatusResponse(context),
        };

      case 'workspace':
        return this.handleWorkspaceCommand(context);

      case 'conversations':
        return this.handleConversationsCommand(context);

      case 'pair':
        return {
          success: true,
          response: [
            '🔗 Pairing Your Account',
            '',
            'To link your Telegram account with Vestara:',
            '1. Open Vestara in your browser',
            '2. Go to Settings → Telegram',
            '3. Click "Generate Pairing Code"',
            '4. Enter the code here',
            '',
            'The code expires in 10 minutes.',
          ].join('\n'),
        };

      default:
        return {
          success: false,
          response: `Command /${commandName} is not implemented.`,
        };
    }
  }

  /**
   * Build /status from authoritative binding services when connected,
   * falling back to the session context echo when they are absent.
   */
  private buildStatusResponse(context: CommandContext): string {
    const lines: string[] = ['📊 Session Status', ''];

    if (context.principalId && this.providers.workspaceBindings) {
      const preferred = this.providers.workspaceBindings.getPreferredWorkspace(context.principalId);
      lines.push(`Workspace: ${preferred ? `${preferred.workspaceName} (${preferred.workspaceId})` : 'Not selected'}`);
    } else {
      lines.push(`Workspace: ${context.workspaceId ?? 'Not selected'}`);
    }

    if (context.principalId && this.providers.conversationBindings) {
      const bindings = this.providers.conversationBindings.getBindingsByPrincipal(context.principalId);
      const active = this.providers.conversationBindings.getActiveBinding(context.telegramChatId, context.principalId);
      const activeSuffix = active
        ? ` (this chat: ${active.vestaraConversationTitle ?? active.vestaraConversationId})`
        : '';
      lines.push(`Conversations: ${bindings.length} bound${activeSuffix}`);
    }

    lines.push(`Principal: ${context.principalId ?? 'Not authenticated'}`);
    lines.push(`Chat: ${context.telegramChatId}`);
    lines.push(`Chat Type: ${context.telegramChatType}`);
    return lines.join('\n');
  }

  /**
   * Handle /workspace [list|info] as a read-only projection over TG-008.
   */
  private handleWorkspaceCommand(context: CommandContext): CommandResult {
    const principalId = context.principalId;
    if (!principalId) {
      return {
        success: false,
        response: 'You need to pair your Telegram account first. Use /pair to get started.',
      };
    }
    const source = this.providers.workspaceBindings;
    if (!source) {
      return {
        success: false,
        response: 'Workspace service is not connected. Try again later.',
      };
    }

    const sub = context.args[0]?.toLowerCase() ?? 'list';
    if (sub === 'info') {
      const preferred = source.getPreferredWorkspace(principalId);
      if (!preferred) {
        return {
          success: true,
          response: 'No preferred workspace selected. Use /workspace list to see your workspaces.',
        };
      }
      return {
        success: true,
        response: [
          '📁 Workspace',
          '',
          `Name: ${preferred.workspaceName}`,
          `ID: ${preferred.workspaceId}`,
          `Last accessed: ${preferred.lastAccessedAt}`,
        ].join('\n'),
      };
    }

    if (sub !== 'list') {
      return { success: true, response: `Usage: /workspace [list|info]` };
    }

    const bindings = source.getBindingsByPrincipal(principalId);
    if (bindings.length === 0) {
      return { success: true, response: 'No workspaces bound to your account yet.' };
    }
    const lines: string[] = ['📁 Workspaces', ''];
    for (const b of bindings) {
      lines.push(`• ${b.workspaceName} (${b.workspaceId})${b.preferred ? ' — preferred' : ''}`);
    }
    return { success: true, response: lines.join('\n') };
  }

  /**
   * Handle /conversations as a read-only projection over TG-009.
   */
  private handleConversationsCommand(context: CommandContext): CommandResult {
    const principalId = context.principalId;
    if (!principalId) {
      return {
        success: false,
        response: 'You need to pair your Telegram account first. Use /pair to get started.',
      };
    }
    const source = this.providers.conversationBindings;
    if (!source) {
      return {
        success: false,
        response: 'Conversation service is not connected. Try again later.',
      };
    }

    const bindings = source.getBindingsByPrincipal(principalId);
    if (bindings.length === 0) {
      return { success: true, response: 'No conversations bound to your chats yet. Just send a message to start.' };
    }
    const active = source.getActiveBinding(context.telegramChatId, principalId);
    const lines: string[] = ['💬 Conversations', ''];
    for (const b of bindings) {
      const title = b.vestaraConversationTitle ?? b.vestaraConversationId;
      const marker = active && active.id === b.id ? ' (this chat)' : '';
      lines.push(`• ${title} [${b.status}] — chat ${b.telegramChatId}${marker}`);
    }
    return { success: true, response: lines.join('\n') };
  }

  private formatCategory(category: CommandCategory): string {
    const labels: Record<CommandCategory, string> = {
      workspace: '📁 Workspace',
      conversation: '💬 Conversation',
      help: '❓ Help',
      admin: '🔧 Admin',
    };
    return labels[category] ?? category;
  }
}
