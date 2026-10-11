/**
 * VES-TG-030 — Telegram question projection tests.
 *
 * Proves the pure bridge contract:
 * - rendered text is bounded and lists options with 1-based numbering,
 * - keyboards carry namespaced callback data within Telegram's 64-byte limit,
 * - callback parsing is fail-closed (foreign/malformed taps never resolve),
 * - staged selections convert to broker answers without inventing labels,
 * - typed replies match numbers/labels/custom text for single questions only.
 */

import { describe, expect, it } from 'vitest';
import {
  buildQuestionChannelKeyboard,
  buildQuestionKeyboard,
  MAX_OPTIONS_PER_QUESTION,
  MAX_QUESTIONS_PER_REQUEST,
  matchTextAnswer,
  type ProjectedQuestion,
  parseQuestionCallback,
  QUESTION_TEXT_LIMIT,
  renderQuestionText,
  selectionsToAnswers,
  toggleSelection,
} from '../src/question-projection';

function question(overrides?: Partial<ProjectedQuestion>): ProjectedQuestion {
  return {
    question: 'Which region?',
    header: 'Deploy',
    options: [{ label: 'us-east' }, { label: 'eu-west', description: 'GDPR friendly' }],
    ...overrides,
  };
}

describe('renderQuestionText', () => {
  it('lists options with 1-based numbering and descriptions', () => {
    const text = renderQuestionText([question()]);
    expect(text).toContain('Deploy');
    expect(text).toContain('Which region?');
    expect(text).toContain('1. us-east');
    expect(text).toContain('2. eu-west — GDPR friendly');
  });

  it('stays within the text bound for adversarial input', () => {
    const big = question({
      question: 'q'.repeat(5000),
      options: Array.from({ length: 30 }, (_, i) => ({ label: `option-${i}-${'x'.repeat(100)}` })),
    });
    const text = renderQuestionText([big, big, big, big, big, big]);
    expect(text.length).toBeLessThanOrEqual(QUESTION_TEXT_LIMIT);
  });

  it('notes overflow questions when sizes stay in budget', () => {
    const many = Array.from({ length: MAX_QUESTIONS_PER_REQUEST + 2 }, (_, i) => question({ header: `Q${i}` }));
    expect(renderQuestionText(many)).toContain('more question(s) in the app');
  });

  it('notes overflow options and multi/custom hints', () => {
    const many = question({
      options: Array.from({ length: MAX_OPTIONS_PER_QUESTION + 3 }, (_, i) => ({ label: `o${i}` })),
    });
    expect(renderQuestionText([many])).toContain('more — reply with the exact label');
    expect(renderQuestionText([question({ multiple: true })])).toContain('✅ Send');
    expect(renderQuestionText([question({ options: [], custom: true })])).toContain('just reply');
  });
});

describe('buildQuestionKeyboard', () => {
  it('emits one row per option plus a Send/Custom/Reject row', () => {
    const keyboard = buildQuestionKeyboard([question()]);
    expect(keyboard.rows).toHaveLength(3);
    expect(keyboard.rows[0]?.[0]?.callbackData).toBe('tq:s:0:0');
    expect(keyboard.rows[2]?.map((b) => b.callbackData)).toEqual(['tq:done', 'tq:custom', 'tq:no']);
  });

  it('marks staged selections and keeps every callback under 64 bytes', () => {
    const selections = new Map([[0, new Set([1])]]);
    const keyboard = buildQuestionKeyboard([question()], selections);
    expect(keyboard.rows[1]?.[0]?.text.startsWith('✅')).toBe(true);
    for (const row of keyboard.rows) {
      for (const btn of row) expect(new TextEncoder().encode(btn.callbackData).length).toBeLessThanOrEqual(64);
    }
  });

  it('converts through the canonical channel-keyboard shape', () => {
    const channel = buildQuestionChannelKeyboard([question()]);
    expect(channel[0]?.[0]).toEqual({ text: 'us-east', callbackData: 'tq:s:0:0' });
  });
});

describe('parseQuestionCallback', () => {
  it('parses select/done/reject/custom taps', () => {
    expect(parseQuestionCallback('tq:s:0:2')).toEqual({ kind: 'select', questionIndex: 0, optionIndex: 2 });
    expect(parseQuestionCallback('tq:done')).toEqual({ kind: 'done' });
    expect(parseQuestionCallback('tq:no')).toEqual({ kind: 'reject' });
    expect(parseQuestionCallback('tq:custom')).toEqual({ kind: 'custom' });
  });

  it('rejects foreign namespaces and malformed payloads', () => {
    expect(parseQuestionCallback(undefined)).toBeNull();
    expect(parseQuestionCallback('')).toBeNull();
    expect(parseQuestionCallback('confirm:deploy:yes')).toBeNull();
    expect(parseQuestionCallback('ws:select:abc')).toBeNull();
    expect(parseQuestionCallback('tq:s:-1:0')).toBeNull();
    expect(parseQuestionCallback('tq:s:0')).toBeNull();
    expect(parseQuestionCallback('tq:done:extra')).toBeNull();
    expect(parseQuestionCallback('tq:bogus')).toBeNull();
    expect(parseQuestionCallback('tq:s:x:y')).toBeNull();
  });
});

describe('toggleSelection + selectionsToAnswers', () => {
  it('replaces for single-choice, accumulates for multiple', () => {
    const empty = new Map<number, Set<number>>();
    const single = toggleSelection(empty, false, 0, 1);
    expect(toggleSelection(single, false, 0, 0).get(0)).toEqual(new Set([0]));
    const multi = toggleSelection(toggleSelection(empty, true, 0, 0), true, 0, 1);
    expect(multi.get(0)).toEqual(new Set([0, 1]));
    expect(toggleSelection(multi, true, 0, 0).get(0)).toEqual(new Set([1]));
  });

  it('converts staged taps to broker label rows and drops out-of-range picks', () => {
    const answers = selectionsToAnswers([question()], new Map([[0, new Set([1, 9])]]));
    expect(answers).toEqual([['eu-west']]);
    expect(selectionsToAnswers([question()], new Map())).toEqual([]);
  });
});

describe('matchTextAnswer', () => {
  it('matches 1-based numbers, lists, and labels', () => {
    expect(matchTextAnswer('1', [question()])).toEqual(['us-east']);
    expect(matchTextAnswer('EU-WEST', [question()])).toEqual(['eu-west']);
    expect(matchTextAnswer('0', [question()])).toBeNull();
    expect(matchTextAnswer('3', [question()])).toBeNull();
  });

  it('allows several numbers only for multiple-choice questions', () => {
    expect(matchTextAnswer('1,2', [question()])).toBeNull();
    expect(matchTextAnswer('2, 1', [question({ multiple: true })])).toEqual(['us-east', 'eu-west']);
  });

  it('accepts free text only when custom is allowed', () => {
    expect(matchTextAnswer('ap-south', [question()])).toBeNull();
    expect(matchTextAnswer('ap-south', [question({ custom: true })])).toEqual(['ap-south']);
  });

  it('refuses typed answers for multi-question requests (buttons only)', () => {
    expect(matchTextAnswer('1', [question(), question()])).toBeNull();
    expect(matchTextAnswer('', [question()])).toBeNull();
  });
});
