import * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

export async function handleNotificationsRoute(method: string, p: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: WorkspaceContext): Promise<boolean> {
  if (method === 'GET' && p === '/api/notifications') {
    const qs = new URL(req.url!, 'http://x').searchParams;
    const limit = qs.get('limit') ? parseInt(qs.get('limit')!, 10) : 50;
    const unreadOnly = qs.get('unreadOnly') === 'true';
    const category = qs.get('category') || undefined;
    const before = qs.get('before') || undefined;
    if (ctx.notificationService) { const [notifications, unreadCount] = await Promise.all([ctx.notificationService.list({ limit, unreadOnly, category, before }), ctx.notificationService.unreadCount()]); json(res, 200, { notifications, unreadCount }); }
    else json(res, 200, { notifications: [], unreadCount: 0, note: 'Notification service not available' });
    return true;
  }

  if (method === 'POST' && p === '/api/notifications/read-all') {
    json(res, 200, ctx.notificationService ? { markedRead: await ctx.notificationService.markAllRead() } : { markedRead: 0 });
    return true;
  }

  const readMatch = p.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (method === 'POST' && readMatch) {
    const id = readMatch[1];
    if (ctx.notificationService) await ctx.notificationService.markRead(id);
    json(res, 200, { ok: !!ctx.notificationService });
    return true;
  }

  return false;
}
