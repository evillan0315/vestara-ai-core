/**
 * Per-request context.
 *
 * Uses `AsyncLocalStorage` so downstream services can resolve the current
 * request ID without threading it through every method signature. Every
 * incoming request receives a context; an ambient fallback context exists
 * for code paths running outside an HTTP request (workers, timers).
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type * as http from 'node:http';

export interface ApiRequestContext {
  requestId: string;
  method: string;
  pathname: string;
  startedAt: number;
  actor?: string;
  remoteAddress?: string;
  userAgent?: string;
  /** Abort signal for request deadline/client-disconnect cancellation. */
  signal?: AbortSignal;
}

/** Reject malformed or dangerously long client-supplied request IDs. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,96}$/;

export class RequestContextStore {
  private readonly storage = new AsyncLocalStorage<ApiRequestContext>();

  /** Resolve the active request context, falling back to an ambient default. */
  current(isolate: boolean = false): ApiRequestContext {
    const ambient = this.storage.getStore();
    if (ambient) return ambient;
    if (isolate) {
      return { requestId: randomUUID(), method: '', pathname: '', startedAt: performance.now() };
    }
    // Stable fallback for non-request code paths.
    return { requestId: 'no-request', method: '', pathname: '', startedAt: performance.now() };
  }

  /**
   * Extract and validate a client-supplied request ID. Returns the validated
   * value or a fresh UUID when absent/invalid.
   */
  requestIdFor(req: http.IncomingMessage): string {
    const header = req.headers['x-request-id'];
    if (typeof header === 'string' && REQUEST_ID_PATTERN.test(header)) return header;
    return randomUUID();
  }

  derive(req: http.IncomingMessage, pathname: string): ApiRequestContext {
    return {
      requestId: this.requestIdFor(req),
      method: (req.method ?? 'GET').toUpperCase(),
      pathname,
      startedAt: performance.now(),
      actor: actorHeader(req),
      remoteAddress: socketAddress(req),
      userAgent: headerString(req.headers['user-agent']),
    };
  }

  run<T>(ctx: ApiRequestContext, fn: () => T | Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.storage.run(ctx, () => {
        Promise.resolve(fn()).then(resolve, reject);
      });
    });
  }
}

export const requestContext = new RequestContextStore();

function headerString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

function actorHeader(req: http.IncomingMessage): string | undefined {
  const actor = req.headers['x-vestara-actor'];
  if (typeof actor === 'string' && actor.trim()) return actor.trim();
  return undefined;
}

function socketAddress(req: http.IncomingMessage): string | undefined {
  const addr = req.socket.remoteAddress;
  if (!addr) return undefined;
  // IPv6 mapped IPv4 presentation ("::ffff:127.0.0.1" → "127.0.0.1").
  return addr.replace(/^::ffff:/, '');
}
