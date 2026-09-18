/**
 * VES-TG-019: Telegram Rich Execution Cards
 *
 * Renders execution status as a rich, progressively-editable Telegram card:
 * headline, progress bar, step list, elapsed time, and an action keyboard.
 * Cards are projections — the Vestara Execution Authority remains canonical
 * (TG-S2) and this module never stores execution state.
 *
 * Cards are designed to be edited in place (see the TG-022 delivery
 * coalescer) so a long execution advances one message instead of flooding
 * the chat.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-019)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

import { randomBytes } from 'node:crypto';
import type { ChannelButton, ChannelDelivery } from '@vestara/channel-types';
import type { ExecutionStatus, ExecutionUpdate } from './execution-projection';

// ─── Types ─────────────────────────────────────────────────────

export type StepState = 'done' | 'active' | 'pending' | 'failed';

export interface ExecutionStep {
  /** Human label for the step */
  readonly label: string;

  /** Step state */
  readonly state: StepState;
}

export interface ExecutionCardInput {
  /** Execution ID (provenance only) */
  readonly executionId: string;

  /** Current status */
  readonly status: ExecutionStatus;

  /** Optional status message */
  readonly message?: string;

  /** Optional progress percentage (0-100) */
  readonly progressPercent?: number;

  /** Optional ordered steps */
  readonly steps?: readonly ExecutionStep[];

  /** Optional start time (ISO-8601) used for elapsed rendering */
  readonly startedAt?: string;

  /** Optional completion time (ISO-8601) */
  readonly completedAt?: string;

  /** Optional deep link back into Vestara (TG-020) */
  readonly deepLink?: string;

  /** ISO-8601 timestamp of this update */
  readonly timestamp: string;
}

export interface ExecutionCardOptions {
  /** Render the textual progress bar */
  readonly includeProgressBar?: boolean;

  /** Character width of the progress bar */
  readonly progressBarWidth?: number;

  /** Render elapsed/complete duration */
  readonly includeDuration?: boolean;

  /** Render the action keyboard */
  readonly includeKeyboard?: boolean;

  /** Render the deep link footer when present */
  readonly includeDeepLink?: boolean;
}

const DEFAULT_OPTIONS: Required<ExecutionCardOptions> = {
  includeProgressBar: true,
  progressBarWidth: 10,
  includeDuration: true,
  includeKeyboard: true,
  includeDeepLink: true,
};

const STATUS_HEADLINE: Record<ExecutionStatus, string> = {
  queued: '⏳ Queued',
  planning: '📋 Planning',
  executing: '⚡ Executing',
  verifying: '🔍 Verifying',
  completed: '✅ Completed',
  failed: '❌ Failed',
  cancelled: '🚫 Cancelled',
};

const STEP_ICON: Record<StepState, string> = {
  done: '✅',
  active: '▶️',
  pending: '⬜',
  failed: '❌',
};

const TERMINAL: readonly ExecutionStatus[] = ['completed', 'failed', 'cancelled'];

export function isTerminalStatus(status: ExecutionStatus): boolean {
  return TERMINAL.includes(status);
}

// ─── Rendering Helpers ─────────────────────────────────────────

/**
 * Render a textual progress bar. `percent` is clamped to 0-100 and the bar
 * always renders exactly `width` cells so cards do not shift horizontally as
 * progress changes.
 */
export function renderProgressBar(percent: number, width = 10): string {
  const safeWidth = Math.max(1, Math.floor(width));
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const filled = Math.round((clamped / 100) * safeWidth);
  return `[${'█'.repeat(filled)}${'░'.repeat(safeWidth - filled)}] ${Math.round(clamped)}%`;
}

/**
 * Format a duration between two ISO-8601 timestamps.
 * Returns null when either timestamp is missing or unparseable.
 */
