/**
 * Question-answer mirror tests (tap + typed resolutions).
 *
 * Proves a resolved assistant question leaves an Activity Room record of
 * the outcome — previously only the broker knew:
 * - pure builder: answered / rejected / already-resolved / blank fallbacks,
 * - tap path via `dispatchTelegramQuestionTap` with fake transport deps
 *   (no network): staged + submitted answers mirror the resolution,
 * - typed path via `tryAnswerForwardedQuestionByText` with stubbed fetch
 *   (no network): the confirmation mirrors what the answer meant.
 */

import type { ChannelMessage, ProjectedQuestion } from '@vestara/telegram-integration';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appendMock = vi.fn();

vi.mock('../src/routes/activity-room-m11a.js', () => ({
  getM11ARoom: () => ({ store: { append: appendMock } }),
}));

import {
  buildQuestionAnswerMirrorMessage,
  dispatchTelegramQuestionTap,
  getPairingService,
  tryAnswerForwardedQuestionByText,
} from '../src/routes/telegram';
import { telegramQuestionLedger } from '../src/telegram-question-bridge';
import type { WorkspaceContext } from '../src/workspace-context';

function singleQuestion(): ProjectedQuestion[] {
  return [
    {
      question: 'Which region?',
      header: 'Deploy',
      options: [{ label: 'us-east' }, { label: 'eu-west' }],
    },
  ];
}

interface MirroredRoomEvent {
  actor?: { id?: string };
  payload?: { message?: string };
}

function mirroredMessages(): string[] {
  return appendMock.mock.calls.map((call) => ((call[0] ?? {}) as MirroredRoomEvent).payload?.message ?? '');
}

let userSeq = 0;

/** Pair a fresh sender; returns ids wired for the raw-principal fallback. */
function pairFreshSender(principalPrefix: string): { userId: string; principalId: string } {
  userSeq += 1;
  const userId = `tg-ans-user-${userSeq}`;
  const principalId = `${principalPrefix}-${userSeq}`;
  const request = getPairingService().createPairingRequest(userId, `Answer User ${userSeq}`);
  getPairingService().approvePairing(request.token, principalId, `Answer User ${userSeq}`);
  return { userId, principalId };
}

function trackEntry(overrides: { chatId: string; messageId: string; principalId: string }): void {
  telegramQuestionLedger.track({
    chatId: overrides.chatId,
    messageId: overrides.messageId,
    conversationId: `conv-${overrides.chatId}`,
    requestId: `req-${overrides.messageId}`,
    principalId: overrides.principalId,
    questions: singleQuestion(),
    selections: new Map(),
    expiresAt: Date.now() + 60_000,
  });
}

describe('buildQuestionAnswerMirrorMessage', () => {
  it('renders tap/typed answers with the sender', () => {
    expect(
      buildQuestionAnswerMirrorMessage({
        question: 'Which region?',
        picked: 'eu-west',
        senderLabel: 'tg-ans-user-1',
        accepted: true,
        outcome: 'answered',
      }),
    ).toBe('[Telegram] tg-ans-user-1 answered "Which region?": eu-west');
  });

  it('marks broker-rejected resolutions as already resolved', () => {
    expect(
      buildQuestionAnswerMirrorMessage({
        question: 'Which region?',
        picked: 'eu-west',
        senderLabel: 'Op',
        accepted: false,
        outcome: 'answered',
      }),
    ).toContain('(already resolved in the app)');
  });

  it('renders rejections without a pick', () => {
    expect(
      buildQuestionAnswerMirrorMessage({
        question: 'Which region?',
        picked: '',
        senderLabel: 'tg-ans-user-1',
        accepted: true,
        outcome: 'rejected',
      }),
    ).toBe('[Telegram] tg-ans-user-1 rejected "Which region?"');
  });

  it('falls back on blank sender and question', () => {
    const text = buildQuestionAnswerMirrorMessage({
      question: '  ',
      picked: 'x',
      senderLabel: '  ',
      accepted: true,
      outcome: 'answered',
    });
    expect(text).toContain('unknown sender');
    expect(text).toContain('"Question"');
  });
});

describe('tap answer mirror', () => {
  beforeEach(() => {
    appendMock.mockClear();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ ok: true, result: { message_id: '9' } }) })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function ctx(): WorkspaceContext {
    return {
      assistantInteractionBroker: {
        decideQuestion: () => true,
        cancelQuestion: () => true,
      },
    } as unknown as WorkspaceContext;
  }

  function tapBody(chatId: string, messageId: string, senderId: string, data: string): string {
    return JSON.stringify({
      callback_query: {
        id: 'q-1',
        data,
        from: { id: senderId },
        message: { message_id: messageId, chat: { id: chatId } },
      },
    });
  }

  it('mirrors a submitted tap answer with the pick', async () => {
    const { userId, principalId } = pairFreshSender('hp-tap');
    const chatId = `tg-tap-chat-${userId}`;
    const messageId = `tap-msg-${userId}`;
    trackEntry({ chatId, messageId, principalId });

    expect(await dispatchTelegramQuestionTap(ctx(), tapBody(chatId, messageId, userId, 'tq:s:0:1'))).toBe(true);
    expect(await dispatchTelegramQuestionTap(ctx(), tapBody(chatId, messageId, userId, 'tq:done'))).toBe(true);

    await vi.waitFor(() => expect(appendMock).toHaveBeenCalled());
    expect(
      mirroredMessages().some((text) => text.includes(`[Telegram] ${userId} answered "Which region?": eu-west`)),
    ).toBe(true);
  });

  it('mirrors a tap rejection', async () => {
    const { userId, principalId } = pairFreshSender('hp-tap-reject');
    const chatId = `tg-tap-chat-${userId}`;
    const messageId = `tap-msg-${userId}`;
    trackEntry({ chatId, messageId, principalId });

    expect(await dispatchTelegramQuestionTap(ctx(), tapBody(chatId, messageId, userId, 'tq:no'))).toBe(true);

    await vi.waitFor(() => expect(appendMock).toHaveBeenCalled());
    expect(mirroredMessages().some((text) => text.includes(`[Telegram] ${userId} rejected "Which region?"`))).toBe(
      true,
    );
  });
});

describe('typed answer mirror', () => {
  beforeEach(() => {
    appendMock.mockClear();
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ json: async () => ({ ok: true, result: { message_id: '9' } }) })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('mirrors the confirmation with what the answer meant', async () => {
    const { userId, principalId } = pairFreshSender('hp-typed');
    const chatId = `tg-typed-chat-${userId}`;
    trackEntry({ chatId, messageId: `typed-msg-${userId}`, principalId });

    const message: ChannelMessage = {
      channel: 'telegram',
      conversation: { channel: 'telegram', externalId: chatId, type: 'direct' },
      externalMessageId: 'ext-typed',
      id: 'tg-typed-msg-1',
      sender: { channel: 'telegram', displayName: 'Typed User', externalId: userId },
      text: '2',
      timestamp: new Date().toISOString(),
    };
    const outcome = await tryAnswerForwardedQuestionByText(message);

    expect(outcome).toEqual({ status: 'answered' });
    await vi.waitFor(() => expect(appendMock).toHaveBeenCalled());
    expect(
      mirroredMessages().some((text) =>
        text.includes('[Telegram] Typed User answered "Which region?": eu-west (already resolved in the app)'),
      ),
    ).toBe(true);
  });
});
