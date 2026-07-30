import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';

describe('@vestara/api', () => {
  it('can import the module', async () => {
    const mod = await import('../src/index.js');
    expect(mod).toBeDefined();
  });

  it('module has expected structure', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod).toBe('object');
  });
});

describe('server', () => {
  it('createServer returns an HTTP server with broadcast', async () => {
    const { createServer } = await import('../src/server.js');
    const mockCtx = {
      repoPath: '/test',
      workspaceDir: '/test/.vestara',
      runtime: { currentStatus: 'ready' },
      orchestrator: null,
    };
    const server = createServer(mockCtx as any, 0);
    expect(server).toBeDefined();
    expect(typeof server.broadcast).toBe('function');
    expect(server instanceof http.Server).toBe(true);
    server.close();
  });

  it('health endpoint returns 200 with status', async () => {
    const { createServer } = await import('../src/server.js');
    const mockCtx = {
      repoPath: '/test',
      workspaceDir: '/test/.vestara',
      runtime: { currentStatus: 'ready' },
      orchestrator: null,
    };
    const server = createServer(mockCtx as any, 18992);
    try {
      await server.listen(18992);
      const res = await fetch('http://127.0.0.1:18992/api/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.repoPath).toBe('/test');
    } finally {
      server.close();
    }
  });

  it('returns 404 for unknown routes', async () => {
    const { createServer } = await import('../src/server.js');
    const mockCtx = {
      repoPath: '/test',
      workspaceDir: '/test/.vestara',
      runtime: { currentStatus: 'ready' },
      orchestrator: null,
    };
    const server = createServer(mockCtx as any, 18993);
    try {
      await server.listen(18993);
      const res = await fetch('http://127.0.0.1:18993/api/nonexistent');
      expect(res.status).toBe(404);
    } finally {
      server.close();
    }
  });

  it('handles CORS preflight', async () => {
    const { createServer } = await import('../src/server.js');
    const mockCtx = {
      repoPath: '/test',
      workspaceDir: '/test/.vestara',
      runtime: { currentStatus: 'ready' },
      orchestrator: null,
    };
    const server = createServer(mockCtx as any, 18994);
    try {
      await server.listen(18994);
      const res = await fetch('http://127.0.0.1:18994/api/health', { method: 'OPTIONS' });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    } finally {
      server.close();
    }
  });

  it.skip('broadcasts to WebSocket clients', { timeout: 5000 }, async () => {
    const { createServer } = await import('../src/server.js');
    const mockCtx = {
      repoPath: '/test',
      workspaceDir: '/test/.vestara',
      runtime: { currentStatus: 'ready' },
      orchestrator: null,
    };
    const port = 18995;
    const server = createServer(mockCtx as any, port);
    try {
      await server.listen(port);
      const { WebSocket } = require('ws');
      const ws = await new Promise<any>((resolve, reject) => {
        const s = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        s.on('open', () => resolve(s));
        s.on('error', reject);
        setTimeout(() => reject(new Error('WS timeout')), 4000);
      });
      const msg = await new Promise<string>((resolve, reject) => {
        ws.on('message', (data: Buffer) => resolve(String(data)));
        setTimeout(() => reject(new Error('WS msg timeout')), 4000);
      });
      const parsed = JSON.parse(msg);
      expect(parsed.op).toBe('event');
      ws.close();
    } finally {
      server.close();
    }
  });
});

describe('auth', () => {
  it('authenticate returns anonymous user without token', async () => {
    const { authenticate } = await import('../src/auth.js');
    const req = { headers: {} } as any;
    const user = authenticate(req);
    expect(user.id).toBeDefined();
    expect(user.type).toBe('user');
    expect(user.role).toBe('admin');
  });

  it('authenticate extracts bearer token', async () => {
    const { authenticate } = await import('../src/auth.js');
    const mockStore = {
      findByToken: (token: string) =>
        token === 'valid-token' ? { id: 'u1', username: 'testuser', role: 'editor' as const } : null,
    };
    const req = { headers: { authorization: 'Bearer valid-token' } } as any;
    const user = authenticate(req, mockStore as any);
    expect(user.id).toBe('u1');
    expect(user.name).toBe('testuser');
    expect(user.role).toBe('editor');
  });

  it('hasRole checks role hierarchy', async () => {
    const { hasRole } = await import('../src/auth.js');
    const admin = { id: 'a', name: 'Admin', type: 'user' as const, role: 'admin' as const };
    const editor = { id: 'e', name: 'Editor', type: 'user' as const, role: 'editor' as const };
    const viewer = { id: 'v', name: 'Viewer', type: 'user' as const, role: 'viewer' as const };

    expect(hasRole(admin, 'viewer')).toBe(true);
    expect(hasRole(admin, 'admin')).toBe(true);
    expect(hasRole(editor, 'admin')).toBe(false);
    expect(hasRole(editor, 'editor')).toBe(true);
    expect(hasRole(viewer, 'admin')).toBe(false);
    expect(hasRole(viewer, 'viewer')).toBe(true);
  });
});

describe('audit-log', () => {
  it('logAudit writes to the audit store', async () => {
    const { logAudit, AuditAction } = await import('../src/audit-log.js');
    const logged: any[] = [];
    const mockAudit = { log: (entry: any) => logged.push(entry) };
    const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } } as any;

    logAudit(mockAudit as any, req, 'u1', 'testuser', AuditAction.PLAN_CREATE, 'plan', 'p1');

    expect(logged.length).toBe(1);
    expect(logged[0].userId).toBe('u1');
    expect(logged[0].username).toBe('testuser');
    expect(logged[0].action).toBe('plan.create');
    expect(logged[0].resource).toBe('plan');
    expect(logged[0].resourceId).toBe('p1');
  });
});

describe('api-runtime', () => {
  it('creates ApiRuntime with services', async () => {
    const { ApiRuntime } = await import('../src/runtime/api-runtime.js');
    const mockServices = {
      kernel: { shutdown: vi.fn() },
      workspaceRuntime: { close: vi.fn() },
      eventBus: {} as any,
      planning: {} as any,
      sessions: {} as any,
      memory: {} as any,
    };

    const runtime = new ApiRuntime(
      { id: 'test-api' as any, type: 'runtime' as any, name: 'Test API' },
      mockServices as any,
    );

    expect(runtime.services.kernel).toBe(mockServices.kernel);
    expect(runtime.planning).toBe(mockServices.planning);
    expect(runtime.sessions).toBe(mockServices.sessions);
    expect(runtime.memory).toBe(mockServices.memory);
    expect(runtime.kernel).toBe(mockServices.kernel);
  });
});
