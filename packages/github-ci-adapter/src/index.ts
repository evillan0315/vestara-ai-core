/**
 * @vestara/github-ci-adapter — GitHub Actions adapter for CI Observation.
 *
 * Translates GitHub Actions API responses into canonical @vestara/ci-contracts.
 * GitHub terminology is contained within this adapter and must not leak
 * into provider-neutral contracts.
 *
 * Architectural boundary:
 *   GitHub API → This adapter → @vestara/ci-contracts
 *   NEVER: @vestara/ci-contracts → GitHub-specific interpretation
 */

/**
 * Adapter package version — display metadata only.
 *
 * Not an observation contract: consumers may surface it as configuration
 * provenance but must never branch CI logic on it.
 */
export const GITHUB_CI_ADAPTER_VERSION = '0.1.0';

export type { GitHubCIClientConfig, GitHubCIError, GitHubCIOperationResult, GitHubCIResult } from './client';
// ─── Client ─────────────────────────────────────────────────────────
export { createGitHubCIClient } from './client';
// Provider payload types (GitHub terminology stays inside this adapter).
export type {
  GitHubCheckRun,
  GitHubCheckRunsResponse,
  GitHubJobStep,
  GitHubJobsResponse,
  GitHubWorkflowJob,
  GitHubWorkflowRun,
  GitHubWorkflowRunsResponse,
} from './github-types';
// ─── Normalization (pure functions) ─────────────────────────────────
export {
  buildObservation,
  extractFailureEvidence,
  normalizeCheck,
  normalizeCheckConclusion,
  normalizeCheckStatus,
  normalizeJob,
  normalizeJobConclusion,
  normalizeJobStatus,
  normalizeRun,
  normalizeRunConclusion,
  normalizeRunStatus,
  normalizeStepConclusion,
} from './normalize';
