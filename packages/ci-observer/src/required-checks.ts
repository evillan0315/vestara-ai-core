/**
 * CI-OBS-002C / H3 — Required-check aggregation + resume gate.
 *
 * GitHub may execute several workflows for one commit. Resuming a task on the
 * first terminal run is unsafe once more than one workflow is required. This
 * module aggregates observed checks against a declared required set and derives
 * a deterministic resume gate.
 *
 * Slice 1: when no required set is configured, the gate still refuses to
 * resume on a retrieval failure or a non-terminal/inconclusive observation.
 * Resume never implies objective verification.
 */

import type { CIConclusion } from '@vestara/ci-contracts';

// ─── Required set ───────────────────────────────────────────────────

export type CIRequiredCheckMode = 'all-observed' | 'any-designated';

export interface CIRequiredCheckSet {
  readonly mode: CIRequiredCheckMode;
  /** Required check/workflow names for `any-designated`. */
  readonly names?: readonly string[];
}

export interface CICheckObservation {
  readonly name: string;
  readonly conclusion?: CIConclusion;
  readonly workflowName?: string;
}

export type CICheckAggregateState = 'satisfied' | 'failed' | 'pending' | 'inconclusive' | 'unknown';

export interface CICheckAggregate {
  readonly state: CICheckAggregateState;
  readonly satisfied: readonly string[];
  readonly failed: readonly string[];
  readonly pending: readonly string[];
  readonly inconclusive: readonly string[];
  readonly reason: string;
}

const FAILED: readonly CIConclusion[] = ['failed', 'timed_out'];
const INCONCLUSIVE: readonly CIConclusion[] = ['cancelled', 'skipped', 'unknown'];

/** Aggregate observed checks against the required set. Pure. */
export function aggregateRequiredChecks(
  checks: readonly CICheckObservation[],
  required: CIRequiredCheckSet = { mode: 'all-observed' },
): CICheckAggregate {
  const requiredNames =
    required.mode === 'all-observed'
      ? checks.map((check) => check.name)
      : (required.names ?? []).filter((name) => name.length > 0);

  if (requiredNames.length === 0) {
    return {
      state: 'unknown',
      satisfied: [],
      failed: [],
      pending: [],
      inconclusive: [],
      reason: 'No required checks are declared or observed',
    };
  }

  const byName = new Map(checks.map((check) => [check.name, check]));
  const satisfied: string[] = [];
  const failed: string[] = [];
  const pending: string[] = [];
  const inconclusive: string[] = [];

  for (const name of requiredNames) {
    const check = byName.get(name);
    if (!check || check.conclusion === undefined) {
      pending.push(name);
      continue;
    }
    if (FAILED.includes(check.conclusion)) failed.push(name);
    else if (INCONCLUSIVE.includes(check.conclusion)) inconclusive.push(name);
    else satisfied.push(name);
  }

  if (failed.length > 0) {
    return { state: 'failed', satisfied, failed, pending, inconclusive, reason: `Failed: ${failed.join(', ')}` };
  }
  if (pending.length > 0) {
    return { state: 'pending', satisfied, failed, pending, inconclusive, reason: `Awaiting: ${pending.join(', ')}` };
  }
  if (inconclusive.length > 0) {
    return {
      state: 'inconclusive',
      satisfied,
      failed,
      pending,
      inconclusive,
      reason: `Inconclusive: ${inconclusive.join(', ')}`,
    };
  }
  return { state: 'satisfied', satisfied, failed, pending, inconclusive, reason: 'All required checks passed' };
}

// ─── Resume gate ────────────────────────────────────────────────────

export interface CIResumeGateInput {
  readonly status: string;
  readonly conclusion: CIConclusion;
  readonly passedChecks: number;
  readonly failedChecks: number;
  readonly skippedChecks: number;
}

export interface CIResumeGateDecision {
  readonly allow: boolean;
  readonly reason: string;
}

/**
 * Derive whether the originating task may be resumed. Denies retrieval
 * failure, non-terminal observations, and inconclusive conclusions. Resume
 * returns the task to `in-progress`; it never marks the objective verified.
 */
export function evaluateCIResumeGate(input: CIResumeGateInput): CIResumeGateDecision {
  if (
    input.status !== 'completed' ||
    (input.conclusion === 'unknown' && input.passedChecks + input.failedChecks + input.skippedChecks === 0)
  ) {
    return {
      allow: false,
      reason:
        input.status !== 'completed'
          ? 'CI observation is non-terminal'
          : 'CI state could not be retrieved (retrieval failure ≠ CI failure)',
    };
  }
  if (input.conclusion === 'skipped' || input.conclusion === 'unknown') {
    return { allow: false, reason: `Inconclusive CI conclusion '${input.conclusion}'` };
  }
  return { allow: true, reason: 'CI reached a terminal, classifiable state' };
}
