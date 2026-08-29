import type { ActivityRecord, TaskActivity, TaskActivityStatus } from '../contracts';
import type { ActivityProjector } from '../projector';
import { type ActivitySourceEvent, resolveActivityActor, stringField, stringFieldOr } from '../source-event';

const TASK_TRANSITION_TYPES = new Set([
  'task.created',
  'task.ready',
  'task.assigned',
  'task.started',
  'task.approval-requested',
  'task.approval-resolved',
  'task.revision',
  'task.approved',
  'task.blocked',
  'task.retrying',
  'task.completed',
  'task.failed',
  'task.cancelled',
  'task.review.decided',
]);

const TASK_STATUS_BY_TYPE: Readonly<
  Record<string, { readonly previous: TaskActivityStatus; readonly status: TaskActivityStatus }>
> = {
  'task.created': { previous: 'pending', status: 'ready' },
  'task.ready': { previous: 'pending', status: 'ready' },
  'task.assigned': { previous: 'ready', status: 'assigned' },
  'task.started': { previous: 'assigned', status: 'in-progress' },
  'task.approval-requested': { previous: 'in-progress', status: 'awaiting-approval' },
  'task.approval-resolved': { previous: 'awaiting-approval', status: 'in-progress' },
  'task.revision': { previous: 'reviewing', status: 'changes-requested' },
  'task.approved': { previous: 'testing', status: 'approved' },
  'task.blocked': { previous: 'in-progress', status: 'blocked' },
  'task.retrying': { previous: 'failed', status: 'retrying' },
  'task.completed': { previous: 'in-progress', status: 'completed' },
  'task.failed': { previous: 'in-progress', status: 'failed' },
  'task.cancelled': { previous: 'in-progress', status: 'cancelled' },
};

/** Projects task lifecycle transitions into task activity records. */
export class TaskProjector implements ActivityProjector {
  readonly kind = 'task' as const;

  supports(event: ActivitySourceEvent): boolean {
    return TASK_TRANSITION_TYPES.has(event.type);
  }

  project(event: ActivitySourceEvent): readonly ActivityRecord[] {
    const payload = event.payload;
    const transition = statusFor(event);
    const record: TaskActivity = {
      id: `activity:${event.id}:task`,
      sequence: event.sourceSequence ?? 0,
      timestamp: event.at,
      actor: resolveActivityActor(event),
      kind: 'task',
      taskId: event.taskId ?? stringFieldOr(payload, 'taskId', 'unknown'),
      planId: stringField(payload, 'planId'),
      previousStatus: transition.previous,
      status: transition.status,
      summary: stringField(payload, 'summary'),
      workflowId: event.workflowId,
      correlationId: event.correlationId,
      evidenceRefs: [],
    };
    return [record];
  }
}

function statusFor(event: ActivitySourceEvent): {
  readonly previous: TaskActivityStatus;
  readonly status: TaskActivityStatus;
} {
  if (event.type === 'task.review.decided') {
    const decision = stringFieldOr(event.payload, 'decision', 'changes-requested');
    switch (decision) {
      case 'approved':
        return { previous: 'reviewing', status: 'approved' };
      case 'rejected':
        return { previous: 'reviewing', status: 'blocked' };
      default:
        return { previous: 'reviewing', status: 'changes-requested' };
    }
  }
  return TASK_STATUS_BY_TYPE[event.type] ?? { previous: 'pending', status: 'pending' };
}
