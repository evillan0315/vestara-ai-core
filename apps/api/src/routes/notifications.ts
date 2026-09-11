import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

/**
 * Notifications route — disabled.
 *
 * NotificationService was removed as part of AR-001L (activity-log removal).
 * All endpoints return 501 to signal the service is intentionally unavailable.
 * The frontend useNotifications hook returns empty state without calling these.
 */
export async function handleNotificationsRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/notifications') {
    json(res, 501, { error: 'Notification service disabled' });
    return true;
  }

  if (method === 'POST' && p === '/api/notifications/read-all') {
    json(res, 501, { error: 'Notification service disabled' });
    return true;
  }

  const readMatch = p.match(/^\/api\/notifications\/([^/]+)\/read$/);
  if (method === 'POST' && readMatch) {
    json(res, 501, { error: 'Notification service disabled' });
    return true;
  }

  return false;
}
