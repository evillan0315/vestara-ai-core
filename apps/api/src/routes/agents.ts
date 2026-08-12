import type * as http from 'node:http';
import { AuditAction, logAudit } from '../audit-log';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { getActor, json, readBody } from './types';

/**
 * Annotate Vestara-governed workspace agents with their OpenCode runtime twin.
 *
 * Vestara is the single source of truth for agents. The OpenCode runtime is a
 * rendering/execution target only — it never introduces agents of its own. Each
 * stored agent is matched to its native twin by `runtimeAgent` (or `role`) and
 * annotated, but any runtime agent without a Vestara counterpart is ignored.
 * Returns `null` when the runtime is unreachable so callers fall back to the
 * stored catalog unchanged.
 */
async function runtimeSyncedAgents(ctx: WorkspaceContext, stored: any[]): Promise<any[] | null> {
  let runtimeAgents: Array<{ name: string; description?: string; mode?: string; native?: boolean }>;
  try {
    runtimeAgents = await ctx.opencodeRuntime.listAgents();
  } catch {
    return null;
  }
  if (!runtimeAgents.length) return stored;
  const runtimeByName = new Map(runtimeAgents.map((agent) => [agent.name, agent]));
  return stored.map((agent) => {
    const twin =
      (typeof agent.runtimeAgent === 'string' && runtimeByName.get(agent.runtimeAgent)) ||
      (typeof agent.role === 'string' && runtimeByName.get(agent.role));
    return {
      ...agent,
      source: 'workspace',
      ...(twin ? { runtimeAgent: agent.runtimeAgent ?? twin.name } : {}),
    };
  });
}

