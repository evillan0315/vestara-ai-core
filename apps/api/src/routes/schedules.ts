import type * as http from 'node:http';
import { AuditAction, logAudit } from '../audit-log';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { getActor, json, readBody } from './types';

export async function handleSchedulesRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/schedules') {
    try {
      json(res, 200, {
        schedules: await ctx.agents.listSchedules(),
        due: await ctx.agents.getDueSchedules().catch(() => []),
      });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  if (method === 'POST' && p === '/api/schedules') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const actor = getActor(req, ctx);
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const id = body.id || `sched-${Date.now()}`;
      const nextRun =
        body.nextRunAt ||
        (body.frequency === 'hourly'
          ? new Date(Date.now() + 3600000).toISOString()
          : new Date(Date.now() + 86400000).toISOString());
      await ctx.agents.saveSchedule({
        id,
        agentId: body.agentId,
        task: body.task,
        frequency: body.frequency || 'once',
        cronExpression: body.cronExpression,
        nextRunAt: nextRun,
        enabled: true,
        createdAt: new Date().toISOString(),
      });
      logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.SCHEDULE_CREATE, 'schedule', id, body.task);
      json(res, 201, {
        schedule: {
          id,
          agentId: body.agentId,
          task: body.task,
          frequency: body.frequency || 'once',
          nextRunAt: nextRun,
          enabled: true,
        },
      });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  const schedMatch = p.match(/^\/api\/schedules\/([^/]+)$/);
  if (method === 'DELETE' && schedMatch) {
    if (!requireRole(req, ctx, 'admin', res)) return true;
    try {
      const id = decodeURIComponent(schedMatch[1]);
      await ctx.agents.deleteSchedule(id);
      json(res, 200, { deleted: true });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  if (method === 'POST' && p === '/api/schedules/run-due') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    try {
      const due = await ctx.agents.getDueSchedules();
      const results: any[] = [];
      for (const s of due) {
        try {
          await ctx.agentRuntime.run(s.agentId, s.task, ctx.runtime.getSession());
          await ctx.agents.updateScheduleRun(s.id, 'completed');
          results.push({ scheduleId: s.id, status: 'completed' });
        } catch (err: any) {
          await ctx.agents.updateScheduleRun(s.id, 'failed');
          results.push({ scheduleId: s.id, status: 'failed', error: err.message });
        }
      }
      ctx.orchestrator.runBackgroundServices(ctx.runtime.getSession()).catch(() => {});
      json(res, 200, { ran: results.length, results });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  return false;
}
