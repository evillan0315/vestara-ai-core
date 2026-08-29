/**
 * WFO-001C — observation events.
 *
 * Meaningful changes go to the engineering event stream; every evaluation is
 * recorded separately for experiment metrics. Unchanged recommendations emit
 * nothing. Observation-generated event types are excluded from the trigger set
 * so the observer never re-observes its own output (no self-observation loop).
 */

import type { WorkflowConvergenceStatus } from './convergence-detector';
import type { WorkflowObservation } from './workflow-observer';
import type { ObservedWorkflowState, RecommendedWorkflowAction } from './workflow-state';

export type WorkflowObservationEvent =
  | {
      readonly type: 'workflow.observation.evaluated';
      readonly workflowId: string;
      readonly observationHash: string;
      readonly recommendationChanged: boolean;
      readonly applied: false;
    }
  | {
      readonly type: 'workflow.transition.recommended';
      readonly workflowId: string;
      readonly from: ObservedWorkflowState;
      readonly to: ObservedWorkflowState;
      readonly action: RecommendedWorkflowAction;
      readonly observationHash: string;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly type: 'workflow.convergence.changed';
      readonly workflowId: string;
      readonly from: WorkflowConvergenceStatus;
      readonly to: WorkflowConvergenceStatus;
      readonly observationHash: string;
    };

/** Sink for meaningful engineering events (recommendation/convergence changes). */
export interface WorkflowObservationEventSink {
  emit(event: WorkflowObservationEvent): Promise<void> | void;
}

/**
 * True when a new observation changes the recommendation enough to record it:
 * a different action, a different projected state, a different current state,
 * or a convergence status change.
 */
export function recommendationChanged(previous: WorkflowObservation | undefined, next: WorkflowObservation): boolean {
  if (!previous) return true;
  return (
    previous.recommendedAction !== next.recommendedAction ||
    previous.recommendedState !== next.recommendedState ||
    previous.currentState !== next.currentState ||
    previous.convergence.status !== next.convergence.status
  );
}

/** True for event types the observer itself emits — excluded from observation triggers. */
export function isObservationGenerated(eventType: string): boolean {
  return (
    eventType.startsWith('workflow.observation.') ||
    eventType.startsWith('workflow.transition.') ||
    eventType.startsWith('workflow.convergence.')
  );
}
