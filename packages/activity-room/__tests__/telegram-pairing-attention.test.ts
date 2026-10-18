/**
 * VES-TG-032 — Telegram pairing Needs-Attention projection tests.
 *
 * Proves:
 * - pending /pair requests project as approval-required attention entries,
 * - entry shape uses existing category/reason (no new vocabulary),
 * - dedupe: one open entry per telegramUserId,
 * - auto-resolve: approved/expired/revoked requests produce no entry,
 * - resolve-on-expiry: expired requests are omitted,
 * - suggestedPrincipalId surfaces in details when present.
 */

import { describe, expect, it } from 'vitest';
import { projectTelegramPairingAttentionEntries, type TelegramPairingAttentionInput } from '../src/attention';

function pairingRequest(overrides?: Partial<TelegramPairingAttentionInput>): TelegramPairingAttentionInput {
  return {
    pairingId: 'pair-1',
    token: 'tok-abc',
    status: 'pending',
    telegramUserId: 'tg-123',
    telegramDisplayName: 'Alice',
    createdAt: '2026-10-18T10:00:00Z',
    expiresAt: '2026-10-18T10:05:00Z',
    ...overrides,
  };
}

describe('projectTelegramPairingAttentionEntries', () => {
  it('projects a pending pairing request as an approval-required entry', () => {
    const entries = projectTelegramPairingAttentionEntries([pairingRequest()]);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.category).toBe('approval');
    expect(entry.reason).toBe('approval-required');
    expect(entry.status).toBe('open');
    expect(entry.owner).toBe('telegram-integration');
    expect(entry.message).toContain('Alice');
  });

  it('includes pairingId, token, expiresAt, telegramUserId in details', () => {
    const entries = projectTelegramPairingAttentionEntries([pairingRequest()]);
    const details = entries[0]!.details!;
    expect(details.pairingId).toBe('pair-1');
    expect(details.token).toBe('tok-abc');
    expect(details.expiresAt).toBe('2026-10-18T10:05:00Z');
    expect(details.telegramUserId).toBe('tg-123');
  });

  it('includes suggestedPrincipalId when present', () => {
    const entries = projectTelegramPairingAttentionEntries([pairingRequest({ suggestedPrincipalId: 'principal-42' })]);
    expect(entries[0]!.details!.suggestedPrincipalId).toBe('principal-42');
  });

  it('omits suggestedPrincipalId when absent', () => {
    const entries = projectTelegramPairingAttentionEntries([pairingRequest()]);
    expect(entries[0]!.details).not.toHaveProperty('suggestedPrincipalId');
  });

  it('dedupes to one open entry per telegramUserId (latest wins)', () => {
    const entries = projectTelegramPairingAttentionEntries([
      pairingRequest({ pairingId: 'pair-1', createdAt: '2026-10-18T10:00:00Z' }),
      pairingRequest({ pairingId: 'pair-2', createdAt: '2026-10-18T10:01:00Z' }),
      pairingRequest({ pairingId: 'pair-3', createdAt: '2026-10-18T10:02:00Z' }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.details!.pairingId).toBe('pair-3');
  });

  it('keeps entries for different users separate', () => {
    const entries = projectTelegramPairingAttentionEntries([
      pairingRequest({ pairingId: 'pair-1', telegramUserId: 'tg-1' }),
      pairingRequest({ pairingId: 'pair-2', telegramUserId: 'tg-2' }),
    ]);
    expect(entries).toHaveLength(2);
  });

  it('auto-resolves approved requests (no entry)', () => {
    const entries = projectTelegramPairingAttentionEntries([
      pairingRequest({ status: 'approved', approvedAt: '2026-10-18T10:01:00Z' }),
    ]);
    expect(entries).toEqual([]);
  });

  it('auto-resolves expired requests (no entry)', () => {
    const entries = projectTelegramPairingAttentionEntries([pairingRequest({ status: 'expired' })]);
    expect(entries).toEqual([]);
  });

  it('auto-resolves revoked requests (no entry)', () => {
    const entries = projectTelegramPairingAttentionEntries([pairingRequest({ status: 'revoked' })]);
    expect(entries).toEqual([]);
  });

  it('returns empty array for no pending requests', () => {
    expect(projectTelegramPairingAttentionEntries([])).toEqual([]);
  });

  it('uses telegramUserId in message when display name is absent', () => {
    const entries = projectTelegramPairingAttentionEntries([pairingRequest({ telegramDisplayName: undefined })]);
    expect(entries[0]!.message).toContain('tg-123');
  });
});
