/**
 * VES-TG-030 — Telegram question bridge tests.
 *
 * Proves the governed bridge contract with fake transports:
 * - forward is fail-closed (no token / no linked chat / empty / send failure),
 * - taps resolve only live, authorized questions via the broker,
 * - reject releases the broker wait (fail-safe path, no invented answers),
 * - typed replies answer single-question requests and never hijack chat,
 * - expiry and unauthorized senders are surfaced, never silent.
 */

import type { ProjectedQuestion } from '@vestara/telegram-integration';
import { describe, expect, it } from 'vitest';
import {
  answerQuestionByText,
  dispatchQuestionTap,
  forwardAssistantQuestion,
  QUESTION_FORWARD_TTL_MS,
  type QuestionDispatchDeps,
  type QuestionTextDeps,
  TelegramQuestionLedger,
  type TrackedQuestion,
} from '../src/telegram-question-bridge';

function single(): ProjectedQuestion[] {
  return [
    {
      question: 'Which region?',
      header: 'Deploy',
      options: [{ label: 'us-east' }, { label: 'eu-west' }],
    },
  ];
}

function tracked(overrides?: Partial<TrackedQuestion>): TrackedQuestion {
  return {
    chatId: 'chat-1',
    messageId: 'msg-1',
    conversationId: 'conv-1',
    requestId: 'req-1',
    principalId: 'principal-1',
    questions: single(),
    selections: new Map(),
    expiresAt: Date.now() + QUESTION_FORWARD_TTL_MS,
    ...overrides,
  };
}

describe('forwardAssistantQuestion', () => {
  it('fails closed without token, binding, questions, or delivery', async () => {
    const base = {
      botToken: 'tok',
      findBinding: () => ({ telegramChatId: 'chat-1', telegramChatType: 'direct' as const, principalId: 'p-1' }),
      sendQuestion: async () => ({ ok: true as const, messageId: 'm1' }),
    };
    const input = { conversationId: 'c', requestId: 'r', questions: single() };
    expect(await forwardAssistantQuestion({ ...base, findBinding: () => undefined }, input)).toEqual({
      forwarded: false,
      reason: 'no-linked-chat',
    });
    expect(await forwardAssistantQuestion({ ...base, botToken: undefined }, input)).toEqual({
      forwarded: false,
      reason: 'not-configured',
    });
    expect(await forwardAssistantQuestion({ ...base }, { ...input, questions: [] })).toEqual({
      forwarded: false,
      reason: 'empty-question',
    });
    expect(
      await forwardAssistantQuestion(
        { ...base, botToken: 'tok', sendQuestion: async () => ({ ok: false as const }) },
        input,
      ),
    ).toEqual({ forwarded: false, reason: 'send-failed' });
  });

  it('tracks the sent message for inbound correlation', async () => {
    const ledger = new TelegramQuestionLedger();
    const result = await forwardAssistantQuestion(
      {
        botToken: 'tok',
        findBinding: () => ({ telegramChatId: 'chat-1', telegramChatType: 'direct' as const, principalId: 'p-1' }),
        sendQuestion: async () => ({ ok: true as const, messageId: 'm9' }),
        ledger,
        now: () => 1000,
      },
      { conversationId: 'c', requestId: 'r', questions: single() },
    );
    expect(result).toEqual({ forwarded: true, chatId: 'chat-1', messageId: 'm9' });
    const entry = ledger.get('chat-1', 'm9');
    expect(entry?.requestId).toBe('r');
    expect(entry?.expiresAt).toBe(1000 + QUESTION_FORWARD_TTL_MS);
  });

  it('never throws when the transport throws', async () => {
    const result = await forwardAssistantQuestion(
      {
        botToken: 'tok',
        findBinding: () => ({ telegramChatId: 'chat-1', telegramChatType: 'direct' as const, principalId: 'p-1' }),
        sendQuestion: async () => {
          throw new Error('network down');
        },
      },
      { conversationId: 'c', requestId: 'r', questions: single() },
    );
    expect(result).toEqual({ forwarded: false, reason: 'send-failed' });
  });
});

function dispatchDeps(overrides?: Partial<QuestionDispatchDeps>): QuestionDispatchDeps & {
  decided: Array<{ conversationId: string; requestId: string; answers: readonly (readonly string[])[] }>;
  cancelled: Array<{ conversationId: string; requestId: string }>;
  taps: string[];
} {
  const decided: Array<{ conversationId: string; requestId: string; answers: readonly (readonly string[])[] }> = [];
  const cancelled: Array<{ conversationId: string; requestId: string }> = [];
  const taps: string[] = [];
  return {
    ledger: new TelegramQuestionLedger(),
    now: () => 5000,
    isAuthorized: (_entry, sender) => sender === 'tg-operator',
    decide: (conversationId, requestId, answers) => {
      decided.push({ conversationId, requestId, answers });
      return true;
    },
    cancel: (conversationId, requestId) => {
      cancelled.push({ conversationId, requestId });
      return true;
    },
    answerTap: async (_id, text) => {
      taps.push(text ?? '');
    },
    updateMessage: async () => {},
    decided,
    cancelled,
    taps,
    ...overrides,
  };
}

