import * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { AuditAction, logAudit } from '../audit-log';
import { requireRole } from '../auth';
import { json, readBody, getActor, actorOf } from './types';

export async function handleAgentsRoute(method: string, p: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: WorkspaceContext): Promise<boolean> {
  if (method === 'GET' && p === '/api/agents') {
    try {
      const agents = await ctx.agents.listAgents();
      const enriched = await Promise.all(agents.map(async (a) => ({ ...a, stats: await ctx.agentService.getAgentStats(a.id).catch(() => ({ total: 0, completed: 0, failed: 0, running: 0, successRate: 0 })) })));
      json(res, 200, { agents: enriched, executions: await ctx.agents.listExecutions() });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  if (method === 'POST' && p === '/api/agents') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    try {
      const raw = await readBody(req); const body = raw ? JSON.parse(raw) : {};
      const actor = getActor(req, ctx);
      if (!body.name?.trim()) { json(res, 400, { error: 'name is required' }); return true; }
      const now = new Date().toISOString();
      const agent: any = { id: body.id || `agent-${Date.now()}`, name: body.name.trim(), role: body.role || 'custom', description: body.description || '', capabilities: body.capabilities || ([] as any[]), permissions: body.permissions || ([{ resource: 'repository', action: 'read', approvalRequired: false }, { resource: 'knowledge', action: 'read', approvalRequired: false }] as any[]), provider: body.provider || '', model: body.model || '', teamId: body.teamId || '', color: body.color || '#6b7280', status: 'active', createdAt: now };
      await ctx.agents.saveAgent(agent);
      logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.AGENT_CREATE, 'agent', agent.id, agent.name);
      json(res, 201, { agent });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  const agentMatch = p.match(/^\/api\/agents\/([^/]+)$/);
  if (method === 'GET' && agentMatch) {
    try {
      const id = decodeURIComponent(agentMatch[1]);
      const agent = await ctx.agents.getAgent(id);
      if (!agent) { json(res, 404, { error: 'agent not found' }); return true; }
      const executions = await ctx.agents.listExecutions(id);
      const stats = await ctx.agentService.getAgentStats(id).catch(() => ({ total: 0, completed: 0, failed: 0, running: 0, successRate: 0 }));
      const allTeams = await ctx.agents.listTeams();
      const team = allTeams.find((t: any) => t.memberIds.includes(id) || t.id === agent.teamId);
      json(res, 200, { agent, executions, stats, team });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  if (method === 'PUT' && agentMatch) {
    try {
      const id = decodeURIComponent(agentMatch[1]);
      const raw = await readBody(req); const body = raw ? JSON.parse(raw) : {};
      const existing = await ctx.agents.getAgent(id);
      if (!existing) { json(res, 404, { error: 'agent not found' }); return true; }
      if (body.name !== undefined && typeof body.name === 'string' && !body.name.trim()) { json(res, 400, { error: 'Agent name must not be empty' }); return true; }
      const cleanBody = Object.fromEntries(Object.entries(body).filter(([_, v]) => v !== undefined && v !== null));
      await ctx.agents.saveAgent({ ...existing, ...cleanBody, id, createdAt: existing.createdAt, capabilities: (cleanBody.capabilities ?? existing.capabilities) as any, permissions: (cleanBody.permissions ?? existing.permissions) as any });
      json(res, 200, { agent: { ...existing, ...cleanBody, id } });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  if (method === 'DELETE' && agentMatch) {
    try { const id = decodeURIComponent(agentMatch[1]); await ctx.agents.deleteAgent(id); json(res, 200, { deleted: true }); }
    catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  if (method === 'GET' && p === '/api/capabilities') {
    try { json(res, 200, { capabilities: ctx.agentService.listCapabilities() }); }
    catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  const agentStatsMatch = p.match(/^\/api\/agents\/([^/]+)\/stats$/);
  if (method === 'GET' && agentStatsMatch) {
    try { const id = decodeURIComponent(agentStatsMatch[1]); json(res, 200, { stats: await ctx.agentService.getAgentStats(id) }); }
    catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  const runAgentMatch = p.match(/^\/api\/agents\/([^/]+)\/run$/);
  if (method === 'POST' && runAgentMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const actor = getActor(req, ctx);
    try {
      const agentId = decodeURIComponent(runAgentMatch[1]);
      const raw = await readBody(req); const body = raw ? JSON.parse(raw) : {};
      if (!body.task?.trim()) { json(res, 400, { error: 'task is required' }); return true; }
      const result = await ctx.agentService.runAgent(agentId, body.task.trim(), ctx.runtime.getSession());
      if (!result.success) { json(res, 400, { error: result.message }); return true; }
      logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.AGENT_RUN, 'agent', agentId, body.task.slice(0, 200));
      json(res, 200, { execution: result.execution, agent: result.agent, message: result.message });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  const memMatch = p.match(/^\/api\/agents\/([^/]+)\/memory$/);
  if (method === 'GET' && memMatch) {
    try { const agentId = decodeURIComponent(memMatch[1]); json(res, 200, { memories: req.url?.includes('q=') ? await ctx.agents.searchMemory(agentId, new URL(req.url!, 'http://x').searchParams.get('q') ?? '') : await ctx.agents.listMemory(agentId) }); }
    catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  if (method === 'POST' && memMatch) {
    try {
      const agentId = decodeURIComponent(memMatch[1]);
      const raw = await readBody(req); const body = raw ? JSON.parse(raw) : {};
      const entry = { id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, agentId, type: body.type || 'observation', summary: body.summary || '', detail: body.detail || '', tags: body.tags || [], confidence: body.confidence ?? 0.5, createdAt: new Date().toISOString() };
      await ctx.agents.saveMemory(entry);
      json(res, 201, { entry });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  return false;
}
