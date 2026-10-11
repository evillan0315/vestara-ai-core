/**
 * VES-TG-030: Telegram Question Bridge — projection helpers.
 *
 * Renders pending assistant questions as Telegram message text + inline
 * keyboards, and parses answers back (button taps and typed replies).
 *
 * Pure — no network, no state, no OpenCode imports. Callers map their own
 * question shapes onto {@link ProjectedQuestion}; Telegram never owns
 * execution, permission, or workflow state (VES-TG-001 central invariant).
 *
 * Transport bounds respected throughout:
 * - message text truncated to Telegram's 4096-char limit,
 * - callback data kept far under the 64-byte limit (`tq:<op>:<qi>:<oi>`),
 * - option buttons capped so the keyboard stays tappable.
 *
 * Architecture Traceability:
 *   VES-TG-001: Telegram Interaction Platform (TG-030)
 *   @see docs/blueprint/VES-TG-001-telegram-integration.md
 */

import { type InlineKeyboard, TelegramInlineKeyboard } from './inline-keyboard.js';

// ─── Types ─────────────────────────────────────────────────────

/** A single selectable option within a projected question. */
export interface ProjectedQuestionOption {
  readonly label: string;
  readonly description?: string;
}

/** A single question projected to Telegram. Structural — callers adapt
 *  their own runtime question shapes onto this; telegram-integration
 *  never imports execution-domain types. */
export interface ProjectedQuestion {
  readonly question: string;
  readonly header: string;
  readonly options: readonly ProjectedQuestionOption[];
  readonly multiple?: boolean;
  readonly custom?: boolean;
}

/** Parsed answer tap from an inline-keyboard callback. */
export type ParsedQuestionCallback =
  | { readonly kind: 'select'; readonly questionIndex: number; readonly optionIndex: number }
  | { readonly kind: 'done' }
  | { readonly kind: 'reject' }
  | { readonly kind: 'custom' }
  | { readonly kind: 'noop' };

// ─── Bounds ────────────────────────────────────────────────────

/** Telegram sendMessage text limit. */
export const TELEGRAM_TEXT_LIMIT = 4096;

/** Rendered question text is truncated below the transport limit. */
export const QUESTION_TEXT_LIMIT = 3900;

/** Button labels stay tappable; longer labels truncate with an ellipsis. */
export const OPTION_LABEL_LIMIT = 48;

/** Max options rendered per question — overflow stays answerable by label. */
export const MAX_OPTIONS_PER_QUESTION = 8;

/** Max questions rendered per forwarded request. */
export const MAX_QUESTIONS_PER_REQUEST = 4;

/** Callback data namespace for the question bridge. */
export const QUESTION_CALLBACK_PREFIX = 'tq';

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

// ─── Text Rendering ────────────────────────────────────────────

/**
 * Render questions as Telegram message text: header, question, numbered
 * options, and a hint row (multi-select / custom / typed-answer affordances).
 * Pure and bounded — never exceeds QUESTION_TEXT_LIMIT.
 */
export function renderQuestionText(questions: readonly ProjectedQuestion[]): string {
  const lines: string[] = ['❓ Assistant question'];
  const shown = questions.slice(0, MAX_QUESTIONS_PER_REQUEST);
  shown.forEach((q, qi) => {
    const title = q.header.trim() || `Question ${qi + 1}`;
    lines.push('', title, q.question);
    q.options.slice(0, MAX_OPTIONS_PER_QUESTION).forEach((opt, oi) => {
      const desc = opt.description?.trim() ? ` — ${opt.description.trim()}` : '';
      lines.push(`${oi + 1}. ${opt.label}${desc}`);
    });
    const hidden = q.options.length - MAX_OPTIONS_PER_QUESTION;
    if (hidden > 0) lines.push(`…and ${hidden} more — reply with the exact label.`);
    if (q.multiple) lines.push('Pick several, then tap ✅ Send.');
    if (q.custom && q.options.length === 0) lines.push('No fixed options — just reply with your answer.');
  });
  if (questions.length > MAX_QUESTIONS_PER_REQUEST) {
    lines.push('', `…and ${questions.length - MAX_QUESTIONS_PER_REQUEST} more question(s) in the app.`);
  }
  return truncate(lines.join('\n'), QUESTION_TEXT_LIMIT);
}

// ─── Keyboard Building ─────────────────────────────────────────

/**
 * Build the answer keyboard: one row per option (✓-marked when selected),
 * plus a Send / Reject row. `selections` maps question index → selected
 * option indexes (staged taps; empty = fresh question).
 */
