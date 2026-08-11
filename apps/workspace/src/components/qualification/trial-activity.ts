/**
 * WUX-001B — reconstructed trial activity timeline.
 *
 * Rebuilds the governed flow from a qualification trial report's invocation
 * evidence (role, schema retries, material progress), plan versions, review
 * conclusion, and outcome. This is a display projection of the recorded
 * evidence — never authoritative workflow state.
 */

import type { QualificationTrial } from '../../lib/qualification.js';

export interface ActivityStep {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly state: 'complete' | 'active' | 'blocked' | 'indeterminate';
}

export function reconstructTrialActivity(trial: QualificationTrial): ActivityStep[] {
  const steps: ActivityStep[] = [];
  const model = trial.identity.modelId;
  const totalVersions = trial.planner.versions.length;
  let planVersion = 0;

  for (const invocation of trial.invocations) {
    if (invocation.role === 'planner') {
      steps.push({
        id: `planner-${steps.length}`,
        label: `Planner · ${model}`,
        detail:
          invocation.retries > 0 ? `Schema retry ${invocation.retries} succeeded` : 'Schema-valid on first attempt',
        state: invocation.schemaValid ? 'complete' : 'indeterminate',
      });
      if (invocation.materialProgress) {
        planVersion += 1;
        steps.push({
          id: `plan-${planVersion}`,
          label: `Plan Version ${planVersion}`,
          detail: `Immutably recorded (${trial.planner.versions.find((v) => v.version === planVersion)?.planHash.slice(0, 12) ?? ''}…)`,
          state: 'complete',
        });
      }
    } else {
      steps.push({
        id: `reviewer-${steps.length}`,
        label: `Reviewer · ${model}`,
        detail:
          invocation.retries > 0 ? `Schema retry ${invocation.retries} succeeded` : 'Schema-valid on first attempt',
        state: invocation.schemaValid ? 'complete' : 'indeterminate',
      });
      if (planVersion < totalVersions) {
        steps.push({
          id: `revision-${planVersion}`,
          label: 'Revision requested',
          detail: 'Planner receives structured findings only',
          state: 'complete',
        });
      }
    }
  }

  const review = trial.reviewer.review as { conclusion?: string; findings?: unknown[] } | null;
  if (review) {
    steps.push({
      id: 'review-conclusion',
      label: 'Review conclusion',
      detail: `${review.conclusion ?? 'unknown'}${(review.findings?.length ?? 0) > 0 ? ` · ${review.findings?.length} finding(s)` : ''}`,
      state: 'complete',
    });
  }

  if (trial.outcome === 'awaiting-human-approval' || trial.outcome === 'approved') {
    steps.push({
      id: 'human-approval',
      label: 'Human Approval',
      detail: trial.outcome === 'awaiting-human-approval' ? 'Awaiting human approval' : 'Approved',
      state: trial.outcome === 'awaiting-human-approval' ? 'active' : 'complete',
    });
    steps.push({
      id: 'execution',
      label: 'Execution',
      detail: trial.workflowResult.stoppedBeforeExecution
        ? 'Blocked — execution capability is not enabled for this trial'
        : 'Ready',
      state: trial.workflowResult.stoppedBeforeExecution ? 'blocked' : 'complete',
    });
  } else {
    steps.push({
      id: 'terminal',
      label: 'Workflow outcome',
      detail: trial.outcome,
      state: 'indeterminate',
    });
  }

  return steps;
}
