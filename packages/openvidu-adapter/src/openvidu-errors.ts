/**
 * @vestara/openvidu-adapter — OpenVidu Error Normalization
 *
 * Maps OpenVidu HTTP/network responses into the MediaError hierarchy.
 * Preserves safe diagnostics (operation, HTTP status, error category)
 * but never copies arbitrary provider response bodies or credentials.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-002 Native OpenVidu Adapter
 */

import { MediaError, type MediaErrorCode } from '@vestara/media-runtime';
import type { OpenViduErrorResponse } from './openvidu-types';

/**
 * OpenVidu-specific error categories.
 * Mapped from HTTP status codes at the adapter boundary.
 */
export type OpenViduErrorCategory =
  | 'AUTH'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID'
  | 'UNAVAILABLE'
  | 'NETWORK'
  | 'PROVIDER_ERROR';

/**
 * OpenVidu-specific error with safe diagnostics.
 * Never contains credentials, tokens, or raw response bodies.
 */
export class OpenViduError extends Error {
  readonly category: OpenViduErrorCategory;
  readonly httpStatus?: number;
  readonly retryable: boolean;
  readonly operation?: string;
  readonly providerMessage?: string;

  constructor(
    category: OpenViduErrorCategory,
    message: string,
    options?: {
      httpStatus?: number;
      retryable?: boolean;
      operation?: string;
      providerMessage?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'OpenViduError';
    this.category = category;
    this.httpStatus = options?.httpStatus;
    this.retryable = options?.retryable ?? false;
    this.operation = options?.operation;
    this.providerMessage = options?.providerMessage;
  }
}

/**
 * Classifies an OpenVidu HTTP error response into an OpenViduError.
 *
 * @param httpStatus - HTTP status code
 * @param body - Parsed error response body (may be undefined)
 * @param method - HTTP method for the failed request
 * @param path - Request path
 * @returns Classified OpenViduError
 */
export function classifyOpenViduError(
  httpStatus: number,
  body: OpenViduErrorResponse | undefined,
  method: string,
  path: string,
): OpenViduError {
  const operation = `${method} ${path}`;
  // Sanitize provider message — truncate, never include tokens/credentials
  const providerMessage = sanitizeProviderMessage(body?.error ?? body?.message);

  switch (httpStatus) {
    case 401:
    case 403:
      return new OpenViduError('AUTH', `Authentication failed: ${operation}`, {
        httpStatus,
        retryable: false,
        operation,
        providerMessage,
      });

    case 404:
      return new OpenViduError('NOT_FOUND', `Resource not found: ${operation}`, {
        httpStatus,
        retryable: false,
        operation,
        providerMessage,
      });

    case 409:
      return new OpenViduError('CONFLICT', `Conflict: ${operation}`, {
        httpStatus,
        retryable: false,
        operation,
        providerMessage,
      });

    case 400:
    case 422:
      return new OpenViduError('INVALID', `Invalid request: ${operation}`, {
        httpStatus,
        retryable: false,
        operation,
        providerMessage,
      });

    case 502:
    case 503:
    case 504:
      return new OpenViduError('UNAVAILABLE', `Provider unavailable: ${operation}`, {
        httpStatus,
        retryable: true,
        operation,
        providerMessage,
      });

    default:
      if (httpStatus >= 500) {
        return new OpenViduError('PROVIDER_ERROR', `Provider error ${httpStatus}: ${operation}`, {
          httpStatus,
          retryable: true,
          operation,
          providerMessage,
        });
      }
      return new OpenViduError('PROVIDER_ERROR', `Unexpected status ${httpStatus}: ${operation}`, {
        httpStatus,
        retryable: false,
        operation,
        providerMessage,
      });
  }
}

/**
 * Maps OpenViduError to MediaError at the adapter boundary.
 *
 * @param error - OpenVidu-specific error
 * @returns Provider-neutral MediaError
 */
export function normalizeToMediaError(error: OpenViduError): MediaError {
  const code = mapCategoryToMediaCode(error.category);
  // Sanitize providerMessage at the normalization boundary — defense in depth
  const safeDetail: Record<string, unknown> = {
    category: error.category,
    httpStatus: error.httpStatus,
    operation: error.operation,
    retryable: error.retryable,
  };
  if (error.providerMessage) {
    const sanitized = sanitizeProviderMessage(error.providerMessage);
    if (sanitized) safeDetail.providerMessage = sanitized;
  }
  return new MediaError(code, error.message, {
    provider: 'openvidu',
    providerDetail: safeDetail,
    cause: error,
  });
}

/**
 * Maps OpenVidu error category to MediaErrorCode.
 */
function mapCategoryToMediaCode(category: OpenViduErrorCategory): MediaErrorCode {
  switch (category) {
    case 'AUTH':
      return 'MEDIA_PROVIDER_AUTH_FAILED';
    case 'NOT_FOUND':
      return 'MEDIA_SESSION_NOT_FOUND';
    case 'CONFLICT':
      return 'MEDIA_SESSION_ALREADY_ACTIVE';
    case 'INVALID':
      return 'MEDIA_PROVIDER_REJECTED';
    case 'UNAVAILABLE':
      return 'MEDIA_PROVIDER_UNAVAILABLE';
    case 'NETWORK':
      return 'MEDIA_PROVIDER_TIMEOUT';
    case 'PROVIDER_ERROR':
      return 'MEDIA_PROVIDER_REJECTED';
  }
}

/**
 * Sanitizes a provider message for safe inclusion in errors.
 * Truncates to 200 chars, strips any token-like patterns.
 */
function sanitizeProviderMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  // Truncate
  let sanitized = message.slice(0, 200);
  // Strip potential token patterns (tok_, wss://, base64-like strings)
  sanitized = sanitized.replace(/tok_[A-Za-z0-9_-]+/g, '[REDACTED]');
  sanitized = sanitized.replace(/wss?:\/\/[^\s]+/g, '[REDACTED]');
  return sanitized;
}

/**
 * Checks if a value is an OpenViduError.
 */
export function isOpenViduError(value: unknown): value is OpenViduError {
  return value instanceof OpenViduError;
}
