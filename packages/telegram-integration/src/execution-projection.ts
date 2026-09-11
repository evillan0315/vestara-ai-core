/**
 * VES-TG-013: Telegram Execution Projection
 *
 * Projects execution status updates to Telegram as messages.
 * Provides real-time feedback on task execution, progress, and completion.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-013)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { ChannelDelivery } from '@vestara/channel-types';

// ─── Types ─────────────────────────────────────────────────────

export type ExecutionStatus = 'queued' | 'planning' | 'executing' | 'verifying' | 'completed' | 'failed' | 'cancelled';

export type ProgressLevel = 'none' | 'brief' | 'detailed';

export interface ExecutionUpdate {
  /** Execution ID */
  readonly executionId: string;

  /** Current status */
  readonly status: ExecutionStatus;

  /** Optional progress message */
  readonly message?: string;

  /** Progress percentage (0-100) */
  readonly progressPercent?: number;

  /** ISO-8601 timestamp */
  readonly timestamp: string;

  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

export interface ExecutionProjectionConfig {
  /** Default progress level */
  readonly defaultProgressLevel?: ProgressLevel;

  /** Whether to send completion message */
  readonly sendCompletionMessage?: boolean;

  /** Whether to send failure message */
  readonly sendFailureMessage?: boolean;

  /** Whether to include timestamps in messages */
  readonly includeTimestamps?: boolean;

  /** Message template for status updates */
  readonly statusTemplate?: string;

  /** Message template for completion */
  readonly completionTemplate?: string;

  /** Message template for failure */
  readonly failureTemplate?: string;
}

// ─── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: Required<ExecutionProjectionConfig> = {
  defaultProgressLevel: 'brief',
  sendCompletionMessage: true,
  sendFailureMessage: true,
  includeTimestamps: true,
  statusTemplate: '{emoji} **{status}**: {message}',
  completionTemplate: '✅ **Execution Complete**\n\n{summary}',
  failureTemplate: '❌ **Execution Failed**\n\n{error}',
};

// ─── Status Emoji Map ──────────────────────────────────────────

const STATUS_EMOJI: Record<ExecutionStatus, string> = {
  queued: '⏳',
  planning: '📋',
  executing: '⚡',
  verifying: '🔍',
  completed: '✅',
  failed: '❌',
  cancelled: '🚫',
};

// ─── Execution Projection Service ──────────────────────────────

export class TelegramExecutionProjection {
  private config: Required<ExecutionProjectionConfig>;
  private activeExecutions: Map<string, ExecutionUpdate> = new Map();

  constructor(config?: ExecutionProjectionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Project an execution update to a Telegram chat.
   */
  projectUpdate(update: ExecutionUpdate, chatId: string, progressLevel?: ProgressLevel): ChannelDelivery {
    // Track active execution
    this.activeExecutions.set(update.executionId, update);

    // Build message based on progress level
    const level = progressLevel ?? this.config.defaultProgressLevel;
    const message = this.buildStatusMessage(update, level);

    // Remove from active if terminal
    if (this.isTerminal(update.status)) {
      this.activeExecutions.delete(update.executionId);
    }

    return {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channel: 'telegram',
      conversation: {
        channel: 'telegram',
        externalId: chatId,
        type: 'direct',
      },
      content: { text: message },
      priority: update.status === 'failed' ? 'high' : 'normal',
    };
  }

  /**
   * Project a completion message.
   */
  projectCompletion(_executionId: string, summary: string, chatId: string): ChannelDelivery | null {
    if (!this.config.sendCompletionMessage) return null;

    const message = this.config.completionTemplate.replace('{summary}', summary);

    return {
      id: `proj-comp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channel: 'telegram',
      conversation: {
        channel: 'telegram',
        externalId: chatId,
        type: 'direct',
      },
      content: { text: message },
      priority: 'normal',
    };
  }

  /**
   * Project a failure message.
   */
  projectFailure(_executionId: string, error: string, chatId: string): ChannelDelivery | null {
    if (!this.config.sendFailureMessage) return null;

    const message = this.config.failureTemplate.replace('{error}', error);

    return {
      id: `proj-fail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channel: 'telegram',
      conversation: {
        channel: 'telegram',
        externalId: chatId,
        type: 'direct',
      },
      content: { text: message },
      priority: 'high',
    };
  }

  /**
   * Get active executions.
   */
  getActiveExecutions(): readonly ExecutionUpdate[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Check if an execution is active.
   */
  isActive(executionId: string): boolean {
    return this.activeExecutions.has(executionId);
  }

  /**
   * Get execution status.
   */
  getExecutionStatus(executionId: string): ExecutionUpdate | undefined {
    return this.activeExecutions.get(executionId);
  }

  // ─── Internal Methods ───────────────────────────────────────

  private buildStatusMessage(update: ExecutionUpdate, level: ProgressLevel): string {
    const emoji = STATUS_EMOJI[update.status];
    const statusLabel = this.formatStatus(update.status);

    const parts: string[] = [];

    if (level === 'none') {
      return `${emoji} ${statusLabel}`;
    }

    parts.push(`${emoji} **${statusLabel}**`);

    if (update.message) {
      parts.push(update.message);
    }

    if (level === 'detailed' && update.progressPercent !== undefined) {
      parts.push(`Progress: ${update.progressPercent}%`);
    }

    if (this.config.includeTimestamps) {
      const time = new Date(update.timestamp).toLocaleTimeString();
      parts.push(`_${time}_`);
    }

    return parts.join('\n');
  }

  private formatStatus(status: ExecutionStatus): string {
    const labels: Record<ExecutionStatus, string> = {
      queued: 'Queued',
      planning: 'Planning',
      executing: 'Executing',
      verifying: 'Verifying',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };
    return labels[status];
  }

  private isTerminal(status: ExecutionStatus): boolean {
    return status === 'completed' || status === 'failed' || status === 'cancelled';
  }
}
