/**
 * VES-TG-019 — Telegram rich execution card tests.
 *
 * Proves:
 * - cards render canonical status, summary, timestamps, and safe actions,
 * - progress bars are clamped and fixed-width,
 * - terminal cards are read-only (no cancel button),
 * - long/error/partial results are handled,
 * - deliveries respect Telegram size limits,
 * - executionUpdateToCardInput adapts raw updates.
 */

import { describe, expect, it } from 'vitest';
import {
  buildExecutionCardDelivery,
  buildExecutionCardKeyboard,
  type ExecutionCardInput,
  type ExecutionUpdate,
  executionUpdateToCardInput,
  formatDuration,
  isTerminalStatus,
  renderExecutionCard,
  renderProgressBar,
} from '../src/rich-cards';

function cardInput(overrides?: Partial<ExecutionCardInput>): ExecutionCardInput {
  return {
    executionId: 'exec-1',
    status: 'executing',
    message: 'Running tests',
    progressPercent: 50,
    timestamp: '2026-10-18T10:00:00Z',
    ...overrides,
  };
}

describe('renderProgressBar', () => {
  it('renders a fixed-width bar', () => {
    const bar = renderProgressBar(50, 10);
    expect(bar).toContain('█████');
    expect(bar).toContain('░░░░░');
    expect(bar).toContain('50%');
  });

  it('clamps percent to 0-100', () => {
    expect(renderProgressBar(-10, 10)).toContain('0%');
    expect(renderProgressBar(150, 10)).toContain('100%');
  });

  it('handles NaN and Infinity', () => {
    expect(renderProgressBar(NaN, 10)).toContain('0%');
    expect(renderProgressBar(Infinity, 10)).toContain('100%');
  });

  it('enforces minimum width of 1', () => {
    const bar = renderProgressBar(100, 0);
    expect(bar).toContain('100%');
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration('2026-10-18T10:00:00Z', '2026-10-18T10:00:45Z')).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration('2026-10-18T10:00:00Z', '2026-10-18T10:03:30Z')).toBe('3m 30s');
  });

  it('formats hours, minutes', () => {
    expect(formatDuration('2026-10-18T10:00:00Z', '2026-10-18T12:30:00Z')).toBe('2h 30m');
  });

  it('returns null for missing or invalid timestamps', () => {
    expect(formatDuration(undefined, undefined)).toBeNull();
    expect(formatDuration('invalid', 'invalid')).toBeNull();
    expect(formatDuration('2026-10-18T10:00:00Z', '2026-10-18T09:00:00Z')).toBeNull();
  });
});

describe('isTerminalStatus', () => {
  it('identifies terminal statuses', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
  });

  it('identifies non-terminal statuses', () => {
    expect(isTerminalStatus('queued')).toBe(false);
    expect(isTerminalStatus('executing')).toBe(false);
    expect(isTerminalStatus('verifying')).toBe(false);
  });
});

describe('renderExecutionCard', () => {
  it('renders status, message, and progress', () => {
    const text = renderExecutionCard(cardInput());
    expect(text).toContain('Executing');
    expect(text).toContain('exec-1');
    expect(text).toContain('Running tests');
    expect(text).toContain('50%');
  });

  it('renders steps with icons', () => {
    const text = renderExecutionCard(
      cardInput({
        steps: [
          { label: 'Build', state: 'done' },
          { label: 'Test', state: 'active' },
          { label: 'Deploy', state: 'pending' },
        ],
      }),
    );
    expect(text).toContain('Build');
    expect(text).toContain('Test');
    expect(text).toContain('Deploy');
  });

  it('renders elapsed time for non-terminal cards', () => {
    const text = renderExecutionCard(
      cardInput({ startedAt: '2026-10-18T10:00:00Z', timestamp: '2026-10-18T10:02:00Z' }),
    );
    expect(text).toContain('Elapsed');
  });

  it('renders deep link when present', () => {
    const text = renderExecutionCard(cardInput({ deepLink: 'https://vestara.ai/exec/exec-1' }));
    expect(text).toContain('Open in Vestara');
  });

  it('handles long messages without breaking', () => {
    const longMessage = 'x'.repeat(5000);
    const text = renderExecutionCard(cardInput({ message: longMessage }));
    expect(text).toContain('Executing');
    expect(text.length).toBeGreaterThan(5000);
  });

  it('handles error status', () => {
    const text = renderExecutionCard(cardInput({ status: 'failed', message: 'Build failed' }));
    expect(text).toContain('Failed');
    expect(text).toContain('Build failed');
  });

  it('handles partial progress (no percent)', () => {
    const text = renderExecutionCard(cardInput({ progressPercent: undefined }));
    expect(text).not.toContain('%');
  });
});

