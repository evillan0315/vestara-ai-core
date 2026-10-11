/**
 * Telegram forward (Activity Room → Telegram) — target resolution tests.
 *
 * The forward endpoint is explicit per-message delivery: nothing leaves the
 * room unless the operator picks a message and a chat. These tests prove the
 * fail-closed target contract:
 * - no linked chats → NO_LINKED_CHATS (with guidance, never silent)
 * - explicit unknown chatId → UNKNOWN_CHAT (never an open relay)
 * - several linked chats without a choice → AMBIGUOUS_CHAT
 * - a single linked chat resolves implicitly; an explicit match wins
 */

import type { ConversationBinding } from '@vestara/telegram-integration';
import { describe, expect, it, vi } from 'vitest';
import {
  buildForwardMirrorMessage,
  mirrorTelegramForwardToActivityRoom,
  resolveForwardTarget,
} from '../src/routes/telegram';

function binding(chatId: string, overrides?: Partial<ConversationBinding>): ConversationBinding {
  return {
    id: `conv-${chatId}`,
    principalId: 'principal-1',
    workspaceId: 'workspace',
    telegramChatId: chatId,
    telegramChatType: 'direct',
    vestaraConversationId: `vestara-${chatId}`,
    status: 'active',
    createdAt: '2026-09-01T00:00:00.000Z',
    lastActivityAt: '2026-09-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveForwardTarget', () => {
  it('rejects with NO_LINKED_CHATS when no chat is linked', () => {
    const result = resolveForwardTarget([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NO_LINKED_CHATS');
  });

  it('resolves the single linked chat implicitly', () => {
    const bindings = [binding('111')];
    const result = resolveForwardTarget(bindings);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.binding.telegramChatId).toBe('111');
  });

  it('requires an explicit choice when several chats are linked', () => {
    const result = resolveForwardTarget([binding('111'), binding('222')]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('AMBIGUOUS_CHAT');
  });

  it('resolves an explicit chatId among several linked chats', () => {
    const bindings = [binding('111'), binding('222')];
    const result = resolveForwardTarget(bindings, '222');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.binding.telegramChatId).toBe('222');
  });

  it('rejects an unknown explicit chatId (never an open relay)', () => {
    const result = resolveForwardTarget([binding('111')], '999');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNKNOWN_CHAT');
  });

  it('treats blank chatId as absent (single chat still resolves)', () => {
    const result = resolveForwardTarget([binding('111')], '   ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.binding.telegramChatId).toBe('111');
  });
});

describe('buildForwardMirrorMessage', () => {
  it('prefixes the outbound copy with the destination chat', () => {
    expect(buildForwardMirrorMessage('8531736505', 'hello')).toBe('[To Telegram 8531736505] hello');
  });

  it('preserves the full forwarded text (no truncation)', () => {
    const text = 'a'.repeat(5000);
    expect(buildForwardMirrorMessage('111', text)).toBe(`[To Telegram 111] ${text}`);
  });
});

describe('mirrorTelegramForwardToActivityRoom', () => {
  it('never throws when M11A is uninitialized (best-effort mirror)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(
        mirrorTelegramForwardToActivityRoom('111', 'hello', { id: 'user-1', name: 'Operator' }),
      ).resolves.toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });
});
