import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { type HumanPrincipalStatus, isHumanPrincipalStatus } from '@vestara/workspace';
import { AuditAction, logAudit } from '../audit-log';
import { type AuthUser, requireRole } from '../auth';
import { ApiError } from '../http/api-error';
import { readJsonBody } from '../http/body';
import { json } from '../http/response';
import type { WorkspaceContext } from '../workspace-context';
import { getActor } from './types';

function isLoopback(req: http.IncomingMessage): boolean {
  const address = req.socket?.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/**
 * Provision the shared session file so local CLI/TUI clients are authenticated
 * after the Vestara OS login (no `vestara auth login` needed). Loopback-only and
 * best-effort: a failure never affects the login response. The path mirrors the
 * CLI's `auth.json` (`VESTARA_SESSION_FILE` overrides it for images/services).
 */
function persistSessionFile(port: number, user: { username: string; role: string; token: string }): void {
  try {
    const file =
      process.env.VESTARA_SESSION_FILE ??
      path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'vestara', 'auth.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const payload = {
      endpoint: `http://127.0.0.1:${port}`,
      token: user.token,
      username: user.username,
      role: user.role,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  } catch {
    // Best-effort provisioning; explicit `vestara auth login` remains available.
  }
}

function requireExplicitAdmin(
  req: http.IncomingMessage,
  ctx: WorkspaceContext,
  res: http.ServerResponse,
): AuthUser | null {
  const authHeader = req.headers.authorization;
  const tokenMatch = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
  const authenticatedUser = tokenMatch ? ctx.users.findByToken(tokenMatch[1]) : undefined;
  if (!authenticatedUser) {
    json(res, 401, { error: 'Authentication is required.' });
    return null;
  }
  return requireRole(req, ctx, 'admin', res);
}

function mapRepresentationError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('already exists')) return ApiError.conflict('Human identity representation already exists.');
  if (message.includes('not active')) return ApiError.forbidden('HumanPrincipal is not active.');
  if (message.includes('not found')) return ApiError.notFound('Human identity representation was not found.');
  return ApiError.internal(undefined, error);
}

