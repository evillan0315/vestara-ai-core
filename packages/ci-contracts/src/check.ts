/**
 * CI-OBS-001B — CICheck — the finest-grained CI verification result.
 *
 * A check represents a single verification unit: a test suite, a build,
 * a lint pass, a contract validation, etc. Checks belong to jobs, which
 * belong to runs. The hierarchy is: Run → Job → Check.
 *
 * Invariant: Observation ≠ Hypothesis ≠ Finding.
 * A check records what was observed. Classification is a separate concern.
 */

import type { CIConclusion } from './conclusion';
import type { CIFailureEvidence } from './evidence';
import type { CICheckId, CIJobId } from './identity';

/**
 * Provider-native check status — preserved for provenance, diagnostics,
 * replay, and adapter debugging. MUST NOT be used for canonical logic.
 *
 * Architectural boundary:
 *   Provider-native state → Adapter normalization → Canonical CI contract
 *   NEVER: Canonical domain → provider-specific interpretation
 */
export type CIRawCheckStatus = string;

/**
 * Provider-native check conclusion — preserved for provenance, diagnostics,
 * replay, and adapter debugging. MUST NOT be used for canonical logic.
 *
 * Architectural boundary:
 *   Provider-native state → Adapter normalization → Canonical CI contract
 *   NEVER: Canonical domain → provider-specific interpretation
 */
export type CIRawCheckConclusion = string;

/** A single CI check result. */
export interface CICheck {
  /** Unique check identifier. */
  readonly checkId: CICheckId;

  /** Parent job identifier. */
  readonly jobId: CIJobId;

  /** Human-readable check name (e.g. 'unit tests', 'build', 'lint'). */
  readonly name: string;

  /** Canonical status. */
  readonly status: string;

  /** Canonical conclusion (only meaningful when status is 'completed'). */
  readonly conclusion: CIConclusion;

  /** Provider-native status — not used for canonical logic. */
  readonly rawStatus?: CIRawCheckStatus;

  /** Provider-native conclusion — not used for canonical logic. */
  readonly rawConclusion?: CIRawCheckConclusion;

  /** URL to the check result in the provider's UI. Provenance. */
  readonly url?: string;

  /** Duration in milliseconds, if known. */
  readonly durationMs?: number;

  /** Failure evidence, only present when conclusion is 'failed'. */
  readonly failureEvidence?: CIFailureEvidence;
}

/** True when the check has reached a terminal conclusion. Pure. */
export function isTerminalCheck(check: CICheck): boolean {
  return check.conclusion !== 'unknown' || check.status === 'completed';
}

/** True when the check has failure evidence. Pure. */
export function hasFailureEvidence(check: CICheck): boolean {
  return check.failureEvidence !== undefined && check.failureEvidence !== null;
}
