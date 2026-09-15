/**
 * CI-OBS-001C — GitHub Actions API client.
 *
 * Fetch-based client for reading GitHub Actions workflow runs, jobs,
 * and check runs. Does NOT use octokit — keeps dependencies minimal.
 *
 * Architectural boundary:
 *   This client is GitHub-specific. It MUST NOT be imported by
 *   @vestara/ci-contracts or any provider-neutral package.
 *
 * Authentication:
 *   Uses GITHUB_TOKEN from environment. Unauthenticated requests
 *   are rate-limited and may fail for private repos.
 *
 * Error handling:
 *   API failures are distinguished from CI failures. The caller
 *   receives a structured result that separates transport errors
 *   from CI state.
 */

import type { CIJobId } from '@vestara/ci-contracts';
import type {
  GitHubCheckRun,
  GitHubJobsResponse,
  GitHubWorkflowJob,
  GitHubWorkflowRun,
  GitHubWorkflowRunsResponse,
} from './github-types';
import { normalizeCheck, normalizeJob, normalizeRun } from './normalize';

// ─── Result types ───────────────────────────────────────────────────

/** Successful retrieval result. */
export interface GitHubCIResult<T> {
  readonly ok: true;
  readonly data: T;
}

/** Failed retrieval result — distinguished from CI failure. */
export interface GitHubCIError {
  readonly ok: false;
  readonly error: string;
  readonly status?: number;
  /** True when the failure is a transport/API error, not a CI failure. */
  readonly isRetrievalFailure: true;
}

export type GitHubCIOperationResult<T> = GitHubCIResult<T> | GitHubCIError;

// ─── Client configuration ───────────────────────────────────────────

export interface GitHubCIClientConfig {
  /** GitHub API base URL. Defaults to https://api.github.com. */
  readonly baseUrl?: string;
  /** GitHub token for authentication. If absent, requests are unauthenticated. */
  readonly token?: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  readonly timeoutMs?: number;
}

// ─── Client implementation ──────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.github.com';
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Create a GitHub Actions API client.
 *
 * The client is a factory function, not a class — keeps the interface
 * simple and testable.
 */
