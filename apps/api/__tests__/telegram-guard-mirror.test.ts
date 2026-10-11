/**
 * TG-032 — Guard-failure visibility tests.
 *
 * Proves every guard rejection in `processTelegramMessage` produces a
 * user-visible reply (previously HTTP-response-only silence) and projects
 * it into the Activity Room M9 store through the existing
 * `fromAgentLifecycle` bridge:
 * - `buildGuardFailureReply` covers all nine guard statuses with generic
 *   copy (no internal IDs leak into chat text),
 * - `notifyGuardFailure` mirrors the reply without a bot token and never
 *   throws,
 * - the unpaired pipeline path returns the guard status AND mirrors the
 *   reply, so the Room never implies silence.
 */

import type { ChannelMessage } from '@vestara/telegram-integration';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appendMock = vi.fn();

vi.mock('../src/routes/activity-room-m11a.js', () => ({
  getM11ARoom: () => ({ store: { append: appendMock } }),
}));

import {
  buildGuardFailureReply,
  notifyGuardFailure,
  processTelegramMessage,
  type TelegramGuardFailureStatus,
} from '../src/routes/telegram';
import type { WorkspaceContext } from '../src/workspace-context';

let userSeq = 0;

function tgMessage(text: string): ChannelMessage {
  userSeq += 1;
  const userId = `tg-guard-user-${userSeq}`;
  return {
    channel: 'telegram',
    conversation: {
      channel: 'telegram',
      externalId: `tg-guard-chat-${userSeq}`,
      type: 'direct',
    },
    externalMessageId: `ext-${userSeq}`,
    id: `tg-guard-msg-${userSeq}`,
    sender: {
      channel: 'telegram',
      displayName: `Guard User ${userSeq}`,
      externalId: userId,
    },
    text,
    timestamp: new Date().toISOString(),
  };
}

interface MirroredRoomEvent {
  actor?: { id?: string };
  payload?: { message?: string };
}

function mirroredMessages(): string[] {
  return appendMock.mock.calls.map((call) => ((call[0] ?? {}) as MirroredRoomEvent).payload?.message ?? '');
}

describe('buildGuardFailureReply (TG-032)', () => {
  const statuses: readonly TelegramGuardFailureStatus[] = [
    'unpaired',
    'unresolved-identity',
    'question-unauthorized',
    'no-workspace',
    'conversation-limit',
    'not-configured',
    'queued',
    'rejected',
    'failed',
  ];

  it.each(statuses)('builds non-empty generic copy for %s', (status) => {
    const text = buildGuardFailureReply(status);
    expect(text.trim().length).toBeGreaterThan(0);
    // Internal identifiers must never leak into chat copy.
    expect(text).not.toMatch(/tg-guard|principal-\d|hp-test/);
  });

  it('points unpaired users at /pair', () => {
    expect(buildGuardFailureReply('unpaired')).toContain('/pair');
  });

  it('carries bounded detail for rejected/failed, generic copy without', () => {
    expect(buildGuardFailureReply('rejected', 'policy says no')).toContain('policy says no');
    expect(buildGuardFailureReply('failed', 'boom')).toContain('boom');
    expect(buildGuardFailureReply('rejected')).toContain('policy');
    expect(buildGuardFailureReply('failed')).toContain('try again');
  });

  it('truncates long error detail', () => {
    const text = buildGuardFailureReply('failed', 'x'.repeat(1000));
    expect(text.length).toBeLessThan(500);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('notifyGuardFailure (TG-032)', () => {
  beforeEach(() => {
    appendMock.mockClear();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
  });

  it('mirrors the reply into the Room and never throws without a token', async () => {
    await expect(notifyGuardFailure('chat-1', 'hello there')).resolves.toBeUndefined();
    await vi.waitFor(() => expect(appendMock).toHaveBeenCalled());
    const last = (appendMock.mock.calls.at(-1)?.[0] ?? {}) as MirroredRoomEvent;
    expect(last.actor?.id).toBe('agent-assistant');
    expect(last.payload?.message).toBe('hello there');
  });
});

describe('processTelegramMessage guard wiring (TG-032)', () => {
  beforeEach(() => {
    appendMock.mockClear();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
  });

  it('mirrors the unpaired reply so the Room never implies silence', async () => {
    const message = tgMessage('hello from an unknown user');
    const result = await processTelegramMessage(message, {} as unknown as WorkspaceContext);

    expect(result.status).toBe('unpaired');
    await vi.waitFor(() => expect(appendMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    const texts = mirroredMessages();
    // First record is the inbound mirror; the guard reply follows it.
    expect(texts[0]).toContain('[Telegram]');
    expect(texts.some((text) => text.includes('Send /pair'))).toBe(true);
  });
});
