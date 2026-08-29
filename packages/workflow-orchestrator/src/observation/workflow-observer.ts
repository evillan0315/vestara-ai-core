/**
 * WFO-001 — workflow observation.
 *
 * A deterministic, replayable projection of workflow state, progress, and
 * convergence. It only reports: it never calls a model, never edits files,
 * never dispatches agents, and never mutates workflow state. The coordinator
 * validates and applies any recommendation.
 *
 * Shadow mode: callers may log every observation even when the recommendation
 * is ignored, building an evaluation dataset of observation → human decision →
 * outcome.
 */

import { createHash } from 'node:crypto';
import { assessConvergence, type WorkflowConvergenceAssessment } from './convergence-detector';
import { DEFAULT_WORKFLOW_OBSERVATION_POLICY, type WorkflowObservationPolicy } from './observation-policy';
import { computeProgressDelta, type WorkflowProgressDelta } from './progress-delta';
import { type MissingWorkflowOutput, projectWorkflowState } from './state-projector';
import type {
  WorkflowBlockerObservation,
  WorkflowObservationProvenance,
  WorkflowObservationSnapshot,
} from './workflow-snapshot';
import type { ObservedWorkflowState, RecommendedWorkflowAction } from './workflow-state';

export type WorkflowObservationConfidence = 'low' | 'medium' | 'high';

export type WorkflowBudgetStatus = 'within-budget' | 'approaching-limit' | 'exceeded';

export interface WorkflowCostObservation {
  readonly reasoningTurns: number;
  readonly executionTurns: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCost?: number;
  readonly budgetStatus: WorkflowBudgetStatus;
}

export interface WorkflowObservation {
  readonly workflowId: string;
  readonly observedAt: string;
  readonly currentState: ObservedWorkflowState;
  readonly recommendedState: ObservedWorkflowState;
  readonly recommendedAction: RecommendedWorkflowAction;
  readonly progress: WorkflowProgressDelta;
  readonly convergence: WorkflowConvergenceAssessment;
  readonly cost: WorkflowCostObservation;
  readonly confidence: WorkflowObservationConfidence;
  readonly reasons: readonly string[];
  readonly blockers: readonly WorkflowBlockerObservation[];
  readonly missingOutputs: readonly MissingWorkflowOutput[];
  readonly evidenceRefs: readonly string[];
  readonly sourceSnapshotHash: string;
  readonly shouldContinueConversation: boolean;
}

export interface WorkflowObservationInput {
  readonly workflowId: string;
  readonly previous?: WorkflowObservationSnapshot;
  /** Prior convergence assessment — allows the no-progress counter to accumulate across observations. */
  readonly previousAssessment?: WorkflowConvergenceAssessment;
  readonly current: WorkflowObservationSnapshot;
  readonly policy?: WorkflowObservationPolicy;
}

export interface WorkflowObserver {
  observe(input: WorkflowObservationInput): WorkflowObservation;
}

/** Recommended state implied by an action; `null` keeps the current state. */
const STATE_FOR_ACTION: Record<RecommendedWorkflowAction, ObservedWorkflowState | null> = {
  wait: null,
  'start-execution': 'in-progress',
  'continue-execution': 'in-progress',
  'request-artifact': 'ready',
  'request-review': 'awaiting-review',
  'request-verification': 'awaiting-verification',
  'pause-conversation': null,
  'resolve-blocker': 'blocked',
  complete: 'completed',
  fail: 'failed',
  escalate: null,
};

/**
 * Default deterministic observer. `observe` performs zero provider calls and
 * zero state mutations; identical inputs always produce identical outputs.
 */
