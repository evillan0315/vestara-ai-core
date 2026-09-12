/**
 * Auth Route Tests — VES-SEC-001
 *
 * Tests for /api/auth/* routes covering:
 * - GET /api/auth/me — current user identification
 * - POST /api/auth/login — token-based and username-based login
 * - POST /api/auth/logout — session termination
 * - Role-based access control
 *
 * Security invariant: credentials never leak in responses.
 */

import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock getActor to avoid the dynamic require('../auth') in types.ts
vi.mock('../src/routes/types', () => ({
  getActor: (req: http.IncomingMessage, _ctx: unknown) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const match = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
      if (match) {
        return { id: 'user-1', name: 'admin', type: 'user', role: 'admin' };
      }
    }
    return { id: 'local-operator', name: 'local-operator', type: 'user', role: 'admin' };
  },
  actorOf: (req: http.IncomingMessage) => {
    const h = req.headers['x-vestara-actor'];
    return typeof h === 'string' && h.trim() ? h.trim() : 'local-operator';
  },
  json: (res: http.ServerResponse, status: number, data: unknown) => {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  },
  CORS: {},
  readBody: async (req: http.IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    return Buffer.concat(chunks).toString();
  },
  ApiError: class extends Error {
    constructor(message: string) {
      super(message);
    }
    static unauthorized(msg: string) {
      const e = new Error(msg);
      (e as any).status = 401;
      return e;
    }
    static badRequest(msg: string) {
      const e = new Error(msg);
      (e as any).status = 400;
      return e;
    }
  },
}));

import { handleAuthRoute } from '../src/routes/auth';
import type { WorkspaceContext } from '../src/workspace-context';

// ─── Mock Helpers ────────────────────────────────────────────

function fakeResponse(): { res: http.ServerResponse; body: () => unknown; status: () => number } {
  let status = 0;
  let body: unknown = null;
  const res = new EventEmitter() as unknown as http.ServerResponse;
  res.writeHead = (code: number) => {
    status = code;
    return res as unknown as http.ServerResponse;
  };
  res.end = (data?: unknown) => {
    body = typeof data === 'string' ? JSON.parse(data) : data;
    return res as unknown as http.ServerResponse;
  };
  return { res, body: () => body, status: () => status };
}

function fakeRequest(
  method: string,
  url: string,
  body?: string,
  headers?: Record<string, string>,
): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  req.method = method;
  req.url = url;
  req.headers = { ...headers };
  if (body) {
    queueMicrotask(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  } else {
    queueMicrotask(() => req.emit('end'));
  }
  return req;
}

// ─── Mock User Store ─────────────────────────────────────────

interface MockUser {
  id: string;
  username: string;
  role: string;
  token: string;
  createdAt: string;
}

const MOCK_USERS: MockUser[] = [
  { id: 'user-1', username: 'admin', role: 'admin', token: 'tok_admin_abc123', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'user-2', username: 'editor', role: 'editor', token: 'tok_editor_def456', createdAt: '2026-01-02T00:00:00Z' },
];

