/**
 * WFO-001 — workflow state projection.
 *
 * Derives the observed state from normalized snapshot facts using explicit,
 * ordered, deterministic rules. Pure: reads a snapshot, returns a projection,
 * never writes state and never calls a model.
 */

import type { WorkflowObservationPolicy } from './observation-policy';
import type { WorkflowObservationSnapshot } from './workflow-snapshot';
import { snapshotAgentActive, snapshotTaskActive } from './workflow-snapshot';
import type { ObservedWorkflowState } from './workflow-state';

export interface MissingWorkflowOutput {
  readonly kind: string;
  readonly name?: string;
}

export interface WorkflowStateProjection {
  readonly state: ObservedWorkflowState;
  readonly reasons: readonly string[];
  readonly missingOutputs: readonly MissingWorkflowOutput[];
}

/** Required outputs not satisfied by an artifact with the same kind (and name). */
export function missingRequiredOutputs(snapshot: WorkflowObservationSnapshot): readonly MissingWorkflowOutput[] {
  return snapshot.objective.requiredOutputs.filter(
    (required) =>
      !snapshot.artifacts.some(
        (artifact) => artifact.kind === required.kind && (!required.name || artifact.name === required.name),
      ),
  );
}

export function hasUnresolvedBlockers(snapshot: WorkflowObservationSnapshot): boolean {
  return snapshot.blockers.some((blocker) => blocker.status === 'open' || blocker.status === 'blocking');
}

export function hasUnresolvedContradiction(snapshot: WorkflowObservationSnapshot): boolean {
  return (
    snapshot.decisions.some((decision) => decision.status === 'contradicted') ||
    snapshot.evidence.some((evidence) => evidence.contradicts !== undefined)
  );
}

export function hasPendingDependencies(snapshot: WorkflowObservationSnapshot): boolean {
  return snapshot.tasks.some((task) => task.status === 'pending');
}

export function hasUnresolvedApproval(snapshot: WorkflowObservationSnapshot): boolean {
  return (
    snapshot.approvals.some((approval) => approval.status === 'requested') ||
    snapshot.tasks.some((task) => task.status === 'awaiting-approval')
  );
}

function hasTerminalFailure(snapshot: WorkflowObservationSnapshot): boolean {
  // A failed task is terminal only when no retry is in flight.
  return (
    snapshot.tasks.some((task) => task.status === 'failed') &&
    !snapshot.tasks.some((task) => task.status === 'retrying')
  );
}

function isActive(snapshot: WorkflowObservationSnapshot): boolean {
  return snapshot.tasks.some(snapshotTaskActive) || snapshot.agents.some(snapshotAgentActive);
}

function reviewSatisfied(snapshot: WorkflowObservationSnapshot, policy: WorkflowObservationPolicy): boolean {
  if (!policy.requireReview) return true;
  return (
    snapshot.approvals.some((approval) => approval.status === 'granted' || approval.status === 'resolved') ||
    snapshot.decisions.some((decision) => decision.status === 'approved' || decision.status === 'decided')
  );
}

function allTasksTerminalSuccess(snapshot: WorkflowObservationSnapshot): boolean {
  return snapshot.tasks.every(
    (task) => task.status === 'completed' || task.status === 'approved' || task.status === 'cancelled',
  );
}

/**
 * A required output counts as present only when its verification has a passing
 * conclusion (or verification is not required / not yet run). A failing
 * verification leaves the output unsatisfied and routes back to execution.
 */
function validatedOutputsPresent(
  snapshot: WorkflowObservationSnapshot,
  policy: WorkflowObservationPolicy,
  missing: readonly MissingWorkflowOutput[],
): boolean {
  if (missing.length > 0) return false;
  if (!policy.requireVerification) return true;
  return snapshot.verification.status === 'pass' || snapshot.verification.status === 'not-run';
}

/**
 * Ordered deterministic state derivation. Earlier rules win; each guard is
 * explicit so the projection is replayable and explainable.
 */
