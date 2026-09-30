import { buildManifest, migrate } from '@vestara/sqlite-migrations';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { PLANS_MANIFEST } from '../src/agent-migrations';
import { HUMAN_IDENTITY_REPRESENTATION_MANIFEST } from '../src/human-identity-representation-migrations';
import { HumanIdentityRepresentationStorage } from '../src/human-identity-representation-storage';
import { HUMAN_PRINCIPAL_MIGRATIONS } from '../src/human-principal-migrations';
import { HumanPrincipalStorage } from '../src/human-principal-storage';

async function fixture() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  migrate(
    db,
    buildManifest('human-identity-representation-test', [
      HUMAN_PRINCIPAL_MIGRATIONS,
      ...[HUMAN_IDENTITY_REPRESENTATION_MANIFEST.steps],
    ]),
  );
  const principals = new HumanPrincipalStorage(db);
  const representations = new HumanIdentityRepresentationStorage(db, principals);
  return { db, principals, representations };
}

describe('HumanIdentityRepresentationStorage', () => {
  it('upgrades pre-004 plans history without shifting recorded migrations', async () => {
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    const pre004 = buildManifest('plans-pre-004', [PLANS_MANIFEST.steps.slice(0, -1)]);
    migrate(db, pre004);
    db.run('INSERT INTO human_principals (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      'hp-pre-004',
      'active',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);

    expect(() => migrate(db, PLANS_MANIFEST)).not.toThrow();
    expect(db.exec('SELECT id FROM human_principals')).toEqual([{ columns: ['id'], values: [['hp-pre-004']] }]);
    const applied = db.exec('SELECT name FROM _vestara_migrations ORDER BY version')[0]?.values ?? [];
    expect(applied.at(-1)).toEqual(['human_identity_representation.baseline']);
    db.close();
  });

  it('is explicit, principal-scoped, durable in the database, and fail-closed', async () => {
    const state = await fixture();
    const first = await state.principals.create({ status: 'active' });
    const second = await state.principals.create({ status: 'active' });
    try {
      await expect(state.representations.create('missing', { preferredName: 'Unknown' })).rejects.toThrow(
        'HumanPrincipal not found',
      );
      const representation = await state.representations.create(first.id, { preferredName: 'Operator' });
      expect(representation).toMatchObject({
        principalId: first.id,
        preferredName: 'Operator',
        status: 'active',
        source: 'explicit',
      });
      expect(await state.representations.get(second.id)).toBeNull();
      expect(
        state.db.exec('SELECT principal_id, preferred_name FROM human_identity_representations')[0]?.values,
      ).toEqual([[first.id, 'Operator']]);
      await expect(state.representations.create(first.id, { preferredName: 'Again' })).rejects.toThrow(
        'already exists',
      );
      await expect(state.representations.update(first.id, { preferredName: 'Renamed' })).resolves.toMatchObject({
        preferredName: 'Renamed',
      });
      expect(await state.representations.get(first.id)).toMatchObject({ preferredName: 'Renamed' });
    } finally {
      state.db.close();
    }
  });

  it('rejects inactive principals and provider-shaped fields are not part of the contract', async () => {
    const state = await fixture();
    const principal = await state.principals.create({ status: 'suspended' });
    try {
      await expect(state.representations.create(principal.id, { preferredName: 'Telegram Name' })).rejects.toThrow(
        'not active',
      );
      await expect(
        state.representations.create(principal.id, {
          preferredName: 'Telegram Name',
          // @ts-expect-error provider presentation is intentionally unsupported.
          telegramDisplayName: 'Telegram Name',
        }),
      ).rejects.toThrow();
    } finally {
      state.db.close();
    }
  });
});
