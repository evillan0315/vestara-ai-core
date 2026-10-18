/**
 * composerSpellcheck unit tests (pure functions, no DOM).
 */

import { describe, expect, it } from 'vitest';
import { applySuggestion, COMMON_TYPOS, findSpellingIssues } from './composerSpellcheck.js';

describe('findSpellingIssues', () => {
  it('returns no issues for empty drafts', () => {
    expect(findSpellingIssues('')).toEqual([]);
    expect(findSpellingIssues('   ')).toEqual([]);
  });

  it('flags curated typos with case preservation', () => {
    const [lower] = findSpellingIssues('this is gloabl state');
    expect(lower.suggestion).toBe('global');
    expect(lower.kind).toBe('typo');

    const [upper] = findSpellingIssues('GLOABL search');
    expect(upper.suggestion).toBe('GLOBAL');

    const [capitalized] = findSpellingIssues('Veestara workspace');
    expect(capitalized.suggestion).toBe('Vestara');
  });

  it('does not flag ordinary words', () => {
    expect(findSpellingIssues('Review the floating assistant context')).toEqual([]);
  });

  it('flags repeated words at the second occurrence', () => {
    const issues = findSpellingIssues('go to the the store');
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('repeat');
    expect(issues[0].word.toLowerCase()).toBe('the');
  });

  it('flags double spacing', () => {
    const issues = findSpellingIssues('hello  world');
    expect(issues.some((issue) => issue.kind === 'spacing')).toBe(true);
  });

  it('returns issues sorted by offset', () => {
    const issues = findSpellingIssues('teh cat  sat');
    const starts = issues.map((issue) => issue.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });
});

describe('applySuggestion', () => {
  it('replaces the flagged range with the suggestion', () => {
    const text = 'this is gloabl state';
    const [issue] = findSpellingIssues(text);
    expect(applySuggestion(text, issue)).toBe('this is global state');
  });

  it('removes repeated words', () => {
    const text = 'go to the the store';
    const [issue] = findSpellingIssues(text);
    expect(applySuggestion(text, issue)).toBe('go to the  store');
  });
});

describe('COMMON_TYPOS', () => {
  it('has no identity mappings', () => {
    for (const [from, to] of Object.entries(COMMON_TYPOS)) {
      expect(to).not.toBe(from);
    }
  });
});
