/**
 * HUMAN-CONTEXT-002 — HumanPrincipal contracts + persistence.
 *
 * Proves: Credential ≠ Principal, Principal ≠ Membership,
 * Principal ≠ Profile, Principal ≠ Authority, Identity ≠ Presentation.
 *
 * Explicitly out of scope: HumanProfile storage, Professional Profile seed,
 * My Story ingestion, HumanContext, retrieval, agent prompt/execution
 * changes, _enrichProfile repair, UserProfile migration, drawer redesign,
 * Account Settings redesign, policy engine.
 */

import { buildManifest, migrate } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HUMAN_PRINCIPAL_MANIFEST,
  HumanPrincipalConflictError,
  HumanPrincipalStorage,
  isHumanPrincipalStatus,
  PLANS_MANIFEST,
  projectHumanPrincipal,
  UserStore,
} from '../src/index.js';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

function setup(): { db: Database; principals: HumanPrincipalStorage; users: UserStore } {
  const db = new SQL.Database();
  // Full composition chain: proves the trailing human_principal step applies
  // cleanly and the users table (credential side) coexists with principals.
  migrate(db, PLANS_MANIFEST);
  return { db, principals: new HumanPrincipalStorage(db), users: new UserStore(db) };
}

describe('HumanPrincipal lifecycle', () => {
  it('creates, reads, and updates status with stable identity', async () => {
    const { principals } = setup();
    const created = await principals.create();
    expect(created.id.startsWith('hp-')).toBe(true);
    expect(created.status).toBe('active');

    const invited = await principals.create({ status: 'invited' });
    expect(invited.status).toBe('invited');

    const fetched = await principals.require(created.id);
    expect(fetched).toEqual(created);

    const suspended = await principals.updateStatus(created.id, 'suspended');
    expect(suspended.id).toBe(created.id);
    expect(suspended.status).toBe('suspended');

    await expect(principals.updateStatus(created.id, 'bogus' as never)).rejects.toThrow();
    await expect(principals.require('hp-missing')).rejects.toThrow('not found');
  });

  it('rejects unknown statuses at the contract gate', () => {
    expect(isHumanPrincipalStatus('active')).toBe(true);
    expect(isHumanPrincipalStatus('deleted')).toBe(true);
    expect(isHumanPrincipalStatus('display-name')).toBe(false);
    expect(isHumanPrincipalStatus(undefined)).toBe(false);
  });
});

describe('Identity ≠ Presentation', () => {
  it('presentation metadata never round-trips into stored identity', async () => {
    const { db, principals } = setup();
    const created = await principals.create();
    const projection = projectHumanPrincipal(
      created,
      { displayName: 'Eddie Villanueva', avatar: 'https://example.invalid/e.png' },
      [],
    );
    expect(projection.principal).toEqual(created);

    // Stored row carries identity columns only — no displayName/avatar/biography.
    const cols = (db.exec('PRAGMA table_info(human_principals)')[0]?.values ?? []).map((row) => String(row[1]));
    expect(cols).toEqual(['id', 'status', 'created_at', 'updated_at']);

    const refetched = await principals.require(created.id);
    expect(refetched).toEqual(created);
    expect('displayName' in refetched).toBe(false);
  });
});

describe('multiple principals coexist (no latest-row leakage)', () => {
  it('lists and resolves each principal by id', async () => {
    const { principals } = setup();
    const a = await principals.create();
    const b = await principals.create({ status: 'invited' });
    const c = await principals.create();
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);

    const listed = await principals.list();
    expect(listed.map((p) => p.id)).toEqual([a.id, b.id, c.id]);
    expect(await principals.get(b.id)).toEqual(b);
    expect(await principals.get('hp-nope')).toBeNull();
  });
});

describe('external identity binding', () => {
  it('binds to the correct principal, idempotent on relink, deterministic on conflict', async () => {
    const { principals } = setup();
    const a = await principals.create();
    const b = await principals.create();

    const linked = await principals.linkExternalIdentity(a.id, 'google', 'sub-123');
    expect(linked.principalId).toBe(a.id);

    const relinked = await principals.linkExternalIdentity(a.id, 'google', 'sub-123');
    expect(relinked).toEqual(linked);

    await expect(principals.linkExternalIdentity(b.id, 'google', 'sub-123')).rejects.toBeInstanceOf(
      HumanPrincipalConflictError,
    );

    expect(await principals.findPrincipalByExternalIdentity('google', 'sub-123')).toEqual(
      await principals.require(a.id),
    );
    expect(await principals.findPrincipalByExternalIdentity('github', 'nobody')).toBeNull();
    expect(await principals.listExternalIdentities(a.id)).toEqual([linked]);
    expect(await principals.listExternalIdentities(b.id)).toEqual([]);
  });

  it('refuses linkage to unknown principals', async () => {
    const { principals } = setup();
    await expect(principals.linkExternalIdentity('hp-ghost', 'google', 'sub-x')).rejects.toThrow('not found');
  });
});

