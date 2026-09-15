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

export type { GitHubCIClientConfig, GitHubCIError, GitHubCIOperationResult, GitHubCIResult } from './client';

// ─── Client ─────────────────────────────────────────────────────────
export { createGitHubCIClient } from './client';
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
