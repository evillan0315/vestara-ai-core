import { mkdtemp, rm } from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { migrate } from '@vestara/sqlite-migrations';
import { AuditStore, UserStore, WORKSPACE_DOMAIN_MANIFEST } from '@vestara/workspace';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import type { WorkspaceContext } from '../src/workspace-context';
import { openSqlDb } from '../src/workspace-context';

const servers: { close: (cb: (err?: Error) => void) => void }[] = [];
const dbs: { close: () => void }[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  for (const db of dbs.splice(0)) db.close();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function fixture() {
  const directory = await mkdtemp('/tmp/vestara-user-lifecycle-');
  dirs.push(directory);
  const db = (await openSqlDb(path.join(directory, 'plans.db'), (raw) => {
    migrate(raw, WORKSPACE_DOMAIN_MANIFEST);
  })) as any;
  dbs.push(db);
  const users = new UserStore(db);
  const audit = new AuditStore(db);
  const admin = users.listAll()[0];
  if (!admin) throw new Error('admin fixture was not created');

  const ctx = { users, audit } as unknown as WorkspaceContext;
  const server = createServer(ctx, 0);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a port');
  servers.push(server);
  return { users, admin, port: address.port };
}

function request(
  port: number,
  requestPath: string,
  method: string,
  body: unknown,
  token?: string,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : null });
        });
      },
    );
    req.on('error', reject);
    req.end(payload || undefined);
  });
}

describe('admin user lifecycle (role update + delete)', () => {
  it('requires admin: 401 anonymous, 403 editor', async () => {
    const state = await fixture();
    const editor = state.users.createUser('ed', 'editor');
    await expect(
      request(state.port, `/api/admin/users/${editor.id}`, 'PATCH', { role: 'viewer' }),
    ).resolves.toMatchObject({ status: 401 });
    await expect(
      request(state.port, `/api/admin/users/${editor.id}`, 'PATCH', { role: 'viewer' }, editor.token),
    ).resolves.toMatchObject({ status: 403 });
    await expect(request(state.port, `/api/admin/users/${editor.id}`, 'DELETE', undefined)).resolves.toMatchObject({
      status: 401,
    });
    await expect(
      request(state.port, `/api/admin/users/${editor.id}`, 'DELETE', undefined, editor.token),
    ).resolves.toMatchObject({ status: 403 });
  });

  it('updates roles with validation and 404s unknown users', async () => {
    const state = await fixture();
    const editor = state.users.createUser('ed', 'editor');
    await expect(
      request(state.port, `/api/admin/users/${editor.id}`, 'PATCH', { role: 'superuser' }, state.admin.token),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      request(state.port, '/api/admin/users/nope', 'PATCH', { role: 'viewer' }, state.admin.token),
    ).resolves.toMatchObject({ status: 404 });

    const response = await request(
      state.port,
      `/api/admin/users/${editor.id}`,
      'PATCH',
      { role: 'viewer' },
      state.admin.token,
    );
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ id: editor.id, username: 'ed', role: 'viewer' });
    expect(response.body.user.token).toBeUndefined();
    expect(state.users.findById(editor.id)?.role).toBe('viewer');
  });

  it('refuses to demote the last admin or delete your own account', async () => {
    const state = await fixture();
    await expect(
      request(state.port, `/api/admin/users/${state.admin.id}`, 'PATCH', { role: 'editor' }, state.admin.token),
    ).resolves.toMatchObject({ status: 409 });
    await expect(
      request(state.port, `/api/admin/users/${state.admin.id}`, 'DELETE', undefined, state.admin.token),
    ).resolves.toMatchObject({ status: 400 });

    const second = state.users.createUser('admin2', 'admin');
    const demote = await request(
      state.port,
      `/api/admin/users/${state.admin.id}`,
      'PATCH',
      { role: 'editor' },
      second.token,
    );
    expect(demote.status).toBe(200);
    // Self-deletion stays refused even when other admins exist.
    await expect(
      request(state.port, `/api/admin/users/${second.id}`, 'DELETE', undefined, second.token),
    ).resolves.toMatchObject({ status: 400 });
    // …and the demoted token immediately loses admin rights.
    await expect(
      request(state.port, `/api/admin/users/${second.id}`, 'DELETE', undefined, state.admin.token),
    ).resolves.toMatchObject({ status: 403 });
  });

  it('deletes users and invalidates their tokens', async () => {
    const state = await fixture();
    const editor = state.users.createUser('ed', 'editor');
    const response = await request(state.port, `/api/admin/users/${editor.id}`, 'DELETE', undefined, state.admin.token);
    expect(response).toMatchObject({ status: 200, body: { deleted: true, id: editor.id } });
    expect(state.users.findById(editor.id)).toBeUndefined();
    await expect(request(state.port, '/api/auth/me', 'GET', undefined, editor.token)).resolves.toMatchObject({
      status: 401,
    });
    await expect(
      request(state.port, `/api/admin/users/${editor.id}`, 'DELETE', undefined, state.admin.token),
    ).resolves.toMatchObject({ status: 404 });
  });

  it('gates self-registration on VESTARA_AUTH_OPEN_REGISTRATION', async () => {
    const state = await fixture();
    const previous = process.env.VESTARA_AUTH_OPEN_REGISTRATION;
    try {
      const open = await request(state.port, '/api/auth/login', 'POST', { username: 'newbie' });
      expect(open.status).toBe(201);
      expect(open.body.user.role).toBe('editor');

      process.env.VESTARA_AUTH_OPEN_REGISTRATION = '0';
      await expect(request(state.port, '/api/auth/login', 'POST', { username: 'stranger' })).resolves.toMatchObject({
        status: 401,
      });
      expect(state.users.listAll().some((u) => u.username === 'stranger')).toBe(false);

      // Known users still log in with registration closed.
      const known = await request(state.port, '/api/auth/login', 'POST', { username: 'newbie' });
      expect(known.status).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.VESTARA_AUTH_OPEN_REGISTRATION;
      else process.env.VESTARA_AUTH_OPEN_REGISTRATION = previous;
    }
  });

  it('keeps tokens and the user directory out of /api/auth/me', async () => {
    const state = await fixture();
    const me = await request(state.port, '/api/auth/me', 'GET', undefined, state.admin.token);
    expect(me.status).toBe(200);
    expect(me.body.currentUser).toMatchObject({ id: state.admin.id, username: 'admin', role: 'admin' });
    expect(me.body.currentUser.token).toBeUndefined();
    expect(me.body.allUsers).toBeUndefined();
  });
});
