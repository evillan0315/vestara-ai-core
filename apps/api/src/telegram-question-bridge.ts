/**
 * VES-TG-030: Telegram Question Bridge — API-side orchestration.
 *
 * Forwards pending assistant questions to the bound Telegram chat and
 * routes answers (button taps + typed replies) back into the
 * AssistantInteractionBroker. Telegram holds only transport correlation
 * (chat/message → conversation/request); execution truth stays in the
 * broker and the M11A RuntimeInteraction authority (VES-TG-001 invariant).
 *
 * All side effects arrive as injected dependencies so the orchestration
 * is unit-testable with fakes. Every path is best-effort and fail-closed:
 * forwarding problems never break the agent turn, and unknown taps never
 * resolve a question.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-030)
 */

import {
  buildQuestionChannelKeyboard,
  type ChannelButton,
  matchTextAnswer,
  type ProjectedQuestion,
  parseQuestionCallback,
  renderQuestionText,
  selectionsToAnswers,
  toggleSelection,
} from '@vestara/telegram-integration';

// ─── Correlation Ledger ────────────────────────────────────────
// Transport-only: maps a sent Telegram question message back to the
// broker key (conversation + request). Never execution state — entries
// die on resolve or expiry, and resolution always goes through the broker.

/** Forward lifetime mirrors the broker wait window (fail-safe reject). */
export const QUESTION_FORWARD_TTL_MS = 10 * 60 * 1000;

export interface TrackedQuestion {
  readonly chatId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly requestId: string;
  readonly principalId: string;
  readonly questions: readonly ProjectedQuestion[];
  readonly selections: Map<number, Set<number>>;
  readonly expiresAt: number;
}

export class TelegramQuestionLedger {
  private readonly entries = new Map<string, TrackedQuestion>();

  private static key(chatId: string, messageId: string): string {
    return `${chatId}:${messageId}`;
  }

  track(entry: TrackedQuestion): void {
    this.entries.set(TelegramQuestionLedger.key(entry.chatId, entry.messageId), entry);
  }

  get(chatId: string, messageId: string): TrackedQuestion | undefined {
    const entry = this.entries.get(TelegramQuestionLedger.key(chatId, messageId));
    return entry;
  }

  /** All live entries for a chat (typed-answer lookup). Expired included —
   *  callers report expiry explicitly instead of silently dropping. */
  listByChat(chatId: string): readonly TrackedQuestion[] {
    return [...this.entries.values()].filter((entry) => entry.chatId === chatId);
  }

  remove(chatId: string, messageId: string): void {
    this.entries.delete(TelegramQuestionLedger.key(chatId, messageId));
  }

  /** Drop expired entries. Returns the removed set for expiry surfacing. */
  sweepExpired(now: number = Date.now()): readonly TrackedQuestion[] {
    const removed: TrackedQuestion[] = [];
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        removed.push(entry);
        this.entries.delete(key);
      }
    }
    return removed;
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Process-wide ledger singleton (in-memory, like the broker itself). */
export const telegramQuestionLedger = new TelegramQuestionLedger();

// ─── Outbound Forward ──────────────────────────────────────────

export interface QuestionBinding {
  readonly telegramChatId: string;
  readonly telegramChatType: 'direct' | 'group';
  readonly telegramChatTitle?: string;
  readonly principalId: string;
}

export interface ForwardQuestionInput {
  readonly conversationId: string;
  readonly requestId: string;
  readonly questions: readonly ProjectedQuestion[];
}

export interface ForwardQuestionDeps {
  readonly botToken?: string;
  readonly findBinding: (conversationId: string) => QuestionBinding | undefined;
  readonly sendQuestion: (
    chatId: string,
    text: string,
    keyboard: readonly ChannelButton[][],
  ) => Promise<{ readonly ok: boolean; readonly messageId?: string }>;
  readonly ledger?: TelegramQuestionLedger;
  readonly now?: () => number;
}

export type ForwardQuestionResult =
  | { readonly forwarded: true; readonly chatId: string; readonly messageId: string }
  | {
      readonly forwarded: false;
      readonly reason: 'not-configured' | 'no-linked-chat' | 'empty-question' | 'send-failed';
    };

/**
 * Forward a pending assistant question to the Telegram chat bound to the
 * Vestara conversation. Best-effort: any failure returns a reason and
 * never throws, so the agent turn (still awaiting the browser) continues.
 */
