/**
 * Shared HTTP primitives for route handlers.
 *
 * Backwards-compatible surface for existing route modules: keeps the original
 * `json`, `CORS`, `readBody`, `getActor`, and `actorOf` signatures while
 * delegating to the hardened `http/` implementations where relevant.
 */

import type * as http from 'node:http';
import { ApiError, normalizeError } from '../http/api-error';
import { readBody as hardenedReadBody } from '../http/body';
import { CORS_HEADERS, json } from '../http/response';
import type { WorkspaceContext } from '../workspace-context';

export type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  url: URL,
  port: number,
) => Promise<boolean>;

export const CORS: Record<string, string> = { ...CORS_HEADERS };

export { ApiError, json, normalizeError };

export function readBody(req: http.IncomingMessage): Promise<string> {
  return hardenedReadBody(req);
}

export function actorOf(req: http.IncomingMessage): string {
  const h = req.headers['x-vestara-actor'];
  return typeof h === 'string' && h.trim() ? h.trim() : 'local-operator';
}

export function getActor(req: http.IncomingMessage, ctx: WorkspaceContext) {
  const { authenticate } = require('../auth');
  return authenticate(req, ctx.users);
}
