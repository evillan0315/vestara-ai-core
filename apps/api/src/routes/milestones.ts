import * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { requireRole } from '../auth';
import { json, readBody, getActor, actorOf } from './types';

export async function handleMilestonesRoute(method: string, p: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: WorkspaceContext, port: number): Promise<boolean> {
  if (method === 'GET' && p === '/api/milestones') {
    if (ctx.milestones) {
      const existingVersions = new Set(ctx.milestones.list().map((m: any) => m.version));
      json(res, 200, { milestones: ctx.milestones.list(), byEra: ctx.milestones.getByEra(), current: ctx.milestones.getCurrent(), progress: ctx.milestones.getProgress() });
    } else json(res, 200, { milestones: [], byEra: {}, current: null, progress: { total: 0, completed: 0, inProgress: 0, pending: 0 } });
    return true;
  }

  if (method === 'PUT' && p === '/api/milestones') {
    const raw = await readBody(req); const body = raw ? JSON.parse(raw) : {};
    if (!ctx.milestones || !body.version) { json(res, 400, { error: 'Invalid request' }); return true; }
    const updated = ctx.milestones.updateMilestone(body.version, body.data || {});
    if (!updated) { json(res, 404, { error: 'Milestone not found' }); return true; }
    json(res, 200, { milestone: updated });
    if (ctx.onMilestoneUpdate) ctx.onMilestoneUpdate(body.version);
    return true;
  }

  return false;
}
