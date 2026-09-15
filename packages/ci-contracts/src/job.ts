/**
 * CI-OBS-001B — CIJob — a unit of work within a CI run.
 *
 * Jobs group related checks. For example, a 'build-and-test' job might
 * contain checks for 'unit tests', 'integration tests', and 'lint'.
 * The hierarchy is: Run → Job → Check.
 *
 * Provider-native job data is preserved on the domain object but not
 * used for canonical status/conclusion logic.
 */

import type { CIConclusion } from './conclusion';
import type { CIAttempt, CIJobId, CIRunId } from './identity';
import type { CIStatus } from './status';

/**
 * Provider-native job status — preserved for provenance, diagnostics,
 * replay, and adapter debugging. MUST NOT be used for canonical logic.
 *
 * Architectural boundary:
 *   Provider-native state → Adapter normalization → Canonical CI contract
 *   NEVER: Canonical domain → provider-specific interpretation
 */
export type CIRawJobStatus = string;

/** A unit of work within a CI run. */
export interface CIJob {
  /** Unique job identifier. */
  readonly jobId: CIJobId;

  /** Parent run identifier. */
  readonly runId: CIRunId;

  /** Human-readable job name (e.g. 'build-and-test', 'desktop-build'). */
  readonly name: string;

  /** Canonical status. */
  readonly status: CIStatus;

  /** Canonical conclusion (only meaningful when status is 'completed'). */
  readonly conclusion: CIConclusion;

  /** Attempt number for this job (1 = initial run). */
  readonly attempt: CIAttempt;

  /** Provider-native status — not used for canonical logic. */
  readonly rawStatus?: CIRawJobStatus;

  /** URL to the job in the provider's UI. Provenance. */
  readonly url?: string;

  /** Duration in milliseconds, if known. */
  readonly durationMs?: number;
}

/** True when the job has reached a terminal state. Pure. */
export function isTerminalJob(job: CIJob): boolean {
  return job.status === 'completed';
}
