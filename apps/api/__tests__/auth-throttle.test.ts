import { mkdtemp, rm } from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';
import { migrate } from '@vestara/sqlite-migrations';
import { AuditStore, UserStore, WORKSPACE_DOMAIN_MANIFEST } from '@vestara/workspace';
import { afterEach, describe, expect, it } from 'vitest';
import { LoginThrottle, loginThrottleOptions } from '../src/login-throttle';
import { createServer } from '../src/server';
import type { WorkspaceContext } from '../src/workspace-context';
import { openSqlDb } from '../src/workspace-context';

function fakeReq(remoteAddress = '10.0.0.1', forwardedFor?: string): http.IncomingMessage {
  return {
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    socket: { remoteAddress },
  } as unknown as http.IncomingMessage;
}

describe('LoginThrottle', () => {
  it('allows attempts under the limit and throttles past it', () => {
    const throttle = new LoginThrottle({ maxAttempts: 3, windowMs: 60_000 });
    expect(throttle.take(fakeReq(), 1000)).toBe(0);
    expect(throttle.take(fakeReq(), 2000)).toBe(0);
    expect(throttle.take(fakeReq(), 3000)).toBe(0);
    const retryAfter = throttle.take(fakeReq(), 4000);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('slides the window so old attempts expire', () => {
    const throttle = new LoginThrottle({ maxAttempts: 2, windowMs: 1000 });
    expect(throttle.take(fakeReq(), 0)).toBe(0);
    expect(throttle.take(fakeReq(), 100)).toBe(0);
    expect(throttle.take(fakeReq(), 200)).toBeGreaterThan(0);
    expect(throttle.take(fakeReq(), 1200)).toBe(0);
  });

  it('exempts direct loopback but counts forwarded claims', () => {
    const throttle = new LoginThrottle({ maxAttempts: 1, windowMs: 60_000 });
    for (let i = 0; i < 50; i++) expect(throttle.take(fakeReq('127.0.0.1'), i)).toBe(0);
    expect(throttle.take(fakeReq('127.0.0.1'), 100)).toBe(0);
    expect(throttle.take(fakeReq('127.0.0.1', '203.0.113.9'), 200)).toBe(0);
    expect(throttle.take(fakeReq('127.0.0.1', '203.0.113.9'), 300)).toBeGreaterThan(0);
  });

  it('rotating X-Forwarded-For does not escape the socket bucket', () => {
    const throttle = new LoginThrottle({ maxAttempts: 2, windowMs: 60_000 });
    expect(throttle.take(fakeReq('10.9.9.9', '1.1.1.1'), 0)).toBe(0);
    expect(throttle.take(fakeReq('10.9.9.9', '2.2.2.2'), 100)).toBe(0);
    expect(throttle.take(fakeReq('10.9.9.9', '3.3.3.3'), 200)).toBeGreaterThan(0);
  });

  it('falls back to safe defaults on invalid env', () => {
    expect(loginThrottleOptions({ VESTARA_AUTH_LOGIN_MAX_ATTEMPTS: 'nope' })).toMatchObject({ maxAttempts: 10 });
    expect(loginThrottleOptions({ VESTARA_AUTH_LOGIN_WINDOW_MS: '-5' })).toMatchObject({ windowMs: 60_000 });
    expect(loginThrottleOptions({})).toMatchObject({ maxAttempts: 10, windowMs: 60_000 });
  });
});

describe('login endpoint throttling', () => {
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

  it('returns 429 with Retry-After past the limit and audits failures', async () => {
    const directory = await mkdtemp('/tmp/vestara-auth-throttle-');
    dirs.push(directory);
    const db = (await openSqlDb(path.join(directory, 'plans.db'), (raw) => {
      migrate(raw, WORKSPACE_DOMAIN_MANIFEST);
    })) as any;
    dbs.push(db);
    const users = new UserStore(db);
    const audit = new AuditStore(db);
    const ctx = { users, audit } as unknown as WorkspaceContext;
    const server = createServer(ctx, 0);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not bind to a port');
    servers.push(server);

    const login = (
      extraHeaders: Record<string, string> = {},
    ): Promise<{ status: number; headers: http.IncomingHttpHeaders }> =>
      new Promise((resolve, reject) => {
        const payload = JSON.stringify({ token: 'vst_wrong' });
        const req = http.request(
          {
            host: '127.0.0.1',
            port: address.port,
            path: '/api/auth/login',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
              'X-Forwarded-For': '203.0.113.7',
              ...extraHeaders,
            },
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
          },
        );
        req.on('error', reject);
        req.end(payload);
      });

    for (let i = 0; i < 10; i++) {
      const attempt = await login();
      expect(attempt.status).toBe(401);
    }
    const throttled = await login();
    expect(throttled.status).toBe(429);
    expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);
    const failures = audit.query({ action: 'user.login-failed', limit: 50 });
    expect(failures.length).toBeGreaterThanOrEqual(10);
  });
});
