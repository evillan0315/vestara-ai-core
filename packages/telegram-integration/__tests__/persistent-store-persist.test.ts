/**
 * TelegramPersistentStore flush coverage.
 *
 * Proves every mutation flushes the in-memory sql.js database to disk via
 * the persist callback (previously persistence only ran inside migrate() at
 * boot, so pairing approvals lived only in memory until restart), reads
 * never flush, and a failing flush never fails the mutation.
 */

import { describe, expect, it, vi } from 'vitest';
import type { PairingRequest, TelegramIdentityBinding } from '../src/pairing';
import { TelegramPersistentStore } from '../src/persistent-store';

// Minimal sql.js-shaped stub: prepare/bind/step/getAsObject/free.
function fakeDb(row: Record<string, unknown> | null = null) {
  const seen: string[] = [];
  return {
    seen,
    prepare(sql: string) {
      seen.push(sql);
      let stepped = false;
      return {
        bind: () => true,
        step: () => {
          if (row !== null && !stepped) {
            stepped = true;
            return true;
          }
          return false;
        },
        getAsObject: () => row,
        free: () => true,
      };
    },
  };
}

function pairingRequest(): PairingRequest {
  return {
    id: 'pair-persist-1',
    telegramUserId: 'tg-u-1',
    telegramDisplayName: 'Persist User',
    token: 'PERSIST01',
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
}

function identityBinding(): TelegramIdentityBinding {
  return {
    id: 'binding-persist-1',
    telegramUserId: 'tg-u-1',
    telegramDisplayName: 'Persist User',
    principalId: 'hp-persist-1',
    principalName: 'Persist User',
    createdAt: new Date().toISOString(),
    active: true,
  };
}

describe('TelegramPersistentStore persist callback', () => {
  it('flushes after every mutation', () => {
    const db = fakeDb();
    const persist = vi.fn();
    const store = new TelegramPersistentStore(db, { persist });

    store.savePairingRequest(pairingRequest());
    store.saveIdentityBinding(identityBinding());
    store.saveSettings('k', { v: 1 });
    store.deleteSettings('k');
    store.deletePairingRequest('pair-persist-1');
    store.deleteIdentityBinding('binding-persist-1');

    expect(persist).toHaveBeenCalledTimes(6);
  });

  it('never flushes on reads', () => {
    const db = fakeDb({
      id: 'binding-persist-1',
      telegram_user_id: 'tg-u-1',
      telegram_display_name: 'Persist User',
      principal_id: 'hp-persist-1',
      principal_name: 'Persist User',
      created_at: new Date().toISOString(),
      active: 1,
    });
    const persist = vi.fn();
    const store = new TelegramPersistentStore(db, { persist });

    expect(store.getIdentityBindingByTelegramId('tg-u-1')?.principalId).toBe('hp-persist-1');
    store.getPairingRequestByToken('PERSIST01');
    expect(persist).not.toHaveBeenCalled();
  });

  it('a failing flush never fails the mutation', () => {
    const db = fakeDb();
    const store = new TelegramPersistentStore(db, {
      persist: () => {
        throw new Error('disk full');
      },
    });
    expect(() => store.savePairingRequest(pairingRequest())).not.toThrow();
    expect(db.seen.join('\n')).toContain('telegram_pairing_requests');
  });

  it('works without a persist callback (in-memory/test usage)', () => {
    const db = fakeDb();
    const store = new TelegramPersistentStore(db);
    expect(() => store.saveIdentityBinding(identityBinding())).not.toThrow();
  });
});
