/**
 * WFO-001 — evidence-based workflow observation.
 *
 * Deterministic state projection, material-progress measurement, convergence
 * detection, and recommendation. The observer only reports; it never calls a
 * model, edits files, dispatches agents, or mutates workflow state.
 */

export {
  assessConvergence,
  type ConvergenceInput,
  countContradictions,
  type WorkflowConvergenceAssessment,
  type WorkflowConvergenceReason,
  type WorkflowConvergenceStatus,
} from './convergence-detector';
export {
  DEFAULT_WORKFLOW_OBSERVATION_POLICY,
  type WorkflowObservationPolicy,
} from './observation-policy';
export type {
  WorkflowObservationRunner,
  WorkflowObservationRunnerOptions,
  WorkflowObservationRunResult,
  WorkflowObservationTelemetrySink,
} from './observation-runner';
export {
  DefaultWorkflowObservationRunner,
  shouldObserve,
  WORKFLOW_OBSERVATION_TRIGGER_EVENTS,
} from './observation-runner';
export type {
  WorkflowObservationEvaluationRecord,
  WorkflowObservationRecord,
  WorkflowObservationStore,
} from './observation-store';
export { MemoryWorkflowObservationStore } from './observation-store';
export {
  computeProgressDelta,
  type WorkflowProgressDelta,
  type WorkflowProgressDimension,
} from './progress-delta';
export type {
  ProjectSnapshotProvider,
  WorkflowObservationSnapshotAssembler,
  WorkflowObservationSourceAdapters,
} from './snapshot-assembler';
export { OrchestratorWorkflowObservationAssembler } from './snapshot-assembler';
export {
  hasPendingDependencies,
  hasUnresolvedApproval,
  hasUnresolvedBlockers,
  hasUnresolvedContradiction,
  type MissingWorkflowOutput,
  missingRequiredOutputs,
  projectWorkflowState,
  type WorkflowStateProjection,
} from './state-projector';
export type { WorkflowObservationEvent, WorkflowObservationEventSink } from './workflow-event';
export { isObservationGenerated, recommendationChanged } from './workflow-event';
export type {
  WorkflowBudgetStatus,
  WorkflowCostObservation,
  WorkflowObservation,
  WorkflowObservationConfidence,
  WorkflowObservationInput,
  WorkflowObserver,
} from './workflow-observer';
export { DefaultWorkflowObserver, observationHash, snapshotHash } from './workflow-observer';
export type {
  ObservationFieldProvenance,
  ObservationFieldSource,
  RequiredWorkflowOutput,
  VerificationConclusionObservation,
  WorkflowAgentObservation,
  WorkflowApprovalObservation,
  WorkflowArtifactObservation,
  WorkflowBlockerObservation,
  WorkflowConversationObservation,
  WorkflowDecisionObservation,
  WorkflowEvidenceObservation,
  WorkflowObjectiveObservation,
  WorkflowObservationProvenance,
  WorkflowObservationSnapshot,
  WorkflowRepositoryObservation,
  WorkflowTaskObservation,
  WorkflowVerificationObservation,
} from './workflow-snapshot';
export {
  snapshotAgentActive,
  snapshotTaskActive,
} from './workflow-snapshot';
export type { ObservedWorkflowState, RecommendedWorkflowAction } from './workflow-state';