export function formatDuration(startedAt: string | undefined, endedAt: string | undefined): string | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;

  const totalSeconds = Math.round((end - start) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ─── Card Builder ──────────────────────────────────────────────

/**
 * Build the card text. Pure — callers own delivery.
 */
export function renderExecutionCard(input: ExecutionCardInput, options?: ExecutionCardOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines: string[] = [`${STATUS_HEADLINE[input.status]} · \`${input.executionId}\``];

  if (input.message) lines.push('', input.message);
  if (opts.includeProgressBar && input.progressPercent !== undefined) {
    lines.push('', renderProgressBar(input.progressPercent, opts.progressBarWidth));
  }

  if (input.steps && input.steps.length > 0) {
    lines.push('');
    for (const step of input.steps) {
      lines.push(`${STEP_ICON[step.state]} ${step.label}`);
    }
  }

  if (opts.includeDuration) {
    const end = isTerminalStatus(input.status) ? (input.completedAt ?? input.timestamp) : undefined;
    const duration = formatDuration(input.startedAt, end);
    if (duration) lines.push('', `_Elapsed: ${duration}_`);
  }

  if (opts.includeDeepLink && input.deepLink) {
    lines.push('', `[Open in Vestara](${input.deepLink})`);
  }

  return lines.join('\n');
}

/**
 * Build the card action keyboard. Terminal cards are read-only: a finished
 * execution offers no cancel button so stale callbacks cannot be replayed
 * against it (TG-025).
 */
export function buildExecutionCardKeyboard(
  input: ExecutionCardInput,
  options?: ExecutionCardOptions,
): ChannelButton[][] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!opts.includeKeyboard) return [];

  const rows: ChannelButton[][] = [
    [
      { text: '📊 Status', callbackData: `exec:status:${input.executionId}`, url: undefined },
      ...(isTerminalStatus(input.status)
        ? []
        : [{ text: '❌ Cancel', callbackData: `exec:cancel:${input.executionId}`, url: undefined }]),
    ],
  ];

  if (opts.includeDeepLink && input.deepLink) {
    rows.push([{ text: '🔗 Open in Vestara', callbackData: `exec:open:${input.executionId}`, url: input.deepLink }]);
  }

  return rows;
}

/**
 * Build a canonical Telegram delivery for an execution card.
 * Pass `editMessageId` to advance an existing card in place.
 */
export function buildExecutionCardDelivery(
  input: ExecutionCardInput,
  chatId: string,
  options?: ExecutionCardOptions & { editMessageId?: string },
): ChannelDelivery {
  const keyboard = buildExecutionCardKeyboard(input, options);
  return {
    id: `card-${Date.now()}-${randomBytes(4).toString('hex')}`,
    channel: 'telegram',
    conversation: {
      channel: 'telegram',
      externalId: chatId,
      type: 'direct',
    },
    content: {
      text: renderExecutionCard(input, options),
      inlineKeyboard: keyboard.length > 0 ? keyboard : undefined,
    },
    editMessageId: options?.editMessageId,
    priority: input.status === 'failed' ? 'high' : 'normal',
    metadata: {
      executionId: input.executionId,
      executionStatus: input.status,
      ...(input.deepLink ? { deepLink: input.deepLink } : {}),
    },
  };
}

/**
 * Adapt a raw `ExecutionUpdate` (TG-013) into a rich card input, carrying
 * through progress metadata when present.
 */
export function executionUpdateToCardInput(
  update: ExecutionUpdate,
  extras?: { startedAt?: string; deepLink?: string; steps?: readonly ExecutionStep[] },
): ExecutionCardInput {
  const progress = update.metadata?.progressPercent;
  return {
    executionId: update.executionId,
    status: update.status,
    message: update.message,
    progressPercent:
      update.progressPercent ?? (typeof progress === 'number' && Number.isFinite(progress) ? progress : undefined),
    steps: extras?.steps,
    startedAt: extras?.startedAt,
    deepLink: extras?.deepLink,
    timestamp: update.timestamp,
  };
}
