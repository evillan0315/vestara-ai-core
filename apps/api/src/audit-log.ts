/**
 * Audit log helpers for the Vestara API.
 *
 * Provides a lightweight middleware that auto-logs user actions on
 * sensitive routes to the AuditStore.
 */

import type * as http from 'node:http';
import type { AuditStore } from '@vestara/workspace';

/** Actions tracked by the audit log. */
export const AuditAction = {
  SETTINGS_UPDATE: 'settings.update',
  SETTINGS_DELETE: 'settings.delete',
  AGENT_CREATE: 'agent.create',
  AGENT_UPDATE: 'agent.update',
  AGENT_DELETE: 'agent.delete',
  AGENT_RUN: 'agent.run',
  PLAN_CREATE: 'plan.create',
  PLAN_UPDATE: 'plan.update',
  PLAN_DELETE: 'plan.delete',
  IMPLEMENT_START: 'implement.start',
  IMPLEMENT_APPLY: 'implement.apply',
  PROJECT_CREATE: 'project.create',
  SCHEDULE_CREATE: 'schedule.create',
  SCHEDULE_RUN_DUE: 'schedule.run-due',
  SCHEDULE_DELETE: 'schedule.delete',
  USER_CREATE: 'user.create',
  USER_ROTATE_TOKEN: 'user.rotate-token',
  LOGIN: 'user.login',
  OPENCODE_PERMISSION_APPROVE: 'opencode.permission.approve',
  OPENCODE_PERMISSION_REJECT: 'opencode.permission.reject',
} as const;

/** Extract the client IP from the request. */
function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Log an action to the audit store.
 */
export function logAudit(
  audit: AuditStore,
  req: http.IncomingMessage,
  userId: string,
  username: string,
  action: string,
  resource: string,
  resourceId?: string,
  details?: string,
): void {
  try {
    audit.log({
      userId,
      username,
      action,
      resource,
      resourceId,
      details,
      ip: getClientIp(req),
    });
  } catch {
    // Audit logging is best-effort — never fail the request
  }
}
