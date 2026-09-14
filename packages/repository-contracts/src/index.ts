/**
 * @vestara/repository-contracts — Layer-0 leaf contracts for Repository
 * Awareness & Concurrent Change Governance (VES-REPO-002).
 *
 * Describes concepts only. No Git, filesystem, OpenCode, workflow,
 * locking, coordination, persistence, projection, or verification behavior.
 */
export type { RepositoryAccessMode } from './access-mode';
export { isMutationMode, isReadOnlyMode, REPOSITORY_ACCESS_MODES } from './access-mode';
export type {
  AttributionEvidence,
  AttributionFailure,
  AttributionFailureReason,
  AttributionResult,
  EvaluateAttributionInput,
  EvaluateAttributionResult,
} from './attribution';
export { evaluateAttribution } from './attribution';
export type {
  AttributionConfidence,
  ChangeAttribution,
  ObservedFileChange,
  ObservedFileFate,
  RepositoryChangeSet,
} from './changeset';
export {
  ATTRIBUTION_CONFIDENCES,
  CHANGE_ATTRIBUTIONS,
  claimStrengthAllowsIntroductionClaim,
  isValidRepositoryChangeSet,
} from './changeset';
export type { SnapshotChangeKind, SnapshotComparison } from './comparison';
export { compareSnapshots, isNoChangeComparison, SNAPSHOT_CHANGE_KINDS } from './comparison';
export type { RepositoryConflict, RepositoryConflictClass } from './conflict';
export { isKnownConflictClass, isValidRepositoryConflict, REPOSITORY_CONFLICT_CLASSES } from './conflict';
export type { ExecutionRepositoryContext } from './context';
export { contextPermitsMutation, isValidExecutionRepositoryContext } from './context';
export type { RuntimeSessionCorrelation, SessionOrigin } from './correlation';
export { isValidRuntimeSessionCorrelation, SESSION_ORIGINS } from './correlation';
export type { CoordinationOutcome, RepositoryCoordinationDecision } from './decision';
export {
  allowMutation,
  decisionPermitsMutation,
  isValidCoordinationDecision,
  unknownCompatibility,
} from './decision';
export type {
  ChangeSetId,
  ExecutionId,
  IdentityKind,
  IdentityRef,
  Opaque,
  OperationId,
  RepositoryId,
  RepositoryIdentity,
  RepositoryRoot,
  RepositoryVcs,
  RuntimeSessionId,
  SnapshotId,
  WorkflowRunId,
} from './identity';
export { IDENTITY_KINDS, isIdentityRefOfKind, isValidRepositoryIdentity, makeIdentityRef } from './identity';
export type { ChangeIntent, MutationKind } from './intent';
export { isValidChangeIntent, MUTATION_KINDS } from './intent';
export type { ObservedRepositoryChange } from './observed-change';
export { isValidObservedRepositoryChange } from './observed-change';
export type { ChangeScope, ScopeLevel } from './scope';
export { isValidScopeChain, SCOPE_LEVELS, scopeChain, scopeDepth, scopeLevelRank, scopeRootName } from './scope';
export type { PathState, RepositorySnapshot, SnapshotReason } from './snapshot';
export { isSnapshotOfRepository, isValidRepositorySnapshot, SNAPSHOT_REASONS } from './snapshot';
export type {
  ChangedPath,
  PathDifference,
  RepositoryState,
  UpstreamPosition,
  WorkingTreeObservation,
} from './state';
export { dirtyPaths, isCleanState } from './state';
export type { ActiveRepositoryWork, ActiveWorkState } from './work';
export { ACTIVE_WORK_STATES, isActivelyMutating, isTerminalWorkState } from './work';
