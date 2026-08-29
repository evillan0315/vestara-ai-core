import * as net from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { type ApiServer, createServer } from '../src/server.js';

const MINIMAL_CTX = {
  repoPath: '/test',
  workspaceDir: '/test/.vestara',
  runtime: { currentStatus: 'ready' },
  orchestrator: null,
  close: () => {},
} as never;

let portCounter = 19100;

interface TestServer {
  server: ApiServer;
  port: number;
  url: string;
}

async function startServer(options: { requestTimeoutMs?: number; shutdownGraceMs?: number } = {}): Promise<TestServer> {
  const port = portCounter++;
  const server = createServer(MINIMAL_CTX, port, undefined, options);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  return { server, port, url: `http://127.0.0.1:${port}` };
}

async function stopServer(server: ApiServer): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

describe('server hardening', () => {
  it('exposes live/ready health split', async () => {
    const { server, url } = await startServer();
    try {
      const live = await fetch(`${url}/api/health/live`);
      expect(live.status).toBe(200);
      expect(((await live.json()) as { status: string }).status).toBe('ok');
      expect(live.headers.get('cache-control')).toBe('no-cache');

      const ready = await fetch(`${url}/api/health/ready`);
      expect(ready.status).toBe(200);
      expect(((await ready.json()) as { ready: boolean }).ready).toBe(true);
    } finally {
      await stopServer(server);
    }
  });

  it('reports /api/health/ready as degraded when runtime is not ready', async () => {
    const ctx = {
      repoPath: '/test',
      workspaceDir: '/test/.vestara',
      runtime: { currentStatus: 'starting' },
      orchestrator: null,
      close: () => {},
    } as never;
    const port = portCounter++;
    const server = createServer(ctx, port);
    await new Promise<void>((resolve) => server.listen(port, resolve));
    try {
      const ready = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
      expect(ready.status).toBe(503);
      expect(((await ready.json()) as { ready: boolean }).ready).toBe(false);
    } finally {
      await stopServer(server);
    }
  });

  it('serves aggregate HTTP metrics at /api/telemetry/http', async () => {
    const { server, url } = await startServer();
    try {
      await fetch(`${url}/api/health/live`);
      await fetch(`${url}/api/nonexistent`);
      const res = await fetch(`${url}/api/telemetry/http`);
      expect(res.status).toBe(200);
      const metrics = (await res.json()) as {
        totalRequests: number;
        requestsByStatusClass: Record<string, number>;
        averageDurationMs: number;
        uptimeMs: number;
      };
      expect(metrics.totalRequests).toBeGreaterThanOrEqual(3);
      expect(metrics.requestsByStatusClass['2xx']).toBeGreaterThanOrEqual(2);
      expect(metrics.requestsByStatusClass['4xx']).toBeGreaterThanOrEqual(1);
      expect(typeof metrics.averageDurationMs).toBe('number');
      expect(metrics.uptimeMs).toBeGreaterThan(0);
    } finally {
      await stopServer(server);
    }
  });

  it('echoes a validated x-request-id header on responses', async () => {
    const { server, url } = await startServer();
    try {
      const res = await fetch(`${url}/api/health/live`, {
        headers: { 'x-request-id': 'client-supplied-id-123' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-request-id')).toBe('client-supplied-id-123');
    } finally {
      await stopServer(server);
    }
  });

  it('returns 404 JSON with the standardized error envelope', async () => {
    const { server, url } = await startServer();
    try {
      const res = await fetch(`${url}/api/definitely/not/here`);
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: { code: string; message: string; requestId: string } };
      expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(body.error.requestId).toBeTruthy();
      expect(res.headers.get('x-request-id')).toBe(body.error.requestId);
    } finally {
      await stopServer(server);
    }
  });

  it('rejects an oversized request body as 413', async () => {
    const { server, url } = await startServer();
    try {
      const big = 'x'.repeat(2 * 1024 * 1024);
      const res = await fetch(`${url}/api/marketplace/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference: 'demo', payload: big }),
      });
      expect(res.status).toBe(413);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    } finally {
      await stopServer(server);
    }
  });

  it('returns 408 for a request that exceeds the deadline', async () => {
    const { server, port, url } = await startServer({ requestTimeoutMs: 200 });
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
          // Send headers declaring a body, then stall forever.
          socket.write(
            'POST /api/auth/login HTTP/1.1\r\n' +
              `Host: 127.0.0.1:${port}\r\n` +
              'Content-Type: application/json\r\n' +
              'Content-Length: 100\r\n' +
              '\r\n',
          );
        });
        let received = '';
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error('no response before deadline'));
        }, 10_000);
        socket.on('data', (chunk) => {
          received += chunk.toString('utf8');
          if (received.includes('\r\n\r\n')) {
            clearTimeout(timer);
            resolve(Number(/HTTP\/1\.1 (\d{3})/.exec(received)?.[1] ?? 0));
            socket.destroy();
          }
        });
        socket.on('error', () => {
          clearTimeout(timer);
          reject(new Error('socket error'));
        });
      });
      expect(status).toBe(408);
      void url;
    } finally {
      await stopServer(server);
    }
  });

  it('responds to CORS preflight with 204', async () => {
    const { server, url } = await startServer();
    try {
      const res = await fetch(`${url}/api/health/live`, { method: 'OPTIONS' });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    } finally {
      await stopServer(server);
    }
  });

  it('rejects a malformed HTTP request with 400', async () => {
    const { server, port } = await startServer();
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const socket = net.createConnection({ port, host: '127.0.0.1' }, () => {
          socket.write('GARBAGE\r\n\r\n');
        });
        let received = '';
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error('no response to malformed request'));
        }, 10_000);
        socket.on('data', (chunk) => {
          received += chunk.toString('utf8');
          if (received.includes('\r\n\r\n')) {
            clearTimeout(timer);
            resolve(Number(/HTTP\/1\.1 (\d{3})/.exec(received)?.[1] ?? 0));
            socket.destroy();
          }
        });
        socket.on('error', () => {
          clearTimeout(timer);
          reject(new Error('socket error'));
        });
      });
      expect(status).toBe(400);
    } finally {
      await stopServer(server);
    }
  });

  afterAll(async () => {
    // Leave no server listening.
  });
});