export async function forwardAssistantQuestion(
  deps: ForwardQuestionDeps,
  input: ForwardQuestionInput,
): Promise<ForwardQuestionResult> {
  if (!deps.botToken) return { forwarded: false, reason: 'not-configured' };
  if (input.questions.length === 0) return { forwarded: false, reason: 'empty-question' };
  const binding = deps.findBinding(input.conversationId);
  if (!binding) return { forwarded: false, reason: 'no-linked-chat' };
  const ledger = deps.ledger ?? telegramQuestionLedger;
  const now = deps.now?.() ?? Date.now();
  const text = renderQuestionText(input.questions);
  const keyboard = buildQuestionChannelKeyboard(input.questions);
  let sent: { readonly ok: boolean; readonly messageId?: string };
  try {
    sent = await deps.sendQuestion(binding.telegramChatId, text, keyboard);
  } catch {
    return { forwarded: false, reason: 'send-failed' };
  }
  if (!sent.ok || !sent.messageId) return { forwarded: false, reason: 'send-failed' };
  ledger.track({
    chatId: binding.telegramChatId,
    messageId: sent.messageId,
    conversationId: input.conversationId,
    requestId: input.requestId,
    principalId: binding.principalId,
    questions: input.questions,
    selections: new Map(),
    expiresAt: now + QUESTION_FORWARD_TTL_MS,
  });
  return { forwarded: true, chatId: binding.telegramChatId, messageId: sent.messageId };
}

// ─── Inbound Dispatch ──────────────────────────────────────────

export interface QuestionTapEvent {
  readonly chatId: string;
  readonly messageId: string;
  readonly callbackQueryId: string;
  readonly callbackData: string;
  readonly senderTelegramUserId: string;
}

export interface QuestionDispatchDeps {
  readonly ledger?: TelegramQuestionLedger;
  readonly now?: () => number;
  /**
   * Paired-principal check: the tapping sender must own the question.
   * May resolve asynchronously (e.g. canonical-principal resolution).
   */
  readonly isAuthorized: (entry: TrackedQuestion, senderTelegramUserId: string) => boolean | Promise<boolean>;
  /** Resolve through the broker. Answers mirror POST /questions/:id. */
  readonly decide: (conversationId: string, requestId: string, answers: readonly (readonly string[])[]) => boolean;
  /** Release the broker wait without answers (adapter fail-safe rejects). */
  readonly cancel: (conversationId: string, requestId: string) => boolean;
  readonly answerTap: (callbackQueryId: string, text?: string) => Promise<void>;
  readonly updateMessage: (
    chatId: string,
    messageId: string,
    text: string,
    keyboard?: readonly ChannelButton[][],
  ) => Promise<void>;
  /**
   * Observer for broker resolutions (tap path). The typed path already
   * reports through `confirmMessage`; taps had no equivalent, so answers
   * resolved by button left no trace outside the broker. Optional and
   * never allowed to break resolution — a throwing observer is swallowed.
   */
  readonly onResolved?: (resolution: QuestionResolution) => void;
}

/** A tap-resolved answer, reported to observers after broker resolution. */
export interface QuestionResolution {
  readonly entry: TrackedQuestion;
  readonly answers: readonly (readonly string[])[];
  readonly accepted: boolean;
  readonly outcome: 'answered' | 'rejected';
  readonly senderTelegramUserId: string;
}

/**
 * Report a tap resolution to the optional observer. Observer failures
 * must never break the broker resolution path.
 */
function reportResolution(deps: QuestionDispatchDeps, resolution: QuestionResolution): void {
  try {
    deps.onResolved?.(resolution);
  } catch {
    /* observer-only — resolution already stands */
  }
}

export type QuestionDispatchOutcome =
  | { readonly handled: false }
  | {
      readonly handled: true;
      readonly outcome: 'selected' | 'answered' | 'rejected' | 'custom-hint' | 'stale' | 'unauthorized' | 'unknown-tap';
    };

function resolvedText(entry: TrackedQuestion, suffix: string): string {
  const first = entry.questions[0]?.question ?? 'Question';
  return `✅ ${first}\n${suffix}`;
}

/**
 * Dispatch an inline-button tap. Foreign callback namespaces return
 * unhandled so existing buttons keep their behavior.
 */