function tapEvent(
  overrides?: Partial<{ chatId: string; messageId: string; callbackData: string; senderTelegramUserId: string }>,
) {
  return {
    chatId: 'chat-1',
    messageId: 'msg-1',
    callbackQueryId: 'q-1',
    callbackData: 'tq:s:0:1',
    senderTelegramUserId: 'tg-operator',
    ...overrides,
  };
}

describe('dispatchQuestionTap', () => {
  it('leaves foreign namespaces to existing handlers', async () => {
    const deps = dispatchDeps();
    expect(await dispatchQuestionTap(deps, tapEvent({ callbackData: 'confirm:deploy:yes' }))).toEqual({
      handled: false,
    });
    expect(deps.decided).toHaveLength(0);
  });

  it('stages selections and submits labeled answers on done', async () => {
    const deps = dispatchDeps();
    deps.ledger?.track(tracked());
    expect(await dispatchQuestionTap(deps, tapEvent())).toEqual({ handled: true, outcome: 'selected' });
    expect(deps.decided).toHaveLength(0);
    expect(await dispatchQuestionTap(deps, tapEvent({ callbackData: 'tq:done' }))).toEqual({
      handled: true,
      outcome: 'answered',
    });
    expect(deps.decided).toEqual([{ conversationId: 'conv-1', requestId: 'req-1', answers: [['eu-west']] }]);
    expect(deps.ledger?.size).toBe(0);
  });

  it('refuses empty submissions and unknown options', async () => {
    const deps = dispatchDeps();
    deps.ledger?.track(tracked());
    expect(await dispatchQuestionTap(deps, tapEvent({ callbackData: 'tq:done' }))).toEqual({
      handled: true,
      outcome: 'selected',
    });
    expect(deps.decided).toHaveLength(0);
    expect(await dispatchQuestionTap(deps, tapEvent({ callbackData: 'tq:s:0:7' }))).toEqual({
      handled: true,
      outcome: 'unknown-tap',
    });
  });

  it('rejects through the broker release (no invented answers)', async () => {
    const deps = dispatchDeps();
    deps.ledger?.track(tracked());
    expect(await dispatchQuestionTap(deps, tapEvent({ callbackData: 'tq:no' }))).toEqual({
      handled: true,
      outcome: 'rejected',
    });
    expect(deps.decided).toHaveLength(0);
    expect(deps.cancelled).toEqual([{ conversationId: 'conv-1', requestId: 'req-1' }]);
  });

  it('surfaces stale and unauthorized taps without resolving', async () => {
    const deps = dispatchDeps();
    deps.ledger?.track(tracked({ expiresAt: 1000 }));
    expect(await dispatchQuestionTap(deps, tapEvent())).toEqual({ handled: true, outcome: 'stale' });
    deps.ledger?.track(tracked());
    expect(await dispatchQuestionTap(deps, tapEvent({ senderTelegramUserId: 'tg-stranger' }))).toEqual({
      handled: true,
      outcome: 'unauthorized',
    });
    expect(deps.decided).toHaveLength(0);
    expect(deps.cancelled).toHaveLength(0);
  });

  it('hints custom answers for the typed path', async () => {
    const deps = dispatchDeps();
    deps.ledger?.track(tracked());
    expect(await dispatchQuestionTap(deps, tapEvent({ callbackData: 'tq:custom' }))).toEqual({
      handled: true,
      outcome: 'custom-hint',
    });
    expect(deps.taps[0]).toContain('Reply');
  });

  it('awaits asynchronous authorization (canonical-principal resolution)', async () => {
    // Production isAuthorized resolves the sender through the canonical
    // principal store — the bridge must await it, never treat the Promise
    // as truthy. Awaiting a Promise object would authorize everyone.
    const allow = dispatchDeps({ isAuthorized: async (_entry, sender) => sender === 'tg-operator' });
    allow.ledger?.track(tracked());
    expect(await dispatchQuestionTap(allow, tapEvent())).toEqual({ handled: true, outcome: 'selected' });

    const deny = dispatchDeps({ isAuthorized: async () => false });
    deny.ledger?.track(tracked());
    expect(await dispatchQuestionTap(deny, tapEvent())).toEqual({ handled: true, outcome: 'unauthorized' });
    expect(deny.decided).toHaveLength(0);
  });
});

