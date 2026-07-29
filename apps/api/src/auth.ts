/**
 * Auth middleware for Vestara API.
 *
 * Extracts and verifies Bearer tokens from the Authorization header.
 * Attaches the authenticated user to the request for downstream handlers.
 * Unauthenticated requests get a minimal anonymous user context.
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
 * Extract and verify the bearer token from an incoming request.
 * Returns the authenticated user, or a default anonymous user.
 */
export function authenticate(req: http.IncomingMessage, userStore?: UserStore): AuthUser {
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

  // 2. Try X-Vestara-Actor header (legacy)
  const actorHeader = req.headers['x-vestara-actor'];
  const actorName = typeof actorHeader === 'string' && actorHeader.trim() ? actorHeader.trim() : 'local-operator';

  return {
    id: actorName,
    name: actorName,
    type: 'user',
    role: 'admin',
  };
}

/** Check if the user has at least the given role. */
export function hasRole(user: AuthUser, minimum: AuthUser['role']): boolean {
  const hierarchy: Record<string, number> = { viewer: 0, editor: 1, admin: 2 };
  return (hierarchy[user.role] ?? -1) >= (hierarchy[minimum] ?? 99);
}

/**
 * Require a minimum role for a request.
 * Sends a 403 JSON response and returns false if the user lacks the required role.
 */
export function requireRole(
  req: http.IncomingMessage,
  ctx: { users: UserStore },
  minimum: AuthUser['role'],
  res: http.ServerResponse,
): AuthUser | null {
  const user = authenticate(req, ctx.users);
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
