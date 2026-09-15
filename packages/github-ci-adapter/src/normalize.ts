/**
 * CI-OBS-001C — GitHub → CI contract normalization.
 *
 * Pure functions that translate GitHub Actions API response shapes into
 * canonical @vestara/ci-contracts types. GitHub terminology stays inside
 * this module. The outputs are fully provider-neutral.
 *
 * Architectural boundary:
 *   GitHub API → This adapter → @vestara/ci-contracts
 *   NEVER: @vestara/ci-contracts → GitHub-specific interpretation
 *
 * Invariants:
 *   - UNKNOWN is preserved when GitHub data cannot be mapped safely
 *   - Retrieval/API failure ≠ CI failure
 *   - Provider-native values preserved as provenance, never canonical inputs
 */

import type {
  CIAttempt,
  CICheck,
  CICheckId,
  CICommitId,
  CIConclusion,
  CIFailureEvidence,
  CIJob,
  CIJobId,
  CIObservation,
  CIObservationTrigger,
  CIRunId,
  CIStatus,
  CIVerificationRun,
} from '@vestara/ci-contracts';

import type { GitHubCheckRun, GitHubJobStep, GitHubWorkflowJob, GitHubWorkflowRun } from './github-types';

// ─── Status normalization ───────────────────────────────────────────

/**
 * Normalize GitHub workflow run status → CIStatus.
 *
 * GitHub uses: queued, in_progress, completed, waiting, pending, requested, started
 * CI contracts use: discovered, queued, running, completed
 *
 * Unknown/unrecognized statuses map to 'discovered'. An unrecognized
 * provider status does not confirm execution, queuing, or completion.
 * 'discovered' is the weakest assertion: we know the run exists, we
 * cannot confirm any provider-side activity. Provider-native values
 * are preserved on rawStatus for provenance and debugging.
 */
export function normalizeRunStatus(githubStatus: string): CIStatus {
  switch (githubStatus) {
    case 'completed':
      return 'completed';
    case 'queued':
    case 'waiting':
    case 'pending':
    case 'requested':
      return 'queued';
    case 'in_progress':
    case 'started':
      return 'running';
    default:
      // Unknown status — 'discovered' (weakest assertion: run exists,
      // provider activity unconfirmed). NOT 'running' — an unrecognized
      // status does not confirm active execution.
      return 'discovered';
  }
}

/**
 * Normalize GitHub job status → CIStatus.
 * Same mapping as run status but without run-specific states.
 */
export function normalizeJobStatus(githubStatus: string): CIStatus {
  switch (githubStatus) {
    case 'completed':
      return 'completed';
    case 'queued':
      return 'queued';
    case 'in_progress':
      return 'running';
    default:
      return 'discovered';
  }
}

/**
 * Normalize GitHub check status → CIStatus.
 */
export function normalizeCheckStatus(githubStatus: string): CIStatus {
  switch (githubStatus) {
    case 'completed':
      return 'completed';
    case 'queued':
      return 'queued';
    case 'in_progress':
      return 'running';
    default:
      return 'discovered';
  }
}

// ─── Conclusion normalization ───────────────────────────────────────

/**
 * Normalize GitHub workflow run conclusion → CIConclusion.
 *
 * GitHub uses: success, failure, cancelled, timed_out, skipped, neutral, stale, action_required
 * CI contracts use: passed, failed, cancelled, timed_out, skipped, unknown
 *
 * Critical: null conclusion (run not yet completed) → 'unknown'.
 * `neutral` and `stale` map to 'unknown' — they don't map cleanly.
 * `action_required` maps to 'failed' — something needs human intervention.
 */
