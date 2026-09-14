/**
 * VES-REPO-007 — Execution observation closer (difference evidence only).
 *
 * Flow:
 *   ExecutionRepositoryContext (S0 = baselineSnapshotId)
 *     + caller-supplied baseline snapshot S0
 *     → capture S1 (same explicit observation scope)
 *     → compareSnapshots(S0, S1)
 *     → ObservedRepositoryChange
 *
 * Fail-closed rules:
 * - no baseline supplied, or baseline id ≠ context.baselineSnapshotId →
 *   refused (the exact S0 is required; HEAD, sessions, and other
 *   executions' snapshots are never substituted);
 * - baseline repository ≠ context repository → refused;
 * - S1 capture failure → propagated, no change record;
 * - S1 repository ≠ context repository → refused (identity moved
 *   mid-window; continuity is not manufactured);
 * - optional session correlation naming another execution, another
 *   baseline, or an invalid record → refused.
 *
 * Non-goals, structurally enforced: the result carries no attribution,
 * actor, violation, or causation — an OBSERVE execution closing over a
 * dirty S1 succeeds exactly like a MUTATE one, and observed paths outside
 * the declared intent remain observations, never violations.
 */
import type {
  ExecutionRepositoryContext,
  ObservedRepositoryChange,
  RepositorySnapshot,
  RuntimeSessionCorrelation,
  SnapshotComparison,
} from '@vestara/repository-contracts';
import {
  compareSnapshots,
  isValidExecutionRepositoryContext,
  isValidRuntimeSessionCorrelation,
} from '@vestara/repository-contracts';
import type { ObservationFailure, ObserveRepositoryInput } from './repository-discovery-adapter';
import type { CaptureSnapshotInput, CaptureSnapshotResult, SnapshotRuntimeDeps } from './repository-snapshot-runtime';
import { captureRepositorySnapshot } from './repository-snapshot-runtime';

/** Closer input — baseline value and observation scope are both explicit. */
export interface CloseObservationInput {
  readonly context: ExecutionRepositoryContext;
  readonly baseline: RepositorySnapshot;
  readonly observe: ObserveRepositoryInput;
  readonly sessionCorrelation?: RuntimeSessionCorrelation;
}

/** Fail-closed closer failures beyond observation passthrough. */
export type ObservationCloseFailureReason =
  | 'invalid-context'
  | 'baseline-required'
  | 'baseline-mismatch'
  | 'repository-mismatch'
  | 'correlation-mismatch';

export interface ObservationCloseFailure {
  readonly ok: false;
  readonly reason: ObservationFailure['reason'] | ObservationCloseFailureReason;
  readonly detail: string;
}

export type CloseObservationResult =
  | { readonly ok: true; readonly change: ObservedRepositoryChange }
  | ObservationCloseFailure
  | ObservationFailure;

/** Injectable seams. Defaults use the live capture authority. */
export interface ChangeObservationDeps {
  readonly capture: (input: CaptureSnapshotInput, deps?: SnapshotRuntimeDeps) => Promise<CaptureSnapshotResult>;
  readonly compare: (baseline: RepositorySnapshot, current: RepositorySnapshot) => SnapshotComparison;
  readonly now: () => string;
}

const defaultDeps: ChangeObservationDeps = {
  capture: (input, deps) => captureRepositorySnapshot(input, deps),
  compare: (baseline, current) => compareSnapshots(baseline, current),
  now: () => new Date().toISOString(),
};

function fail(reason: ObservationCloseFailure['reason'], detail: string): ObservationCloseFailure {
  return { ok: false, reason, detail };
}

/**
 * Close an execution observation window. Read-only against the repository;
 * constructs only the observed-change value. No attribution, no governance.
 */
export async function closeExecutionObservation(
  input: CloseObservationInput,
  deps: ChangeObservationDeps = defaultDeps,
): Promise<CloseObservationResult> {
  if (!isValidExecutionRepositoryContext(input.context)) {
    return fail('invalid-context', 'Execution repository context must itself be valid before closing.');
  }
  if (!input.baseline || typeof input.baseline.snapshotId !== 'string' || input.baseline.snapshotId.length === 0) {
    return fail('baseline-required', 'The exact baseline snapshot value is required; nothing is substituted.');
  }
  if (input.baseline.snapshotId !== input.context.baselineSnapshotId) {
    return fail(
      'baseline-mismatch',
      'Supplied baseline is not the context baselineSnapshotId; other snapshots are never substituted.',
    );
  }
  if (input.baseline.repositoryId !== input.context.repositoryId) {
    return fail('baseline-mismatch', 'Supplied baseline names a different repository than the context.');
  }

  let runtimeSessionId: ObservedRepositoryChange['runtimeSessionId'];
  if (input.sessionCorrelation !== undefined) {
    if (!isValidRuntimeSessionCorrelation(input.sessionCorrelation)) {
      return fail('correlation-mismatch', 'Session correlation must itself be valid to establish lineage presence.');
    }
    if (
      input.sessionCorrelation.executionId !== input.context.executionId ||
      input.sessionCorrelation.repositoryContext.baselineSnapshotId !== input.context.baselineSnapshotId
    ) {
      return fail(
        'correlation-mismatch',
        'Session correlation names another execution or baseline; never re-targeted.',
      );
    }
    runtimeSessionId = input.sessionCorrelation.runtimeSessionId;
  }

  const captured = await deps.capture({ ...input.observe, reason: 'execution-end' }, undefined);
  if (!captured.ok) return captured;
  if (captured.snapshot.repositoryId !== input.context.repositoryId) {
    return fail(
      'repository-mismatch',
      'S1 names a different repository than the context; continuity not manufactured.',
    );
  }

  const comparison = deps.compare(input.baseline, captured.snapshot);
  return {
    ok: true,
    change: {
      executionId: input.context.executionId,
      repositoryId: input.context.repositoryId,
      baselineSnapshotId: input.context.baselineSnapshotId,
      observedSnapshotId: captured.snapshot.snapshotId,
      ...(runtimeSessionId ? { runtimeSessionId } : {}),
      comparison,
      observedAt: deps.now(),
    },
  };
}
