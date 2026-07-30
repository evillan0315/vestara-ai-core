import * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

export async function handleActivityRoute(method: string, p: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: WorkspaceContext): Promise<boolean> {
  if (method === 'GET' && p === '/api/activity-log') {
    try { json(res, 200, { events: ctx.activityStore ? await ctx.activityStore.query({ limit: 100 }) : [] }); }
    catch { json(res, 200, { events: [] }); }
    return true;
  }

  if (method === 'GET' && p === '/api/activity') {
    if (ctx.activityService?.query) {
      const qs = new URL(req.url!, 'http://x').searchParams;
      const options: Record<string, any> = {};
      if (qs.get('category')) options.category = qs.get('category');
      if (qs.get('type')) options.type = qs.get('type');
      if (qs.get('limit')) options.limit = parseInt(qs.get('limit')!, 10);
      if (qs.get('before')) options.before = qs.get('before');
      const events = await ctx.activityService.query(options);
      json(res, 200, { events, total: events.length });
    } else json(res, 200, { events: [], total: 0, note: 'Activity service not available' });
    return true;
  }

  return false;
}