export function normalizeRunConclusion(githubConclusion: string | null | undefined): CIConclusion {
  if (githubConclusion === null || githubConclusion === undefined) {
    return 'unknown';
  }
  switch (githubConclusion) {
    case 'success':
      return 'passed';
    case 'failure':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'timed_out':
      return 'timed_out';
    case 'skipped':
      return 'skipped';
    case 'action_required':
      // action_required means something needs human attention — treat as failed
      return 'failed';
    case 'neutral':
    case 'stale':
      // No clean mapping — preserve as unknown
      return 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Normalize GitHub job conclusion → CIConclusion.
 */
export function normalizeJobConclusion(githubConclusion: string | null | undefined): CIConclusion {
  if (githubConclusion === null || githubConclusion === undefined) {
    return 'unknown';
  }
  switch (githubConclusion) {
    case 'success':
      return 'passed';
    case 'failure':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'timed_out':
      return 'timed_out';
    case 'skipped':
      return 'skipped';
    case 'action_required':
      return 'failed';
    case 'neutral':
      return 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Normalize GitHub check conclusion → CIConclusion.
 */
export function normalizeCheckConclusion(githubConclusion: string | null | undefined): CIConclusion {
  if (githubConclusion === null || githubConclusion === undefined) {
    return 'unknown';
  }
  switch (githubConclusion) {
    case 'success':
      return 'passed';
    case 'failure':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'timed_out':
      return 'timed_out';
    case 'skipped':
      return 'skipped';
    case 'action_required':
      return 'failed';
    case 'neutral':
    case 'stale':
      return 'unknown';
    default:
      return 'unknown';
  }
}

// ─── Step conclusion normalization ──────────────────────────────────

/**
 * Normalize a GitHub job step conclusion for failure evidence extraction.
 * Steps have their own conclusion that may differ from the job-level conclusion.
 */
export function normalizeStepConclusion(conclusion: string | null | undefined): CIConclusion {
  if (conclusion === null || conclusion === undefined) {
    return 'unknown';
  }
  switch (conclusion) {
    case 'success':
      return 'passed';
    case 'failure':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'timed_out':
      return 'timed_out';
    case 'skipped':
      return 'skipped';
    default:
      return 'unknown';
  }
}

// ─── Entity construction ────────────────────────────────────────────

/** Coerce a GitHub numeric ID to a branded CI ID type. */
function toRunId(id: number): CIRunId {
  return String(id) as CIRunId;
}

function toJobId(id: number): CIJobId {
  return String(id) as CIJobId;
}

function toCheckId(id: number): CICheckId {
  return String(id) as CICheckId;
}

/**
 * Normalize a GitHub workflow run → CIVerificationRun.
 *
 * Preserves GitHub-native status/conclusion as rawStatus/rawConclusion
 * for provenance. Canonical fields use normalized values.
 *
 * Invariants:
 *   - commitSha is always set (head_sha from the run)
 *   - attempt is always >= 1 (GitHub default)
 *   - rawStatus/rawConclusion preserve the original GitHub values
 */
export function normalizeRun(run: GitHubWorkflowRun): CIVerificationRun {
  return {
    runId: toRunId(run.id),
    repository: run.repository.full_name,
    commitSha: run.head_sha as CICommitId,
    branch: run.head_branch || undefined,
    status: normalizeRunStatus(run.status),
    conclusion: normalizeRunConclusion(run.conclusion),
    attempt: (run.attempt ?? 1) as CIAttempt,
    discoveredAt: run.created_at,
    startedAt: run.run_started_at || undefined,
    completedAt: run.status === 'completed' ? run.updated_at : undefined,
    rawStatus: run.status,
    rawConclusion: run.conclusion ?? undefined,
    url: run.html_url,
    provider: 'github-actions',
    workflowName: run.name || undefined,
  };
}

/**
 * Normalize a GitHub workflow job → CIJob.
 *
 * Preserves GitHub-native status as rawStatus for provenance.
 */
export function normalizeJob(job: GitHubWorkflowJob): CIJob {
  return {
    jobId: toJobId(job.id),
    runId: toRunId(job.run_id),
    name: job.name,
    status: normalizeJobStatus(job.status),
    conclusion: normalizeJobConclusion(job.conclusion),
    attempt: (job.run_attempt ?? 1) as CIAttempt,
    rawStatus: job.status,
    url: job.html_url,
    durationMs:
      job.completed_at && job.started_at
        ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
        : undefined,
  };
}

/**
 * Normalize a GitHub check run → CICheck.
 *
 * The caller MUST supply the genuine parent job ID. The commit-level
 * check-runs endpoint carries no job linkage, so the adapter never
 * invents one: jobs expose `check_run_url`, and run-scoped check
 * retrieval follows that provider-supplied linkage.
 *
 * Preserves GitHub-native status/conclusion as rawStatus/rawConclusion
 * for provenance. Maps failed steps to failureEvidence when available.
 */
export function normalizeCheck(check: GitHubCheckRun, jobId: CIJobId): CICheck {
  return {
    checkId: toCheckId(check.id),
    jobId,
    name: check.name,
    status: normalizeCheckStatus(check.status),
    conclusion: normalizeCheckConclusion(check.conclusion),
    rawStatus: check.status,
    rawConclusion: check.conclusion ?? undefined,
    url: check.html_url,
    durationMs:
      check.completed_at && check.started_at
        ? new Date(check.completed_at).getTime() - new Date(check.started_at).getTime()
        : undefined,
  };
}

/**
 * Extract failure evidence from GitHub job steps.
 *
 * Finds the first failed step and constructs a canonical
 * CIFailureEvidence. The evidence ID is derived from provider data
 * (job ID + step number), never invented. Returns undefined when no
 * failed step is found.
 */
export function extractFailureEvidence(steps: readonly GitHubJobStep[], jobId: CIJobId): CIFailureEvidence | undefined {
  const failedStep = steps.find((s) => normalizeStepConclusion(s.conclusion) === 'failed');
  if (!failedStep) return undefined;

  return {
    evidenceId: `gh-evidence-${jobId}-step-${failedStep.number}`,
    kind: 'log-excerpt',
    summary: `Step "${failedStep.name}" failed`,
    stepName: failedStep.name,
    capturedAt: failedStep.completed_at || failedStep.started_at || new Date().toISOString(),
  };
}

// ─── Observation construction ───────────────────────────────────────

/**
 * Build a CIObservation from normalized run, jobs, and checks.
 *
 * Counts checks by conclusion to produce the observation snapshot.
 * This is the canonical observation that feeds downstream
 * classification and hypothesis generation.
 *
 * The default trigger is 'polling': per frozen CI-OBS-001A there is no
 * GitHub webhook receiver — polling is the observation mechanism for
 * initial dogfood. Callers with a genuine alternate trigger pass it
 * explicitly.
 */
export function buildObservation(
  run: CIVerificationRun,
  jobs: readonly CIJob[],
  checks: readonly CICheck[],
  trigger: CIObservationTrigger = 'polling',
): CIObservation {
  let passedChecks = 0;
  let failedChecks = 0;
  let skippedChecks = 0;

  for (const check of checks) {
    switch (check.conclusion) {
      case 'passed':
        passedChecks++;
        break;
      case 'failed':
        failedChecks++;
        break;
      case 'skipped':
      case 'unknown':
        skippedChecks++;
        break;
      // cancelled, timed_out count as failed for observation purposes
      case 'cancelled':
      case 'timed_out':
        failedChecks++;
        break;
    }
  }

  // If no checks were provided, use jobs as a fallback
  if (checks.length === 0) {
    for (const job of jobs) {
      switch (job.conclusion) {
        case 'passed':
          passedChecks++;
          break;
        case 'failed':
          failedChecks++;
          break;
        case 'skipped':
        case 'unknown':
          skippedChecks++;
          break;
        case 'cancelled':
        case 'timed_out':
          failedChecks++;
          break;
      }
    }
  }

  return {
    observationId: `obs-${run.runId}`,
    runId: run.runId,
    commitSha: run.commitSha,
    status: run.status,
    conclusion: run.conclusion,
    passedChecks,
    failedChecks,
    skippedChecks,
    trigger,
    observedAt: run.completedAt || run.discoveredAt,
    provenance: run.url ? [run.url] : [],
  };
}