export function createGitHubCIClient(config: GitHubCIClientConfig = {}) {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const token = config.token;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Trusted API origin. Absolute provider URLs (e.g. job.check_run_url)
  // are only followed when they stay inside this boundary. A malformed
  // base URL trusts nothing — absolute URLs then fail closed while
  // relative paths still attempt (and fail) as retrieval failures.
  let trustedOrigin: string | null = null;
  try {
    trustedOrigin = new URL(baseUrl).origin;
  } catch {
    trustedOrigin = null;
  }

  /**
   * Resolve a request target against the trust boundary.
   *
   * Relative paths resolve against the configured base URL (same origin
   * by construction). Absolute provider URLs must be https: AND match
   * the trusted origin — otherwise they are refused BEFORE any network
   * activity, so the bearer token can never be forwarded off-origin.
   * Refusals return null plus a diagnostic; the caller converts them to
   * retrieval failures, never CI failures.
   */
  function resolveTrustedUrl(path: string): { url: string } | { refusal: string } {
    if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(path)) {
      return { url: `${baseUrl}${path}` };
    }
    let parsed: URL;
    try {
      parsed = new URL(path);
    } catch {
      return { refusal: 'Refused absolute provider URL: malformed URL' };
    }
    if (parsed.protocol !== 'https:') {
      return { refusal: `Refused absolute provider URL: non-HTTPS scheme '${parsed.protocol}'` };
    }
    if (trustedOrigin === null || parsed.origin !== trustedOrigin) {
      return {
        refusal: `Refused absolute provider URL: origin '${parsed.origin}' is outside the trusted GitHub API origin '${trustedOrigin ?? 'none'}'`,
      };
    }
    return { url: parsed.toString() };
  }

  async function request<T>(path: string): Promise<GitHubCIOperationResult<T>> {
    const resolved = resolveTrustedUrl(path);
    if ('refusal' in resolved) {
      return { ok: false, error: resolved.refusal, isRetrievalFailure: true };
    }
    // Reached only for same-origin targets (relative paths resolved
    // against baseUrl, or absolute URLs inside the trusted origin), so
    // attaching the bearer token here cannot leak it off-origin.
    const url = resolved.url;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        return {
          ok: false,
          error: `GitHub API error: ${response.status} ${response.statusText}`,
          status: response.status,
          isRetrievalFailure: true,
        };
      }

      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `GitHub API request failed: ${message}`,
        isRetrievalFailure: true,
      };
    }
  }

  return {
    /**
     * List recent workflow runs for a repository.
     * Maps GitHub API response to canonical CIVerificationRun[].
     */
    async listWorkflowRuns(
      owner: string,
      repo: string,
      options?: { readonly sha?: string; readonly perPage?: number },
    ): Promise<GitHubCIOperationResult<readonly import('@vestara/ci-contracts').CIVerificationRun[]>> {
      const shaParam = options?.sha ? `&head_sha=${encodeURIComponent(options.sha)}` : '';
      const perPage = options?.perPage ?? 10;
      const result = await request<GitHubWorkflowRunsResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs?per_page=${perPage}${shaParam}`,
      );
      if (!result.ok) return result;
      return { ok: true, data: result.data.workflow_runs.map(normalizeRun) };
    },

    /**
     * Get a single workflow run by ID.
     */
    async getWorkflowRun(
      owner: string,
      repo: string,
      runId: number,
    ): Promise<GitHubCIOperationResult<import('@vestara/ci-contracts').CIVerificationRun>> {
      const result = await request<GitHubWorkflowRun>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}`,
      );
      if (!result.ok) return result;
      return { ok: true, data: normalizeRun(result.data) };
    },

    /**
     * List jobs for a workflow run.
     * Maps GitHub API response to canonical CIJob[].
     */
    async listJobs(
      owner: string,
      repo: string,
      runId: number,
    ): Promise<GitHubCIOperationResult<readonly import('@vestara/ci-contracts').CIJob[]>> {
      const result = await request<GitHubJobsResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/jobs`,
      );
      if (!result.ok) return result;
      return { ok: true, data: result.data.jobs.map(normalizeJob) };
    },

    /**
     * List check runs for a workflow run.
     *
     * Job identity is established through the provider-supplied
     * `check_run_url` on each job — the ONLY genuine job↔check linkage
     * the API offers. The commit-level check-runs endpoint carries no
     * job linkage, so this adapter does not consume it: a check without
     * a known parent job is omitted rather than assigned a fabricated
     * identity. Jobs without `check_run_url` contribute no checks.
     *
     * Fail-closed: if any linked check run cannot be retrieved, the
     * whole operation reports a retrieval failure rather than an
     * undercounted observation.
     *
     * Trust boundary: linked check_run_url values are absolute provider
     * URLs and pass through the same-origin https: gate in request() —
     * foreign-host or non-HTTPS URLs are refused as retrieval failures
     * without any network activity or credential forwarding.
     */
    async listChecksForRun(
      owner: string,
      repo: string,
      runId: number,
    ): Promise<GitHubCIOperationResult<readonly import('@vestara/ci-contracts').CICheck[]>> {
      const jobsResult = await request<GitHubJobsResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/jobs`,
      );
      if (!jobsResult.ok) return jobsResult;

      const checks: import('@vestara/ci-contracts').CICheck[] = [];
      for (const job of jobsResult.data.jobs) {
        if (!job.check_run_url) continue;
        const checkResult = await request<GitHubCheckRun>(job.check_run_url);
        if (!checkResult.ok) return checkResult;
        checks.push(normalizeCheck(checkResult.data, String(job.id) as CIJobId));
      }
      return { ok: true, data: checks };
    },

    /**
     * Get failed step logs for a job (for failure evidence extraction).
     * Returns raw steps — the caller uses extractFailureEvidence().
     */
    async getJobSteps(
      owner: string,
      repo: string,
      jobId: number,
    ): Promise<GitHubCIOperationResult<GitHubWorkflowJob['steps']>> {
      const result = await request<GitHubWorkflowJob>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/jobs/${jobId}`,
      );
      if (!result.ok) return result;
      return { ok: true, data: result.data.steps };
    },
  };
}
