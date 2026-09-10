/**
 * VES-TG-016: Telegram Inline Keyboards
 *
 * Manages inline keyboard buttons for interactive Telegram messages.
 * Provides keyboard builders for common actions like workspace selection,
 * conversation switching, and confirmation dialogs.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-016)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { ChannelButton } from '@vestara/channel-types';

// ─── Types ─────────────────────────────────────────────────────

export interface InlineKeyboardButton {
  /** Button text */
  readonly text: string;

  /** Callback data (sent when button is pressed) */
  readonly callbackData: string;

  /** Optional URL to open when button is pressed */
  readonly url?: string;

  /** Whether button is disabled */
  readonly disabled?: boolean;
}

export interface InlineKeyboard {
  /** Keyboard rows */
  readonly rows: InlineKeyboardButton[][];
}

export type KeyboardType =
  | 'workspace-select'
  | 'conversation-switch'
  | 'confirm-action'
  | 'model-select'
  | 'navigation'
  | 'custom';

// ─── Keyboard Builders ─────────────────────────────────────────

export class TelegramInlineKeyboard {
  /**
   * Build workspace selection keyboard.
   */
  static workspaceSelect(workspaces: Array<{ id: string; name: string; preferred?: boolean }>): InlineKeyboard {
    const rows: InlineKeyboardButton[][] = [];

    for (const ws of workspaces) {
      const prefix = ws.preferred ? '⭐ ' : '';
      rows.push([
        {
          text: `${prefix}${ws.name}`,
          callbackData: `ws:select:${ws.id}`,
        },
      ]);
    }

    // Add refresh button
    rows.push([{ text: '🔄 Refresh', callbackData: 'ws:refresh' }]);

    return { rows };
  }

  /**
   * Build conversation switch keyboard.
   */
  static conversationSwitch(
    conversations: Array<{ id: string; title: string; lastActivity?: string }>,
  ): InlineKeyboard {
    const rows: InlineKeyboardButton[][] = [];

    for (const conv of conversations) {
      const lastActivity = conv.lastActivity ? ` (${new Date(conv.lastActivity).toLocaleDateString()})` : '';
      rows.push([
        {
          text: `${conv.title}${lastActivity}`,
          callbackData: `conv:switch:${conv.id}`,
        },
      ]);
    }

    // Add new conversation button
    rows.push([{ text: '➕ New Conversation', callbackData: 'conv:new' }]);

    return { rows };
  }

  /**
   * Build confirmation dialog keyboard.
   */
  static confirmAction(action: string, confirmText = 'Confirm', cancelText = 'Cancel'): InlineKeyboard {
    return {
      rows: [
        [
          { text: `✅ ${confirmText}`, callbackData: `confirm:${action}:yes` },
          { text: `❌ ${cancelText}`, callbackData: `confirm:${action}:no` },
        ],
      ],
    };
  }

  /**
   * Build model selection keyboard.
   */
  static modelSelect(
    models: Array<{ id: string; name: string; provider: string }>,
    currentModel?: string,
  ): InlineKeyboard {
    const rows: InlineKeyboardButton[][] = [];

    for (const model of models) {
      const prefix = model.id === currentModel ? '✓ ' : '';
      rows.push([
        {
          text: `${prefix}${model.name} (${model.provider})`,
          callbackData: `model:select:${model.id}`,
        },
      ]);
    }

    return { rows };
  }

  /**
   * Build navigation keyboard (pagination).
   */
  static navigation(params: { currentPage: number; totalPages: number; callbackPrefix: string }): InlineKeyboard {
    const buttons: InlineKeyboardButton[] = [];

    if (params.currentPage > 1) {
      buttons.push({
        text: '⬅️ Previous',
        callbackData: `${params.callbackPrefix}:page:${params.currentPage - 1}`,
      });
    }

    buttons.push({
      text: `${params.currentPage}/${params.totalPages}`,
      callbackData: 'noop',
      disabled: true,
    });

    if (params.currentPage < params.totalPages) {
      buttons.push({
        text: '➡️ Next',
        callbackData: `${params.callbackPrefix}:page:${params.currentPage + 1}`,
      });
    }

    return { rows: [buttons] };
  }

  /**
   * Build execution status keyboard.
   */
  static executionStatus(executionId: string): InlineKeyboard {
    return {
      rows: [
        [
          { text: '📊 Status', callbackData: `exec:status:${executionId}` },
          { text: '❌ Cancel', callbackData: `exec:cancel:${executionId}` },
        ],
      ],
    };
  }

  /**
   * Build error recovery keyboard.
   */
  static errorRecovery(errorId: string): InlineKeyboard {
    return {
      rows: [
        [
          { text: '🔄 Retry', callbackData: `error:retry:${errorId}` },
          { text: '📋 Details', callbackData: `error:details:${errorId}` },
        ],
        [{ text: '🛑 Abort', callbackData: `error:abort:${errorId}` }],
      ],
    };
  }

  /**
   * Convert to Telegram API format.
   */
  static toTelegramFormat(keyboard: InlineKeyboard): ChannelButton[][] {
    return keyboard.rows.map((row) =>
      row.map((btn) => ({
        text: btn.text,
        callbackData: btn.callbackData,
      })),
    );
  }

  /**
   * Parse callback data from a button press.
   */
  static parseCallbackData(callbackData: string): {
    action: string;
    category: string;
    target?: string;
    params?: string[];
  } {
    const parts = callbackData.split(':');

    return {
      category: parts[0] ?? 'unknown',
      action: parts[1] ?? 'unknown',
      target: parts[2],
      params: parts.slice(3),
    };
  }
}