export async function handleAgentsRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/agents') {
    try {
      const stored = await ctx.agents.listAgents();
      const synced = await runtimeSyncedAgents(ctx, stored);
      const merged = synced ?? stored;
      const enriched = await Promise.all(
        merged.map(async (a) => ({
          ...a,
          stats: await ctx.agentService
            .getAgentStats(String(a.id))
            .catch(() => ({ total: 0, completed: 0, failed: 0, running: 0, successRate: 0 })),
        })),
      );
      json(res, 200, {
        agents: enriched,
        executions: await ctx.agents.listExecutions(),
        runtime: { reachable: synced !== null },
      });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  if (method === 'POST' && p === '/api/agents') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const actor = getActor(req, ctx);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        json(res, 400, { error: 'name is required' });
        return true;
      }
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const stored = await ctx.agents.listAgents();
      const normalizedId = id || `agent-${Date.now()}`;
      if (stored.some((agent: any) => agent.id === normalizedId)) {
        json(res, 409, { error: `Agent id already exists: ${normalizedId}` });
        return true;
      }
      const now = new Date().toISOString();
      const agent: any = {
        id: normalizedId,
        name,
        role: body.role || 'custom',
        agentType: body.agentType || 'workspace',
        description: typeof body.description === 'string' ? body.description : '',
        capabilities: body.capabilities || ([] as any[]),
        permissions:
          body.permissions ||
          ([
            { resource: 'repository', action: 'read', approvalRequired: false },
            { resource: 'knowledge', action: 'read', approvalRequired: false },
          ] as any[]),
        provider: body.provider || '',
        model: body.model || '',
        runtimeAgent: body.runtimeAgent || '',
        teamId: body.teamId || '',
        color: body.color || '#6b7280',
        status: 'active',
        createdAt: now,
      };
      await ctx.agents.saveAgent(agent);
      logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.AGENT_CREATE, 'agent', agent.id, agent.name);
      json(res, 201, { agent });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  const agentMatch = p.match(/^\/api\/agents\/([^/]+)$/);
  if (method === 'GET' && agentMatch) {
    try {
      const id = decodeURIComponent(agentMatch[1]);
      let agent = await ctx.agents.getAgent(id);
      if (!agent) {
        const synced = await runtimeSyncedAgents(ctx, await ctx.agents.listAgents());
        const match = synced?.find((candidate) => candidate.id === id);
        if (match) agent = match as unknown as Awaited<ReturnType<WorkspaceContext['agents']['getAgent']>>;
      }
      if (!agent) {
        json(res, 404, { error: 'agent not found' });
        return true;
      }
      const executions = await ctx.agents.listExecutions(id);
      const stats = await ctx.agentService
        .getAgentStats(id)
        .catch(() => ({ total: 0, completed: 0, failed: 0, running: 0, successRate: 0 }));
      const allTeams = await ctx.agents.listTeams();
      const team = allTeams.find((t: any) => t.memberIds.includes(id) || t.id === agent.teamId);
      json(res, 200, { agent, executions, stats, team });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  if (method === 'PUT' && agentMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    try {
      const id = decodeURIComponent(agentMatch[1]);
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const actor = getActor(req, ctx);
      const existing = await ctx.agents.getAgent(id);
      if (!existing) {
        json(res, 404, { error: 'agent not found' });
        return true;
      }
      if (body.name !== undefined && typeof body.name === 'string' && !body.name.trim()) {
        json(res, 400, { error: 'Agent name must not be empty' });
        return true;
      }
      const cleanBody = Object.fromEntries(Object.entries(body).filter(([_, v]) => v !== undefined && v !== null));
      if (typeof cleanBody.name === 'string') cleanBody.name = cleanBody.name.trim();
      await ctx.agents.saveAgent({
        ...existing,
        ...cleanBody,
        id,
        createdAt: existing.createdAt,
        capabilities: (cleanBody.capabilities ?? existing.capabilities) as any,
        permissions: (cleanBody.permissions ?? existing.permissions) as any,
      });
      logAudit(
        ctx.audit,
        req,
        actor.id,
        actor.name,
        AuditAction.AGENT_UPDATE,
        'agent',
        id,
        JSON.stringify({ changed: Object.keys(cleanBody) }),
      );
      json(res, 200, { agent: { ...existing, ...cleanBody, id } });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  if (method === 'DELETE' && agentMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    try {
      const id = decodeURIComponent(agentMatch[1]);
      const actor = getActor(req, ctx);
      const existing = await ctx.agents.getAgent(id);
      await ctx.agents.deleteAgent(id);
      logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.AGENT_DELETE, 'agent', id, existing?.name);
      json(res, 200, { deleted: true });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  if (method === 'GET' && p === '/api/capabilities') {
    try {
      json(res, 200, { capabilities: ctx.agentService.listCapabilities() });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  const agentStatsMatch = p.match(/^\/api\/agents\/([^/]+)\/stats$/);
  if (method === 'GET' && agentStatsMatch) {
    try {
      const id = decodeURIComponent(agentStatsMatch[1]);
      json(res, 200, { stats: await ctx.agentService.getAgentStats(id) });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  const runAgentMatch = p.match(/^\/api\/agents\/([^/]+)\/run$/);
  if (method === 'POST' && runAgentMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const actor = getActor(req, ctx);
    try {
      const agentId = decodeURIComponent(runAgentMatch[1]);
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (!body.task?.trim()) {
        json(res, 400, { error: 'task is required' });
        return true;
      }
      const result = await ctx.agentService.runAgent(agentId, body.task.trim(), ctx.runtime.getSession());
      if (!result.success) {
        json(res, 400, { error: result.message });
        return true;
      }
      logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.AGENT_RUN, 'agent', agentId, body.task.slice(0, 200));
      json(res, 200, {
        execution: result.execution,
        agent: result.agent,
        message: result.message,
        // The harness executes agents through the OpenCode runtime.
        runtime: { engine: 'opencode-runtime' },
      });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  const capExecMatch = p.match(/^\/api\/agents\/([^/]+)\/capabilities$/);
  if (method === 'POST' && capExecMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const actor = getActor(req, ctx);
    try {
      const agentId = decodeURIComponent(capExecMatch[1]);
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (!body.capability) {
        json(res, 400, { error: 'capability is required' });
        return true;
      }
      const result = await ctx.agentRuntime.executeCapability(
        agentId,
        body.capability,
        body.input ?? {},
        ctx.runtime.getSession(),
      );
      logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.AGENT_RUN, 'capability', agentId, body.capability);
      json(res, result.result.ok ? 200 : 400, {
        capability: result.capability,
        ok: result.result.ok,
        data: result.result.data,
        observation: result.result.observation,
        error: result.result.error,
        approvalId: result.result.approvalId,
      });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  const memMatch = p.match(/^\/api\/agents\/([^/]+)\/memory$/);
  if (method === 'GET' && memMatch) {
    try {
      const agentId = decodeURIComponent(memMatch[1]);
      json(res, 200, {
        memories: req.url?.includes('q=')
          ? await ctx.agents.searchMemory(agentId, new URL(req.url!, 'http://x').searchParams.get('q') ?? '')
          : await ctx.agents.listMemory(agentId),
      });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  if (method === 'POST' && memMatch) {
    try {
      const agentId = decodeURIComponent(memMatch[1]);
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const entry = {
        id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        agentId,
        type: body.type || 'observation',
        summary: body.summary || '',
        detail: body.detail || '',
        tags: body.tags || [],
        confidence: body.confidence ?? 0.5,
        createdAt: new Date().toISOString(),
      };
      await ctx.agents.saveMemory(entry);
      json(res, 201, { entry });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  return false;
}
