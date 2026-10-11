/**
 * TG-031 — Pairing-command reply mirror tests.
 *
 * Proves every `/pair` + `/start` command reply (pairing code,
 * already-paired notice, pending-limit failure, start greeting) is
 * projected into the Activity Room M9 store through the existing
 * `fromAgentLifecycle` bridge, so the operator Details view shows the
 * same code the Telegram user received.
 */

import type { ChannelMessage } from '@vestara/telegram-integration';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appendMock = vi.fn();

vi.mock('../src/routes/activity-room-m11a.js', () => ({
  getM11ARoom: () => ({ store: { append: appendMock } }),
}));

import { getPairingService, handleTelegramCommand } from '../src/routes/telegram';

let userSeq = 0;

function tgMessage(text: string): ChannelMessage {
  userSeq += 1;
  const userId = `tg-mirror-user-${userSeq}`;
  return {
    channel: 'telegram',
    conversation: {
      channel: 'telegram',
      externalId: `tg-mirror-chat-${userSeq}`,
      type: 'direct',
    },
    externalMessageId: `ext-${userSeq}`,
    id: `tg-mirror-msg-${userSeq}`,
    sender: {
      channel: 'telegram',
      displayName: `Mirror User ${userSeq}`,
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

async function lastMirroredMessage(): Promise<MirroredRoomEvent> {
  await vi.waitFor(() => expect(appendMock).toHaveBeenCalled());
  return (appendMock.mock.calls.at(-1)?.[0] ?? {}) as MirroredRoomEvent;
}

describe('handleTelegramCommand Room mirror (TG-031)', () => {
  beforeEach(() => {
    appendMock.mockClear();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
  });

  it('mirrors the pairing code so the operator sees the approvable token', async () => {
    const message = tgMessage('/pair');
    const result = await handleTelegramCommand(message, 'pair');

    expect(result.status).toBe('pairing-requested');
    const mirrored = await lastMirroredMessage();
    const text = mirrored.payload?.message ?? '';
    expect(mirrored.actor?.id).toBe('agent-assistant');
    expect(text).toContain('Your Vestara pairing code:');

    const token = text.match(/pairing code:\s*(\S+)/)?.[1];
    expect(token).toBeDefined();
    // The mirrored code is the live token: approving it binds the user.
    const binding = getPairingService().approvePairing(token as string, 'hp-test-1', 'Test Principal');
    expect(binding.telegramUserId).toBe(message.sender.externalId);
  });

  it('mirrors the already-paired notice after approval', async () => {
    const message = tgMessage('/pair');
    await handleTelegramCommand(message, 'pair');
    const first = await lastMirroredMessage();
    const token = (first.payload?.message ?? '').match(/pairing code:\s*(\S+)/)?.[1] as string;
    getPairingService().approvePairing(token, 'hp-test-1', 'Test Principal');

    appendMock.mockClear();
    const result = await handleTelegramCommand(tgMessageWithSender(message), 'pair');

    expect(result.status).toBe('already-paired');
    const mirrored = await lastMirroredMessage();
    expect(mirrored.payload?.message ?? '').toContain('already paired as Test Principal');
  });

  it('mirrors the pending-limit failure on a second /pair', async () => {
    const message = tgMessage('/pair');
    await handleTelegramCommand(message, 'pair');
    await lastMirroredMessage();

    appendMock.mockClear();
    const result = await handleTelegramCommand(tgMessageWithSender(message), 'pair');

    expect(result.status).toBe('pairing-failed');
    const mirrored = await lastMirroredMessage();
    expect(mirrored.payload?.message ?? '').toContain('pending pairing request');
  });

  it('mirrors the /start greeting for an unpaired user', async () => {
    const result = await handleTelegramCommand(tgMessage('/start'), 'start');

    expect(result).toMatchObject({ status: 'started', paired: false });
    const mirrored = await lastMirroredMessage();
    expect(mirrored.payload?.message ?? '').toContain('Send /pair to link your Telegram account');
  });
});

/** Reuse the same Telegram sender so pairing state carries across calls. */
function tgMessageWithSender(first: ChannelMessage): ChannelMessage {
  return {
    ...first,
    id: `${first.id}-again`,
    text: '/pair',
    timestamp: new Date().toISOString(),
  };
}