describe('Credential binds to Principal (no authority transfer)', () => {
  it('resolves principal identity while credential role stays with the credential', async () => {
    const { principals, users } = setup();
    const principal = await principals.create();
    const user = users.createUser('eddie', 'admin');

    const binding = await principals.bindCredential(user.id, principal.id);
    expect(binding.credentialId).toBe(user.id);
    expect(binding.principalId).toBe(principal.id);

    // Secrets never land in the binding table.
    const rows = users.findByToken(user.token);
    expect(rows?.id).toBe(user.id);
    const stored = (principals as unknown as { db: Database }).db.exec(
      'SELECT credential_id, principal_id FROM human_credential_bindings',
    )[0]?.values;
    expect(stored).toEqual([[user.id, principal.id]]);

    const resolved = await principals.resolvePrincipalForCredential(user.id);
    expect(resolved).toEqual(principal);
    // The resolved principal carries no role/authority from the credential.
    expect('role' in (resolved as object)).toBe(false);
    expect('token' in (resolved as object)).toBe(false);
    expect('username' in (resolved as object)).toBe(false);

    // Rebinding the same pair is idempotent; stealing is deterministic.
    expect(await principals.bindCredential(user.id, principal.id)).toEqual(binding);
    const other = await principals.create();
    await expect(principals.bindCredential(user.id, other.id)).rejects.toBeInstanceOf(HumanPrincipalConflictError);

    await principals.unbindCredential(user.id);
    expect(await principals.resolvePrincipalForCredential(user.id)).toBeNull();
    // Credential itself is untouched by unbinding.
    expect(users.findById(user.id)?.username).toBe('eddie');
  });
});

describe('Principal ≠ Membership / Profile / Authority', () => {
  it('principal tables reference nothing about teams, roles, or profile', async () => {
    const { db, principals } = setup();
    await principals.create();
    const tables = (
      db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'human_%'")[0]?.values ?? []
    )
      .map((row) => String(row[0]))
      .sort();
    // Identity tables owned by 002; later milestones add their own human_*
    // tables without touching principal authority.
    for (const expected of ['human_credential_bindings', 'human_external_identities', 'human_principals']) {
      expect(tables).toContain(expected);
    }

    const principalCols = (db.exec('PRAGMA table_info(human_principals)')[0]?.values ?? []).map((row) =>
      String(row[1]),
    );
    for (const forbidden of ['display_name', 'biography', 'skills', 'role', 'membership', 'permissions']) {
      expect(principalCols).not.toContain(forbidden);
    }
  });
});

describe('persistence survives reconstruction', () => {
  it('exports and reopens with principals, identities, and bindings intact', async () => {
    const { db, principals, users } = setup();
    const principal = await principals.create();
    await principals.linkExternalIdentity(principal.id, 'github', 'octo-1');
    const user = users.createUser('eddie2', 'editor');
    await principals.bindCredential(user.id, principal.id);

    const bytes = db.export();
    const reopened = new SQL.Database(bytes);
    const restored = new HumanPrincipalStorage(reopened);
    expect(await restored.require(principal.id)).toEqual(principal);
    expect(await restored.findPrincipalByExternalIdentity('github', 'octo-1')).toEqual(principal);
    expect(await restored.resolvePrincipalForCredential(user.id)).toEqual(principal);
  });
});

describe('append-only migration upgrade', () => {
  it('upgrades a pre-human-principal database without metadata inconsistency', async () => {
    expect(HUMAN_PRINCIPAL_MANIFEST.steps.map((s) => s.name)).toEqual(['human_principal.baseline']);
    const names = PLANS_MANIFEST.steps.map((s) => s.name);
    expect(names).toContain('human_principal.baseline');

    // Reproduce a database recorded before 002: every step up to (excluding)
    // human_principal.baseline. Later trailing steps apply after it.
    const principalIndex = names.indexOf('human_principal.baseline');
    const legacy = buildManifest('plans-pre-human-principal', [PLANS_MANIFEST.steps.slice(0, principalIndex)]);
    const db = new SQL.Database();
    const installed = migrate(db, legacy);
    expect(installed.to).toBe(principalIndex);

    const result = migrate(db, PLANS_MANIFEST);
    expect(result.applied[0]).toBe('human_principal.baseline');
    expect(result.applied).toContain('human_knowledge.baseline');

    const principals = new HumanPrincipalStorage(db);
    const created = await principals.create();
    expect(await principals.require(created.id)).toEqual(created);
  });
});
