import type * as http from 'node:http';
import type { WebSocket } from 'ws';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

export async function handleMiscRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
  _url: URL,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/health') {
    json(res, 200, {
      status: 'ok',
      repoPath: ctx.repoPath,
      workspaceDir: ctx.workspaceDir,
      workspaceStatus: ctx.runtime.currentStatus,
      time: new Date().toISOString(),
    });
    return true;
  }

  if (method === 'GET' && p === '/api/routes') {
    json(res, 200, {
      routes: [
        { path: '/api/health', method: 'GET', description: 'System health', requiresAuth: false },
        { path: '/api/routes', method: 'GET', description: 'List all routes', requiresAuth: false },
        { path: '/api/auth/me', method: 'GET', description: 'Current user info', requiresAuth: false },
        { path: '/api/auth/login', method: 'POST', description: 'Login', requiresAuth: false },
        { path: '/api/admin/users', method: 'GET', description: 'List users (admin)', requiresAuth: true },
        { path: '/api/admin/users', method: 'POST', description: 'Create user (admin)', requiresAuth: true },
        { path: '/api/admin/audit-log', method: 'GET', description: 'Audit log (admin)', requiresAuth: true },
        { path: '/api/workspace', method: 'GET', description: 'Workspace state', requiresAuth: false },
        { path: '/api/understanding', method: 'GET', description: 'Workspace understanding', requiresAuth: false },
        { path: '/api/settings', method: 'GET', description: 'Settings', requiresAuth: true },
        { path: '/api/settings', method: 'PUT', description: 'Update settings', requiresAuth: true },
        { path: '/api/settings', method: 'DELETE', description: 'Reset settings', requiresAuth: true },
        { path: '/api/sessions', method: 'GET', description: 'Sessions list', requiresAuth: true },
        { path: '/api/sessions', method: 'POST', description: 'Create session', requiresAuth: true },
        { path: '/api/agents', method: 'GET', description: 'List agents', requiresAuth: true },
        { path: '/api/agents', method: 'POST', description: 'Create agent', requiresAuth: true },
        { path: '/api/teams', method: 'GET', description: 'List teams', requiresAuth: true },
        { path: '/api/teams', method: 'POST', description: 'Create team', requiresAuth: true },
        { path: '/api/schedules', method: 'GET', description: 'List schedules', requiresAuth: true },
        { path: '/api/schedules', method: 'POST', description: 'Create schedule', requiresAuth: true },
        { path: '/api/milestones', method: 'GET', description: 'Milestones', requiresAuth: false },
        { path: '/api/milestones', method: 'PUT', description: 'Update milestone', requiresAuth: true },
        { path: '/api/plans', method: 'GET', description: 'List plans', requiresAuth: true },
        { path: '/api/plans', method: 'POST', description: 'Create plan', requiresAuth: true },
        { path: '/api/projects', method: 'GET', description: 'List projects', requiresAuth: true },
        { path: '/api/projects', method: 'POST', description: 'Create project', requiresAuth: true },
        { path: '/api/sprints', method: 'GET', description: 'Sprints list', requiresAuth: true },
        { path: '/api/conversations', method: 'POST', description: 'Create conversation', requiresAuth: false },
        { path: '/api/conversations', method: 'GET', description: 'List conversations', requiresAuth: false },
        { path: '/api/conversations/:id', method: 'GET', description: 'Get conversation history', requiresAuth: false },
        {
          path: '/api/conversations/:id/stream',
          method: 'POST',
          description: 'Stream a message into a conversation',
          requiresAuth: false,
        },
      ],
    });
    return true;
  }

  if (method === 'POST' && p === '/api/explain') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const target = body.target?.trim();
    if (!target) {
      json(res, 400, { error: 'target is required' });
      return true;
    }
    json(res, 200, await ctx.explainService.explain(target, ctx.runtime.getSession()));
    return true;
  }

  if (method === 'GET' && p === '/api/models') {
    const provider = ctx.kernel.providerManager?.getProvider('opencode') ?? null;
    json(res, 200, { models: provider ? await (provider as any).listModels() : [] });
    return true;
  }

  if (method === 'POST' && p === '/api/analyze-feature') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (!body.feature?.trim()) {
      json(res, 400, { error: 'feature is required' });
      return true;
    }
    json(res, 200, { analysis: await ctx.suggestionService.featureAnalysis(body.feature, ctx.runtime.getSession()) });
    return true;
  }

  if (method === 'POST' && p === '/api/analyze-workspace') {
    try {
      json(res, 200, { analysis: await ctx.workspaceAnalyst.analyze(ctx.runtime.getSession()) });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  if (method === 'POST' && p === '/api/repl/execute') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const command = body.command?.trim();
    if (!command) {
      json(res, 400, { error: 'command is required' });
      return true;
    }
    const lines: string[] = [];
    const _fakeWs = {
      send: (s: string) => {
        try {
          const m = JSON.parse(s);
          if (m.op === 'output') lines.push(m.text);
        } catch {}
      },
    } as WebSocket;
    json(res, 200, { output: lines.join('\n') });
    return true;
  }

  if (method === 'GET' && p === '/api/suggestions') {
    const session = ctx.runtime.getSession();
    const excludeDismissed = req.url?.includes('excludeDismissed=true');
    json(res, 200, { suggestions: await ctx.suggestionService.generate(session, { excludeDismissed }) });
    return true;
  }

  const acceptMatch = p.match(/^\/api\/suggestions\/([^/]+)\/accept$/);
  if (method === 'POST' && acceptMatch) {
    const suggestionId = decodeURIComponent(acceptMatch[1]);
    await ctx.suggestionService.trackAction(suggestionId, 'accepted');
    const suggestions = await ctx.suggestionService.generate(ctx.runtime.getSession());
    const suggestion = suggestions.find((s) => s.id === suggestionId);
    if (!suggestion) {
      json(res, 404, { error: 'suggestion not found' });
      return true;
    }
    json(res, 200, {
      plan: (await ctx.planningService.createPlan(suggestion.title, ctx.runtime.getSession())).plan,
      suggestion: suggestion.id,
    });
    return true;
  }

  const dismissMatch = p.match(/^\/api\/suggestions\/([^/]+)\/dismiss$/);
  if (method === 'POST' && dismissMatch) {
    const suggestionId = decodeURIComponent(dismissMatch[1]);
    await ctx.suggestionService.dismiss(suggestionId);
    await ctx.suggestionService.trackAction(suggestionId, 'dismissed');
    json(res, 200, { dismissed: true });
    return true;
  }

  if (method === 'POST' && p === '/api/stt') {
    const raw = await readBody(req);
    const sizeKb = raw ? (Buffer.byteLength(raw) / 1024).toFixed(1) : '0';
    json(res, 200, { text: `[Transcribed audio ${sizeKb}kb]` });
    return true;
  }

  return false;
}
