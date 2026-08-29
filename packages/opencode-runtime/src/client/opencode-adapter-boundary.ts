// OpenCodeAdapterBoundary — raw HTTP operations that bypass the typed client.
// Used for contract compatibility testing and for endpoints that don't yet have
// typed DTOs. Every operation returns the raw parsed JSON response, preserving
// the upstream shape for validation against the pinned OpenAPI spec.
//
// This class is NOT a substitute for OpenCodeClient. It exists to:
// 1. Verify contract compatibility between the pinned spec and the live server.
// 2. Provide escape-hatch access for new endpoints before typed DTOs exist.
// 3. Enable regression testing of response shapes against the spec.

import type { OpenCodeRuntimeConfig } from '../config';
import { authenticationFailedError, sessionNotFoundError, upstreamError } from './opencode-errors';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

export interface RawHttpResponse {
  readonly status: number;
  readonly headers: ReadonlyMap<string, string>;
  readonly body: unknown;
}

export interface AdapterRequestOptions {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

/**
 * Raw HTTP adapter for the OpenCode server. Returns unparsed response shapes
 * for contract validation. Use OpenCodeClient for all production operations.
 */
export class OpenCodeAdapterBoundary {
  private readonly config: OpenCodeRuntimeConfig;

  constructor(config: OpenCodeRuntimeConfig) {
    this.config = config;
  }

  get baseUrl(): string {
    return this.config.baseUrl.toString().replace(/\/$/, '');
  }

  /**
   * Execute a raw HTTP request and return the full response including status,
   * headers, and parsed body. Does NOT normalize or validate the response shape.
   */
  async requestRaw(options: AdapterRequestOptions): Promise<RawHttpResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    const onOuterAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onOuterAbort);
    try {
      const headers: Record<string, string> = {
        Authorization: basicAuthHeader(this.config.username, this.config.password),
        Accept: 'application/json',
        'X-Vestara-Source': 'opencode-runtime',
      };
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${options.path}`, {
          method: options.method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted && !options.signal?.aborted) {
          throw new Error('Request timed out');
        }
        throw new Error('OpenCode server unreachable');
      }
      const responseHeaders = new Map<string, string>();
      response.headers.forEach((value, key) => {
        responseHeaders.set(key, value);
      });
      if (response.status === 204) {
        return { status: response.status, headers: responseHeaders, body: undefined };
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      return { status: response.status, headers: responseHeaders, body };
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  /**
   * Get the OpenAPI document from the server for contract validation.
   */
  async getOpenApiDocument(signal?: AbortSignal): Promise<unknown> {
    const result = await this.requestRaw({
      method: 'GET',
      path: '/doc',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    });
    return result.body;
  }

  /**
   * Execute a contract validation request — verifies that the server responds
   * to the given path with the expected status code.
   */
  async contractProbe(
    method: string,
    path: string,
    expectedStatus: number,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<{ readonly ok: boolean; readonly actualStatus: number; readonly body: unknown }> {
    const result = await this.requestRaw({
      method,
      path,
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    });
    return {
      ok: result.status === expectedStatus,
      actualStatus: result.status,
      body: result.body,
    };
  }
}
