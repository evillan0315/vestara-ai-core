/**
 * WUX-001B — trial detail panel.
 *
 * Renders one qualification trial through the shared WorkflowHeader +
 * WorkflowStage components plus the recorded plan, review, usage, and a
 * reconstructed governed-flow activity timeline.
 */

import { Link } from 'react-router-dom';
import type { QualificationTrial } from '../../lib/qualification.js';
import { reconstructTrialActivity } from './trial-activity.js';
import { WorkflowHeader } from './WorkflowHeader.js';
import { WorkflowStage, type WorkflowStageState } from './WorkflowStage.js';

export interface PlanView {
  summary: string;
  assumptions: string[];
  steps: Array<{
    id: string;
    description: string;
    assignedRole: string;
    expectedArtifacts: string[];
    verificationRequirements: string[];
  }>;
  affectedPaths: string[];
  outOfScope: string[];
  requiredApprovals: string[];
  risks: string[];
  completionCriteria: string[];
}

export interface ReviewView {
  conclusion: string;
  findings: Array<{ id: string; severity: string; category: string; message: string; evidenceRefs: string[] }>;
  evidenceRefs: string[];
}

const SEVERITY_STYLE: Record<string, string> = {
  blocking: 'bg-red-500/15 text-red-300',
  warning: 'bg-amber-500/15 text-amber-300',
  info: 'bg-sky-500/15 text-sky-300',
};

const ACTIVITY_DOT: Record<string, string> = {
  complete: 'bg-emerald-500',
  active: 'bg-sky-500 animate-pulse',
  blocked: 'bg-red-500',
  indeterminate: 'bg-amber-500',
};

export function planOf(trial: QualificationTrial): PlanView | null {
  return (trial.planner.plan as PlanView) ?? null;
}

export function reviewOf(trial: QualificationTrial): ReviewView | null {
  return (trial.reviewer.review as ReviewView) ?? null;
}

export function stateLabel(trial: QualificationTrial): string {
  switch (trial.outcome) {
    case 'awaiting-human-approval':
      return 'Awaiting Human Approval';
    case 'approved':
      return 'Approved';
    case 'changes-requested':
      return 'Changes Requested';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Indeterminate';
  }
}

export function objectiveOf(trial: QualificationTrial): string {
  return (
    planOf(trial)?.summary ??
    'Add a read-only API endpoint that exposes worker scheduling status, with targeted tests and documentation.'
  );
}

