/**
 * Response helpers.
 *
 * All JSON responses go through these helpers so they uniformly attach the
 * request ID header, CORS headers, content type, and content length, and so
 * secondary errors never crash request processing.
 */

import type * as http from 'node:http';
import { ApiError, normalizeError } from './api-error';
import { COMPRESSION_MIN_BYTES, compressBuffer, negotiateEncoding } from './compression';
import { requestContext } from './request-context';

interface CorsHeaders {
  'Access-Control-Allow-Origin': string;
  'Access-Control-Allow-Methods': string;
  'Access-Control-Allow-Headers': string;
}

const CORS: CorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Vestara-Actor, X-Request-Id',
};

export interface SendOptions {
  cacheControl?: string;
}

function requestId(): string {
  return requestContext.current(false).requestId;
}

function isWritable(res: http.ServerResponse): boolean {
  return !res.writableEnded && res.headersSent !== true;
}

/**
 * VES-PERF-002 (P1): conversation payloads were previously streamed identity
 * — a 50-message conversation measured 1.52 MB on the wire with no
 * `Content-Encoding`, despite the client advertising gzip/br. Compression is a
 * transport-layer trim that requires no contract or client change. Encoding
 * policy lives in `./compression` and is shared with the static asset server.
 */
function writeJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  if (!isWritable(res)) return;
  let data: string;
  try {
    data = JSON.stringify(body);
  } catch {
    // Unserializable body (circular, BigInt) — return a safe fallback.
    data = JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Response serialization failed.' } });
  }
  const byteLength = Buffer.byteLength(data);
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Request-Id': requestId(),
    ...CORS,
  };

  const encoding =
    byteLength >= COMPRESSION_MIN_BYTES ? negotiateEncoding(res.req?.headers?.['accept-encoding']) : null;

  if (!encoding) {
    res.writeHead(statusCode, {
      ...baseHeaders,
      // Always vary so intermediaries never serve a compressed body to a
      // client that cannot decode it (and vice versa).
      Vary: 'Accept-Encoding',
      'Content-Length': String(byteLength),
    });
    try {
      res.end(data);
    } catch {
      /* client already gone */
    }
    return;
  }

  const compressedHeaders: Record<string, string> = {
    ...baseHeaders,
    'Content-Encoding': encoding,
    Vary: 'Accept-Encoding',
  };

  compressBuffer(Buffer.from(data, 'utf8'), encoding)
    .then((payload) => {
      if (!isWritable(res)) return;
      res.writeHead(statusCode, { ...compressedHeaders, 'Content-Length': String(payload.byteLength) });
      try {
        res.end(payload);
      } catch {
        /* client already gone */
      }
    })
    .catch(() => {
      // Compression failure must never fail the request — fall back to identity.
      if (!isWritable(res)) return;
      res.writeHead(statusCode, {
        ...baseHeaders,
        Vary: 'Accept-Encoding',
        'Content-Length': String(byteLength),
      });
      try {
        res.end(data);
      } catch {
        /* client already gone */
      }
    });
}

function writeNoContent(res: http.ServerResponse): void {
  if (!isWritable(res)) return;
  const headers: Record<string, string> = {
    'X-Request-Id': requestId(),
    ...CORS,
  };
  res.writeHead(204, headers);
  try {
    res.end();
  } catch {
    /* client already gone */
  }
}

export function applyCacheControl(res: http.ServerResponse, value?: string): void {
  if (value && !res.headersSent) res.setHeader('Cache-Control', value);
}

export function sendJson<T>(res: http.ServerResponse, statusCode: number, body: T, options?: SendOptions): void {
  applyCacheControl(res, options?.cacheControl);
  writeJson(res, statusCode, body);
}

export function sendNoContent(res: http.ServerResponse, options?: SendOptions): void {
  applyCacheControl(res, options?.cacheControl);
  writeNoContent(res);
}

export function sendError(res: http.ServerResponse, error: unknown): ApiError {
  const apiError = normalizeError(error);
  const body = errorBody(apiError);
  writeJson(res, apiError.statusCode, body);
  return apiError;
}

export function sendNotFound(res: http.ServerResponse, message?: string): void {
  sendError(res, ApiError.notFound(message));
}

export function sendMethodNotAllowed(res: http.ServerResponse, allowed?: string[]): void {
  if (allowed && allowed.length > 0 && !res.headersSent) {
    res.setHeader('Allow', allowed.join(', '));
  }
  sendError(res, ApiError.badRequest('The requested method is not supported for this resource.'));
}

function errorBody(error: ApiError): Record<string, unknown> {
  const envelope: Record<string, unknown> = {
    error: {
      code: error.code,
      message: error.expose ? error.message : 'An internal error occurred.',
      requestId: requestId(),
    },
  };
  if (error.details !== undefined) {
    (envelope.error as Record<string, unknown>).details = error.details;
  }
  return envelope;
}

/** Backwards-compatible shim matching the old `json(res, status, body)` helper. */
export function json(res: http.ServerResponse, status: number, body: unknown): void {
  writeJson(res, status, body);
}

/** Backwards-compatible CORS constant for callers that import it. */
export const CORS_HEADERS: CorsHeaders = CORS;

export { ApiError };