export async function handleAuthRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  port: number,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/auth/me') {
    const authHeader = req.headers.authorization;
    const tokenMatch = typeof authHeader === 'string' ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
    const token = tokenMatch?.[1];
    const fullUser = token ? ctx.users.findByToken(token) : undefined;
    const authUser = getActor(req, ctx);
    json(res, 200, {
      user: { id: authUser.id, name: authUser.name, role: authUser.role, type: authUser.type },
      currentUser: fullUser
        ? {
            id: fullUser.id,
            username: fullUser.username,
            role: fullUser.role,
            token: fullUser.token,
            createdAt: fullUser.createdAt,
          }
        : undefined,
      allUsers: ctx.users
        .listAll()
        .map((u) => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt })),
    });
    return true;
  }

  if (method === 'POST' && p === '/api/auth/login') {
    const body = await readJsonBody<{ username?: string; token?: string }>(req);
    const username = body.username?.trim();
    const token = body.token?.trim();
    if (token) {
      const user = ctx.users.findByToken(token);
      if (user) {
        logAudit(ctx.audit, req, user.id, user.username, AuditAction.LOGIN, 'user', user.id, 'Token login');
        json(res, 200, { user: { id: user.id, username: user.username, role: user.role, token: user.token } });
        if (isLoopback(req)) persistSessionFile(port, user);
      } else throw ApiError.unauthorized('Invalid token.');
    } else if (username) {
      const existing = ctx.users.listAll().find((u) => u.username === username);
      if (existing) {
        logAudit(
          ctx.audit,
          req,
          existing.id,
          existing.username,
          AuditAction.LOGIN,
          'user',
          existing.id,
          'Username login',
        );
        json(res, 200, {
          user: { id: existing.id, username: existing.username, role: existing.role, token: existing.token },
        });
        if (isLoopback(req)) persistSessionFile(port, existing);
      } else {
        const newUser = ctx.users.createUser(username, 'editor');
        logAudit(
          ctx.audit,
          req,
          newUser.id,
          newUser.username,
          AuditAction.LOGIN,
          'user',
          newUser.id,
          'New user registration',
        );
        json(res, 201, {
          user: { id: newUser.id, username: newUser.username, role: newUser.role, token: newUser.token },
        });
        if (isLoopback(req)) persistSessionFile(port, newUser);
      }
    } else throw ApiError.badRequest('Provide username or token.');
    return true;
  }

  if (method === 'POST' && p === '/api/admin/human-principals') {
    // Principal provisioning is an identity-admin operation. Unlike the
    // legacy local-operator fallback used by other routes, this boundary
    // requires an actual bearer token so it cannot be called anonymously.
    const authenticatedUser = requireExplicitAdmin(req, ctx, res);
    if (!authenticatedUser) return true;

    const body = await readJsonBody<Record<string, unknown>>(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw ApiError.badRequest('Request body must be an object.');
    }
    const supportedFields = new Set(['status']);
    const unsupportedField = Object.keys(body).find((key) => !supportedFields.has(key));
    if (unsupportedField) {
      throw ApiError.badRequest(`Unsupported HumanPrincipal field: ${unsupportedField}`);
    }

    const status = body.status === undefined ? 'active' : body.status;
    if (typeof status !== 'string' || !isHumanPrincipalStatus(status)) {
      throw ApiError.badRequest('status must be a valid HumanPrincipal status.');
    }

    const principal = await ctx.humanPrincipals.create({ status: status as HumanPrincipalStatus });
    logAudit(
      ctx.audit,
      req,
      authenticatedUser.id,
      authenticatedUser.name,
      AuditAction.HUMAN_PRINCIPAL_CREATE,
      'human-principal',
      principal.id,
    );
    json(res, 201, { principal });
    return true;
  }

  const representationMatch = p.match(/^\/api\/admin\/human-principals\/([^/]+)\/representation$/);
  if (representationMatch && (method === 'POST' || method === 'PUT')) {
    const authenticatedUser = requireExplicitAdmin(req, ctx, res);
    if (!authenticatedUser) return true;
    const principalId = decodeURIComponent(representationMatch[1]);
    const body = await readJsonBody<Record<string, unknown>>(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw ApiError.badRequest('Request body must be an object.');
    }
    const supportedFields = new Set(['preferredName', 'status']);
    const unsupportedField = Object.keys(body).find((key) => !supportedFields.has(key));
    if (unsupportedField) throw ApiError.badRequest(`Unsupported representation field: ${unsupportedField}`);
    if (typeof body.preferredName !== 'string' || !body.preferredName.trim()) {
      throw ApiError.badRequest('preferredName is required.');
    }
    const status = body.status === undefined ? 'active' : body.status;
    if (status !== 'active' && status !== 'unavailable') {
      throw ApiError.badRequest('status must be active or unavailable.');
    }
    let representation;
    try {
      representation =
        method === 'POST'
          ? await ctx.humanIdentityRepresentations.create(principalId, {
              preferredName: body.preferredName,
              status,
            })
          : await ctx.humanIdentityRepresentations.update(principalId, {
              preferredName: body.preferredName,
              status,
            });
    } catch (error) {
      throw mapRepresentationError(error);
    }
    logAudit(
      ctx.audit,
      req,
      authenticatedUser.id,
      authenticatedUser.name,
      method === 'POST'
        ? AuditAction.HUMAN_IDENTITY_REPRESENTATION_CREATE
        : AuditAction.HUMAN_IDENTITY_REPRESENTATION_UPDATE,
      'human-identity-representation',
      principalId,
    );
    json(res, method === 'POST' ? 201 : 200, { representation });
    return true;
  }

  if (method === 'GET' && representationMatch) {
    if (!requireExplicitAdmin(req, ctx, res)) return true;
    const principalId = decodeURIComponent(representationMatch[1]);
    const principal = await ctx.humanPrincipals.get(principalId);
    if (!principal) throw ApiError.notFound('HumanPrincipal was not found.');
    if (principal.status !== 'active') throw ApiError.forbidden('HumanPrincipal is not active.');
    const representation = await ctx.humanIdentityRepresentations.get(principalId);
    if (!representation) throw ApiError.notFound('Human identity representation was not found.');
    json(res, 200, { representation });
    return true;
  }

  if (method === 'GET' && p === '/api/admin/audit-log') {
    if (!requireRole(req, ctx, 'admin', res)) return true;
    const qs = new URL(req.url!, `http://127.0.0.1:${port}`).searchParams;
    const entries = ctx.audit.query({
      limit: qs.get('limit') ? parseInt(qs.get('limit')!, 10) : 100,
      offset: qs.get('offset') ? parseInt(qs.get('offset')!, 10) : undefined,
      userId: qs.get('userId') || undefined,
      action: qs.get('action') || undefined,
      resource: qs.get('resource') || undefined,
      since: qs.get('since') || undefined,
      until: qs.get('until') || undefined,
    });
    json(res, 200, { entries, total: ctx.audit.count() });
    return true;
  }

  if (method === 'GET' && p === '/api/admin/users') {
    if (!requireRole(req, ctx, 'admin', res)) return true;
    json(res, 200, {
      users: ctx.users.listAll().map((u) => ({ id: u.id, username: u.username, role: u.role, createdAt: u.createdAt })),
    });
    return true;
  }

  if (method === 'POST' && p === '/api/admin/users') {
    if (!requireRole(req, ctx, 'admin', res)) return true;
    const actor = getActor(req, ctx);
    const body = await readJsonBody<{ username?: string; role?: string }>(req);
    if (!body.username?.trim()) throw ApiError.badRequest('username is required.');
    const role = body.role === 'admin' || body.role === 'editor' || body.role === 'viewer' ? body.role : 'editor';
    const user = ctx.users.createUser(body.username.trim(), role);
    logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.USER_CREATE, 'user', user.id, user.username);
    json(res, 201, {
      user: { id: user.id, username: user.username, role: user.role, token: user.token, createdAt: user.createdAt },
    });
    return true;
  }

  const rotateMatch = p.match(/^\/api\/admin\/users\/([^/]+)\/rotate-token$/);
  if (method === 'POST' && rotateMatch) {
    if (!requireRole(req, ctx, 'admin', res)) return true;
    const actor = getActor(req, ctx);
    const userId = decodeURIComponent(rotateMatch[1]);
    const newToken = ctx.users.rotateToken(userId);
    if (newToken) {
      logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.USER_ROTATE_TOKEN, 'user', userId);
      json(res, 200, { token: newToken });
    } else throw ApiError.notFound('User not found.');
    return true;
  }

  return false;
}
