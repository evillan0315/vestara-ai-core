import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { describe, expect, it } from 'vitest';
import { ApiError, normalizeError } from '../src/http/api-error';
import { readJsonBody } from '../src/http/body';
import { requestContext } from '../src/http/request-context';
import { RequestLogger } from '../src/http/request-logger';
import { HttpMetrics } from '../src/http/request-metrics';
import { sendError, sendJson, sendNoContent } from '../src/http/response';
import { createDispatcher } from '../src/http/router';

// ─── Fake request/response doubles ──────────────────────────────
// These mirror the doubles used across the route test suites so unit tests
// exercise the same call shapes as the real server.

interface FakeRequest extends EventEmitter {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress: string };
  readableEnded: boolean;
}

function makeRequest(
  options: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: string;
    chunk?: Buffer;
    neverEnd?: boolean;
  } = {},
): FakeRequest {
  const req = new EventEmitter() as FakeRequest;
  req.method = options.method ?? 'POST';
  req.url = options.url ?? '/api/test';
  req.headers = { ...(options.headers ?? {}) };
  req.socket = { remoteAddress: '127.0.0.1' };
  req.readableEnded = false;
  queueMicrotask(() => {
    if (options.chunk) req.emit('data', options.chunk);
    else if (options.body !== undefined) req.emit('data', Buffer.from(options.body));
    if (!options.neverEnd) {
      req.readableEnded = true;
      req.emit('end');
    }
  });
  return req;
}

interface FakeResponse extends EventEmitter {
  statusCode: number;
  headersSent: boolean;
  writableEnded: boolean;
  writable: boolean;
  writeHead: (code: number, headers?: Record<string, string>) => FakeResponse;
  end: (data?: string | Buffer) => void;
  setHeader: (name: string, value: string) => void;
  getHeader: (name: string) => string | undefined;
}

function makeResponse(): {
  res: FakeResponse;
  status: () => number;
  body: () => unknown;
  headers: () => Record<string, string>;
} {
  let statusCode = 0;
  let bodyText = '';
  const headerStore: Record<string, string> = {};
  const res = new EventEmitter() as FakeResponse;
  res.statusCode = 200;
  res.headersSent = false;
  res.writableEnded = false;
  res.writable = true;
  res.writeHead = (code, headers) => {
    res.statusCode = code;
    statusCode = code;
    res.headersSent = true;
    if (headers) Object.assign(headerStore, headers);
    return res;
  };
  res.end = (data) => {
    if (data !== undefined) bodyText += String(data);
    res.writableEnded = true;
    res.emit('finish');
  };
  res.setHeader = (name, value) => {
    headerStore[name] = value;
  };
  res.getHeader = (name) => headerStore[name];
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

const MINIMAL_CTX = {
  repoPath: '/test',
  workspaceDir: '/test/.vestara',
  runtime: { currentStatus: 'ready' },
  orchestrator: null,
};

// ─── ApiError / normalizeError ──────────────────────────────────

describe('ApiError', () => {
  it('exposes stable code, status, and message', () => {
    const err = ApiError.notFound('missing');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('RESOURCE_NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('missing');
    expect(err.expose).toBe(true);
  });

  it('marks 5xx errors as non-exposed by default', () => {
    expect(ApiError.internal().expose).toBe(false);
    expect(ApiError.internal('secret', new Error('boom')).expose).toBe(false);
    expect(ApiError.internal('secret', new Error('boom')).message).toBe('secret');
  });

  it('provides factories for each client status', () => {
    expect(ApiError.badRequest().statusCode).toBe(400);
    expect(ApiError.validation({ field: 'x' }).statusCode).toBe(400);
    expect(ApiError.unauthorized().statusCode).toBe(401);
    expect(ApiError.forbidden().statusCode).toBe(403);
    expect(ApiError.notFound().statusCode).toBe(404);
    expect(ApiError.conflict().statusCode).toBe(409);
    expect(ApiError.requestTimeout().statusCode).toBe(408);
    expect(ApiError.payloadTooLarge().statusCode).toBe(413);
    expect(ApiError.unsupportedMediaType().statusCode).toBe(415);
    expect(ApiError.rateLimited().code).toBe('RATE_LIMITED');
    expect(ApiError.serviceUnavailable().statusCode).toBe(503);
    expect(ApiError.gatewayTimeout().statusCode).toBe(504);
  });
});

describe('normalizeError', () => {
  it('passes ApiError through unchanged', () => {
    const original = ApiError.conflict('nope');
    expect(normalizeError(original)).toBe(original);
  });

  it('maps plain Error to hidden 500', () => {
    const err = normalizeError(new Error('boom'));
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.expose).toBe(false);
  });

  it('maps AbortError / TimeoutError to 408', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(normalizeError(abort).statusCode).toBe(408);
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    expect(normalizeError(timeout).statusCode).toBe(408);
  });

  it('maps ENOENT/EACCES to 404 and connection failures to 503', () => {
    const missing = new Error('no such file') as NodeJS.ErrnoException;
    missing.code = 'ENOENT';
    expect(normalizeError(missing).statusCode).toBe(404);
    const refused = new Error('refused') as NodeJS.ErrnoException;
    refused.code = 'ECONNREFUSED';
    expect(normalizeError(refused).statusCode).toBe(503);
  });

  it('maps auth-marker messages to 401', () => {
    expect(normalizeError(new Error('invalid token provided')).statusCode).toBe(401);
  });

  it('handles thrown strings and arbitrary objects', () => {
    expect(normalizeError('raw string').statusCode).toBe(500);
    const shaped = normalizeError({ code: 'CUSTOM', message: 'downstream failed', statusCode: 502 });
    expect(shaped.statusCode).toBe(502);
    expect(shaped.code).toBe('CUSTOM');
    expect(normalizeError(null).statusCode).toBe(500);
  });
});

