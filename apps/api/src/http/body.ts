/**
 * Hardened request-body processing.
 *
 * Bounded by size and time, abort-aware, listener/timer-safe. Malformed JSON
 * is distinguished from internal failures and mapped to the correct status.
 */

import type { IncomingMessage } from 'node:http';
import { ApiError } from './api-error';

export const DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024;
export const DEFAULT_BODY_TIMEOUT_MS = 15_000;

export interface ReadBodyOptions {
  maxBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class BodyTooLargeError extends Error {
  readonly code = 'PAYLOAD_TOO_LARGE';
  constructor(message = 'Request body exceeds the allowed size.') {
    super(message);
    this.name = 'BodyTooLargeError';
  }
}

export class BodyReadAbortedError extends Error {
  readonly code = 'REQUEST_TIMEOUT';
  constructor(message = 'Request body read was aborted.') {
    super(message);
    this.name = 'BodyReadAbortedError';
  }
}

export class BodyReadTimedOutError extends Error {
  readonly code = 'REQUEST_TIMEOUT';
  constructor(message = 'Request body read timed out.') {
    super(message);
    this.name = 'BodyReadTimedOutError';
  }
}

function readBodyOnce(req: IncomingMessage, options: ReadBodyOptions): Promise<{ text: string; bytes: number }> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_BODY_TIMEOUT_MS;
  const signal = options.signal;

  return new Promise((resolve, reject) => {
    let declaredLength: number | null = null;
    try {
      declaredLength = parseContentLength(req);
    } catch (err) {
      pauseSafe(req);
      return reject(err);
    }
    if (declaredLength !== null && declaredLength > maxBytes) {
      pauseSafe(req);
      return reject(new BodyTooLargeError());
    }

    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    const cleanup = (): void => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
      signal?.removeEventListener('abort', onAbort);
      if (timeout) clearTimeout(timeout);
    };

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onData = (chunk: Buffer): void => {
      received += chunk.length;
      if (received > maxBytes) {
        pauseSafe(req);
        settle(() => reject(new BodyTooLargeError()));
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = (): void => {
      const buf = Buffer.concat(chunks);
      settle(() => resolve({ text: buf.toString('utf8'), bytes: buf.length }));
    };

    const onError = (err: Error): void => settle(() => reject(err));
    const onAborted = (): void => settle(() => reject(new BodyReadAbortedError()));
    const onAbort = (): void => settle(() => reject(new BodyReadAbortedError()));

    if (signal) {
      if (signal.aborted) {
        settle(() => reject(new BodyReadAbortedError()));
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    timeout = setTimeout(() => {
      pauseSafe(req);
      settle(() => reject(new BodyReadTimedOutError()));
    }, timeoutMs);

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);

    if (declaredLength === 0 && req.readableEnded) onEnd();
  });
}

function requireJsonContentType(req: IncomingMessage): void {
  const contentType = req.headers['content-type'];
  if (!contentType) return;
  const mediaType = String(contentType).split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json' && mediaType !== '') {
    throw ApiError.unsupportedMediaType();
  }
}

/**
 * Read and parse a JSON request body with structural protections.
 * Throws `ApiError` (status-mapped) on every failure mode.
 */
export async function readJsonBody<T>(req: IncomingMessage, options?: ReadBodyOptions): Promise<T> {
  requireJsonContentType(req);
  const { text } = await readBodyOnce(req, options ?? {});
  if (text.trim() === '') return {} as T;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw ApiError.badRequest('Request body is not valid JSON.', { code: 'INVALID_JSON' });
  }
  return parsed as T;
}

/** Read a raw body string with the hardened body reader. */
export async function readTextBody(req: IncomingMessage, options?: ReadBodyOptions): Promise<string> {
  const { text } = await readBodyOnce(req, options ?? {});
  return text;
}

function parseContentLength(req: IncomingMessage): number | null {
  const headers = req.headers;
  if (!headers) return null;
  const raw = headers['content-length'];
  if (raw === undefined) return null;
  const str = Array.isArray(raw) ? raw.join(',') : String(raw);
  if (!/^\d+$/.test(str)) throw ApiError.badRequest('Invalid Content-Length header.');
  const n = Number(str);
  if (!Number.isSafeInteger(n) || n < 0) throw ApiError.badRequest('Invalid Content-Length header.');
  return n;
}

function pauseSafe(req: IncomingMessage): void {
  try {
    req.pause();
  } catch {
    // Some test doubles and already-ended streams lack pause().
  }
}

/** Backwards-compatible raw body read. */
export async function readBody(req: IncomingMessage, options?: ReadBodyOptions): Promise<string> {
  return readTextBody(req, options);
}