export function projectWorkflowState(
  snapshot: WorkflowObservationSnapshot,
  policy: WorkflowObservationPolicy,
): WorkflowStateProjection {
  const missing = missingRequiredOutputs(snapshot);
  const blockers = hasUnresolvedBlockers(snapshot) ? snapshot.blockers.filter((b) => b.status !== 'resolved') : [];
  const reasons: string[] = [];

  if (snapshot.verification.status === 'indeterminate') {
    reasons.push('Verification conclusion is indeterminate — the workflow must not be treated as complete (ADR-012).');
    return { state: 'indeterminate', reasons, missingOutputs: missing };
  }

  if (isWorkflowCancelled(snapshot)) {
    reasons.push('All tasks were explicitly cancelled.');
    return { state: 'cancelled', reasons, missingOutputs: missing };
  }

  if (hasTerminalFailure(snapshot)) {
    reasons.push('A task failed with no retry path in flight.');
    return { state: 'failed', reasons, missingOutputs: missing };
  }

  if (blockers.length > 0 || snapshot.tasks.some((task) => task.status === 'blocked')) {
    reasons.push(
      `Unresolved blocker prevents progress: ${blockers.map((blocker) => blocker.summary).join('; ') || 'task blocked'}.`,
    );
    return { state: 'blocked', reasons, missingOutputs: missing };
  }

  if (isActive(snapshot)) {
    reasons.push('At least one task or agent is actively producing work.');
    return { state: 'in-progress', reasons, missingOutputs: missing };
  }

  if (hasUnresolvedContradiction(snapshot)) {
    reasons.push('Unresolved contradiction in decisions or evidence — no state conclusion is justified.');
    return { state: 'indeterminate', reasons, missingOutputs: missing };
  }

  if (snapshot.objective.requiredOutputs.length === 0) {
    reasons.push('No required outputs are declared — state evidence is insufficient.');
    return { state: 'indeterminate', reasons, missingOutputs: missing };
  }

  const outputsPresent = validatedOutputsPresent(snapshot, policy, missing);
  const reviewOk = reviewSatisfied(snapshot, policy);
  const allTerminal = allTasksTerminalSuccess(snapshot);
  if (missing.length === 0 && outputsPresent && allTerminal && reviewOk && snapshot.verification.status === 'pass') {
    reasons.push(
      'All required outputs exist, tasks are terminal-success, review is satisfied, and verification passes.',
    );
    return { state: 'completed', reasons, missingOutputs: missing };
  }

  if (missing.length === 0 && policy.requireReview && !reviewOk) {
    reasons.push('Required review has not completed.');
    return { state: 'awaiting-review', reasons, missingOutputs: missing };
  }

  if (missing.length === 0 && reviewOk && policy.requireVerification && snapshot.verification.status === 'not-run') {
    reasons.push('Reviewed output exists and verification is required but has not produced a conclusion.');
    return { state: 'awaiting-verification', reasons, missingOutputs: missing };
  }

  if (hasPendingDependencies(snapshot) || hasUnresolvedApproval(snapshot)) {
    reasons.push('Required inputs or approvals are not yet available.');
    return { state: 'pending', reasons, missingOutputs: missing };
  }

  if (missing.length > 0) {
    reasons.push(
      `Required output${missing.length === 1 ? '' : 's'} not yet created: ${missing.map(describeOutput).join(', ')}.`,
    );
    return { state: 'ready', reasons, missingOutputs: missing };
  }

  reasons.push('State evidence is insufficient or contradictory — no state conclusion is justified.');
  return { state: 'indeterminate', reasons, missingOutputs: missing };
}

function describeOutput(output: MissingWorkflowOutput): string {
  return output.name ? `${output.kind}:${output.name}` : output.kind;
}

/** Workflow-level cancellation: every defined task was explicitly cancelled. */
function isWorkflowCancelled(snapshot: WorkflowObservationSnapshot): boolean {
  return snapshot.tasks.length > 0 && snapshot.tasks.every((task) => task.status === 'cancelled');
}