export async function dispatchQuestionTap(
  deps: QuestionDispatchDeps,
  event: QuestionTapEvent,
): Promise<QuestionDispatchOutcome> {
  const parsed = parseQuestionCallback(event.callbackData);
  if (!parsed || parsed.kind === 'noop') return { handled: false };
  const ledger = deps.ledger ?? telegramQuestionLedger;
  const now = deps.now?.() ?? Date.now();
  const entry = ledger.get(event.chatId, event.messageId);
  if (!entry || entry.expiresAt <= now) {
    if (entry) ledger.remove(event.chatId, event.messageId);
    await deps.answerTap(event.callbackQueryId, 'This question expired — see the app for the latest.');
    return { handled: true, outcome: 'stale' };
  }
  if (!(await deps.isAuthorized(entry, event.senderTelegramUserId))) {
    await deps.answerTap(event.callbackQueryId, 'Only the paired operator can answer.');
    return { handled: true, outcome: 'unauthorized' };
  }
  if (parsed.kind === 'custom') {
    await deps.answerTap(event.callbackQueryId, 'Reply with your answer as a message.');
    return { handled: true, outcome: 'custom-hint' };
  }
  if (parsed.kind === 'reject') {
    ledger.remove(event.chatId, event.messageId);
    const accepted = deps.cancel(entry.conversationId, entry.requestId);
    reportResolution(deps, {
      entry,
      answers: [],
      accepted,
      outcome: 'rejected',
      senderTelegramUserId: event.senderTelegramUserId,
    });
    await deps.updateMessage(event.chatId, event.messageId, resolvedText(entry, 'Rejected from Telegram.'));
    await deps.answerTap(event.callbackQueryId, 'Rejected.');
    return { handled: true, outcome: 'rejected' };
  }
  if (parsed.kind === 'done') {
    const answers = selectionsToAnswers(entry.questions, entry.selections);
    if (answers.length === 0) {
      await deps.answerTap(event.callbackQueryId, 'Pick at least one option first.');
      return { handled: true, outcome: 'selected' };
    }
    ledger.remove(event.chatId, event.messageId);
    const accepted = deps.decide(entry.conversationId, entry.requestId, answers);
    reportResolution(deps, {
      entry,
      answers,
      accepted,
      outcome: 'answered',
      senderTelegramUserId: event.senderTelegramUserId,
    });
    const picked = answers.map((row) => row.join(', ')).join(' · ');
    await deps.updateMessage(event.chatId, event.messageId, resolvedText(entry, `Answered: ${picked}`));
    await deps.answerTap(event.callbackQueryId, accepted ? 'Answer sent.' : 'Question already resolved.');
    return { handled: true, outcome: 'answered' };
  }
  // select: stage the tap, re-render checkmarks.
  const question = entry.questions[parsed.questionIndex];
  if (!question || parsed.optionIndex >= question.options.length) {
    await deps.answerTap(event.callbackQueryId, 'Unknown option.');
    return { handled: true, outcome: 'unknown-tap' };
  }
  const selections = toggleSelection(
    entry.selections,
    question.multiple ?? false,
    parsed.questionIndex,
    parsed.optionIndex,
  );
  ledger.track({ ...entry, selections });
  await deps.updateMessage(
    event.chatId,
    event.messageId,
    renderQuestionText(entry.questions),
    buildQuestionChannelKeyboard(entry.questions, selections),
  );
  await deps.answerTap(event.callbackQueryId);
  return { handled: true, outcome: 'selected' };
}

// ─── Typed Answers ─────────────────────────────────────────────

export interface QuestionTextEvent {
  readonly chatId: string;
  readonly senderTelegramUserId: string;
  readonly text: string;
}

export interface QuestionTextDeps {
  readonly ledger?: TelegramQuestionLedger;
  readonly now?: () => number;
  /** Same ownership check as taps; may resolve asynchronously. */
  readonly isAuthorized: (entry: TrackedQuestion, senderTelegramUserId: string) => boolean | Promise<boolean>;
  readonly decide: (conversationId: string, requestId: string, answers: readonly (readonly string[])[]) => boolean;
  readonly confirmMessage: (
    entry: TrackedQuestion,
    answers: readonly (readonly string[])[],
    accepted: boolean,
  ) => Promise<void>;
}

export type QuestionTextOutcome =
  | { readonly handled: false }
  | { readonly handled: true; readonly outcome: 'answered' | 'unauthorized' };

/**
 * Answer a forwarded question from a typed reply (option numbers, exact
 * labels, or custom text). Commands and non-matching text return
 * unhandled so normal chat routing continues untouched.
 */
export async function answerQuestionByText(
  deps: QuestionTextDeps,
  event: QuestionTextEvent,
): Promise<QuestionTextOutcome> {
  const text = event.text.trim();
  if (!text || text.startsWith('/')) return { handled: false };
  const ledger = deps.ledger ?? telegramQuestionLedger;
  const now = deps.now?.() ?? Date.now();
  const live = ledger.listByChat(event.chatId).filter((entry) => entry.expiresAt > now);
  if (live.length === 0) return { handled: false };
  // Oldest pending question wins; typed answers are single-question only.
  const entry = live
    .filter((candidate) => matchTextAnswer(text, candidate.questions) !== null)
    .sort((a, b) => a.expiresAt - b.expiresAt)[0];
  if (!entry) return { handled: false };
  if (!(await deps.isAuthorized(entry, event.senderTelegramUserId))) {
    return { handled: true, outcome: 'unauthorized' };
  }
  const row = matchTextAnswer(text, entry.questions) as readonly string[];
  ledger.remove(entry.chatId, entry.messageId);
  const accepted = deps.decide(entry.conversationId, entry.requestId, [row]);
  await deps.confirmMessage(entry, [row], accepted);
  return { handled: true, outcome: 'answered' };
}
