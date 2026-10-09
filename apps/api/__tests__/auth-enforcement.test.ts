import { mkdtemp, rm } from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { migrate } from '@vestara/sqlite-migrations';
import { AuditStore, UserStore, WORKSPACE_DOMAIN_MANIFEST } from '@vestara/workspace';
import { describe, expect, it } from 'vitest';
import { authenticate, isPublicApiRequest, legacyActor } from '../src/auth';
import { createServer } from '../src/server';
import type { WorkspaceContext } from '../src/workspace-context';
import { openSqlDb } from '../src/workspace-context';

async function fixture() {
  const directory = await mkdtemp('/tmp/vestara-auth-enforcement-');
  const dbPath = path.join(directory, 'plans.db');
  const db = (await openSqlDb(dbPath, (raw) => {
    migrate(raw, WORKSPACE_DOMAIN_MANIFEST);
  })) as any;
  const users = new UserStore(db);
  const audit = new AuditStore(db);
  const admin = users.listAll()[0];
  if (!admin) throw new Error('admin fixture was not created');

  const ctx = { users, audit } as unknown as WorkspaceContext;
  const server = createServer(ctx, 0);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a port');

  return { db, users, admin, server, port: address.port, directory };
}

async function teardown(state: Awaited<ReturnType<typeof fixture>>) {
  await new Promise<void>((resolve, reject) => state.server.close((error) => (error ? reject(error) : resolve())));
  state.db.close();
  await rm(state.directory, { recursive: true, force: true });
}

function req(
  port: number,
  options: { path: string; method?: string; body?: unknown; token?: string; actor?: string },
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path: options.path,
        method: options.method ?? (payload === undefined ? 'GET' : 'POST'),
        headers: {
          ...(payload === undefined
            ? {}
            : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options.actor ? { 'X-Vestara-Actor': options.actor } : {}),
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
    request.on('error', reject);
    request.end(payload);
  });
}

function fakeReq(headers: Record<string, string>): http.IncomingMessage {
  return { headers } as http.IncomingMessage;
}

describe('VES-AUTH-001 fail-closed API authentication', () => {
  it('keeps login public and gates everything else at the pipeline', async () => {
    const state = await fixture();
    try {
      const login = await req(state.port, { path: '/api/auth/login', body: { username: 'gate-user' } });
      expect(login.status).toBe(201);
      expect(login.body.user.token).toEqual(expect.any(String));

      await expect(req(state.port, { path: '/api/auth/me' })).resolves.toMatchObject({ status: 401 });
      await expect(req(state.port, { path: '/api/milestones' })).resolves.toMatchObject({ status: 401 });

      const me = await req(state.port, { path: '/api/auth/me', token: login.body.user.token });
      expect(me.status).toBe(200);
      expect(me.body.currentUser.username).toBe('gate-user');

      const milestones = await req(state.port, { path: '/api/milestones', token: state.admin.token });
      expect(milestones.status).toBe(200);
    } finally {
      await teardown(state);
    }
  });

  it('no longer grants admin to the legacy actor header or anonymous callers', async () => {
    const state = await fixture();
    try {
      await expect(req(state.port, { path: '/api/auth/me', actor: 'local-operator' })).resolves.toMatchObject({
        status: 401,
      });
      await expect(
        req(state.port, { path: '/api/admin/users', body: { username: 'sneaky' }, actor: 'local-operator' }),
      ).resolves.toMatchObject({ status: 401 });

      const viewer = state.users.createUser('gate-viewer', 'viewer');
      await expect(
        req(state.port, { path: '/api/admin/users', body: { username: 'denied' }, token: viewer.token }),
      ).resolves.toMatchObject({ status: 403 });

      const created = await req(state.port, {
        path: '/api/admin/users',
        body: { username: 'allowed' },
        token: state.admin.token,
      });
      expect(created.status).toBe(201);
      expect(created.body.user.username).toBe('allowed');
    } finally {
      await teardown(state);
    }
  });

  it('classifies public paths without touching the network', () => {
    expect(isPublicApiRequest('POST', '/api/auth/login')).toBe(true);
    expect(isPublicApiRequest('POST', '/api/telegram/webhook')).toBe(true);
    expect(isPublicApiRequest('GET', '/api/auth/login')).toBe(false);
    expect(isPublicApiRequest('GET', '/api/auth/me')).toBe(false);
    expect(isPublicApiRequest('POST', '/api/telegram/simulate')).toBe(false);
    expect(isPublicApiRequest('GET', '/api/milestones')).toBe(false);
    expect(isPublicApiRequest('POST', '/api/plans')).toBe(false);
  });

  it('authenticate() is null without a valid token; legacy actor is viewer-only', () => {
    const store = { findByToken: () => undefined } as any;
    expect(authenticate(fakeReq({}), store)).toBeNull();
    expect(authenticate(fakeReq({ 'x-vestara-actor': 'local-operator' }), store)).toBeNull();
    expect(authenticate(fakeReq({ authorization: 'Bearer bogus' }), store)).toBeNull();

    const legacy = legacyActor(fakeReq({ 'x-vestara-actor': 'local-operator' }));
    expect(legacy).toMatchObject({ id: 'local-operator', role: 'viewer' });
    expect(legacyActor(fakeReq({}))).toMatchObject({ id: 'local-operator', role: 'viewer' });
  });
});
