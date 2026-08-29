/**
 * HTTP observability + request-processing core.
 */

export { ApiError, normalizeError } from './api-error';
export {
  BodyReadAbortedError,
  BodyReadTimedOutError,
  BodyTooLargeError,
  DEFAULT_BODY_TIMEOUT_MS,
  DEFAULT_MAX_BODY_BYTES,
  type ReadBodyOptions,
  readBody,
  readJsonBody,
  readTextBody,
} from './body';
export { type ApiRequestContext, RequestContextStore, requestContext } from './request-context';
export { type LogFields, type LogLevel, logger, RequestLogger, redactSensitive } from './request-logger';
export { HttpMetrics, type HttpMetricsSnapshot, httpMetrics } from './request-metrics';
export {
  applyCacheControl,
  CORS_HEADERS,
  json,
  type SendOptions,
  sendError,
  sendJson,
  sendMethodNotAllowed,
  sendNoContent,
  sendNotFound,
} from './response';
export { createDispatcher, RouteDispatcher, type RouteGroup, type RouteHandler } from './router';
