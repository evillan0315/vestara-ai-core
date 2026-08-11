/**
 * WFO-001 — deterministic convergence detection.
 *
 * Classifies whether a workflow is progressing, converging, stable, or stagnant
 * based on material progress deltas, stable decisions, and unresolved
 * contradictions. Never merges: an acknowledgement-only turn is a stage-transition
 * signal, not a failure.
 */

import type { WorkflowObservationPolicy } from './observation-policy';
import type { WorkflowProgressDelta } from './progress-delta';
import { hasUnresolvedBlockers, type MissingWorkflowOutput } from './state-projector';
import type { WorkflowObservationSnapshot } from './workflow-snapshot';

export type WorkflowConvergenceStatus = 'not-evaluated' | 'progressing' | 'converging' | 'stable' | 'stagnant';

export type WorkflowConvergenceReason =
  | 'new-material-progress'
  | 'architecture-stable'
  | 'required-artifact-missing'
  | 'repeated-acknowledgement'
  | 'no-evidence-delta'
  | 'no-decision-delta'
  | 'no-artifact-delta'
  | 'unresolved-contradiction'
  | 'blocked-dependency'
  | 'verification-pending'
  | 'completion-criteria-satisfied'
  | 'budget-threshold-reached';

export interface WorkflowConvergenceAssessment {
  readonly status: WorkflowConvergenceStatus;
  readonly consecutiveNoProgressTurns: number;
  readonly stableDecisionCount: number;
  readonly unresolvedContradictions: number;
  readonly reasonCodes: readonly WorkflowConvergenceReason[];
}

export interface ConvergenceInput {
  readonly previous?: WorkflowObservationSnapshot;
  readonly previousAssessment?: WorkflowConvergenceAssessment;
  readonly current: WorkflowObservationSnapshot;
  readonly progress: WorkflowProgressDelta;
  readonly policy: WorkflowObservationPolicy;
  readonly missingOutputs: readonly MissingWorkflowOutput[];
}

export function countContradictions(current: WorkflowObservationSnapshot): number {
  return (
    current.decisions.filter((decision) => decision.status === 'contradicted').length +
    current.evidence.filter((evidence) => evidence.contradicts !== undefined).length
  );
}

export function assessConvergence(input: ConvergenceInput): WorkflowConvergenceAssessment {
  const { previous, previousAssessment, current, progress, policy, missingOutputs } = input;
  const noBaseline = previous === undefined && previousAssessment === undefined;
  // The counter tracks workflow turns, not observation invocations: a duplicate
  // trigger for the same turn must not accumulate a no-progress turn.
  const turnAdvanced =
    previous !== undefined && current.conversation.turnCount > (previous.conversation.turnCount ?? 0);
  const consecutiveNoProgressTurns =
    noBaseline || progress.materialProgress
      ? 0
      : turnAdvanced
        ? (previousAssessment?.consecutiveNoProgressTurns ?? 0) + 1
        : (previousAssessment?.consecutiveNoProgressTurns ?? 0);
  const previousStatus = new Map((previous?.decisions ?? []).map((decision) => [decision.id, decision.status]));
  const stableDecisionCount = current.decisions.filter(
    (decision) =>
      (decision.status === 'decided' || decision.status === 'approved') &&
      (previous === undefined || previousStatus.get(decision.id) === decision.status),
  ).length;
  const unresolvedContradictions = countContradictions(current);
  const budgetExceeded =
    policy.maxEstimatedCost !== undefined && (current.conversation.estimatedCost ?? 0) >= policy.maxEstimatedCost;

  let status: WorkflowConvergenceStatus;
  if (noBaseline) {
    status = 'not-evaluated';
  } else if (progress.materialProgress) {
    status = 'progressing';
  } else if (consecutiveNoProgressTurns > policy.maxConsecutiveNoProgressTurns) {
    status = 'stagnant';
  } else if (unresolvedContradictions > 0) {
    status = 'converging';
  } else if (stableDecisionCount > 0) {
    status = 'stable';
  } else {
    status = 'converging';
  }

  return {
    status,
    consecutiveNoProgressTurns,
    stableDecisionCount,
    unresolvedContradictions,
    reasonCodes: reasonCodesFor({
      previous,
      current,
      progress,
      policy,
      missingOutputs,
      noBaseline,
      consecutiveNoProgressTurns,
      unresolvedContradictions,
      stableDecisionCount,
      budgetExceeded,
    }),
  };
}

function reasonCodesFor(context: {
  previous: WorkflowObservationSnapshot | undefined;
  current: WorkflowObservationSnapshot;
  progress: WorkflowProgressDelta;
  policy: WorkflowObservationPolicy;
  missingOutputs: readonly MissingWorkflowOutput[];
  noBaseline: boolean;
  consecutiveNoProgressTurns: number;
  unresolvedContradictions: number;
  stableDecisionCount: number;
  budgetExceeded: boolean;
}): readonly WorkflowConvergenceReason[] {
  const { current, progress, policy, missingOutputs, budgetExceeded, stableDecisionCount } = context;
  if (context.noBaseline || progress.materialProgress) return ['new-material-progress'];

  const codes: WorkflowConvergenceReason[] = [];
  if (context.consecutiveNoProgressTurns > 0) codes.push('repeated-acknowledgement');
  if (context.unresolvedContradictions > 0) codes.push('unresolved-contradiction');
  if (stableDecisionCount > 0 && progress.decisionChanges === 0) codes.push('architecture-stable');
  if (progress.decisionChanges === 0) codes.push('no-decision-delta');
  if (progress.evidenceChanges === 0) codes.push('no-evidence-delta');
  if (progress.artifactChanges === 0 && missingOutputs.length > 0) {
    codes.push('no-artifact-delta');
    codes.push('required-artifact-missing');
  }
  if (hasUnresolvedBlockers(current)) codes.push('blocked-dependency');
  if (policy.requireVerification && current.verification.status === 'not-run') codes.push('verification-pending');
  if (missingOutputs.length === 0 && current.verification.status === 'pass')
    codes.push('completion-criteria-satisfied');
  if (budgetExceeded) codes.push('budget-threshold-reached');
  return codes;
}