// ─── request-context ────────────────────────────────────────────

describe('requestContext', () => {
  it('validates and honors a well-formed x-request-id', () => {
    const req = makeRequest({ headers: { 'x-request-id': 'abc_123.xyz' } });
    expect(requestContext.requestIdFor(req)).toBe('abc_123.xyz');
  });

  it('rejects oversized or malformed request ids with a fresh UUID', () => {
    const bad = makeRequest({ headers: { 'x-request-id': 'a'.repeat(200) } });
    const id = requestContext.requestIdFor(bad);
    expect(id.length).toBe(36);
    const weird = makeRequest({ headers: { 'x-request-id': 'spaces and more' } });
    expect(requestContext.requestIdFor(weird)).not.toBe('spaces and more');
  });

  it('derives context from the request', () => {
    const req = makeRequest({
      method: 'GET',
      url: '/api/health',
      headers: { 'user-agent': 'vitest', 'x-vestara-actor': 'tester' },
    });
    const ctx = requestContext.derive(req, '/api/health');
    expect(ctx.method).toBe('GET');
    expect(ctx.pathname).toBe('/api/health');
    expect(ctx.actor).toBe('tester');
    expect(ctx.remoteAddress).toBe('127.0.0.1');
    expect(ctx.requestId).toMatch(/^[A-Za-z0-9._:-]+$/);
  });

  it('scopes the active context via run()', async () => {
    let seen: string | undefined;
    const context = requestContext.derive(makeRequest({ headers: { 'x-request-id': 'scope-me' } }), '/api/x');
    await requestContext.run(context, async () => {
      seen = requestContext.current(false).requestId;
    });
    expect(seen).toBe('scope-me');
    // Outside run(), falls back to the stable ambient context.
    expect(requestContext.current(false).requestId).toBe('no-request');
  });
});

// ─── request-logger ─────────────────────────────────────────────

describe('RequestLogger', () => {
  it('emits NDJSON with request context', async () => {
    const lines: string[] = [];
    const logger = new RequestLogger({ out: (line) => lines.push(line) });
    await requestContext.run(
      requestContext.derive(makeRequest({ headers: { 'x-request-id': 'log-1' } }), '/api/x'),
      () => {
        logger.info({ event: 'test.event', method: 'GET' });
      },
    );
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(parsed.requestId).toBe('log-1');
    expect(parsed.event).toBe('test.event');
    expect(parsed.level).toBe('info');
  });

  it('redacts sensitive keys at any depth', () => {
    const lines: string[] = [];
    const logger = new RequestLogger({ out: (line) => lines.push(line) });
    logger.info({
      event: 'test',
      authorization: 'Bearer secret',
      nested: { apiKey: 'abc', password: 'p', safe: 'ok' },
      list: [{ token: 't' }],
    });
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(parsed.authorization).toBe('[REDACTED]');
    expect((parsed.nested as Record<string, unknown>).apiKey).toBe('[REDACTED]');
    expect((parsed.nested as Record<string, unknown>).safe).toBe('ok');
    expect((parsed.list as Array<Record<string, unknown>>)[0].token).toBe('[REDACTED]');
  });

  it('respects the configured minimum level', () => {
    const lines: string[] = [];
    const logger = new RequestLogger({ level: 'warn', out: (line) => lines.push(line) });
    logger.debug({ event: 'skip' });
    logger.info({ event: 'skip' });
    logger.warn({ event: 'keep' });
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).event).toBe('keep');
  });
});