export function TrialDetailPanel({ trial }: { trial: QualificationTrial }) {
  const plan = planOf(trial);
  const review = reviewOf(trial);
  const activity = reconstructTrialActivity(trial);
  const occurrences = new Map<string, number>();
  const invocations = trial.invocations.map((invocation) => {
    const occurrence = (occurrences.get(invocation.role) ?? 0) + 1;
    occurrences.set(invocation.role, occurrence);
    return { ...invocation, occurrence };
  });
  const stages: WorkflowStageState[] = [
    { stage: 'intake', label: 'Objective', state: 'complete' },
    { stage: 'planning', label: 'Plan', state: 'complete' },
    { stage: 'plan-review', label: 'Plan Review', state: review ? 'complete' : 'indeterminate' },
    {
      stage: 'human-approval',
      label: 'Human Approval',
      state: trial.outcome === 'awaiting-human-approval' ? 'active' : 'pending',
    },
    { stage: 'execution', label: 'Execution', state: 'blocked' },
    { stage: 'verification', label: 'Verification', state: 'pending' },
    { stage: 'completion', label: 'Completion', state: 'pending' },
  ];

  return (
    <div className="space-y-4">
      <WorkflowHeader
        workflowId={trial.profileId}
        objective={objectiveOf(trial)}
        authoritativeState={stateLabel(trial)}
        observedState="Ready to Continue"
        observedApplied={false}
        activeAgent={`${trial.identity.modelId} / ${trial.identity.providerId}`}
        nextRequiredAction={
          trial.outcome === 'awaiting-human-approval' ? 'Human plan approval' : 'No execution authorized'
        }
        primaryAction={{
          label: 'Approve for Execution',
          disabled: true,
          hint: 'Execution capability is not enabled for this trial.',
        }}
        executionBlocked={trial.workflowResult.stoppedBeforeExecution}
      />
      <div className="text-right">
        <Link to={`/qualification/${encodeURIComponent(trial.profileId)}/activity`} className="text-xs text-sky-400 hover:underline">
          Open Activity Room →
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-3">
          <WorkflowStage stages={stages} />
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-4">
            <h2 className="text-xs font-semibold text-(--vestara-text)">Planner</h2>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-[10px] text-(--vestara-text-muted)">Schema retries</dt>
                <dd>{trial.execution.retryCount}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-(--vestara-text-muted)">Plan versions</dt>
                <dd>{trial.planner.versions.length}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-(--vestara-text-muted)">Material progress</dt>
                <dd>{trial.planner.materialProgress ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-(--vestara-text-muted)">Schema-valid first attempt</dt>
                <dd>{trial.planner.schemaValidFirstAttempt ? 'Yes' : 'No'}</dd>
              </div>
            </dl>

            {plan && (
              <div className="mt-3 space-y-3">
                <p className="text-xs leading-relaxed text-(--vestara-text-2)">{plan.summary}</p>
                {plan.steps.length > 0 && (
                  <ol className="space-y-1">
                    {plan.steps.map((step, index) => (
                      <li key={step.id ?? index} className="text-xs text-(--vestara-text-2)">
                        <span className="text-(--vestara-text-muted)">{index + 1}.</span> {step.description}
                        <span className="ml-1 text-[10px] text-(--vestara-text-muted)">({step.assignedRole})</span>
                      </li>
                    ))}
                  </ol>
                )}
                {plan.affectedPaths.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted)">
                      Affected paths
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {plan.affectedPaths.map((p) => (
                        <code key={p} className="rounded bg-zinc-800/70 px-1.5 py-0.5 text-[10px]">
                          {p}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
                {plan.outOfScope.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted)">Out of scope</div>
                    <ul className="mt-1 space-y-0.5">
                      {plan.outOfScope.map((item) => (
                        <li key={item} className="text-[11px] text-(--vestara-text-muted)">
                          · {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {plan.risks.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted)">Risks</div>
                    <ul className="mt-1 space-y-0.5">
                      {plan.risks.map((risk) => (
                        <li key={risk} className="text-[11px] text-amber-300">
                          · {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-4">
            <h2 className="text-xs font-semibold text-(--vestara-text)">Reviewer</h2>
            {review ? (
              <div className="mt-2">
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                  {review.conclusion}
                </span>
                {review.findings.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {review.findings.map((finding) => (
                      <li
                        key={finding.id}
                        className={`rounded px-2 py-1 text-[11px] ${SEVERITY_STYLE[finding.severity] ?? ''}`}
                      >
                        <strong className="mr-1 uppercase">{finding.severity}</strong>
                        <span className="text-(--vestara-text-dim)">{finding.category} · </span>
                        {finding.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-(--vestara-text-muted)">No findings.</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-(--vestara-text-muted)">No review produced.</p>
            )}
          </section>

          <section className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-4">
            <h2 className="text-xs font-semibold text-(--vestara-text)">Activity</h2>
            <ol className="mt-2 space-y-1">
              {activity.map((step) => (
                <li key={step.id} className="flex items-start gap-2 text-xs">
                  <span
                    className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${ACTIVITY_DOT[step.state]}`}
                    aria-hidden="true"
                  />
                  <span>
                    <span className="text-(--vestara-text)">{step.label}</span>
                    <span className="ml-1 text-(--vestara-text-muted)">· {step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-4">
            <h2 className="text-xs font-semibold text-(--vestara-text)">Usage</h2>
            <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-[10px] text-(--vestara-text-muted)">Model calls</dt>
                <dd>{trial.execution.callCount}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-(--vestara-text-muted)">Input tokens</dt>
                <dd>{trial.execution.totalInputTokens.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-(--vestara-text-muted)">Output tokens</dt>
                <dd>{trial.execution.totalOutputTokens.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-[10px] text-(--vestara-text-muted)">Duration</dt>
                <dd>
                  {trial.execution.totalDurationMs >= 60_000
                    ? `${(trial.execution.totalDurationMs / 60_000).toFixed(1)}m`
                    : `${Math.round(trial.execution.totalDurationMs / 1_000)}s`}
                </dd>
              </div>
            </dl>
            {invocations.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {invocations.map((invocation) => (
                  <li
                    key={`${invocation.role}-${invocation.occurrence}`}
                    className="flex flex-wrap items-center gap-2 text-[11px] text-(--vestara-text-muted)"
                  >
                    <span className="text-(--vestara-text-2)">{invocation.role}</span>
                    <span>{invocation.schemaValid ? 'schema-valid' : 'schema-invalid'}</span>
                    <span>retries: {invocation.retries}</span>
                    <span>
                      tokens: {invocation.inputTokens}/{invocation.outputTokens}
                    </span>
                    <span>{invocation.materialProgress ? 'material' : 'no-material'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
