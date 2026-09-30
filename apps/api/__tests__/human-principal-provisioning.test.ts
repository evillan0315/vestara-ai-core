import { mkdtemp, readFile, rm } from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { migrate } from '@vestara/sqlite-migrations';
import {
  AuditStore,
  HumanIdentityRepresentationStorage,
  HumanPrincipalStorage,
  UserStore,
  WORKSPACE_DOMAIN_MANIFEST,
} from '@vestara/workspace';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import type { WorkspaceContext } from '../src/workspace-context';
import { openSqlDb } from '../src/workspace-context';

async function fixture() {
  const directory = await mkdtemp('/tmp/vestara-principal-provisioning-');
  const dbPath = path.join(directory, 'plans.db');
  const db = (await openSqlDb(dbPath, (raw) => {
    migrate(raw, WORKSPACE_DOMAIN_MANIFEST);
    // The standalone human manifest has its own migration namespace. The
    // production plans manifest appends these tables to the shared chain, so
    // create the same bounded schema here without advancing a second namespace.
    raw.exec(`
      CREATE TABLE human_principals (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE human_external_identities (
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        principal_id TEXT NOT NULL REFERENCES human_principals(id),
        linked_at TEXT NOT NULL,
        PRIMARY KEY (provider, subject)
      );
      CREATE TABLE human_credential_bindings (
        credential_id TEXT PRIMARY KEY,
        principal_id TEXT NOT NULL REFERENCES human_principals(id),
        created_at TEXT NOT NULL
      );
      CREATE TABLE human_identity_representations (
        principal_id TEXT PRIMARY KEY REFERENCES human_principals(id),
        preferred_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        source TEXT NOT NULL DEFAULT 'explicit',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  })) as any;
  const users = new UserStore(db);
  const audit = new AuditStore(db);
  const humanPrincipals = new HumanPrincipalStorage(db);
  const humanIdentityRepresentations = new HumanIdentityRepresentationStorage(db, humanPrincipals);
  const admin = users.listAll()[0];
  if (!admin) throw new Error('admin fixture was not created');

  const ctx = { users, audit, humanPrincipals, humanIdentityRepresentations } as unknown as WorkspaceContext;
  const server = createServer(ctx, 0);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a port');

  return {
    db,
    users,
    humanPrincipals,
    admin,
    server,
    port: address.port,
    dbPath,
    directory,
  };
}

async function request(
  port: number,
  body: unknown,
  token?: string,
  requestPath = '/api/admin/human-principals',
  method = 'POST',
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) }),
        );
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

describe('ACTOR-IDENTITY-002D canonical principal provisioning boundary', () => {
  it('requires authentication and rejects invalid input without mutation', async () => {
    const state = await fixture();
    try {
      await expect(request(state.port, {})).resolves.toMatchObject({ status: 401 });
      await expect(
        request(state.port, { displayName: 'Not an identity field' }, state.admin.token),
      ).resolves.toMatchObject({
        status: 400,
      });
      await expect(state.humanPrincipals.list()).resolves.toHaveLength(0);
    } finally {
      await new Promise<void>((resolve, reject) => state.server.close((error) => (error ? reject(error) : resolve())));
      state.db.close();
      await rm(state.directory, { recursive: true, force: true });
    }
  });

  it('allows only an authenticated admin and persists identity without authority', async () => {
    const state = await fixture();
    const editor = state.users.createUser('editor', 'editor');
    try {
      await expect(request(state.port, {}, editor.token)).resolves.toMatchObject({ status: 403 });

      const response = await request(state.port, { status: 'active' }, state.admin.token);
      expect(response.status).toBe(201);
      expect(response.body.principal).toEqual(
        expect.objectContaining({ id: expect.stringMatching(/^hp-[0-9a-f]{16}$/), status: 'active' }),
      );
      await expect(state.humanPrincipals.list()).resolves.toHaveLength(1);
      const identities = await state.humanPrincipals.listExternalIdentities(response.body.principal.id);
      expect(identities).toEqual([]);

      const principalRows = state.db.exec('SELECT id, status FROM human_principals');
      const externalRows = state.db.exec('SELECT provider, subject FROM human_external_identities');
      expect(principalRows[0]?.values).toHaveLength(1);
      expect(externalRows).toEqual([]);

      const SQL = await initSqlJs();
      const persisted = new SQL.Database(await readFile(state.dbPath));
      expect(persisted.exec('SELECT id, status FROM human_principals')[0]?.values).toHaveLength(1);
      expect(persisted.exec('SELECT * FROM human_external_identities')).toEqual([]);
      persisted.close();
    } finally {
      await new Promise<void>((resolve, reject) => state.server.close((error) => (error ? reject(error) : resolve())));
      state.db.close();
      await rm(state.directory, { recursive: true, force: true });
    }
  });

  it('creates and updates only an explicitly governed representation', async () => {
    const state = await fixture();
    try {
      const principal = await state.humanPrincipals.create({ status: 'active' });
      const path = `/api/admin/human-principals/${encodeURIComponent(principal.id)}/representation`;
      await expect(
        request(state.port, { preferredName: 'Operator', telegramDisplayName: 'Ignored' }, state.admin.token, path),
      ).resolves.toMatchObject({
        status: 400,
      });
      const created = await request(state.port, { preferredName: 'Operator' }, state.admin.token, path);
      expect(created.status).toBe(201);
      expect(created.body.representation).toMatchObject({ principalId: principal.id, preferredName: 'Operator' });
      const updated = await request(state.port, { preferredName: 'Renamed' }, state.admin.token, path, 'PUT');
      expect(updated.status).toBe(200);
      expect(updated.body.representation.preferredName).toBe('Renamed');
      expect(await state.humanPrincipals.listExternalIdentities(principal.id)).toEqual([]);
    } finally {
      await new Promise<void>((resolve, reject) => state.server.close((error) => (error ? reject(error) : resolve())));
      state.db.close();
      await rm(state.directory, { recursive: true, force: true });
    }
  });

  it('guards GET and maps representation domain outcomes to stable HTTP semantics', async () => {
    const state = await fixture();
    try {
      const principal = await state.humanPrincipals.create({ status: 'active' });
      const editor = state.users.createUser('representation-editor', 'editor');
      const representationPath = `/api/admin/human-principals/${encodeURIComponent(principal.id)}/representation`;
      await expect(request(state.port, {}, undefined, representationPath, 'GET')).resolves.toMatchObject({
        status: 401,
      });
      await expect(request(state.port, {}, state.admin.token, representationPath, 'GET')).resolves.toMatchObject({
        status: 404,
      });
      await expect(request(state.port, {}, editor.token, representationPath, 'GET')).resolves.toMatchObject({
        status: 403,
      });
      await expect(
        request(state.port, { preferredName: 'Operator' }, state.admin.token, representationPath),
      ).resolves.toMatchObject({ status: 201 });
      await expect(
        request(state.port, { preferredName: 'Again' }, state.admin.token, representationPath),
      ).resolves.toMatchObject({ status: 409 });
      await expect(
        request(
          state.port,
          { preferredName: 'Missing' },
          state.admin.token,
          '/api/admin/human-principals/hp-missing/representation',
        ),
      ).resolves.toMatchObject({ status: 404 });
      await expect(
        request(state.port, { preferredName: 'Missing' }, state.admin.token, representationPath, 'PUT'),
      ).resolves.toMatchObject({ status: 200 });

      const noRepresentation = await state.humanPrincipals.create({ status: 'active' });
      const noRepresentationPath = `/api/admin/human-principals/${encodeURIComponent(noRepresentation.id)}/representation`;
      await expect(
        request(state.port, { preferredName: 'Missing' }, state.admin.token, noRepresentationPath, 'PUT'),
      ).resolves.toMatchObject({ status: 404 });

      const inactive = await state.humanPrincipals.create({ status: 'suspended' });
      const inactivePath = `/api/admin/human-principals/${encodeURIComponent(inactive.id)}/representation`;
      await expect(
        request(state.port, { preferredName: 'Inactive' }, state.admin.token, inactivePath),
      ).resolves.toMatchObject({ status: 403 });
    } finally {
      await new Promise<void>((resolve, reject) => state.server.close((error) => (error ? reject(error) : resolve())));
      state.db.close();
      await rm(state.directory, { recursive: true, force: true });
    }
  });
});
