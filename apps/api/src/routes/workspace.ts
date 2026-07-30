import * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { AuditAction, logAudit } from '../audit-log';
import { requireRole } from '../auth';
import { getActor } from './types';
import { json, readBody } from './types';

export async function handleWorkspaceRoute(method: string, p: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: WorkspaceContext): Promise<boolean> {
  if (method === 'GET' && p === '/api/workspace') {
    const ws = ctx.runtime.currentWorkspace; const session = ctx.runtime.getSession();
    json(res, 200, { status: ctx.runtime.currentStatus, fingerprint: session.fingerprint, profile: session.profile, presentation: ws.presentation });
    return true;
  }

  if (method === 'GET' && p === '/api/understanding') {
    const u = ctx.runtime.getSession().understanding;
    if (!u) { json(res, 503, { error: 'Understanding not yet available', understanding: null }); return true; }
    json(res, 200, u);
    return true;
  }

  if (method === 'GET' && p === '/api/settings') {
    try {
      let prefs: any; try { prefs = ctx.runtime.getSession()?.prefs; } catch {}
      json(res, 200, { settings: prefs ? prefs.getAll() : { provider: 'opencode', model: 'deepseek-v4-flash-free', autoIndex: 'true', verifyOnImplement: 'true', showWelcomeTour: 'true' } });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  if (method === 'PUT' && p === '/api/settings') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const raw = await readBody(req); const body = raw ? JSON.parse(raw) : {}; const actor = getActor(req, ctx);
    try {
      const session = ctx.runtime.getSession();
      if (session?.prefs) { for (const [key, value] of Object.entries(body)) { if (typeof value === 'string') session.prefs.set(key, value); } json(res, 200, { saved: true, settings: session.prefs.getAll() }); }
      else json(res, 200, { saved: true, note: 'No active session — changes will not persist' });
    } catch { json(res, 200, { saved: true, note: 'No active session — changes will not persist' }); }
    logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.SETTINGS_UPDATE, 'settings', undefined, JSON.stringify(Object.keys(body)));
    return true;
  }

  if (method === 'DELETE' && p === '/api/settings') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    try {
      const session = ctx.runtime.getSession();
      if (session?.prefs) { const all = session.prefs.getAll(); for (const key of Object.keys(all)) session.prefs.reset(key); json(res, 200, { reset: true, settings: session.prefs.getAll() }); }
      else json(res, 200, { reset: true, note: 'No active session' });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  if (method === 'POST' && p === '/api/workspace-ui/test-build' || (method === 'POST' || method === 'GET') && p === '/api/workspace-ui/test-build') {
    if (!ctx.runtime) { json(res, 503, { error: 'Workspace runtime not available' }); return true; }
    try { const session = ctx.runtime.getSession(); const result = await ctx.agentRuntime.run('agent-workspace-ui-tester', 'Run test + build for workspace-ui', session); json(res, 200, { result: { status: result.execution.status, message: result.message, artifacts: result.execution.outputArtifacts } }); }
    catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  return false;
}