export class DefaultWorkflowObserver implements WorkflowObserver {
  observe(input: WorkflowObservationInput): WorkflowObservation {
    const policy = input.policy ?? DEFAULT_WORKFLOW_OBSERVATION_POLICY;
    const current = input.current;
    const projection = projectWorkflowState(current, policy);
    const progress = computeProgressDelta(input.previous, current);
    const convergence = assessConvergence({
      previous: input.previous,
      previousAssessment: input.previousAssessment,
      current,
      progress,
      policy,
      missingOutputs: projection.missingOutputs,
    });
    const cost = deriveCost(current, policy);
    const shouldContinueConversation = decideConversation({
      previous: input.previous,
      current,
      progress,
      convergence,
      cost,
      projection,
    });
    const recommended = recommend(projection.state, projection.missingOutputs, convergence, cost, policy);
    const confidence = deriveConfidence(projection.state, convergence, current);
    const reasons = buildReasons({
      current,
      projection,
      progress,
      convergence,
      cost,
      shouldContinueConversation,
    });

    return {
      workflowId: input.workflowId,
      observedAt: current.capturedAt,
      currentState: projection.state,
      recommendedState: recommended.state,
      recommendedAction: recommended.action,
      progress,
      convergence,
      cost,
      confidence,
      reasons,
      blockers: current.blockers.filter((blocker) => blocker.status === 'open' || blocker.status === 'blocking'),
      missingOutputs: projection.missingOutputs,
      evidenceRefs: evidenceRefs(current),
      sourceSnapshotHash: snapshotHash(current),
      shouldContinueConversation,
    };
  }
}

function recommend(
  state: ObservedWorkflowState,
  missingOutputs: readonly MissingWorkflowOutput[],
  convergence: WorkflowConvergenceAssessment,
  cost: WorkflowCostObservation,
  policy: WorkflowObservationPolicy,
): { readonly state: ObservedWorkflowState; readonly action: RecommendedWorkflowAction } {
  let action: RecommendedWorkflowAction;
  switch (state) {
    case 'completed':
      action = 'complete';
      break;
    case 'failed':
      action = 'fail';
      break;
    case 'cancelled':
      action = 'wait';
      break;
    case 'blocked':
      action = 'resolve-blocker';
      break;
    case 'indeterminate':
      action = 'escalate';
      break;
    case 'awaiting-review':
      action = 'request-review';
      break;
    case 'awaiting-verification':
      action = 'request-verification';
      break;
    case 'in-progress':
      action = 'continue-execution';
      break;
    case 'pending':
      action = 'wait';
      break;
    case 'ready':
      action = missingOutputs.length > 0 ? 'request-artifact' : 'start-execution';
      break;
  }

  // Cost and convergence overrides: never let these silently drive completion.
  if (cost.budgetStatus === 'exceeded') {
    action = state === 'indeterminate' || state === 'blocked' ? 'escalate' : 'pause-conversation';
  } else if (convergence.status === 'stagnant') {
    action = convergence.unresolvedContradictions > 0 ? 'escalate' : 'pause-conversation';
  } else if (cost.reasoningTurns >= policy.maxReasoningTurns && convergence.unresolvedContradictions > 0) {
    action = 'escalate';
  }

  return { state: STATE_FOR_ACTION[action] ?? state, action };
}

function decideConversation(context: {
  previous: WorkflowObservationSnapshot | undefined;
  current: WorkflowObservationSnapshot;
  progress: WorkflowProgressDelta;
  convergence: WorkflowConvergenceAssessment;
  cost: WorkflowCostObservation;
  projection: { missingOutputs: readonly MissingWorkflowOutput[] };
}): boolean {
  const { previous, current, progress, convergence, cost } = context;
  if (cost.budgetStatus === 'exceeded') return false;
  if (convergence.status === 'stagnant') return false;

  // Explicit reasons to keep the conversation open.
  if (convergence.unresolvedContradictions > 0) return true;
  if (progress.decisionChanges > 0 && current.decisions.some((decision) => decision.status === 'proposed')) return true;
  if (progress.evidenceChanges > 0) return true;
  if (newlyRejectedDecision(previous, current)) return true;

  // Default: do not continue merely because another agent can acknowledge.
  return false;
}

function newlyRejectedDecision(
  previous: WorkflowObservationSnapshot | undefined,
  current: WorkflowObservationSnapshot,
): boolean {
  if (!previous) return false;
  const previousStatus = new Map(previous.decisions.map((decision) => [decision.id, decision.status]));
  return current.decisions.some(
    (decision) => decision.status === 'rejected' && previousStatus.get(decision.id) !== 'rejected',
  );
}

function deriveCost(current: WorkflowObservationSnapshot, policy: WorkflowObservationPolicy): WorkflowCostObservation {
  const estimatedCost = current.conversation.estimatedCost;
  let budgetStatus: WorkflowBudgetStatus = 'within-budget';
  if (policy.maxEstimatedCost !== undefined && estimatedCost !== undefined) {
    if (estimatedCost >= policy.maxEstimatedCost) budgetStatus = 'exceeded';
    else if (estimatedCost >= policy.maxEstimatedCost * 0.8) budgetStatus = 'approaching-limit';
  }
  return {
    reasoningTurns: current.conversation.reasoningTurns ?? current.conversation.turnCount,
    executionTurns: current.conversation.executionTurns ?? 0,
    inputTokens: current.conversation.cumulativeInputTokens,
    outputTokens: current.conversation.cumulativeOutputTokens,
    estimatedCost,
    budgetStatus,
  };
}

