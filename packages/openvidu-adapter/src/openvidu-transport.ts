/**
 * @vestara/openvidu-adapter — OpenVidu HTTP Transport
 *
 * Focused HTTP transport for the native OpenVidu 2.25 REST API.
 * Uses native fetch — follows the same pattern as OpenCodeHttpClient.
 *
 * SECURITY:
 *   - Basic Auth credentials never logged or included in errors
 *   - Authorization header never serialized
 *   - Provider response tokens consumed ephemerally
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-002 Native OpenVidu Adapter
 */

import { classifyOpenViduError, OpenViduError } from './openvidu-errors';
import type { OpenViduConfig, OpenViduErrorResponse } from './openvidu-types';

/** HTTP method for OpenVidu API calls. */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** Transport interface — abstracted for testability. */
export interface OpenViduTransport {
  request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T>;
}

/**
 * Creates the Basic Auth header value.
 * NEVER logged or included in error messages.
 */
function basicAuthHeader(username: string, secret: string): string {
  return `Basic ${Buffer.from(`${username}:${secret}`).toString('base64')}`;
}

/**
 * Creates a native fetch-based transport for OpenVidu.
 *
 * @param config - OpenVidu configuration (includes credentials)
 * @returns Transport instance
 */
export function createOpenViduTransport(config: OpenViduConfig): OpenViduTransport {
  const baseUrl = config.url.replace(/\/+$/, '');
  const apiBase = config.apiBase.replace(/\/+$/, '');
  const timeoutMs = config.timeoutMs ?? 10_000;

  async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const url = `${baseUrl}${apiBase}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: basicAuthHeader(config.username, config.secret),
      };

      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorBody: OpenViduErrorResponse | undefined;
        try {
          errorBody = (await response.json()) as OpenViduErrorResponse;
        } catch {
          // Response body may not be JSON — that's fine
        }

        const error = classifyOpenViduError(response.status, errorBody, method, path);
        throw error;
      }

      // 204 No Content
      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof OpenViduError) {
        throw error;
      }

      // Network/timeout errors
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new OpenViduError('NETWORK', `Request timed out: ${method} ${path}`, {
          retryable: true,
        });
      }

      if (error instanceof TypeError) {
        throw new OpenViduError('NETWORK', `Network error: ${method} ${path}`, {
          retryable: true,
        });
      }

      throw new OpenViduError('PROVIDER_ERROR', `Unexpected error: ${method} ${path}`, { retryable: false });
    } finally {
      clearTimeout(timeout);
    }
  }

  return { request };
}

/**
 * Creates a transport from a mock fetch function for testing.
 *
 * @param mockFetch - A mock fetch implementation
 * @param config - Optional config (for auth header generation)
 * @returns Transport instance
 */
export function createMockTransport(_mockFetch: typeof fetch, config?: Partial<OpenViduConfig>): OpenViduTransport {
  const resolvedConfig: OpenViduConfig = {
    url: 'https://test.openvidu.local',
    apiBase: '/openvidu/api',
    username: 'TESTUSER',
    secret: 'test-secret-do-not-log',
    ...config,
  };
  return createOpenViduTransport(resolvedConfig);
}
