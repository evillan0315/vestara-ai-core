import type * as http from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { handleDiagnosticsRoute } from '../src/routes/diagnostics.js';

const MINIMAL_CTX = {
  repoPath: '/test',
  workspaceDir: '/test/.vestara',
  runtime: {
    currentStatus: 'ready',
    getSession: () => ({
      profile: {
        fileCount: 100,
        packageCount: 5,
        dependencyCount: 50,
        language: 'typescript',
        framework: 'react',
        isMonorepo: true,
      },
      fingerprint: { name: 'test-workspace', id: 'test-123' },
    }),
  },
  harnessSession: {},
  telemetry: {
    getEvents: () => [],
    getAllAgents: () => [],
    snapshot: () => ({ eventCount: 0, startedAt: Date.now() }),
  },
  agents: {
    listExecutions: () => Promise.resolve([]),
  },
  activityStore: null,
};

function makeRequest(
  options: { method?: string; url?: string; headers?: Record<string, string>; body?: string } = {},
): http.IncomingMessage {
  const req = new EventEmitter() as any;
  req.method = options.method ?? 'GET';
  req.url = options.url ?? '/api/diagnostics/summary';
  req.headers = { ...(options.headers ?? {}) };
  req.socket = { remoteAddress: '127.0.0.1' };
  req.readableEnded = false;
  queueMicrotask(() => {
    if (options.body !== undefined) req.emit('data', Buffer.from(options.body));
    req.readableEnded = true;
    req.emit('end');
  });
  return req;
}

function makeResponse(): {
  res: http.ServerResponse;
  status: () => number;
  body: () => unknown;
  headers: () => Record<string, string>;
} {
  let statusCode = 0;
  let bodyText = '';
  const headerStore: Record<string, string> = {};
  const res = new EventEmitter() as any;
  res.statusCode = 200;
  res.headersSent = false;
  res.writableEnded = false;
  res.writable = true;
  res.writeHead = (code: number, headers?: Record<string, string>) => {
    res.statusCode = code;
    statusCode = code;
    res.headersSent = true;
    if (headers) Object.assign(headerStore, headers);
    return res;
  };
  res.end = (data?: string | Buffer) => {
    if (data !== undefined) bodyText += String(data);
    res.writableEnded = true;
    res.emit('finish');
  };
  res.setHeader = (name: string, value: string) => {
    headerStore[name] = value;
  };
  res.getHeader = (name: string) => headerStore[name];
  return {
    res,
    status: () => statusCode,
    body: () => {
      if (!bodyText) return undefined;
      try {
        return JSON.parse(bodyText);
      } catch {
        return bodyText;
      }
    },
    headers: () => Object.fromEntries(Object.entries(headerStore).map(([k, v]) => [k.toLowerCase(), v])),
  };
}

import { EventEmitter } from 'node:events';

