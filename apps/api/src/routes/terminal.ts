/**
 * GA-TERM-001 Phase 3 — terminal session REST surface.
 *
 * Thin adapter over `ctx.terminalSessions` (the single registry authority):
 * list / create / kill sessions. Streaming itself lives on `/ws/terminal`
 * (wired in `server.ts`); audit of session lifecycle reaches the event bus
 * via the registry's lifecycle events (bridged in `workspace-context.ts`).
 */

import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

function requireRegistry(ctx: WorkspaceContext) {
  const registry = ctx.terminalSessions;
  if (!registry) throw Object.assign(new Error('Terminal sessions unavailable'), { statusCode: 503 });
  return registry;
}

export async function handleTerminalRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/terminal/sessions') {
    json(res, 200, { sessions: requireRegistry(ctx).list() });
    return true;
  }

  if (method === 'POST' && p === '/api/terminal/sessions') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const cwd = typeof body.cwd === 'string' ? body.cwd : undefined;
    const cols = typeof body.cols === 'number' ? body.cols : undefined;
    const rows = typeof body.rows === 'number' ? body.rows : undefined;
    try {
      const session = requireRegistry(ctx).create({
        ...(cwd ? { cwd } : {}),
        ...(cols ? { cols } : {}),
        ...(rows ? { rows } : {}),
      });
      json(res, 201, { session });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'Create failed' });
    }
    return true;
  }

  const killMatch = p.match(/^\/api\/terminal\/sessions\/([^/]+)$/);
  if (method === 'DELETE' && killMatch) {
    const id = decodeURIComponent(killMatch[1] as string);
    const killed = await requireRegistry(ctx).kill(id, 'client');
    if (!killed) {
      json(res, 404, { error: 'Unknown terminal session' });
      return true;
    }
    json(res, 200, { ok: true, id });
    return true;
  }

  return false;
}