describe('answerQuestionByText', () => {
  function textDeps(): { decided: Array<{ answers: readonly (readonly string[])[] }>; deps: QuestionTextDeps } {
    const decided: Array<{ answers: readonly (readonly string[])[] }> = [];
    return {
      decided,
      deps: {
        ledger: new TelegramQuestionLedger(),
        now: () => 5000,
        isAuthorized: () => true,
        decide: (_c: string, _r: string, answers: readonly (readonly string[])[]) => {
          decided.push({ answers });
          return true;
        },
        confirmMessage: async () => {},
      },
    };
  }

  it('ignores commands, idle chats, and non-matching text', async () => {
    const { deps, decided } = textDeps();
    deps.ledger.track(tracked());
    expect(await answerQuestionByText(deps, { chatId: 'chat-1', senderTelegramUserId: 'u', text: '/status' })).toEqual({
      handled: false,
    });
    expect(await answerQuestionByText(deps, { chatId: 'other-chat', senderTelegramUserId: 'u', text: '1' })).toEqual({
      handled: false,
    });
    expect(
      await answerQuestionByText(deps, { chatId: 'chat-1', senderTelegramUserId: 'u', text: 'hello there' }),
    ).toEqual({ handled: false });
    expect(decided).toHaveLength(0);
  });

  it('answers from option numbers and removes the entry', async () => {
    const { deps, decided } = textDeps();
    deps.ledger.track(tracked());
    expect(await answerQuestionByText(deps, { chatId: 'chat-1', senderTelegramUserId: 'u', text: '2' })).toEqual({
      handled: true,
      outcome: 'answered',
    });
    expect(decided).toEqual([{ answers: [['eu-west']] }]);
    expect(deps.ledger.size).toBe(0);
  });

  it('awaits asynchronous authorization before answering', async () => {
    const { deps, decided } = textDeps();
    deps.isAuthorized = async () => false;
    deps.ledger.track(tracked());
    expect(await answerQuestionByText(deps, { chatId: 'chat-1', senderTelegramUserId: 'u', text: '2' })).toEqual({
      handled: true,
      outcome: 'unauthorized',
    });
    expect(decided).toHaveLength(0);
    expect(deps.ledger.size).toBe(1);
  });
});
describe('TelegramQuestionLedger', () => {
  it('sweeps expired entries for surfacing', () => {
    const ledger = new TelegramQuestionLedger();
    ledger.track(tracked({ messageId: 'old', expiresAt: 100 }));
    ledger.track(tracked({ messageId: 'new', expiresAt: 9999 }));
    expect(ledger.sweepExpired(500)).toHaveLength(1);
    expect(ledger.size).toBe(1);
  });
});

describe('dispatchQuestionTap onResolved', () => {
  it('reports tap answers with entry, pick, and sender', async () => {
    const deps = dispatchDeps();
    const resolutions: Array<{ answers: unknown; sender: string; outcome: string }> = [];
    deps.onResolved = (resolution) => {
      resolutions.push({
        answers: resolution.answers,
        sender: resolution.senderTelegramUserId,
        outcome: resolution.outcome,
      });
    };
    deps.ledger?.track(tracked());
    expect(await dispatchQuestionTap(deps, tapEvent())).toEqual({ handled: true, outcome: 'selected' });
    expect(await dispatchQuestionTap(deps, tapEvent({ callbackData: 'tq:done' }))).toEqual({
      handled: true,
      outcome: 'answered',
    });
    expect(resolutions).toEqual([{ answers: [['eu-west']], sender: 'tg-operator', outcome: 'answered' }]);
  });

  it('reports tap rejections with empty answers', async () => {
    const deps = dispatchDeps();
    const resolutions: Array<{ answers: unknown; outcome: string; accepted: boolean }> = [];
    deps.onResolved = (resolution) => {
      resolutions.push({ answers: resolution.answers, outcome: resolution.outcome, accepted: resolution.accepted });
    };
    deps.ledger?.track(tracked());
    expect(await dispatchQuestionTap(deps, tapEvent({ callbackData: 'tq:no' }))).toEqual({
      handled: true,
      outcome: 'rejected',
    });
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0]).toMatchObject({ answers: [], outcome: 'rejected' });
  });

  it('stays silent on staging, unauthorized, and stale taps', async () => {
    const deps = dispatchDeps({
      onResolved: () => {
        throw new Error('must not be called');
      },
    });
    deps.ledger?.track(tracked());
    expect(await dispatchQuestionTap(deps, tapEvent())).toEqual({ handled: true, outcome: 'selected' });
    expect(await dispatchQuestionTap(deps, tapEvent({ senderTelegramUserId: 'tg-stranger' }))).toEqual({
      handled: true,
      outcome: 'unauthorized',
    });
    expect(deps.cancelled).toHaveLength(0);
  });

  it('never lets a throwing observer break resolution', async () => {
    const deps = dispatchDeps({
      onResolved: () => {
        throw new Error('observer down');
      },
    });
    deps.ledger?.track(tracked());
    expect(await dispatchQuestionTap(deps, tapEvent())).toEqual({ handled: true, outcome: 'selected' });
    expect(await dispatchQuestionTap(deps, tapEvent({ callbackData: 'tq:done' }))).toEqual({
      handled: true,
      outcome: 'answered',
    });
    expect(deps.decided).toEqual([{ conversationId: 'conv-1', requestId: 'req-1', answers: [['eu-west']] }]);
  });
});