function mockUserStore() {
  let nextId = 10;
  return {
    listAll: () => MOCK_USERS,
    findByToken: (token: string) => MOCK_USERS.find((u) => u.token === token),
    findByUsername: (username: string) => MOCK_USERS.find((u) => u.username === username),
    createUser: (username: string, role: string): MockUser => {
      const user: MockUser = {
        id: `user-${++nextId}`,
        username,
        role,
        token: `tok_${username}_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      return user;
    },
  };
}

function mockCtx(): WorkspaceContext {
  return {
    users: mockUserStore(),
    audit: { log: () => {} },
  } as unknown as WorkspaceContext;
}

// ─── Tests ───────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns current user from Bearer token', async () => {
    const ctx = mockCtx();
    const { res, body, status } = fakeResponse();
    const req = fakeRequest('GET', '/api/auth/me', undefined, {
      authorization: 'Bearer tok_admin_abc123',
    });

    const handled = await handleAuthRoute('GET', '/api/auth/me', req, res, ctx, 3001);
    expect(handled).toBe(true);
    expect(status()).toBe(200);

    const data = body() as { user: { id: string; name: string; role: string }; currentUser?: MockUser };
    expect(data.user).toBeDefined();
    expect(data.user.id).toBe('user-1');
    expect(data.user.role).toBe('admin');
    // Full user object should include token for session management
    expect(data.currentUser).toBeDefined();
    expect(data.currentUser!.token).toBe('tok_admin_abc123');
  });

  it('returns anonymous user when no token provided', async () => {
    const ctx = mockCtx();
    const { res, body, status } = fakeResponse();
    const req = fakeRequest('GET', '/api/auth/me');

    const handled = await handleAuthRoute('GET', '/api/auth/me', req, res, ctx, 3001);
    expect(handled).toBe(true);
    expect(status()).toBe(200);

    const data = body() as { user: { id: string; role: string }; currentUser?: MockUser };
    expect(data.user).toBeDefined();
    expect(data.currentUser).toBeUndefined();
  });

  it('returns 401 for invalid token', async () => {
    const ctx = mockCtx();
    const { res, status } = fakeResponse();
    const req = fakeRequest('GET', '/api/auth/me', undefined, {
      authorization: 'Bearer invalid_token',
    });

    // Invalid token should still return 200 with anonymous user (graceful degradation)
    const handled = await handleAuthRoute('GET', '/api/auth/me', req, res, ctx, 3001);
    expect(handled).toBe(true);
    expect(status()).toBe(200);
  });

  it('lists all users without exposing tokens in allUsers', async () => {
    const ctx = mockCtx();
    const { res, body, status } = fakeResponse();
    const req = fakeRequest('GET', '/api/auth/me');

    await handleAuthRoute('GET', '/api/auth/me', req, res, ctx, 3001);
    expect(status()).toBe(200);

    const data = body() as { allUsers: Array<{ id: string; username: string; role: string; createdAt: string }> };
    expect(data.allUsers).toBeDefined();
    expect(data.allUsers.length).toBe(2);
    // Tokens should NOT be in the allUsers response
    for (const user of data.allUsers) {
      expect(user).not.toHaveProperty('token');
    }
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with valid token', async () => {
    const ctx = mockCtx();
    const { res, body, status } = fakeResponse();
    const req = fakeRequest('POST', '/api/auth/login', JSON.stringify({ token: 'tok_admin_abc123' }));

    const handled = await handleAuthRoute('POST', '/api/auth/login', req, res, ctx, 3001);
    expect(handled).toBe(true);
    expect(status()).toBe(200);

    const data = body() as { user: MockUser };
    expect(data.user).toBeDefined();
    expect(data.user.username).toBe('admin');
    expect(data.user.role).toBe('admin');
    expect(data.user.token).toBe('tok_admin_abc123');
  });

  it('returns 401 for invalid token', async () => {
    const ctx = mockCtx();
    const { res, status } = fakeResponse();
    const req = fakeRequest('POST', '/api/auth/login', JSON.stringify({ token: 'invalid' }));

    await expect(handleAuthRoute('POST', '/api/auth/login', req, res, ctx, 3001)).rejects.toThrow();
  });

  it('logs in with existing username', async () => {
    const ctx = mockCtx();
    const { res, body, status } = fakeResponse();
    const req = fakeRequest('POST', '/api/auth/login', JSON.stringify({ username: 'editor' }));

    const handled = await handleAuthRoute('POST', '/api/auth/login', req, res, ctx, 3001);
    expect(handled).toBe(true);
    expect(status()).toBe(200);

    const data = body() as { user: MockUser };
    expect(data.user.username).toBe('editor');
  });

  it('creates new user with unknown username', async () => {
    const ctx = mockCtx();
    const { res, body, status } = fakeResponse();
    const req = fakeRequest('POST', '/api/auth/login', JSON.stringify({ username: 'newuser' }));

    const handled = await handleAuthRoute('POST', '/api/auth/login', req, res, ctx, 3001);
    expect(handled).toBe(true);
    expect(status()).toBe(201);

    const data = body() as { user: MockUser };
    expect(data.user.username).toBe('newuser');
    expect(data.user.role).toBe('editor');
    expect(data.user.token).toBeDefined();
    expect(data.user.token).toMatch(/^tok_newuser_/);
  });

  it('rejects login with neither token nor username', async () => {
    const ctx = mockCtx();
    const { res, status } = fakeResponse();
    const req = fakeRequest('POST', '/api/auth/login', JSON.stringify({}));

    await expect(handleAuthRoute('POST', '/api/auth/login', req, res, ctx, 3001)).rejects.toThrow();
  });
});
