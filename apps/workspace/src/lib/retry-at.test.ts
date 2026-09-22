import { describe, expect, it } from 'vitest';
import { getUsageLimitRetry, isUsageLimitError, parseRetryAt } from './retry-at';

const NOW = new Date('2026-09-21T12:00:00Z');

describe('retry-at', () => {
  it('classifies usage-limit errors', () => {
    expect(isUsageLimitError('You’ve hit your usage limit. try again at Sep 26th, 2026 7:51 AM.')).toBe(true);
    expect(isUsageLimitError('Rate limit exceeded (429)')).toBe(true);
    expect(isUsageLimitError('Something else broke')).toBe(false);
    expect(isUsageLimitError(null)).toBe(false);
  });

  it('parses the Codex-style ordinal timestamp', () => {
    const at = parseRetryAt(
      'You’ve hit your usage limit. Upgrade to Pro, visit settings to purchase more credits or try again at Sep 26th, 2026 7:51 AM.',
      NOW,
    );
    expect(at).not.toBeNull();
    expect(at?.getFullYear()).toBe(2026);
    expect(at?.getMonth()).toBe(8);
    expect(at?.getDate()).toBe(26);
  });

  it('parses relative delays', () => {
    const at = parseRetryAt('Rate limit — try again in 30m', NOW);
    expect(at?.getTime()).toBe(NOW.getTime() + 30 * 60_000);
  });

  it('rejects past dates and non-matching text', () => {
    expect(parseRetryAt('try again at Sep 10th, 2026 7:51 AM', NOW)).toBeNull();
    expect(parseRetryAt('nothing schedulable here', NOW)).toBeNull();
  });

  it('combines classifier + instant', () => {
    const retry = getUsageLimitRetry('usage limit — try again at Sep 26th, 2026 7:51 AM', NOW);
    expect(retry).not.toBeNull();
    const back = new Date(retry?.retryAtISO ?? '');
    expect(back.getMonth()).toBe(8);
    expect(back.getDate()).toBe(26);
    expect(getUsageLimitRetry('plain failure', NOW)).toBeNull();
  });
});
