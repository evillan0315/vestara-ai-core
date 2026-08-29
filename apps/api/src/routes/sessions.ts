import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

export async function handleSessionsRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/sessions') {
    json(res, 200, { sessions: await ctx.sessions.listSessions() });
    return true;
  }

  if (method === 'POST' && p === '/api/sessions') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const title = body.title?.trim() || 'Untitled session';
    const session = await ctx.sessions.createSession(title, body.objective?.trim() || title);
    json(res, 201, { session });
    return true;
  }

  if (method === 'GET' && p === '/api/sessions/executions') {
    try {
      json(res, 200, { sessions: await ctx.agents.listExecutionSessions() });
    } catch {
      json(res, 200, { sessions: [] });
    }
    return true;
  }

  const sessionMatch = p.match(/^\/api\/sessions\/([^/]+)$/);
  if (method === 'GET' && sessionMatch) {
    const id = decodeURIComponent(sessionMatch[1]);
    const session = await ctx.sessions.getSession(id);
    if (!session) {
      json(res, 404, { error: 'session not found' });
      return true;
    }
    json(res, 200, { session, events: await ctx.sessions.getEvents(id) });
    return true;
  }

  if (method === 'POST' && p === '/api/sessions/executions') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const now = new Date().toISOString();
    const session = {
      id: `exs-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
      goal: body.goal || '',
      workflowId: body.workflowId,
      assignedAgentIds: body.assignedAgentIds || [],
      planIds: [],
      changeSetIds: [],
      verificationIds: [],
      logs: [],
      timeline: [],
      approvals: [],
      metrics: { duration: 0, totalSteps: 0, completedSteps: 0, artifactCount: 0 },
      status: 'queued' as const,
      createdAt: now,
    };
    await ctx.agents.saveExecutionSession(session);
    json(res, 201, { session });
    return true;
  }

  const exsMatch = p.match(/^\/api\/sessions\/executions\/([^/]+)$/);
  if (method === 'GET' && exsMatch) {
    const id = decodeURIComponent(exsMatch[1]);
    const session = await ctx.agents.getExecutionSession(id);
    if (!session) {
      json(res, 404, { error: 'execution session not found' });
      return true;
    }
    json(res, 200, { session });
    return true;
  }

  if (method === 'PATCH' && exsMatch) {
    const id = decodeURIComponent(exsMatch[1]);
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (body.status) await ctx.agents.updateExecutionSessionStatus(id, body.status);
    if (body.timeline) await ctx.agents.updateExecutionSessionTimeline(id, body.timeline);
    json(res, 200, { session: await ctx.agents.getExecutionSession(id) });
    return true;
  }

  if (method === 'GET' && p === '/api/workflows') {
    json(res, 200, { workflows: ctx.orchestrator.listWorkflows() });
    return true;
  }

  if (method === 'POST' && p === '/api/sessions/executions/start') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (!body.goal || !body.workflow) {
      json(res, 400, { error: 'goal and workflow are required' });
      return true;
    }
    try {
      json(res, 201, {
        session: await ctx.orchestrator.startSession(body.goal, body.workflow, ctx.runtime.getSession()),
      });
    } catch (err: any) {
      json(res, 400, { error: err.message });
    }
    return true;
  }

  if (method === 'POST' && p === '/api/background/run') {
    try {
      await ctx.orchestrator.runBackgroundServices(ctx.runtime.getSession());
      json(res, 200, { ok: true });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  return false;
}
