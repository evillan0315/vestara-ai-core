/**
 * CI-OBS-001B — CIObservation — a snapshot of observed CI state.
 *
 * An observation is what was seen, not what it means. Observations are
 * the input to classification and hypothesis generation. They carry
 * enough provenance to reconstruct the observation and verify its
 * accuracy.
 *
 * Invariants:
 *   - Observation ≠ Hypothesis ≠ Finding
 *   - Retrieval failure ≠ CI failure
 *   - UNKNOWN is valid evidence
 */

import type { CIConclusion } from './conclusion';
import type { CICommitId } from './identity';

/** Status of an observation record. */
export type CIObservationStatus = 'captured' | 'analyzed' | 'superseded';

/** Closed vocabulary — all valid observation statuses. */
export const CI_OBSERVATION_STATUSES: readonly CIObservationStatus[] = ['captured', 'analyzed', 'superseded'];

/** Why the observation was made. */
export type CIObservationTrigger = 'post-push' | 'manual' | 'scheduled' | 'webhook' | 'polling';

/** A snapshot of observed CI state at a point in time. */
export interface CIObservation {
  /** Unique observation identifier. */
  readonly observationId: string;

  /** The run this observation is about. */
  readonly runId: string;

  /** Commit observed (provider-neutral identity). */
  readonly commitSha: CICommitId;

  /** Observed status at capture time. */
  readonly status: string;

  /** Observed conclusion at capture time, if terminal. */
  readonly conclusion: CIConclusion;

  /** Number of checks observed as passed. */
  readonly passedChecks: number;

  /** Number of checks observed as failed. */
  readonly failedChecks: number;

  /** Number of checks observed as skipped/unknown. */
  readonly skippedChecks: number;

  /** What triggered this observation. */
  readonly trigger: CIObservationTrigger;

  /** When this observation was captured. ISO-8601. */
  readonly observedAt: string;

  /** URLs or references to provider-native evidence. Provenance. */
  readonly provenance: readonly string[];

  /** Optional: raw provider response, preserved for debugging. */
  readonly rawPayload?: unknown;
}

/** True when the observation represents a terminal CI state. Pure. */
export function isTerminalObservation(obs: CIObservation): boolean {
  return obs.conclusion !== 'unknown' || obs.passedChecks + obs.failedChecks + obs.skippedChecks > 0;
}

/** True when the observation indicates retrieval failure (not CI failure). Pure. */
export function isRetrievalFailure(obs: CIObservation): boolean {
  return obs.conclusion === 'unknown' && obs.passedChecks === 0 && obs.failedChecks === 0 && obs.skippedChecks === 0;
}
