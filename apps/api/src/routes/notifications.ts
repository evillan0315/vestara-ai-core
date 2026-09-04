import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

/**
 * Notifications route — legacy endpoint.
 *
 * NotificationService was removed as part of AR-001L (activity-log removal).
 * Routes return empty results for backward compatibility.
 * Activity Room provides canonical activity data through M11A API.
 */
export async function handleNotificationsRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/notifications') {
    json(res, 200, { notifications: [], unreadCount: 0, note: 'Notification service not available' });
    return true;
  }

  if (method === 'POST' && p === '/api/notifications/read-all') {
    json(res, 200, { markedRead: 0 });
    return true;
  }

  const readMatch = p.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (method === 'POST' && readMatch) {
    json(res, 200, { ok: false });
    return true;
  }

  return false;
}