function deriveConfidence(
  state: ObservedWorkflowState,
  convergence: WorkflowConvergenceAssessment,
  current: WorkflowObservationSnapshot,
): WorkflowObservationConfidence {
  if (state === 'indeterminate' || current.verification.status === 'indeterminate') return 'low';
  if (convergence.unresolvedContradictions > 0) return 'low';
  const hasFacts =
    current.objective.requiredOutputs.length > 0 &&
    (current.tasks.length > 0 || current.artifacts.length > 0 || current.decisions.length > 0);
  return hasFacts ? 'high' : 'medium';
}

function buildReasons(context: {
  current: WorkflowObservationSnapshot;
  projection: { reasons: readonly string[] };
  progress: WorkflowProgressDelta;
  convergence: WorkflowConvergenceAssessment;
  cost: WorkflowCostObservation;
  shouldContinueConversation: boolean;
}): readonly string[] {
  const reasons = [...context.projection.reasons, ...provenanceReasons(context.current)];
  const { progress, convergence, cost, shouldContinueConversation } = context;

  if (convergence.status === 'not-evaluated') {
    reasons.push('First observation — no baseline to compare against.');
  } else if (progress.materialProgress) {
    reasons.push(`Material progress on: ${progress.materialDimensions.join(', ')}.`);
  } else {
    reasons.push('The latest turn introduced no material progress.');
  }
  if (convergence.stableDecisionCount > 0 && progress.decisionChanges === 0) {
    reasons.push('Architecture decisions are stable.');
  }
  if (convergence.unresolvedContradictions > 0) {
    reasons.push(`${convergence.unresolvedContradictions} unresolved contradiction(s) remain.`);
  }
  if (!shouldContinueConversation && !progress.materialProgress && convergence.status !== 'not-evaluated') {
    reasons.push('No further free-form reasoning is justified; route to the next required stage.');
  }
  if (shouldContinueConversation) reasons.push('A specific issue requires a conversational response.');
  if (cost.budgetStatus === 'exceeded') {
    reasons.push('Cost budget exceeded — pausing for a coordinator or human policy decision.');
  } else if (cost.budgetStatus === 'approaching-limit') {
    reasons.push('Cost budget is approaching its limit.');
  }
  return reasons;
}

function evidenceRefs(current: WorkflowObservationSnapshot): readonly string[] {
  const refs = current.evidence.map((evidence) => evidence.ref);
  if (current.verification.conclusionRef) refs.push(current.verification.conclusionRef);
  return refs;
}

const PROVENANCE_FIELD_LABELS: Record<keyof WorkflowObservationProvenance, string> = {
  tasks: 'task state',
  agents: 'agent state',
  artifacts: 'artifact state',
  decisions: 'decisions',
  evidence: 'evidence',
  blockers: 'blockers',
  approvals: 'approvals',
  verification: 'verification',
  repository: 'repository state',
  conversation: 'conversation metrics',
};

/**
 * Surfaces honesty about inferred/defaulted fields so derived approximations are
 * never presented as authoritative facts.
 */
function provenanceReasons(snapshot: WorkflowObservationSnapshot): string[] {
  const provenance = snapshot.provenance;
  if (!provenance) return [];
  return Object.keys(PROVENANCE_FIELD_LABELS).flatMap((key) => {
    const field = provenance[key as keyof typeof provenance];
    if (field.source !== 'defaulted' && field.source !== 'missing') return [];
    return [
      `${PROVENANCE_FIELD_LABELS[key as keyof typeof provenance]} ${field.source} — ${field.reason ?? 'evidence unavailable'}.`,
    ];
  });
}

/** Canonical, deterministic hash of the current snapshot (replay identity). */
export function snapshotHash(snapshot: WorkflowObservationSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

/** Canonical hash of an observation — stable for identical inputs (observedAt = capturedAt). */
export function observationHash(observation: WorkflowObservation): string {
  return createHash('sha256').update(JSON.stringify(observation)).digest('hex');
}