// ─── request-metrics ────────────────────────────────────────────

describe('HttpMetrics', () => {
  it('tracks active/total and status classes', () => {
    const metrics = new HttpMetrics();
    metrics.begin();
    metrics.end(200, 5);
    metrics.begin();
    metrics.end(404, 3);
    metrics.begin();
    metrics.end(500, 9);
    const snap = metrics.snapshot();
    expect(snap.totalRequests).toBe(3);
    expect(snap.activeRequests).toBe(0);
    expect(snap.requestsByStatusClass['2xx']).toBe(1);
    expect(snap.requestsByStatusClass['4xx']).toBe(1);
    expect(snap.requestsByStatusClass['5xx']).toBe(1);
    expect(snap.totalErrors).toBe(1);
    expect(snap.maxDurationMs).toBe(9);
  });

  it('tracks active requests while in flight', () => {
    const metrics = new HttpMetrics();
    metrics.begin();
    metrics.begin();
    expect(metrics.snapshot().activeRequests).toBe(2);
    metrics.end(200, 1);
    expect(metrics.snapshot().activeRequests).toBe(1);
  });
});

// ─── body reader ────────────────────────────────────────────────

describe('readJsonBody', () => {
  it('parses a JSON body', async () => {
    const req = makeRequest({ body: '{"name":"x"}', headers: { 'content-type': 'application/json' } });
    const body = await readJsonBody<{ name: string }>(req);
    expect(body.name).toBe('x');
  });

  it('returns empty object for an empty body', async () => {
    const req = makeRequest({ headers: { 'content-type': 'application/json' } });
    expect(await readJsonBody(req)).toEqual({});
  });

  it('rejects malformed JSON as 400', async () => {
    const req = makeRequest({ body: '{nope', headers: { 'content-type': 'application/json' } });
    await expect(readJsonBody(req)).rejects.toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
  });

  it('rejects oversized declared content-length as 413', async () => {
    const req = makeRequest({
      body: '{}',
      headers: { 'content-type': 'application/json', 'content-length': '99999999' },
    });
    await expect(readJsonBody(req, { maxBytes: 16 })).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects an oversized actual body as 413', async () => {
    const req = makeRequest({ chunk: Buffer.alloc(100, 97), headers: { 'content-type': 'application/json' } });
    await expect(readJsonBody(req, { maxBytes: 16 })).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects a non-JSON content type as 415', async () => {
    const req = makeRequest({ body: 'x', headers: { 'content-type': 'text/plain' } });
    await expect(readJsonBody(req)).rejects.toMatchObject({ statusCode: 415 });
  });

  it('aborts on signal and returns 408', async () => {
    const controller = new AbortController();
    controller.abort();
    const req = makeRequest({ neverEnd: true, headers: { 'content-type': 'application/json' } });
    await expect(readJsonBody(req, { signal: controller.signal })).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
  });

  it('times out a body that never ends', async () => {
    const req = makeRequest({ neverEnd: true, headers: { 'content-type': 'application/json' } });
    await expect(readJsonBody(req, { timeoutMs: 5 })).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
  });

  it('rejects an invalid content-length header as 400', async () => {
    const req = makeRequest({ body: '{}', headers: { 'content-type': 'application/json', 'content-length': 'abc' } });
    await expect(readJsonBody(req)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ─── response helpers ───────────────────────────────────────────

describe('response helpers', () => {
  it('sendJson writes status, CORS, content-type and request id', async () => {
    const { res, status, body, headers } = makeResponse();
    await requestContext.run(
      requestContext.derive(makeRequest({ headers: { 'x-request-id': 'resp-1' } }), '/api/x'),
      () => {
        sendJson(res, 200, { ok: true });
      },
    );
    expect(status()).toBe(200);
    expect(body()).toEqual({ ok: true });
    expect(headers()['access-control-allow-origin']).toBe('*');
    expect(headers()['content-type']).toContain('application/json');
    expect(headers()['x-request-id']).toBe('resp-1');
  });

  it('sendError hides internal messages but keeps codes', () => {
    const { res, status, body } = makeResponse();
    sendError(res, new Error('root cause'));
    expect(status()).toBe(500);
    expect((body() as { error: { message: string; code: string } }).error.message).toBe('An internal error occurred.');
    expect((body() as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
  });

  it('sendError exposes client-visible messages', () => {
    const { res, status, body } = makeResponse();
    sendError(res, ApiError.badRequest('give me a name'));
    expect(status()).toBe(400);
    expect((body() as { error: { message: string } }).error.message).toBe('give me a name');
  });

  it('sendNoContent returns 204', () => {
    const { res, status } = makeResponse();
    sendNoContent(res);
    expect(status()).toBe(204);
  });

  it('does not double-write an already-ended response', () => {
    const { res, status, body } = makeResponse();
    res.end('first');
    sendJson(res, 500, { nope: true });
    expect(status()).toBe(0);
    expect(body()).toBe('first');
  });
});

// ─── router ─────────────────────────────────────────────────────

describe('RouteDispatcher', () => {
  it('runs handlers in registration order and stops at the first true', async () => {
    const calls: string[] = [];
    const dispatcher = createDispatcher([
      {
        prefix: '/api/a',
        handler: async () => {
          calls.push('a');
          return false;
        },
      },
      {
        prefix: '/api',
        handler: async () => {
          calls.push('b');
          return true;
        },
      },
      {
        prefix: '/api/a',
        handler: async () => {
          calls.push('c');
          return true;
        },
      },
    ]);
    const { res } = makeResponse();
    await dispatcher.dispatch(
      'GET',
      '/api/a/x',
      makeRequest() as unknown as http.IncomingMessage,
      res as unknown as http.ServerResponse,
      MINIMAL_CTX as never,
      3001,
      new URL('http://x/api/a/x'),
    );
    expect(calls).toEqual(['a', 'b']);
  });

  it('sends 404 when no handler claims the request', async () => {
    const dispatcher = createDispatcher([
      {
        prefix: '/api',
        handler: async () => false,
      },
    ]);
    const { res, status, body } = makeResponse();
    await dispatcher.dispatch(
      'GET',
      '/api/nope',
      makeRequest() as unknown as http.IncomingMessage,
      res as unknown as http.ServerResponse,
      MINIMAL_CTX as never,
      3001,
      new URL('http://x/api/nope'),
    );
    expect(status()).toBe(404);
    expect((body() as { error: { code: string } }).error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('preserves overlapping-prefix resolution (sequential chain semantics)', async () => {
    // Mirrors the real registry: the "agents" group owns /api/agents but not
    // /api/agents/:id/runs; a later group claims it.
    const dispatcher = createDispatcher([
      {
        prefix: '/api/agents',
        handler: async () => false,
      },
      {
        prefix: '/api/agent-threads',
        handler: async (_method: string, pathname: string) => {
          if (pathname === '/api/agents/developer-01/runs') return true;
          return false;
        },
      },
    ]);
    const { res, status } = makeResponse();
    await dispatcher.dispatch(
      'POST',
      '/api/agents/developer-01/runs',
      makeRequest() as unknown as http.IncomingMessage,
      res as unknown as http.ServerResponse,
      MINIMAL_CTX as never,
      3001,
      new URL('http://x/api/agents/developer-01/runs'),
    );
    expect(status()).not.toBe(404);
  });

  it('surfaces thrown handler errors to the caller', async () => {
    const dispatcher = createDispatcher([
      {
        prefix: '/api',
        handler: async () => {
          throw new Error('kaboom');
        },
      },
    ]);
    const { res } = makeResponse();
    await expect(
      dispatcher.dispatch(
        'GET',
        '/api/x',
        makeRequest() as unknown as http.IncomingMessage,
        res as unknown as http.ServerResponse,
        MINIMAL_CTX as never,
        3001,
        new URL('http://x/api/x'),
      ),
    ).rejects.toThrow('kaboom');
  });
});