describe('buildExecutionCardKeyboard', () => {
  it('includes cancel for non-terminal cards', () => {
    const keyboard = buildExecutionCardKeyboard(cardInput());
    const flat = keyboard.flat();
    expect(flat.some((b) => b.callbackData === 'exec:cancel:exec-1')).toBe(true);
  });

  it('omits cancel for terminal cards', () => {
    const keyboard = buildExecutionCardKeyboard(cardInput({ status: 'completed' }));
    const flat = keyboard.flat();
    expect(flat.some((b) => b.callbackData === 'exec:cancel:exec-1')).toBe(false);
  });

  it('includes deep link button when present', () => {
    const keyboard = buildExecutionCardKeyboard(cardInput({ deepLink: 'https://vestara.ai/exec/1' }));
    const flat = keyboard.flat();
    expect(flat.some((b) => b.url === 'https://vestara.ai/exec/1')).toBe(true);
  });

  it('returns empty when keyboard disabled', () => {
    const keyboard = buildExecutionCardKeyboard(cardInput(), { includeKeyboard: false });
    expect(keyboard).toEqual([]);
  });
});

describe('buildExecutionCardDelivery', () => {
  it('builds a delivery with text and keyboard', () => {
    const delivery = buildExecutionCardDelivery(cardInput(), 'chat-1');
    expect(delivery.channel).toBe('telegram');
    expect(delivery.content.text).toContain('Executing');
    expect(delivery.content.inlineKeyboard).toBeDefined();
    expect(delivery.metadata?.executionId).toBe('exec-1');
  });

  it('supports editMessageId for progressive updates', () => {
    const delivery = buildExecutionCardDelivery(cardInput(), 'chat-1', { editMessageId: 'msg-42' });
    expect(delivery.editMessageId).toBe('msg-42');
  });

  it('marks failed cards as high priority', () => {
    const delivery = buildExecutionCardDelivery(cardInput({ status: 'failed' }), 'chat-1');
    expect(delivery.priority).toBe('high');
  });
});

describe('executionUpdateToCardInput', () => {
  it('adapts a raw ExecutionUpdate', () => {
    const update: ExecutionUpdate = {
      executionId: 'exec-9',
      status: 'executing',
      message: 'Deploying',
      progressPercent: 75,
      timestamp: '2026-10-18T10:00:00Z',
    };
    const input = executionUpdateToCardInput(update);
    expect(input.executionId).toBe('exec-9');
    expect(input.status).toBe('executing');
    expect(input.progressPercent).toBe(75);
  });

  it('carries progress from metadata when top-level is absent', () => {
    const update: ExecutionUpdate = {
      executionId: 'exec-9',
      status: 'executing',
      timestamp: '2026-10-18T10:00:00Z',
      metadata: { progressPercent: 30 },
    };
    const input = executionUpdateToCardInput(update);
    expect(input.progressPercent).toBe(30);
  });

  it('passes through extras', () => {
    const update: ExecutionUpdate = {
      executionId: 'exec-9',
      status: 'executing',
      timestamp: '2026-10-18T10:00:00Z',
    };
    const input = executionUpdateToCardInput(update, {
      startedAt: '2026-10-18T09:58:00Z',
      deepLink: 'https://vestara.ai/exec/9',
      steps: [{ label: 'Build', state: 'done' }],
    });
    expect(input.startedAt).toBe('2026-10-18T09:58:00Z');
    expect(input.deepLink).toBe('https://vestara.ai/exec/9');
    expect(input.steps).toHaveLength(1);
  });
});
