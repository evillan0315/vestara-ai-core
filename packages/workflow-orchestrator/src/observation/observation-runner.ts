/**
 * WFO-001C — shadow observation runner.
 *
 * Runs the pure observer after workflow events that may materially alter the
 * projection, records every evaluation for experiment metrics, and emits only
 * meaningful recommendation/convergence changes to the engineering event stream.
 * It never applies a recommendation (`applied` is always `false`) and observation
 * failures never interrupt the workflow.
 */

import type { OrchestrationEvent } from '../types';
import type { WorkflowConvergenceAssessment } from './convergence-detector';
import { DEFAULT_WORKFLOW_OBSERVATION_POLICY, type WorkflowObservationPolicy } from './observation-policy';
import type {
  WorkflowObservationEvaluationRecord,
  WorkflowObservationRecord,
  WorkflowObservationStore,
} from './observation-store';
import type { WorkflowObservationSnapshotAssembler } from './snapshot-assembler';
import {
  isObservationGenerated,
  recommendationChanged,
  type WorkflowObservationEvent,
  type WorkflowObservationEventSink,
} from './workflow-event';
import { observationHash, type WorkflowObservation, type WorkflowObserver } from './workflow-observer';
import type { WorkflowObservationSnapshot } from './workflow-snapshot';

export interface WorkflowObservationRunResult {
  readonly observation: WorkflowObservation;
  readonly recommendationChanged: boolean;
  readonly recorded: boolean;
  /** Shadow mode: the runner never applies its recommendation. */
  readonly applied: false;
}

export interface WorkflowObservationRunner {
  observe(workflowId: string): Promise<WorkflowObservationRunResult>;
}

/** Telemetry/experiment log for every evaluation (not the authoritative event stream). */
export interface WorkflowObservationTelemetrySink {
  emitEvaluation(record: WorkflowObservationEvaluationRecord): Promise<void> | void;
}

export interface WorkflowObservationRunnerOptions {
  readonly assembler: WorkflowObservationSnapshotAssembler;
  readonly observer: WorkflowObserver;
  readonly store: WorkflowObservationStore;
  readonly policy?: WorkflowObservationPolicy;
  readonly events?: WorkflowObservationEventSink;
  readonly telemetry?: WorkflowObservationTelemetrySink;
  /** Invoked (never throws) when snapshot assembly fails. */
  readonly onFailure?: (workflowId: string, error: unknown) => void;
}

/**
 * Default shadow runner. Duplicate triggers produce no duplicate recommendation
 * events; every evaluation is still appended to the evaluation log.
 */
export class DefaultWorkflowObservationRunner implements WorkflowObservationRunner {
  private readonly assembler: WorkflowObservationSnapshotAssembler;
  private readonly observer: WorkflowObserver;
  private readonly store: WorkflowObservationStore;
  private readonly policy: WorkflowObservationPolicy;
  private readonly events?: WorkflowObservationEventSink;
  private readonly telemetry?: WorkflowObservationTelemetrySink;
  private readonly onFailure?: (workflowId: string, error: unknown) => void;

  constructor(options: WorkflowObservationRunnerOptions) {
    this.assembler = options.assembler;
    this.observer = options.observer;
    this.store = options.store;
    this.policy = options.policy ?? DEFAULT_WORKFLOW_OBSERVATION_POLICY;
    this.events = options.events;
    this.telemetry = options.telemetry;
    this.onFailure = options.onFailure;
  }

  async observe(workflowId: string): Promise<WorkflowObservationRunResult> {
    let snapshot: WorkflowObservationSnapshot;
    try {
      snapshot = await this.assembler.assemble(workflowId);
    } catch (error) {
      // Observation failures must not interrupt the workflow, and must never
      // replace the latest valid observation with a synthetic failure result.
      this.onFailure?.(workflowId, error);
      const observation = indeterminateObservation(workflowId);
      this.recordSafely(workflowId, observation);
      return { observation, recommendationChanged: false, recorded: false, applied: false };
    }

    // A stale previous record (newer capture or a later turn) must not influence
    // the current observation — treat it as a fresh baseline.
    const storedPrevious = this.store.getLatest(workflowId);
    const previousRecord = storedPrevious && !previousIsStale(storedPrevious, snapshot) ? storedPrevious : undefined;

    const observation = this.observer.observe({
      workflowId,
      previous: previousRecord?.snapshot,
      previousAssessment: previousRecord?.observation.convergence,
      current: snapshot,
      policy: this.policy,
    });
    const changed = recommendationChanged(previousRecord?.observation, observation);
    const hash = observationHash(observation);

    // Experiment log + latest record are maintained on every evaluation.
    this.safe(() => this.store.appendEvaluation(toEvaluationRecord(workflowId, observation, hash)));
    this.safe(() => this.store.save(workflowId, { observation, snapshot }));
    this.safe(() => this.telemetry?.emitEvaluation(toEvaluationRecord(workflowId, observation, hash)));

    // Meaningful changes only — duplicates emit nothing.
    if (changed && previousRecord) {
      const previous = previousRecord.observation;
      if (
        previous.recommendedAction !== observation.recommendedAction ||
        previous.recommendedState !== observation.recommendedState
      ) {
        this.emit({
          type: 'workflow.transition.recommended',
          workflowId,
          from: previous.recommendedState,
          to: observation.recommendedState,
          action: observation.recommendedAction,
          observationHash: hash,
          evidenceRefs: observation.evidenceRefs,
        });
      }
      if (previous.convergence.status !== observation.convergence.status) {
        this.emit({
          type: 'workflow.convergence.changed',
          workflowId,
          from: previous.convergence.status,
          to: observation.convergence.status,
          observationHash: hash,
        });
      }
    }

    return { observation, recommendationChanged: changed, recorded: changed, applied: false };
  }

