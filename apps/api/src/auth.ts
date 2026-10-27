/**
 * Auth middleware for Vestara API.
 *
 * Extracts and verifies Bearer tokens from the Authorization header.
 * Fail-closed: requests without a valid token are unauthenticated (null) —
 * there is no anonymous admin fallback (VES-AUTH-001, v8.0 enforced access).
 *
 * The legacy `X-Vestara-Actor` header is attribution-only: it downgrades to a
 * viewer-identified actor for audit display and never grants authority.
 */

import type * as http from 'node:http';
import type { UserStore } from '@vestara/workspace';

export interface AuthUser {
  id: string;
  name: string;
  type: 'user' | 'agent' | 'system';
  role: 'admin' | 'editor' | 'viewer';
}

/**
 * Paths that remain reachable without a Bearer token.
 * - POST /api/auth/login issues tokens, so it must stay public.
 * - POST /api/auth/password and POST /api/auth/mfa/verify are the
 *   credential-issuance equivalents (throttled + audited in-handler).
 * - POST /api/telegram/webhook is validated inside its handler via the
 *   Telegram Bot API secret_token header, not via Bearer.
 * Everything else under /api/* requires authentication.
 */
export function isPublicApiRequest(method: string, pathname: string): boolean {
  if (method === 'POST' && pathname === '/api/auth/login') return true;
  if (method === 'POST' && pathname === '/api/auth/password') return true;
  if (method === 'POST' && pathname === '/api/auth/mfa/verify') return true;
  if (method === 'POST' && pathname === '/api/telegram/webhook') return true;
  return false;
}

/**
 * Extract and verify the bearer token from an incoming request.
 * Returns the authenticated user, or null when unauthenticated.
 */
export function authenticate(req: http.IncomingMessage, userStore?: UserStore): AuthUser | null {
  // 1. Try Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && userStore) {
    const match = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
    if (match) {
      const token = match[1];
      const user = userStore.findByToken(token);
      if (user) {
        return {
          id: user.id,
          name: user.username,
          type: 'user',
          role: user.role,
        };
      }
    }
  }

  // 2. No valid token — unauthenticated. The legacy actor header is handled
  // separately via legacyActor() for attribution only.
  return null;
}

/**
 * Attribution-only legacy actor name from `X-Vestara-Actor`.
 * Grants no authority; use only for audit display on public paths.
 */
export function legacyActor(req: http.IncomingMessage): AuthUser {
  const actorHeader = req.headers['x-vestara-actor'];
  const actorName = typeof actorHeader === 'string' && actorHeader.trim() ? actorHeader.trim() : 'local-operator';

  return {
    id: actorName,
    name: actorName,
    type: 'user',
    role: 'viewer',
  };
}

/** Check if the user has at least the given role. */
export function hasRole(user: AuthUser, minimum: AuthUser['role']): boolean {
  const hierarchy: Record<string, number> = { viewer: 0, editor: 1, admin: 2 };
  return (hierarchy[user.role] ?? -1) >= (hierarchy[minimum] ?? 99);
}

/**
 * Require any authenticated user for a request.
 * Sends a 401 JSON response and returns null when unauthenticated.
 */
export function requireAuth(
  req: http.IncomingMessage,
  ctx: { users: UserStore },
  res: http.ServerResponse,
): AuthUser | null {
  const user = authenticate(req, ctx.users);
  if (!user) {
    const data = JSON.stringify({ error: 'Authentication is required.' });
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    });
    res.end(data);
    return null;
  }
  return user;
}

/**
 * Require a minimum role for a request.
 * Sends a 401 JSON response when unauthenticated, 403 when under-role,
 * and returns null in both cases.
 */
export function requireRole(
  req: http.IncomingMessage,
  ctx: { users: UserStore },
  minimum: AuthUser['role'],
  res: http.ServerResponse,
): AuthUser | null {
  const user = authenticate(req, ctx.users);
  if (!user) {
    const data = JSON.stringify({ error: 'Authentication is required.' });
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    });
    res.end(data);
    return null;
  }
  if (!hasRole(user, minimum)) {
    const data = JSON.stringify({ error: `Forbidden: requires role '${minimum}' or higher` });
    res.writeHead(403, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    });
    res.end(data);
    return null;
  }
  return user;
}