export function buildQuestionKeyboard(
  questions: readonly ProjectedQuestion[],
  selections?: ReadonlyMap<number, ReadonlySet<number>>,
): InlineKeyboard {
  const rows: InlineKeyboard['rows'] = [];
  questions.slice(0, MAX_QUESTIONS_PER_REQUEST).forEach((q, qi) => {
    q.options.slice(0, MAX_OPTIONS_PER_QUESTION).forEach((opt, oi) => {
      const selected = selections?.get(qi)?.has(oi) ?? false;
      rows.push([
        {
          text: `${selected ? '✅ ' : ''}${truncate(opt.label, OPTION_LABEL_LIMIT)}`,
          callbackData: `${QUESTION_CALLBACK_PREFIX}:s:${qi}:${oi}`,
        },
      ]);
    });
  });
  rows.push([
    { text: '✅ Send', callbackData: `${QUESTION_CALLBACK_PREFIX}:done` },
    { text: '✏️ Custom', callbackData: `${QUESTION_CALLBACK_PREFIX}:custom` },
    { text: '❌ Reject', callbackData: `${QUESTION_CALLBACK_PREFIX}:no` },
  ]);
  return { rows };
}

/**
 * Rebuild the keyboard through the canonical converter so callback data
 * reaches the Bot API in ChannelButton shape.
 */
export function buildQuestionChannelKeyboard(
  questions: readonly ProjectedQuestion[],
  selections?: ReadonlyMap<number, ReadonlySet<number>>,
): ReturnType<typeof TelegramInlineKeyboard.toTelegramFormat> {
  return TelegramInlineKeyboard.toTelegramFormat(buildQuestionKeyboard(questions, selections));
}

// ─── Callback Parsing ──────────────────────────────────────────

/**
 * Parse question-bridge callback data. Returns null for anything outside
 * the `tq:` namespace or malformed payloads (fail-closed: unknown taps
 * never resolve a question).
 */
export function parseQuestionCallback(callbackData: string | undefined): ParsedQuestionCallback | null {
  if (!callbackData) return null;
  const parts = callbackData.split(':');
  if (parts[0] !== QUESTION_CALLBACK_PREFIX) return null;
  const op = parts[1];
  if (op === 'done') return parts.length === 2 ? { kind: 'done' } : null;
  if (op === 'no') return parts.length === 2 ? { kind: 'reject' } : null;
  if (op === 'custom') return parts.length === 2 ? { kind: 'custom' } : null;
  if (op === 'noop') return { kind: 'noop' };
  if (op === 's' && parts.length === 4) {
    const qi = Number(parts[2]);
    const oi = Number(parts[3]);
    if (!Number.isInteger(qi) || !Number.isInteger(oi) || qi < 0 || oi < 0) return null;
    return { kind: 'select', questionIndex: qi, optionIndex: oi };
  }
  return null;
}

// ─── Selection Math (staged taps → broker answers) ─────────────

/**
 * Toggle a staged selection. Single-choice questions replace; multiple-
 * choice questions accumulate. Returns a new map (no mutation).
 */
export function toggleSelection(
  selections: ReadonlyMap<number, ReadonlySet<number>>,
  multiple: boolean,
  questionIndex: number,
  optionIndex: number,
): Map<number, Set<number>> {
  const next = new Map<number, Set<number>>();
  for (const [qi, set] of selections) next.set(qi, new Set(set));
  if (multiple) {
    const set = next.get(questionIndex) ?? new Set<number>();
    if (set.has(optionIndex)) set.delete(optionIndex);
    else set.add(optionIndex);
    if (set.size === 0) next.delete(questionIndex);
    else next.set(questionIndex, set);
  } else {
    next.set(questionIndex, new Set([optionIndex]));
  }
  return next;
}

/**
 * Convert staged selections to broker answers: one label array per
 * question, in question order. Selections pointing outside the projected
 * questions/options are dropped (fail-closed).
 */
export function selectionsToAnswers(
  questions: readonly ProjectedQuestion[],
  selections: ReadonlyMap<number, ReadonlySet<number>>,
): string[][] {
  const answers: string[][] = [];
  questions.forEach((q, qi) => {
    const picked = [...(selections.get(qi) ?? [])]
      .filter((oi) => oi >= 0 && oi < q.options.length)
      .sort((a, b) => a - b)
      .map((oi) => (q.options[oi] as ProjectedQuestionOption).label);
    if (picked.length > 0) answers.push(picked);
  });
  return answers;
}

// ─── Typed Answers ─────────────────────────────────────────────

/**
 * Match a typed Telegram reply against a single-question request:
 * 1-based option numbers (`1`, `1,3`), exact labels (case-insensitive),
 * or free text when the question allows custom answers. Multi-question
 * requests are buttons-only (typed text would be ambiguous) → null.
 * Returns the broker answer row, or null when the text answers nothing.
 */
export function matchTextAnswer(text: string, questions: readonly ProjectedQuestion[]): string[] | null {
  if (questions.length !== 1) return null;
  const q = questions[0] as ProjectedQuestion;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const byNumber = trimmed
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((part) => Number(part));
  if (byNumber.length > 0 && byNumber.every((n) => Number.isInteger(n) && n >= 1 && n <= q.options.length)) {
    const unique = [...new Set(byNumber)].sort((a, b) => a - b);
    if (!q.multiple && unique.length > 1) return null;
    return unique.map((n) => (q.options[n - 1] as ProjectedQuestionOption).label);
  }
  const byLabel = q.options.find((opt) => opt.label.toLowerCase() === trimmed.toLowerCase());
  if (byLabel) return [byLabel.label];
  if (q.custom && trimmed.length <= 200) return [trimmed];
  return null;
}
