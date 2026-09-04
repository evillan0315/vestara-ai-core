import type { ActivityRecord, WorkflowActivity } from '../contracts';
import type { ActivityProjector } from '../projector';
import { type ActivitySourceEvent, extractEvidenceRefs, resolveActivityActor, stringFieldOr } from '../source-event';

interface WorkflowTransition {
  readonly previousState: string;
  readonly currentState: string;
  readonly reason: string;
  readonly authoritative: boolean;
  readonly observed: boolean;
}

const WORKFLOW_TRANSITION_TYPES = new Set([
  'project.created',
  'project.phase.changed',
  'project.completed',
  'project.cancelled',
  'plan.approved',
  'workflow.transition.recommended',
]);

/** Projects workflow transitions, including observer shadow recommendations. */
export class WorkflowProjector implements ActivityProjector {
  readonly kind = 'workflow' as const;

  supports(event: ActivitySourceEvent): boolean {
    return WORKFLOW_TRANSITION_TYPES.has(event.type);
  }

  project(event: ActivitySourceEvent): readonly ActivityRecord[] {
    const transition = transitionFor(event);
    const record: WorkflowActivity = {
      id: `activity:${event.id}:workflow`,
      sequence: event.sourceSequence ?? 0,
      timestamp: event.at,
      actor: resolveActivityActor(event),
      kind: 'workflow',
      workflowId: event.workflowId ?? 'unknown',
      previousState: transition.previousState,
      currentState: transition.currentState,
      reason: transition.reason,
      authoritative: transition.authoritative,
      observed: transition.observed,
      taskId: event.taskId,
      correlationId: event.correlationId,
      evidenceRefs: extractEvidenceRefs(event.payload),
    };
    return [record];
  }
}

function transitionFor(event: ActivitySourceEvent): WorkflowTransition {
  const payload = event.payload;
  switch (event.type) {
    case 'project.created':
      return {
        previousState: 'draft',
        currentState: 'draft',
        reason: 'project created',
        authoritative: true,
        observed: false,
      };
    case 'project.phase.changed':
      return {
        previousState: stringFieldOr(payload, 'from', 'unknown'),
        currentState: stringFieldOr(payload, 'to', 'unknown'),
        reason: 'project phase changed',
        authoritative: true,
        observed: false,
      };
    case 'project.completed':
      return {
        previousState: 'verifying',
        currentState: 'completed',
        reason: 'project completed',
        authoritative: true,
        observed: false,
      };
    case 'project.cancelled':
      return {
        previousState: 'executing',
        currentState: 'cancelled',
        reason: stringFieldOr(payload, 'reason', 'project cancelled'),
        authoritative: true,
        observed: false,
      };
    case 'plan.approved':
      return {
        previousState: 'pending-approval',
        currentState: 'approved',
        reason: 'plan approved',
        authoritative: true,
        observed: false,
      };
    case 'workflow.transition.recommended':
      return {
        previousState: stringFieldOr(payload, 'from', 'unknown'),
        currentState: stringFieldOr(payload, 'to', 'unknown'),
        reason: `observer recommends ${stringFieldOr(payload, 'action', 'proceeding')}`,
        authoritative: false,
        observed: true,
      };
    default:
      return {
        previousState: 'unknown',
        currentState: 'unknown',
        reason: event.type,
        authoritative: true,
        observed: false,
      };
  }
}
