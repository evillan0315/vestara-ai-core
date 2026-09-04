import type { AcceptanceActivity, ActivityRecord, WorkflowActivity } from '../contracts';
import type { ActivityProjector } from '../projector';
import { type ActivitySourceEvent, extractEvidenceRefs, resolveActivityActor, stringFieldOr } from '../source-event';

const ORGANIZATIONAL_TYPES = new Set(['workflow.started', 'workflow.completed', 'acceptance.boundary']);

function stringArrayOr(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Projects structured organizational state — the workflow lifecycle and the
 * acceptance boundary — into Activity Room records. This is the post-ORB
 * observability substrate: the room is fed structured state emitted by the
 * organization, not prose parsed into statuses.
 */
export class OrganizationalProjector implements ActivityProjector {
  readonly kind = 'acceptance' as const;

  supports(event: ActivitySourceEvent): boolean {
    return ORGANIZATIONAL_TYPES.has(event.type);
  }

  project(event: ActivitySourceEvent): readonly ActivityRecord[] {
    if (event.type === 'acceptance.boundary') {
      const boundary = (event.payload?.boundary ?? {}) as Record<string, unknown>;
      const record: AcceptanceActivity = {
        id: `activity:${event.id}:acceptance`,
        sequence: event.sourceSequence ?? 0,
        timestamp: event.at,
        actor: resolveActivityActor(event),
        kind: 'acceptance',
        workflowId: event.workflowId ?? stringFieldOr(event.payload, 'workflowId', 'unknown'),
        objective: stringFieldOr(boundary, 'objective', stringFieldOr(event.payload, 'objective', '')),
        obligations: stringArrayOr(boundary.obligations),
        materialUncertainties: stringArrayOr(boundary.materialUncertainties),
        conditional: boundary.conditional === true,
        derivedBy: stringFieldOr(boundary, 'derivedBy', 'unknown'),
        correlationId: event.correlationId,
        evidenceRefs: extractEvidenceRefs(event.payload),
      };
      return [record];
    }

    const isStarted = event.type === 'workflow.started';
    const boundary = (event.payload?.acceptance ?? {}) as Record<string, unknown>;
    const record: WorkflowActivity = {
      id: `activity:${event.id}:workflow`,
      sequence: event.sourceSequence ?? 0,
      timestamp: event.at,
      actor: resolveActivityActor(event),
      kind: 'workflow',
      workflowId: event.workflowId ?? stringFieldOr(event.payload, 'workflowId', 'unknown'),
      previousState: isStarted ? 'pending' : 'executing',
      currentState: isStarted ? 'started' : 'completed',
      reason: isStarted
        ? `Workflow started: ${stringFieldOr(event.payload, 'goal', '')}`
        : boundary.conditional === true
          ? 'Workflow completed with acceptance CONDITIONAL (material uncertainty unresolved)'
          : 'Workflow completed',
      authoritative: true,
      observed: false,
      taskId: event.taskId,
      correlationId: event.correlationId,
      evidenceRefs: extractEvidenceRefs(event.payload),
    };
    return [record];
  }
}
