import * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

export async function handleTeamsRoute(method: string, p: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: WorkspaceContext): Promise<boolean> {
  if (method === 'GET' && p === '/api/teams') {
    try {
      const teams = await ctx.agents.listTeams();
      const enriched = await Promise.all(teams.map(async (team) => {
        const allAgents = await ctx.agents.listAgents();
        const members = allAgents.filter((a) => team.memberIds.includes(a.id) || a.teamId === team.id);
        const leader = allAgents.find((a) => a.id === team.leaderAgentId);
        const memberExecs = await Promise.all(members.map((m) => ctx.agentService.getAgentStats(m.id).catch(() => ({ total: 0, completed: 0, failed: 0, running: 0, successRate: 0 }))));
        return { ...team, members, leader, stats: { totalExecutions: memberExecs.reduce((s, st) => s + st.total, 0), failedExecutions: memberExecs.reduce((s, st) => s + st.failed, 0), memberCount: members.length } };
      }));
      json(res, 200, { teams: enriched });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  const teamMatch = p.match(/^\/api\/teams\/([^/]+)$/);
  if (method === 'GET' && teamMatch) {
    try {
      const id = decodeURIComponent(teamMatch[1]);
      const team = await ctx.agents.getTeam(id);
      if (!team) { json(res, 404, { error: 'team not found' }); return true; }
      const allAgents = await ctx.agents.listAgents();
      const members = allAgents.filter((a) => team.memberIds.includes(a.id) || a.teamId === team.id);
      const leader = allAgents.find((a) => a.id === team.leaderAgentId);
      const unassigned = allAgents.filter((a) => a.status === 'active' && !team.memberIds.includes(a.id) && a.teamId !== team.id && a.id !== team.leaderAgentId);
      json(res, 200, { team, members, leader, unassigned });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  if (method === 'POST' && p === '/api/teams') {
    try {
      const raw = await readBody(req); const body = raw ? JSON.parse(raw) : {};
      if (!body.name?.trim()) { json(res, 400, { error: 'Team name is required' }); return true; }
      const now = new Date().toISOString(); const id = body.id || `team-${Date.now()}`;
      const team: any = { id, name: body.name.trim(), description: body.description || '', leaderAgentId: body.leaderAgentId || '', memberIds: body.memberIds || [], sharedContext: body.sharedContext || '', activeWorkflowId: body.activeWorkflowId || '', createdAt: now };
      await ctx.agents.saveTeam(team);
      for (const memberId of team.memberIds) { const agent = await ctx.agents.getAgent(memberId); if (agent) { agent.teamId = team.id; await ctx.agents.saveAgent(agent); } }
      json(res, 201, { team });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  if (method === 'PUT' && teamMatch) {
    try { const id = decodeURIComponent(teamMatch[1]); const raw = await readBody(req); const body = raw ? JSON.parse(raw) : {}; const existing = await ctx.agents.getTeam(id); if (!existing) { json(res, 404, { error: 'team not found' }); return true; } await ctx.agents.saveTeam({ ...existing, ...body, id }); json(res, 200, { team: { ...existing, ...body, id } }); }
    catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  const teamMembersMatch = p.match(/^\/api\/teams\/([^/]+)\/members$/);
  if (method === 'POST' && teamMembersMatch) {
    try { const id = decodeURIComponent(teamMembersMatch[1]); const raw = await readBody(req); const body = raw ? JSON.parse(raw) : {}; const team = await ctx.agents.getTeam(id); if (!team) { json(res, 404, { error: 'team not found' }); return true; }
      if (body.add) { for (const agentId of body.add) { if (!team.memberIds.includes(agentId)) team.memberIds.push(agentId); const agent = await ctx.agents.getAgent(agentId); if (agent) { agent.teamId = team.id; await ctx.agents.saveAgent(agent); } } }
      if (body.remove) { team.memberIds = team.memberIds.filter((mid) => !body.remove.includes(mid)); for (const agentId of body.remove) { const agent = await ctx.agents.getAgent(agentId); if (agent) { agent.teamId = ''; await ctx.agents.saveAgent(agent); } } }
      if (body.leaderAgentId) team.leaderAgentId = body.leaderAgentId; await ctx.agents.saveTeam(team); json(res, 200, { team });
    } catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  if (method === 'DELETE' && teamMatch) {
    try { const id = decodeURIComponent(teamMatch[1]); const team = await ctx.agents.getTeam(id); if (team) { for (const memberId of team.memberIds) { const agent = await ctx.agents.getAgent(memberId); if (agent) { agent.teamId = ''; await ctx.agents.saveAgent(agent); } } } await ctx.agents.deleteTeam(id); json(res, 200, { deleted: true }); }
    catch (err: any) { json(res, 500, { error: err.message }); }
    return true;
  }

  return false;
}
