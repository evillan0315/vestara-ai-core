import { mkdtemp, rm } from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { migrate } from '@vestara/sqlite-migrations';
import { AuditStore, totpNow, UserStore, WORKSPACE_DOMAIN_MANIFEST } from '@vestara/workspace';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import type { WorkspaceContext } from '../src/workspace-context';
import { openSqlDb } from '../src/workspace-context';

const servers: { close: (cb: (err?: Error) => void) => void }[] = [];
const dbs: { close: () => void }[] = [];
const dirs: string[] = [];
const CREDENTIAL_KEY = `${'0'.repeat(63)}1`;

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  for (const db of dbs.splice(0)) db.close();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  delete process.env.VESTARA_CREDENTIAL_KEY;
  delete process.env.VESTARA_AUTH_REQUIRE_PASSWORD;
});

async function fixture() {
  process.env.VESTARA_CREDENTIAL_KEY = CREDENTIAL_KEY;
  const directory = await mkdtemp('/tmp/vestara-auth-password-mfa-');
  dirs.push(directory);
  const db = (await openSqlDb(path.join(directory, 'plans.db'), (raw) => {
    migrate(raw, WORKSPACE_DOMAIN_MANIFEST);
  })) as any;
  dbs.push(db);
  const users = new UserStore(db);
  const audit = new AuditStore(db);
  const admin = users.listAll()[0];
  if (!admin) throw new Error('admin fixture was not created');
  const editor = users.createUser('ed', 'editor');

  const ctx = { users, audit, repoPath: directory } as unknown as WorkspaceContext;
  const server = createServer(ctx, 0);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a port');
  servers.push(server);
  return { users, admin, editor, port: address.port };
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

describe('password + MFA authentication', () => {
  it('issues admin passwords and logs in with them', async () => {
    const state = await fixture();
    await expect(
      request(state.port, '/api/auth/password', 'POST', { username: 'ed', password: 'nope' }),
    ).resolves.toMatchObject({ status: 401 });

    const issued = await request(
      state.port,
      `/api/admin/users/${state.editor.id}`,
      'PATCH',
      { passwordSet: true },
      state.admin.token,
    );
    expect(issued.status).toBe(200);
    expect(typeof issued.body.generatedPassword).toBe('string');

    const login = await request(state.port, '/api/auth/password', 'POST', {
      username: 'ed',
      password: issued.body.generatedPassword,
    });
    expect(login.status).toBe(200);
    expect(login.body.user.token).toBe(state.editor.token);
    expect(login.body.mfaRequired).toBeUndefined();
  });

  it('runs the full MFA lifecycle: enroll, confirm, challenge, backup code, disable', async () => {
    const state = await fixture();
    const issued = await request(
      state.port,
      `/api/admin/users/${state.editor.id}`,
      'PATCH',
      { passwordSet: true },
      state.admin.token,
    );
    const password = issued.body.generatedPassword as string;

    const enroll = await request(state.port, '/api/auth/mfa/enroll', 'POST', {}, state.editor.token);
    expect(enroll.status).toBe(200);
    expect(enroll.body.otpauthUrl).toContain('otpauth://totp/');
    const secret = enroll.body.secret as string;

    await expect(
      request(state.port, '/api/auth/mfa/confirm', 'POST', { code: '000000' }, state.editor.token),
    ).resolves.toMatchObject({ status: 400 });
    const confirm = await request(
      state.port,
      '/api/auth/mfa/confirm',
      'POST',
      { code: totpNow(secret) },
      state.editor.token,
    );
    expect(confirm.status).toBe(200);
    expect(confirm.body.backupCodes).toHaveLength(10);

    const challenged = await request(state.port, '/api/auth/password', 'POST', { username: 'ed', password });
    expect(challenged.status).toBe(200);
    expect(challenged.body.mfaRequired).toBe(true);
    expect(challenged.body.user).toBeUndefined();

    const verified = await request(state.port, '/api/auth/mfa/verify', 'POST', {
      username: 'ed',
      code: totpNow(secret),
    });
    expect(verified.status).toBe(200);
    expect(verified.body.user.token).toBe(state.editor.token);

    const backup = (confirm.body.backupCodes as string[])[0];
    const first = await request(state.port, '/api/auth/mfa/verify', 'POST', { username: 'ed', code: backup });
    expect(first.status).toBe(200);
    await expect(
      request(state.port, '/api/auth/mfa/verify', 'POST', { username: 'ed', code: backup }),
    ).resolves.toMatchObject({ status: 401 });

    await expect(
      request(state.port, '/api/auth/mfa', 'DELETE', { password: 'wrong' }, state.editor.token),
    ).resolves.toMatchObject({ status: 401 });
    const disabled = await request(state.port, '/api/auth/mfa', 'DELETE', { password }, state.editor.token);
    expect(disabled).toMatchObject({ status: 200, body: { disabled: true } });
    const direct = await request(state.port, '/api/auth/password', 'POST', { username: 'ed', password });
    expect(direct.status).toBe(200);
    expect(direct.body.user.token).toBe(state.editor.token);
  });

  it('lets admins reset MFA and clear passwords', async () => {
    const state = await fixture();
    const issued = await request(
      state.port,
      `/api/admin/users/${state.editor.id}`,
      'PATCH',
      { passwordSet: true },
      state.admin.token,
    );
    const enroll = await request(state.port, '/api/auth/mfa/enroll', 'POST', {}, state.editor.token);
    await request(
      state.port,
      '/api/auth/mfa/confirm',
      'POST',
      { code: totpNow(enroll.body.secret) },
      state.editor.token,
    );
    expect(state.users.findById(state.editor.id)?.mfaEnrolled).toBe(true);

    const reset = await request(
      state.port,
      `/api/admin/users/${state.editor.id}`,
      'PATCH',
      { mfaReset: true, passwordClear: true },
      state.admin.token,
    );
    expect(reset).toMatchObject({ status: 200, body: { mfaReset: true, passwordCleared: true } });
    expect(state.users.findById(state.editor.id)).toMatchObject({ mfaEnrolled: false, hasPassword: false });
    await expect(
      request(state.port, '/api/auth/password', 'POST', { username: 'ed', password: issued.body.generatedPassword }),
    ).resolves.toMatchObject({ status: 401 });
  });

  it('gates self-registration when passwords are required', async () => {
    const state = await fixture();
    process.env.VESTARA_AUTH_REQUIRE_PASSWORD = '1';
    const response = await request(state.port, '/api/auth/login', 'POST', { username: 'stranger' });
    expect(response.status).toBe(403);
    expect(state.users.findByUsername('stranger')).toBeUndefined();
  });
});
