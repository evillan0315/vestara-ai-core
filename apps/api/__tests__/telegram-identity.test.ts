import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { migrate } from '@vestara/sqlite-migrations';
import { HUMAN_PRINCIPAL_MANIFEST, HumanPrincipalStorage } from '@vestara/workspace';
import type { TelegramIdentityBinding } from '@vestara/telegram-integration';
import { enrollTelegramIdentity, resolveTelegramIdentity } from '../src/telegram-identity';

function binding(overrides: Partial<TelegramIdentityBinding> = {}): TelegramIdentityBinding {
  return {
    id: 'binding-test',
    telegramUserId: 'telegram-subject-test',
    telegramDisplayName: 'Eddie Villanueva',
    principalId: 'hp-test',
    principalName: 'Display-only claim',
    createdAt: new Date().toISOString(),
    active: true,
    ...overrides,
  };
}

async function storage(): Promise<HumanPrincipalStorage> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  migrate(db, HUMAN_PRINCIPAL_MANIFEST);
  return new HumanPrincipalStorage(db);
}

function pairingFor(pairingBinding: TelegramIdentityBinding = binding()) {
  return {
    getBindingByTelegramId: (telegramUserId: string) =>
      telegramUserId === pairingBinding.telegramUserId ? pairingBinding : undefined,
  };
}

describe('ACTOR-IDENTITY-002 Telegram canonical identity resolution', () => {
  it('resolves an explicitly paired Telegram subject to its HumanPrincipal and persists the external link', async () => {
    const principals = await storage();
    const principal = await principals.create();

    const resolved = await resolveTelegramIdentity(binding({ principalId: principal.id }), principals);

    expect(resolved?.principal.id).toBe(principal.id);
    expect(resolved?.externalIdentity).toEqual(
      expect.objectContaining({ provider: 'telegram', subject: 'telegram-subject-test', principalId: principal.id }),
    );
    await expect(principals.findPrincipalByExternalIdentity('telegram', 'telegram-subject-test')).resolves.toEqual(
      expect.objectContaining({ id: principal.id }),
    );
  });

  it('keeps an unpaired or unknown Telegram subject unresolved', async () => {
    const principals = await storage();

    await expect(resolveTelegramIdentity(undefined, principals)).resolves.toBeUndefined();
    await expect(
      resolveTelegramIdentity(binding({ principalId: 'hp-does-not-exist' }), principals),
    ).resolves.toBeUndefined();
  });

  it('does not establish identity from display name, Git identity, or OS username', async () => {
    const principals = await storage();
    const principal = await principals.create();

    await expect(
      resolveTelegramIdentity(
        binding({
          principalId: 'hp-not-created-by-a-name',
          telegramDisplayName: 'Eddie Villanueva',
        }),
        principals,
      ),
    ).resolves.toBeUndefined();

    // The resolver has no Git or OS identity inputs; those namespaces cannot
    // create a Telegram external-identity link.
    await expect(principals.findPrincipalByExternalIdentity('git', 'Eddie Villanueva')).resolves.toBeNull();
    await expect(principals.findPrincipalByExternalIdentity('os', 'user')).resolves.toBeNull();
    expect(principal.id).not.toBe('Eddie Villanueva');
  });

  it('keeps Telegram subject and HumanPrincipal identifiers distinct and grants no authority', async () => {
    const principals = await storage();
    const principal = await principals.create();
    const resolved = await resolveTelegramIdentity(binding({ principalId: principal.id }), principals);

    expect(resolved?.externalIdentity.subject).toBe('telegram-subject-test');
    expect(resolved?.principal.id).not.toBe(resolved?.externalIdentity.subject);
    expect(resolved?.principal).not.toHaveProperty('role');
    expect(resolved?.principal).not.toHaveProperty('permissions');
    expect(resolved?.principal.status).toBe('active');
  });

  it('uses the canonical external link when a legacy pairing carries a different local principal string', async () => {
    const principals = await storage();
    const first = await principals.create();
    const second = await principals.create();
    await principals.linkExternalIdentity(first.id, 'telegram', 'telegram-subject-test');

    await expect(resolveTelegramIdentity(binding({ principalId: second.id }), principals)).resolves.toEqual(
      expect.objectContaining({ principal: expect.objectContaining({ id: first.id }) }),
    );
  });

  it('explicitly enrolls an existing pairing into the selected canonical principal', async () => {
    const principals = await storage();
    const principal = await principals.create();
    const legacyPairing = binding({ principalId: 'tg-principal-legacy' });

    const enrolled = await enrollTelegramIdentity(
      legacyPairing.telegramUserId,
      principal.id,
      pairingFor(legacyPairing),
      principals,
    );

    expect(enrolled.principal.id).toBe(principal.id);
    expect(enrolled.externalIdentity).toEqual(
      expect.objectContaining({ provider: 'telegram', subject: legacyPairing.telegramUserId }),
    );
    await expect(resolveTelegramIdentity(legacyPairing, principals)).resolves.toEqual(enrolled);
  });

  it('makes repeating the same explicit enrollment idempotent', async () => {
    const principals = await storage();
    const principal = await principals.create();
    const legacyPairing = binding({ principalId: 'tg-principal-legacy' });
    const pairing = pairingFor(legacyPairing);

    const first = await enrollTelegramIdentity(legacyPairing.telegramUserId, principal.id, pairing, principals);
    const second = await enrollTelegramIdentity(legacyPairing.telegramUserId, principal.id, pairing, principals);

    expect(second).toEqual(first);
  });

  it('rejects a different target principal and an unknown or inactive target', async () => {
    const principals = await storage();
    const first = await principals.create();
    const second = await principals.create();
    const legacyPairing = binding({ principalId: 'tg-principal-legacy' });
    const pairing = pairingFor(legacyPairing);

    await enrollTelegramIdentity(legacyPairing.telegramUserId, first.id, pairing, principals);
    await expect(enrollTelegramIdentity(legacyPairing.telegramUserId, second.id, pairing, principals)).rejects.toThrow(
      'already linked',
    );
    await expect(
      enrollTelegramIdentity(legacyPairing.telegramUserId, 'hp-missing', pairing, principals),
    ).rejects.toThrow('HumanPrincipal not found');

    const disabled = await principals.create();
    await principals.updateStatus(disabled.id, 'disabled');
    await expect(
      enrollTelegramIdentity(legacyPairing.telegramUserId, disabled.id, pairing, principals),
    ).rejects.toThrow('not active');

    await expect(
      enrollTelegramIdentity(
        legacyPairing.telegramUserId,
        first.id,
        pairingFor({ ...legacyPairing, active: false }),
        principals,
      ),
    ).rejects.toThrow('not actively paired');
  });

  it('does not grant authority during enrollment', async () => {
    const principals = await storage();
    const principal = await principals.create();
    const enrolled = await enrollTelegramIdentity(
      'telegram-subject',
      principal.id,
      pairingFor(binding({ telegramUserId: 'telegram-subject', principalId: 'legacy-principal' })),
      principals,
    );

    expect(enrolled.principal).not.toHaveProperty('role');
    expect(enrolled.principal).not.toHaveProperty('permissions');
    expect(enrolled.externalIdentity.provider).toBe('telegram');
  });
});
