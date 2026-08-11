/**
 * WFO-001C — observation persistence and experimental evaluation records.
 *
 * Two channels:
 *  - the latest observation record (snapshot + observation) so the next run has
 *    a previous baseline;
 *  - an evaluation log holding every evaluation for experiment metrics
 *    (acknowledgement turns detected, avoidable reasoning turns, avoided cost,
 *    false-stop/continue rates, indeterminate frequency, repeated-recommendation
 *    rate).
 */

import type { WorkflowProgressDimension } from './progress-delta';
import type { WorkflowObservation } from './workflow-observer';
import type { WorkflowObservationSnapshot } from './workflow-snapshot';
import type { ObservedWorkflowState, RecommendedWorkflowAction } from './workflow-state';

export interface WorkflowObservationRecord {
  readonly observation: WorkflowObservation;
  readonly snapshot: WorkflowObservationSnapshot;
}

export interface WorkflowObservationEvaluationRecord {
  readonly workflowId: string;
  readonly observationHash: string;
  readonly currentState: ObservedWorkflowState;
  readonly recommendedAction: RecommendedWorkflowAction;
  readonly shouldContinueConversation: boolean;
  readonly materialProgress: boolean;
  readonly materialDimensions: readonly WorkflowProgressDimension[];
  readonly consecutiveNoProgressTurns: number;
  readonly reasoningTurns: number;
  readonly cumulativeInputTokens?: number;
  readonly cumulativeOutputTokens?: number;
  readonly estimatedCost?: number;
  readonly applied: false;
  readonly recordedAt: string;
}

export interface WorkflowObservationStore {
  getLatest(workflowId: string): WorkflowObservationRecord | undefined;
  save(workflowId: string, record: WorkflowObservationRecord): void;
  list(workflowId: string): readonly WorkflowObservationRecord[];
  appendEvaluation(record: WorkflowObservationEvaluationRecord): void;
  listEvaluations(workflowId: string): readonly WorkflowObservationEvaluationRecord[];
}

/** In-memory store. Suitable for shadow-mode sessions; swap for a durable store later. */
export class MemoryWorkflowObservationStore implements WorkflowObservationStore {
  private readonly latest = new Map<string, WorkflowObservationRecord>();
  private readonly history = new Map<string, WorkflowObservationRecord[]>();
  private readonly evaluations = new Map<string, WorkflowObservationEvaluationRecord[]>();

  getLatest(workflowId: string): WorkflowObservationRecord | undefined {
    return this.latest.get(workflowId);
  }

  save(workflowId: string, record: WorkflowObservationRecord): void {
    this.latest.set(workflowId, record);
    const history = this.history.get(workflowId) ?? [];
    history.push(record);
    this.history.set(workflowId, history);
  }

  list(workflowId: string): readonly WorkflowObservationRecord[] {
    return this.history.get(workflowId) ?? [];
  }

  appendEvaluation(record: WorkflowObservationEvaluationRecord): void {
    const evaluations = this.evaluations.get(record.workflowId) ?? [];
    evaluations.push(record);
    this.evaluations.set(record.workflowId, evaluations);
  }

  listEvaluations(workflowId: string): readonly WorkflowObservationEvaluationRecord[] {
    return this.evaluations.get(workflowId) ?? [];
  }
}
