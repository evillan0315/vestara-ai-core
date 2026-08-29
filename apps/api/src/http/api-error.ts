/**
 * Standardized API error model.
 *
 * All expected client and server failures funnel through `ApiError`, which
 * carries a stable machine code, an HTTP status, optional details, and an
 * `expose` flag controlling whether the message is safe to return to clients.
 */

export interface ApiErrorOptions {
  code: string;
  message: string;
  statusCode: number;
  details?: unknown;
  expose?: boolean;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly expose: boolean;
  override readonly cause?: unknown;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = 'ApiError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.details = options.details;
    this.expose = options.expose ?? options.statusCode < 500;
    this.cause = options.cause;
  }

  static badRequest(message = 'The request payload is invalid.', details?: unknown): ApiError {
    return new ApiError({ code: 'BAD_REQUEST', message, statusCode: 400, details, expose: true });
  }

  static validation(details: unknown, message = 'The request payload is invalid.'): ApiError {
    return new ApiError({ code: 'VALIDATION_ERROR', message, statusCode: 400, details, expose: true });
  }

  static unauthorized(message = 'Authentication is required.'): ApiError {
    return new ApiError({ code: 'UNAUTHORIZED', message, statusCode: 401, expose: true });
  }

  static forbidden(message = 'Insufficient access.'): ApiError {
    return new ApiError({ code: 'FORBIDDEN', message, statusCode: 403, expose: true });
  }

  static notFound(message = 'The requested resource was not found.'): ApiError {
    return new ApiError({ code: 'RESOURCE_NOT_FOUND', message, statusCode: 404, expose: true });
  }

  static conflict(message = 'The operation conflicts with an existing resource.'): ApiError {
    return new ApiError({ code: 'CONFLICT', message, statusCode: 409, expose: true });
  }

  static payloadTooLarge(message = 'The request body exceeds the allowed size.'): ApiError {
    return new ApiError({ code: 'PAYLOAD_TOO_LARGE', message, statusCode: 413, expose: true });
  }

  static unsupportedMediaType(message = 'The request content type is unsupported.'): ApiError {
    return new ApiError({ code: 'UNSUPPORTED_MEDIA_TYPE', message, statusCode: 415, expose: true });
  }

  static rateLimited(message = 'Too many requests.'): ApiError {
    return new ApiError({ code: 'RATE_LIMITED', message, statusCode: 429, expose: true });
  }

  static requestTimeout(message = 'The request timed out.'): ApiError {
    return new ApiError({ code: 'REQUEST_TIMEOUT', message, statusCode: 408, expose: true });
  }

  static gatewayTimeout(message = 'The upstream operation timed out.'): ApiError {
    return new ApiError({ code: 'GATEWAY_TIMEOUT', message, statusCode: 504, expose: true });
  }

  static serviceUnavailable(message = 'The requested service is unavailable.'): ApiError {
    return new ApiError({ code: 'SERVICE_UNAVAILABLE', message, statusCode: 503, expose: true });
  }

  static internal(message = 'An internal error occurred.', cause?: unknown): ApiError {
    return new ApiError({ code: 'INTERNAL_ERROR', message, statusCode: 500, expose: false, cause });
  }
}

/**
 * Safely coerce any thrown value into an `ApiError`.
 *
 * Handles: ApiError passthrough, generic Error (message hidden unless expose),
 * a rejected object carrying `code`/`statusCode` (possibly produced inside the
 * same process), throwable strings, fetch-style `AbortError`, JSON parse
 * failures, filesystem error codes, and authentication contract failures.
 */
export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof Error) {
    // Aborted / timed-out requests map to client-side timeouts where safe.
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return ApiError.requestTimeout(error.message);
    }
    // Filesystem and network error codes map to stable statuses without
    // leaking the underlying path.
    if (isNodeError(error)) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EACCES') return ApiError.notFound();
      if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT') return ApiError.serviceUnavailable();
      // Body reader failures carry their status as an error code.
      if (code === 'PAYLOAD_TOO_LARGE') return ApiError.payloadTooLarge();
      if (code === 'REQUEST_TIMEOUT') return ApiError.requestTimeout();
    }
    // Authentication contract failures from downstream services.
    if (messageLooksLikeAuth(error.message)) return ApiError.unauthorized();
    return ApiError.internal(undefined, error);
  }

  if (typeof error === 'string') {
    return new ApiError({ code: 'INTERNAL_ERROR', message: error, statusCode: 500, expose: false, cause: error });
  }

  if (isObjectLike(error)) {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message : 'An internal error occurred.';
    const statusCode = typeof record.statusCode === 'number' ? record.statusCode : 500;
    if (statusCode < 400 || statusCode > 599) {
      return ApiError.internal(undefined, error);
    }
    return new ApiError({
      code: typeof record.code === 'string' ? record.code : 'INTERNAL_ERROR',
      message,
      statusCode,
      expose: statusCode < 500,
      cause: error,
    });
  }

  return ApiError.internal();
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNodeError(error: Error): error is Error & NodeJS.ErrnoException {
  return typeof (error as NodeJS.ErrnoException).code === 'string';
}

const AUTH_MARKERS = /(unauthor|invalid token|permission denied|forbidden|credential)/i;

function messageLooksLikeAuth(message: string): boolean {
  return AUTH_MARKERS.test(message);
}
