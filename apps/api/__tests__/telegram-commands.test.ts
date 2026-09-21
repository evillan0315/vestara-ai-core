/**
 * VES-TG-PAIR — Telegram bot command parsing tests.
 *
 * Proves `/pair` and `/start` are recognized (exact, with `@BotName`
 * suffix, with args, case-insensitive) while ordinary text is not.
 */

import { describe, expect, it } from 'vitest';
import { parseTelegramCommandText } from '../src/routes/telegram';

describe('parseTelegramCommandText', () => {
  it('recognizes /pair and /start', () => {
    expect(parseTelegramCommandText('/pair')).toBe('pair');
    expect(parseTelegramCommandText('/start')).toBe('start');
  });

  it('handles bot-name suffixes, args, and casing', () => {
    expect(parseTelegramCommandText('/pair@VestaraAssistantBot')).toBe('pair');
    expect(parseTelegramCommandText('/PAIR')).toBe('pair');
    expect(parseTelegramCommandText('/start some reason')).toBe('start');
    expect(parseTelegramCommandText('  /pair  ')).toBe('pair');
  });

  it('returns null for ordinary text and unknowns', () => {
    expect(parseTelegramCommandText('hello')).toBeNull();
    expect(parseTelegramCommandText('/help')).toBeNull();
    expect(parseTelegramCommandText('/pairing')).toBeNull();
    expect(parseTelegramCommandText('')).toBeNull();
    expect(parseTelegramCommandText(undefined)).toBeNull();
  });
});
