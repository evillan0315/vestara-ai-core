// Stable error model for the OpenCode integration. The API never returns raw
// upstream errors, stack traces, HTML, secrets, or internal paths.

export type OpenCodeIntegrationErrorCode =
  | 'OPENCODE_DISABLED'
  | 'OPENCODE_UNAVAILABLE'
  | 'OPENCODE_TIMEOUT'
  | 'OPENCODE_AUTHENTICATION_FAILED'
  | 'OPENCODE_SESSION_NOT_FOUND'
  | 'OPENCODE_QUESTION_NOT_FOUND'
  | 'OPENCODE_PERMISSION_DENIED'
  | 'OPENCODE_INVALID_RESPONSE'
  | 'OPENCODE_POLICY_BLOCKED'
  | 'OPENCODE_UPSTREAM_ERROR';

export interface OpenCodeErrorPayload {
  readonly code: OpenCodeIntegrationErrorCode;
  readonly message: string;
  readonly requestId?: string;
  readonly retryable: boolean;
}

export class OpenCodeIntegrationError extends Error {
  readonly code: OpenCodeIntegrationErrorCode;
  readonly retryable: boolean;
  readonly httpStatus: number;

  constructor(code: OpenCodeIntegrationErrorCode, message: string, httpStatus = 502, retryable = false) {
    super(message);
    this.name = 'OpenCodeIntegrationError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }

  toPayload(requestId?: string): OpenCodeErrorPayload {
    return { code: this.code, message: this.message, requestId, retryable: this.retryable };
  }
}

export function disabledError(): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError('OPENCODE_DISABLED', 'The OpenCode integration is disabled.', 503, false);
}

export function unavailableError(message = 'The OpenCode runtime is not reachable.'): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError('OPENCODE_UNAVAILABLE', message, 503, true);
}

export function timeoutError(): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError('OPENCODE_TIMEOUT', 'The OpenCode runtime timed out.', 504, true);
}

export function authenticationFailedError(): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError(
    'OPENCODE_AUTHENTICATION_FAILED',
    'OpenCode rejected the integration credentials.',
    502,
    false,
  );
}

export function sessionNotFoundError(sessionId: string): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError(
    'OPENCODE_SESSION_NOT_FOUND',
    `OpenCode session not found: ${sessionId}`,
    404,
    false,
  );
}

export function questionNotFoundError(requestId: string, sessionId?: string): OpenCodeIntegrationError {
  const scope = sessionId ? ` (session ${sessionId})` : '';
  return new OpenCodeIntegrationError(
    'OPENCODE_QUESTION_NOT_FOUND',
    `OpenCode question not found: ${requestId}${scope}. The question expired, was already answered, or OpenCode restarted.`,
    404,
    false,
  );
}

export function permissionDeniedError(message = 'Permission denied.'): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError('OPENCODE_PERMISSION_DENIED', message, 403, false);
}

export function policyBlockedError(operation: string): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError(
    'OPENCODE_POLICY_BLOCKED',
    `Operation is blocked by Vestara policy: ${operation}`,
    403,
    false,
  );
}

export function invalidResponseError(message = 'OpenCode returned an invalid response.'): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError('OPENCODE_INVALID_RESPONSE', message, 502, false);
}

export function upstreamError(
  status: number,
  message = 'OpenCode returned an unexpected error.',
): OpenCodeIntegrationError {
  return new OpenCodeIntegrationError('OPENCODE_UPSTREAM_ERROR', message, status, true);
}

/**
 * Map a non-OK upstream HTTP status to a typed integration error.
 * OpenCode returns 401 for bad credentials and 404 for missing resources.
 * Pass the question requestId (and path) for question routes so a 404
 * surfaces as OPENCODE_QUESTION_NOT_FOUND with the exact que_* identity
 * instead of a misleading "session not found: unknown".
 */
export function mapUpstreamStatus(
  status: number,
  sessionId?: string,
  detail?: { requestId?: string; path?: string },
): OpenCodeIntegrationError {
  switch (status) {
    case 401:
    case 403:
      return authenticationFailedError();
    case 404: {
      const requestId = detail?.requestId;
      const path = detail?.path ?? '';
      const isQuestionRoute = path.includes('/question');
      if (requestId || isQuestionRoute) {
        return questionNotFoundError(requestId ?? path ?? 'unknown-question', sessionId);
      }
      return sessionId
        ? sessionNotFoundError(sessionId)
        : new OpenCodeIntegrationError(
            'OPENCODE_SESSION_NOT_FOUND',
            `Not found: ${path || 'unknown resource'}.`,
            404,
            false,
          );
    }
    case 408:
    case 429:
    case 500:
    case 502:
    case 503:
    case 504:
      return upstreamError(status);
    default:
      return upstreamError(status);
  }
}

export function isOpenCodeIntegrationError(error: unknown): error is OpenCodeIntegrationError {
  return error instanceof OpenCodeIntegrationError;
}