  private emit(event: WorkflowObservationEvent): void {
    this.safe(() => this.events?.emit(event));
  }

  /** Failure path records the evaluation but never the latest record (synthetic result). */
  private recordSafely(workflowId: string, observation: WorkflowObservation): void {
    const hash = observationHash(observation);
    const record = toEvaluationRecord(workflowId, observation, hash);
    this.safe(() => this.store.appendEvaluation(record));
    this.safe(() => this.telemetry?.emitEvaluation(record));
  }

  /** Observation persistence/telemetry/event-sink failures never fail the originating workflow. */
  private safe(fn: () => unknown): void {
    try {
      const result = fn();
      if (result !== null && typeof result === 'object' && 'then' in result && typeof result.then === 'function') {
        void (result as PromiseLike<unknown>).then(undefined, () => {});
      }
    } catch {
      // ignored — observation must never interrupt the workflow
    }
  }
}

function previousIsStale(previous: WorkflowObservationRecord, current: WorkflowObservationSnapshot): boolean {
  return (
    current.capturedAt < previous.snapshot.capturedAt ||
    current.conversation.turnCount < previous.snapshot.conversation.turnCount
  );
}

/**
 * Trigger model: observe after workflow events that may materially alter the
 * projection, never on telemetry heartbeats/token events, and never in response
 * to observation-generated event types.
 */
export const WORKFLOW_OBSERVATION_TRIGGER_EVENTS: readonly OrchestrationEvent['type'][] = [
  'project.created',
  'project.phase.changed',
  'project.cancelled',
  'project.completed',
  'analysis.completed',
  'plan.generated',
  'plan.approved',
  'architecture.reviewed',
  'task.created',
  'task.ready',
  'task.assigned',
  'task.started',
  'task.completed',
  'task.failed',
  'task.blocked',
  'task.retrying',
  'task.revision',
  'task.approved',
  'task.cancelled',
  'task.approval-requested',
  'task.approval-resolved',
  'task.review.decided',
  'task.tests.decided',
  'file.lock.conflict',
  'verification.passed',
  'verification.failed',
  'project.verification.reopened',
  'verification.awaiting-approval',
];

const TRIGGER_SET: ReadonlySet<string> = new Set(WORKFLOW_OBSERVATION_TRIGGER_EVENTS);

/** True when an event should trigger observation (and is not observer-generated). */
export function shouldObserve(event: OrchestrationEvent): boolean {
  return !isObservationGenerated(event.type) && TRIGGER_SET.has(event.type);
}

function toEvaluationRecord(
  workflowId: string,
  observation: WorkflowObservation,
  hash: string,
): WorkflowObservationEvaluationRecord {
  return {
    workflowId,
    observationHash: hash,
    currentState: observation.currentState,
    recommendedAction: observation.recommendedAction,
    shouldContinueConversation: observation.shouldContinueConversation,
    materialProgress: observation.progress.materialProgress,
    materialDimensions: observation.progress.materialDimensions,
    consecutiveNoProgressTurns: observation.convergence.consecutiveNoProgressTurns,
    reasoningTurns: observation.cost.reasoningTurns,
    cumulativeInputTokens: observation.cost.inputTokens,
    cumulativeOutputTokens: observation.cost.outputTokens,
    estimatedCost: observation.cost.estimatedCost,
    applied: false,
    recordedAt: new Date().toISOString(),
  };
}

function zeroProgress() {
  return {
    artifactChanges: 0,
    repositoryChanges: 0,
    decisionChanges: 0,
    evidenceChanges: 0,
    blockerChanges: 0,
    approvalChanges: 0,
    taskStateChanges: 0,
    verificationChanges: 0,
    materialProgress: false,
    materialDimensions: [] as const,
  };
}

function indeterminateObservation(workflowId: string): WorkflowObservation {
  const convergence: WorkflowConvergenceAssessment = {
    status: 'not-evaluated',
    consecutiveNoProgressTurns: 0,
    stableDecisionCount: 0,
    unresolvedContradictions: 0,
    reasonCodes: [],
  };
  return {
    workflowId,
    observedAt: new Date().toISOString(),
    currentState: 'indeterminate',
    recommendedState: 'indeterminate',
    recommendedAction: 'escalate',
    progress: zeroProgress(),
    convergence,
    cost: { reasoningTurns: 0, executionTurns: 0, budgetStatus: 'within-budget' },
    confidence: 'low',
    reasons: ['Observation assembly failed — state cannot be derived from current evidence.'],
    blockers: [],
    missingOutputs: [],
    evidenceRefs: [],
    sourceSnapshotHash: '',
    shouldContinueConversation: false,
  };
}