describe('diagnostics routes', () => {
  describe('GET /api/diagnostics/summary', () => {
    it('returns a composed diagnostic snapshot', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/summary' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/summary', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data).toBeDefined();
      expect(data.ts).toBeDefined();
      expect(data.os).toBeDefined();
      expect(data.cpu).toBeDefined();
      expect(data.memory).toBeDefined();
      expect(data.disks).toBeDefined();
      expect(data.gpu).toBeDefined();
      expect(data.docker).toBeDefined();
      expect(data.git).toBeDefined();
      expect(data.versions).toBeDefined();
      expect(data.workspace).toBeDefined();
      expect(data.health).toBeDefined();
      expect(data.readiness).toBeDefined();
      expect(data.alerts).toBeDefined();
    });
  });

  describe('GET /api/diagnostics/cpu', () => {
    it('returns CPU snapshot with per-core utilization', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/cpu' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/cpu', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.ts).toBeDefined();
      expect(data.model).toBeDefined();
      expect(data.logicalCores).toBeDefined();
      expect(data.usage).toBeDefined();
      expect(data.perCore).toBeDefined();
    });
  });

  describe('GET /api/diagnostics/memory', () => {
    it('returns memory detail', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/memory' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/memory', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.ts).toBeDefined();
      expect(data.memory).toBeDefined();
      expect(data.memory.total).toBeDefined();
      expect(data.memory.available).toBeDefined();
      expect(data.memory.used).toBeDefined();
    });
  });

  describe('GET /api/diagnostics/processes', () => {
    it('returns process list', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/processes' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/processes', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.processes).toBeDefined();
      expect(data.total).toBeDefined();
      expect(data.threads).toBeDefined();
    });

    it('filters processes by query', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/processes?q=node' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/processes', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.processes).toBeDefined();
      expect(data.filtered).toBeDefined();
    });

    it('respects limit parameter', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/processes?limit=10' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/processes', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
    });
  });

  describe('POST /api/diagnostics/processes/kill', () => {
    it('rejects invalid pid', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({
        method: 'POST',
        url: '/api/diagnostics/processes/kill',
        body: JSON.stringify({ pid: 0 }),
      });

      const handled = await handleDiagnosticsRoute(
        'POST',
        '/api/diagnostics/processes/kill',
        req,
        res,
        MINIMAL_CTX as any,
      );

      expect(handled).toBe(true);
      expect(status()).toBe(400);
      const data = body() as any;
      expect(data.error).toBe('invalid pid');
    });

    it('rejects missing pid', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'POST', url: '/api/diagnostics/processes/kill', body: JSON.stringify({}) });

      const handled = await handleDiagnosticsRoute(
        'POST',
        '/api/diagnostics/processes/kill',
        req,
        res,
        MINIMAL_CTX as any,
      );

      expect(handled).toBe(true);
      expect(status()).toBe(400);
      const data = body() as any;
      expect(data.error).toBe('invalid pid');
    });
  });

  describe('GET /api/diagnostics/disks', () => {
    it('returns disk usage', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/disks' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/disks', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.ts).toBeDefined();
      expect(data.disks).toBeDefined();
    });
  });

  describe('GET /api/diagnostics/gpu', () => {
    it('returns GPU info (degraded if unavailable)', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/gpu' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/gpu', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.ts).toBeDefined();
      expect(data.available).toBeDefined();
      expect(data.gpus).toBeDefined();
    });
  });

  describe('GET /api/diagnostics/docker', () => {
    it('returns Docker info (degraded if unavailable)', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/docker' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/docker', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.ts).toBeDefined();
      expect(data.available).toBeDefined();
      expect(data.containers).toBeDefined();
    });
  });

  describe('GET /api/diagnostics/git', () => {
    it('returns git status', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/git' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/git', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.ts).toBeDefined();
      expect(data.available).toBeDefined();
      expect(data.branch).toBeDefined();
    });
  });

  describe('GET /api/diagnostics/versions', () => {
    it('returns toolchain versions', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/versions' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/versions', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.ts).toBeDefined();
      expect(data.versions).toBeDefined();
    });
  });

  describe('GET /api/diagnostics/filesystem', () => {
    it('returns filesystem scan', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/filesystem' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/filesystem', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.ts).toBeDefined();
      expect(data.dirSizes).toBeDefined();
      expect(data.largeFiles).toBeDefined();
      expect(data.recentlyModified).toBeDefined();
    });
  });

  describe('GET /api/diagnostics/health', () => {
    it('returns health checks and readiness score', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/health' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/health', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.ts).toBeDefined();
      expect(data.checks).toBeDefined();
      expect(data.readiness).toBeDefined();
      expect(Array.isArray(data.checks)).toBe(true);
      expect(typeof data.readiness).toBe('number');
    });
  });

  describe('GET /api/diagnostics/events', () => {
    it('returns merged event timeline', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/events' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/events', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.events).toBeDefined();
      expect(data.total).toBeDefined();
    });

    it('filters by category', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/events?category=agent' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/events', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
    });

    it('filters by query', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/events?q=test' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/events', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
    });

    it('respects limit parameter', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/events?limit=10' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/events', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
    });
  });

  describe('GET /api/diagnostics/agents', () => {
    it('returns agent states and executions', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/agents' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/agents', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(200);
      const data = body() as any;
      expect(data.agents).toBeDefined();
      expect(data.executions).toBeDefined();
      expect(data.eventCount).toBeDefined();
      expect(data.startedAt).toBeDefined();
    });
  });

  describe('POST /api/diagnostics/analyze', () => {
    it('rejects missing snapshot', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({
        method: 'POST',
        url: '/api/diagnostics/analyze',
        body: JSON.stringify({ question: 'test' }),
      });

      const handled = await handleDiagnosticsRoute('POST', '/api/diagnostics/analyze', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect(status()).toBe(400);
      const data = body() as any;
      expect(data.error).toBe('snapshot is required');
    });

    it('accepts snapshot and question', async () => {
      const { res, status, body } = makeResponse();
      const req = makeRequest({
        method: 'POST',
        url: '/api/diagnostics/analyze',
        body: JSON.stringify({ snapshot: { cpu: { usage: 50 } }, question: 'test question' }),
      });

      const handled = await handleDiagnosticsRoute('POST', '/api/diagnostics/analyze', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(true);
      expect([200, 500, 502]).toContain(status());
    });
  });

  describe('unknown route', () => {
    it('returns false for unhandled paths', async () => {
      const { res } = makeResponse();
      const req = makeRequest({ method: 'GET', url: '/api/diagnostics/unknown' });

      const handled = await handleDiagnosticsRoute('GET', '/api/diagnostics/unknown', req, res, MINIMAL_CTX as any);

      expect(handled).toBe(false);
    });
  });
});
