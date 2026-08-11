/**
 * WFO-001 — progress delta.
 *
 * Compares two normalized snapshots and reports which material dimensions
 * changed. A conversational response alone is never progress: message length and
 * token growth are ignored unless they correspond to a normalized state change.
 */

import type { WorkflowObservationSnapshot } from './workflow-snapshot';

export type WorkflowProgressDimension =
  | 'artifact'
  | 'repository'
  | 'decision'
  | 'evidence'
  | 'blocker'
  | 'approval'
  | 'task'
  | 'verification';

export interface WorkflowProgressDelta {
  readonly artifactChanges: number;
  readonly repositoryChanges: number;
  readonly decisionChanges: number;
  readonly evidenceChanges: number;
  readonly blockerChanges: number;
  readonly approvalChanges: number;
  readonly taskStateChanges: number;
  readonly verificationChanges: number;
  readonly materialProgress: boolean;
  readonly materialDimensions: readonly WorkflowProgressDimension[];
}

function addedCount<T>(current: readonly T[], previous: readonly T[] | undefined, keyOf: (item: T) => string): number {
  if (!previous) return current.length;
  const seen = new Set(previous.map(keyOf));
  return current.filter((item) => !seen.has(keyOf(item))).length;
}

function stateChangedCount<T>(
  current: readonly T[],
  previous: readonly T[] | undefined,
  keyOf: (item: T) => string,
  stateOf: (item: T) => string,
): number {
  if (!previous) return current.length;
  const previousState = new Map(previous.map((item) => [keyOf(item), stateOf(item)]));
  return current.filter((item) => previousState.get(keyOf(item)) !== stateOf(item)).length;
}

function verificationChanged(
  previous: WorkflowObservationSnapshot | undefined,
  current: WorkflowObservationSnapshot,
): number {
  if (!previous) return current.verification.status === 'not-run' ? 0 : 1;
  const before = previous.verification;
  const after = current.verification;
  return before.status !== after.status || before.conclusionRef !== after.conclusionRef ? 1 : 0;
}

export function computeProgressDelta(
  previous: WorkflowObservationSnapshot | undefined,
  current: WorkflowObservationSnapshot,
): WorkflowProgressDelta {
  const artifactChanges = addedCount(
    current.artifacts,
    previous?.artifacts,
    (artifact) => `${artifact.id}@${artifact.version}:${artifact.contentHash ?? ''}`,
  );
  const repositoryChanges = addedCount(
    current.repository.changedArtifactHashes,
    previous?.repository.changedArtifactHashes,
    (hash) => hash,
  );
  const decisionChanges = stateChangedCount(
    current.decisions,
    previous?.decisions,
    (decision) => decision.id,
    (decision) => decision.status,
  );
  const evidenceChanges = addedCount(current.evidence, previous?.evidence, (evidence) => evidence.ref);
  const blockerChanges = stateChangedCount(
    current.blockers,
    previous?.blockers,
    (blocker) => blocker.id,
    (blocker) => blocker.status,
  );
  const approvalChanges = stateChangedCount(
    current.approvals,
    previous?.approvals,
    (approval) => approval.id,
    (approval) => approval.status,
  );
  const taskStateChanges = stateChangedCount(
    current.tasks,
    previous?.tasks,
    (task) => task.id,
    (task) => task.status,
  );
  const verificationChanges = verificationChanged(previous, current);

  const dimensions: WorkflowProgressDimension[] = [];
  if (artifactChanges > 0) dimensions.push('artifact');
  if (repositoryChanges > 0) dimensions.push('repository');
  if (decisionChanges > 0) dimensions.push('decision');
  if (evidenceChanges > 0) dimensions.push('evidence');
  if (blockerChanges > 0) dimensions.push('blocker');
  if (approvalChanges > 0) dimensions.push('approval');
  if (taskStateChanges > 0) dimensions.push('task');
  if (verificationChanges > 0) dimensions.push('verification');

  return {
    artifactChanges,
    repositoryChanges,
    decisionChanges,
    evidenceChanges,
    blockerChanges,
    approvalChanges,
    taskStateChanges,
    verificationChanges,
    materialProgress: dimensions.length > 0,
    materialDimensions: dimensions,
  };
}
