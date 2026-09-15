/**
 * CI-OBS-001C — GitHub Actions API response types.
 *
 * These types represent the shapes returned by the GitHub REST API v3
 * for workflow runs, jobs, and check runs. They are INTERNAL to this
 * adapter — not exported from the package. The adapter normalizes these
 * into @vestara/ci-contracts.
 *
 * Reference: https://docs.github.com/en/rest/actions/workflow-runs
 */

// ─── Workflow Runs ──────────────────────────────────────────────────

/** GitHub Actions workflow run status (API field: `status`). */
export type GitHubRunStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'waiting'
  | 'pending'
  | 'requested'
  | 'started'
  | string;

/** GitHub Actions workflow run conclusion (API field: `conclusion`). */
export type GitHubRunConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'timed_out'
  | 'skipped'
  | 'neutral'
  | 'stale'
  | 'action_required'
  | null
  | string;

/** GitHub workflow run API response shape. */
export interface GitHubWorkflowRun {
  readonly id: number;
  readonly name: string;
  readonly node_id: string;
  readonly run_number: number;
  readonly event: string;
  readonly status: GitHubRunStatus;
  readonly conclusion: GitHubRunConclusion;
  readonly workflow_id: number;
  readonly check_suite_id: number;
  readonly check_suite_node_id: string;
  readonly url: string;
  readonly html_url: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly run_started_at?: string;
  readonly jobs_url: string;
  readonly logs_url: string;
  readonly artifacts_url: string;
  readonly head_branch: string;
  readonly head_sha: string;
  readonly repository: {
    readonly id: number;
    readonly name: string;
    readonly full_name: string;
    readonly owner: {
      readonly login: string;
    };
  };
  readonly attempt: number;
}

/** Response shape for GET /repos/{owner}/{repo}/actions/runs. */
export interface GitHubWorkflowRunsResponse {
  readonly total_count: number;
  readonly workflow_runs: readonly GitHubWorkflowRun[];
}

// ─── Jobs ───────────────────────────────────────────────────────────

/** GitHub Actions job status. */
export type GitHubJobStatus = 'queued' | 'in_progress' | 'completed' | string;

/** GitHub Actions job conclusion. */
export type GitHubJobConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'timed_out'
  | 'skipped'
  | 'neutral'
  | 'action_required'
  | null
  | string;

/** A single step within a GitHub Actions job. */
export interface GitHubJobStep {
  readonly name: string;
  readonly status: GitHubJobStatus;
  readonly conclusion: GitHubJobConclusion | null;
  readonly number: number;
  readonly started_at: string | null;
  readonly completed_at: string | null;
}

/** GitHub Actions job API response shape. */
export interface GitHubWorkflowJob {
  readonly id: number;
  readonly run_id: number;
  readonly name: string;
  readonly status: GitHubJobStatus;
  readonly conclusion: GitHubJobConclusion;
  readonly started_at: string;
  readonly completed_at: string | null;
  readonly url: string;
  readonly html_url: string;
  /**
   * Provider-supplied linkage from job to its check run.
   * This is the ONLY genuine job↔check correlation the API offers
   * (the commit-level check-runs endpoint carries no job linkage).
   */
  readonly check_run_url: string | null;
  readonly run_attempt: number;
  readonly steps: readonly GitHubJobStep[];
}

/** Response shape for GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs. */
export interface GitHubJobsResponse {
  readonly total_count: number;
  readonly jobs: readonly GitHubWorkflowJob[];
}

// ─── Check Runs ─────────────────────────────────────────────────────

/** GitHub Actions check run status. */
export type GitHubCheckStatus = 'queued' | 'in_progress' | 'completed' | string;

/** GitHub Actions check run conclusion. */
export type GitHubCheckConclusion =
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'timed_out'
  | 'skipped'
  | 'neutral'
  | 'stale'
  | 'action_required'
  | null
  | string;

/** GitHub Actions check run API response shape. */
export interface GitHubCheckRun {
  readonly id: number;
  readonly name: string;
  readonly status: GitHubCheckStatus;
  readonly conclusion: GitHubCheckConclusion;
  readonly started_at: string;
  readonly completed_at: string | null;
  readonly url: string;
  readonly html_url: string;
  readonly output?: {
    readonly title?: string;
    readonly summary?: string;
  };
}

/** Response shape for GET /repos/{owner}/{repo}/commits/{sha}/check-runs. */
export interface GitHubCheckRunsResponse {
  readonly total_count: number;
  readonly check_runs: readonly GitHubCheckRun[];
}
