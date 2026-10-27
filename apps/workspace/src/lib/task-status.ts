/**
 * Presentation-only task status classification for the Orchestration surface.
 *
 * Task lifecycle authority stays with the workflow orchestrator; these helpers
 * only group canonical `TaskStatus` strings for filters, tones, and ordering.
 */

export type TaskStatusFilter = 'all' | 'active' | 'attention' | 'blocked' | 'approvals' | 'completed' | 'queued';

export type TaskTone = 'success' | 'info' | 'warning' | 'error' | 'muted';

export const ACTIVE_TASK_STATUSES: ReadonlySet<string> = new Set([
  'assigned',
  'in-progress',
  'reviewing',
  'testing',
  'retrying',
]);

export const ATTENTION_TASK_STATUSES: ReadonlySet<string> = new Set([
  'awaiting-approval',
  'awaiting-verification',
  'needs-review',
  'changes-requested',
  'blocked',
  'failed',
  'cancelled',
]);

/** Terminal / stuck work that needs unblocking (error tone). */
export const BLOCKED_TASK_STATUSES: ReadonlySet<string> = new Set(['blocked', 'failed', 'cancelled']);

/** Approval-gated work waiting on a human (warning tone). */
export const APPROVAL_TASK_STATUSES: ReadonlySet<string> = new Set([
  'awaiting-approval',
  'awaiting-verification',
  'needs-review',
  'changes-requested',
]);

export const COMPLETED_TASK_STATUSES: ReadonlySet<string> = new Set(['approved', 'completed']);

export const QUEUED_TASK_STATUSES: ReadonlySet<string> = new Set(['pending', 'ready']);

export function taskStatusTone(status: string): TaskTone {
  if (COMPLETED_TASK_STATUSES.has(status)) return 'success';
  if (status === 'blocked' || status === 'failed' || status === 'cancelled') return 'error';
  if (ATTENTION_TASK_STATUSES.has(status)) return 'warning';
  if (ACTIVE_TASK_STATUSES.has(status)) return 'info';
  return 'muted';
}

export function taskMatchesFilter(status: string, filter: TaskStatusFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return ACTIVE_TASK_STATUSES.has(status);
    case 'attention':
      return ATTENTION_TASK_STATUSES.has(status);
    case 'blocked':
      return BLOCKED_TASK_STATUSES.has(status);
    case 'approvals':
      return APPROVAL_TASK_STATUSES.has(status);
    case 'completed':
      return COMPLETED_TASK_STATUSES.has(status);
    case 'queued':
      return QUEUED_TASK_STATUSES.has(status);
    default:
      return true;
  }
}

/** Lower sorts first: blockers, then approvals, then live work, then queued, then done. */
export function taskStatusPriority(status: string): number {
  if (BLOCKED_TASK_STATUSES.has(status)) return 0;
  if (APPROVAL_TASK_STATUSES.has(status)) return 1;
  if (ACTIVE_TASK_STATUSES.has(status)) return 2;
  if (QUEUED_TASK_STATUSES.has(status)) return 3;
  if (COMPLETED_TASK_STATUSES.has(status)) return 4;
  return 5;
}

/**
 * Distinct status glyph so blocked work never shares a mark with approvals:
 * blocked ⊘, failed/cancelled ✗, approvals !, active ●, done ✓, queued ○.
 */
export function statusGlyph(status: string): string {
  if (status === 'blocked') return '⊘';
  if (status === 'failed' || status === 'cancelled') return '✗';
  if (APPROVAL_TASK_STATUSES.has(status)) return '!';
  if (COMPLETED_TASK_STATUSES.has(status)) return '✓';
  if (ACTIVE_TASK_STATUSES.has(status)) return '●';
  return '○';
}
