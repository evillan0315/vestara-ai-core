/**
 * CI-OBS-001B — CIVerificationRun — the top-level CI verification entity.
 *
 * A verification run represents one pipeline execution for a specific
 * commit. It contains jobs, which contain checks. The hierarchy is:
 * Run → Job → Check.
 *
 * A run is discovered after a push, progresses through lifecycle states,
 * and reaches a terminal conclusion. The run carries enough provenance
 * to reconstruct what happened and why.
 *
 * Invariants:
 *   - Push ≠ Completion
 *   - CI Pass ≠ Objective Verification
 *   - Provider-native data is preserved but not used for canonical logic
 */

import type { CIConclusion } from './conclusion';
import type { CIAttempt, CICommitId, CIRunId } from './identity';
import type { CIStatus } from './status';

/**
 * Provider-native run status — preserved for provenance, diagnostics,
 * replay, and adapter debugging. MUST NOT be used for canonical
 * status/conclusion logic.
 *
 * Architectural boundary:
 *   Provider-native state → Adapter normalization → Canonical CI contract
 *   NEVER: Canonical domain → provider-specific interpretation
 */
export type CIRawRunStatus = string;

/**
 * Provider-native run conclusion — preserved for provenance, diagnostics,
 * replay, and adapter debugging. MUST NOT be used for canonical
 * status/conclusion logic.
 *
 * Architectural boundary:
 *   Provider-native state → Adapter normalization → Canonical CI contract
 *   NEVER: Canonical domain → provider-specific interpretation
 */
export type CIRawRunConclusion = string;

/** A CI verification run — the top-level entity. */
export interface CIVerificationRun {
  /** Unique run identifier. */
  readonly runId: CIRunId;

  /** Repository this run belongs to (provider-neutral reference). */
  readonly repository: string;

  /** Commit that triggered this run (provider-neutral identity). */
  readonly commitSha: CICommitId;

  /** Branch name, if known. */
  readonly branch?: string;

  /** Canonical lifecycle status. */
  readonly status: CIStatus;

  /** Canonical terminal conclusion (only meaningful when status is 'completed'). */
  readonly conclusion: CIConclusion;

  /** Attempt number (1 = initial run, >1 = rerun). */
  readonly attempt: CIAttempt;

  /** When the run was discovered by Vestara. ISO-8601. */
  readonly discoveredAt: string;

  /** When the run started executing, if known. ISO-8601. */
  readonly startedAt?: string;

  /** When the run reached terminal state, if known. ISO-8601. */
  readonly completedAt?: string;

  /** Provider-native status — not used for canonical logic. */
  readonly rawStatus?: CIRawRunStatus;

  /** Provider-native conclusion — not used for canonical logic. */
  readonly rawConclusion?: CIRawRunConclusion;

  /** URL to the run in the provider's UI. Provenance. */
  readonly url?: string;

  /** Provider identifier (e.g. 'github-actions', 'gitlab-ci'). Informational. */
  readonly provider?: string;

  /** Human-readable workflow/pipeline name. */
  readonly workflowName?: string;
}

/** True when the run has reached a terminal state. Pure. */
export function isTerminalRun(run: CIVerificationRun): boolean {
  return run.status === 'completed';
}

/** True when the run's conclusion indicates success. Pure. */
export function isPassedRun(run: CIVerificationRun): boolean {
  return run.status === 'completed' && run.conclusion === 'passed';
}

/** True when the run's conclusion indicates failure. Pure. */
export function isFailedRun(run: CIVerificationRun): boolean {
  return run.status === 'completed' && run.conclusion === 'failed';
}

/** True when the run is a rerun (attempt > 1). Pure. */
export function isRerun(run: CIVerificationRun): boolean {
  return run.attempt > 1;
}
