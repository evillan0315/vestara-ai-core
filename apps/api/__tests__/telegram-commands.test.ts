/**
 * VES-TG-PAIR — Telegram bot command parsing tests.
 *
 * Proves `/pair`, `/start`, `/help`, `/status`, `/workspace`, and
 * `/conversations` are recognized (exact, with `@BotName` suffix, with
 * args, case-insensitive) while ordinary text and unwired commands are
 * not (unwired slash commands fall through to normal chat routing).
 */

import { describe, expect, it } from 'vitest';
import { parseTelegramCommandArgs, parseTelegramCommandText, stripTelegramMarkdown } from '../src/routes/telegram';

describe('parseTelegramCommandText', () => {
  it('recognizes pair/start/info commands', () => {
    expect(parseTelegramCommandText('/pair')).toBe('pair');
    expect(parseTelegramCommandText('/start')).toBe('start');
    expect(parseTelegramCommandText('/help')).toBe('help');
    expect(parseTelegramCommandText('/status')).toBe('status');
    expect(parseTelegramCommandText('/workspace')).toBe('workspace');
    expect(parseTelegramCommandText('/conversations')).toBe('conversations');
  });

  it('handles bot-name suffixes, args, and casing', () => {
    expect(parseTelegramCommandText('/pair@VestaraAssistantBot')).toBe('pair');
    expect(parseTelegramCommandText('/PAIR')).toBe('pair');
    expect(parseTelegramCommandText('/start some reason')).toBe('start');
    expect(parseTelegramCommandText('  /pair  ')).toBe('pair');
    expect(parseTelegramCommandText('/STATUS@VestaraAssistantBot')).toBe('status');
    expect(parseTelegramCommandText('/Workspace list')).toBe('workspace');
  });

  it('returns null for ordinary text, unknowns, and unwired commands', () => {
    expect(parseTelegramCommandText('hello')).toBeNull();
    expect(parseTelegramCommandText('/pairing')).toBeNull();
    expect(parseTelegramCommandText('')).toBeNull();
    expect(parseTelegramCommandText(undefined)).toBeNull();
    // Registry-only commands with no API wiring fall through to routing.
    expect(parseTelegramCommandText('/new')).toBeNull();
    expect(parseTelegramCommandText('/model')).toBeNull();
    expect(parseTelegramCommandText('/reset')).toBeNull();
  });
});

describe('parseTelegramCommandArgs', () => {
  it('returns args after the command head', () => {
    expect(parseTelegramCommandArgs('/workspace list')).toEqual(['list']);
    expect(parseTelegramCommandArgs('/help@Bot status')).toEqual(['status']);
    expect(parseTelegramCommandArgs('/status')).toEqual([]);
    expect(parseTelegramCommandArgs(undefined)).toEqual([]);
  });
});

describe('stripTelegramMarkdown', () => {
  it('drops emphasis markers for the plain-text relay', () => {
    expect(stripTelegramMarkdown('**Workspaces:**')).toBe('Workspaces:');
    expect(stripTelegramMarkdown('no markers')).toBe('no markers');
  });
});
