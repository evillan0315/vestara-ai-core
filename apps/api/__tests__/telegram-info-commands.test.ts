/**
 * Info-command tests (`/help`, `/status`, `/workspace`, `/conversations`).
 *
 * Proves the read-only TG-012 registry wiring: every info command sends a
 * user-visible reply and projects it into the Activity Room M9 store
 * through the existing `fromAgentLifecycle` bridge (same contract as the
 * TG-031 pairing mirror). Unpaired callers get the registry's "need to
 * pair" copy — never silence.
 */

import type { ChannelMessage } from '@vestara/telegram-integration';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const appendMock = vi.fn();

vi.mock('../src/routes/activity-room-m11a.js', () => ({
  getM11ARoom: () => ({ store: { append: appendMock } }),
}));

import { getPairingService, handleTelegramCommand } from '../src/routes/telegram';

let userSeq = 0;

function tgMessage(text: string, sender?: { id: string; name: string }): ChannelMessage {
  userSeq += 1;
  const userId = sender?.id ?? `tg-info-user-${userSeq}`;
  const displayName = sender?.name ?? `Info User ${userSeq}`;
  return {
    channel: 'telegram',
    conversation: {
      channel: 'telegram',
      externalId: `tg-info-chat-${userSeq}`,
      type: 'direct',
    },
    externalMessageId: `ext-${userSeq}`,
    id: `tg-info-msg-${userSeq}`,
    sender: {
      channel: 'telegram',
      displayName,
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

async function lastMirroredMessage(): Promise<string> {
  await vi.waitFor(() => expect(appendMock).toHaveBeenCalled());
  const event = (appendMock.mock.calls.at(-1)?.[0] ?? {}) as MirroredRoomEvent;
  return event.payload?.message ?? '';
}

/** Pair a fresh sender and return its identity for follow-up commands. */
async function pairFreshSender(): Promise<{ id: string; name: string; principalId: string }> {
  userSeq += 1;
  const sender = { id: `tg-info-user-${userSeq}`, name: `Info User ${userSeq}` };
  const principalId = `hp-info-${userSeq}`;
  const request = await handleTelegramCommand(tgMessage('/pair', sender), 'pair');
  if (request.status !== 'pairing-requested') throw new Error(`setup failed: ${request.status}`);
  const token = ((await lastMirroredMessage()).match(/pairing code:\s*(\S+)/)?.[1] ?? '').trim();
  getPairingService().approvePairing(token, principalId, sender.name);
  appendMock.mockClear();
  return { ...sender, principalId };
}

describe('info commands (TG-012 wiring)', () => {
  beforeEach(() => {
    appendMock.mockClear();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
  });

  it('answers /help for unpaired users with the command list', async () => {
    const result = await handleTelegramCommand(tgMessage('/help'), 'help');

    expect(result).toEqual({ status: 'command-answered', command: 'help', success: true });
    const mirrored = await lastMirroredMessage();
    expect(mirrored).toContain('Vestara Bot Commands');
    expect(mirrored).toContain('/pair');
    expect(mirrored).not.toContain('**');
  });

  it('answers /status for unpaired users with the need-to-pair copy', async () => {
    const result = await handleTelegramCommand(tgMessage('/status'), 'status');

    expect(result).toEqual({ status: 'command-answered', command: 'status', success: false });
    expect(await lastMirroredMessage()).toContain('/pair');
  });

  it('answers /status for paired users with their session state', async () => {
    const sender = await pairFreshSender();
    const result = await handleTelegramCommand(tgMessage('/status', sender), 'status');

    expect(result).toEqual({ status: 'command-answered', command: 'status', success: true });
    const mirrored = await lastMirroredMessage();
    expect(mirrored).toContain('Session Status');
    expect(mirrored).toContain(sender.principalId);
  });

  it('answers /workspace for paired users with no bindings yet', async () => {
    const sender = await pairFreshSender();
    const result = await handleTelegramCommand(tgMessage('/workspace', sender), 'workspace');

    expect(result).toEqual({ status: 'command-answered', command: 'workspace', success: true });
    expect(await lastMirroredMessage()).toContain('No workspaces bound');
  });

  it('answers /conversations for paired users with no bindings yet', async () => {
    const sender = await pairFreshSender();
    const result = await handleTelegramCommand(tgMessage('/conversations', sender), 'conversations');

    expect(result).toEqual({ status: 'command-answered', command: 'conversations', success: true });
    expect(await lastMirroredMessage()).toContain('No conversations bound');
  });

  it('accepts command args without breaking the mirror', async () => {
    const sender = await pairFreshSender();
    const result = await handleTelegramCommand(tgMessage('/workspace list', sender), 'workspace');

    expect(result).toEqual({ status: 'command-answered', command: 'workspace', success: true });
    expect(await lastMirroredMessage()).toContain('No workspaces bound');
  });
});
