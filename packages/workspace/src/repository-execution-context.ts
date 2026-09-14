/**
 * VES-REPO-005 — Execution repository context binding (baseline side only).
 *
 * Intended lifecycle:
 *   Execution → explicit identity → observeRepository() →
 *   captureRepositorySnapshot() → S0 → ExecutionRepositoryContext →
 *   execution proceeds with explicit repository context
 *
 * Fail-closed rules (no synthesized baselines, no substitutions):
 * - observation failure (unstable/vanished/Git/binding/non-Git) → propagated,
 *   no context is constructed;
 * - intent naming a different repository than observed → `intent-mismatch`;
 * - intent naming a different execution → `intent-mismatch`;
 * - absent or invalid access mode / invalid intent → refused.
 * Current HEAD, path, project identity, and runtime session identity are
 * never substituted for `baselineSnapshotId`.
 *
 * S1 integration point (documented, not implemented — VES-REPO-007/008 own
 * attribution): re-run `captureRepositorySnapshot` with the same observation
 * scope and `compareSnapshots` the result against this context's
 * `baselineSnapshotId`. No end-of-execution capture happens here.
 *
 * Brand note: this binder speaks the VES-REPO leaf identity system
 * (`@vestara/repository-contracts`). Execution-layer callers holding the
 * `@vestara/types` brand convert once, explicitly, at this edge; the string
 * value is preserved and the duality is recorded, never hidden.
 */
import type {
  ChangeIntent,
  ExecutionId,
  ExecutionRepositoryContext,
  RepositoryAccessMode,
  SnapshotReason,
} from '@vestara/repository-contracts';
import { isValidChangeIntent, REPOSITORY_ACCESS_MODES } from '@vestara/repository-contracts';
import type { ObservationFailure, ObserveRepositoryInput } from './repository-discovery-adapter';
import type { CaptureSnapshotInput, CaptureSnapshotResult, SnapshotRuntimeDeps } from './repository-snapshot-runtime';
import { captureRepositorySnapshot } from './repository-snapshot-runtime';

/** Binder input — every field explicit. Nothing is inferred. */
export interface BindExecutionRepositoryContextInput {
  readonly executionId: ExecutionId;
  readonly accessMode: RepositoryAccessMode;
  readonly changeIntent: ChangeIntent;
  readonly observe: ObserveRepositoryInput;
  readonly snapshotReason?: SnapshotReason;
}

/** Fail-closed binder failures beyond observation passthrough. */
export type ContextBindFailureReason = 'invalid-intent' | 'intent-mismatch' | 'access-mode-required';

export interface ContextBindFailure {
  readonly ok: false;
  readonly reason: ObservationFailure['reason'] | ContextBindFailureReason;
  readonly detail: string;
}

export type BindExecutionRepositoryContextResult =
  | { readonly ok: true; readonly context: ExecutionRepositoryContext }
  | ContextBindFailure
  | ObservationFailure;

/** Injectable seams. Defaults use the live capture authority. */
export interface ExecutionRepositoryContextDeps {
  readonly capture: (input: CaptureSnapshotInput, deps?: SnapshotRuntimeDeps) => Promise<CaptureSnapshotResult>;
  readonly now: () => string;
}

const defaultDeps: ExecutionRepositoryContextDeps = {
  capture: (input, deps) => captureRepositorySnapshot(input, deps),
  now: () => new Date().toISOString(),
};

function fail(reason: ContextBindFailure['reason'], detail: string): ContextBindFailure {
  return { ok: false, reason, detail };
}

/**
 * Bind an execution to its repository baseline. Read-only against the
 * repository; constructs only the context value. No leases, no locks, no
 * coordination, no attribution.
 */
export async function bindExecutionRepositoryContext(
  input: BindExecutionRepositoryContextInput,
  deps: ExecutionRepositoryContextDeps = defaultDeps,
): Promise<BindExecutionRepositoryContextResult> {
  if (!input.accessMode || !(REPOSITORY_ACCESS_MODES as readonly string[]).includes(input.accessMode)) {
    return fail('access-mode-required', 'Access mode must be an explicit OBSERVE, ANALYZE, VERIFY, or MUTATE.');
  }
  if (!isValidChangeIntent(input.changeIntent)) {
    return fail('invalid-intent', 'ChangeIntent must declare a valid non-empty semantic scope for the execution.');
  }
  if (input.changeIntent.executionId !== input.executionId) {
    return fail(
      'intent-mismatch',
      'ChangeIntent names a different execution than the binding request; intent is not re-targeted silently.',
    );
  }

  const captured = await deps.capture(
    { ...input.observe, reason: input.snapshotReason ?? 'execution-start' },
    undefined,
  );
  if (!captured.ok) return captured;

  if (captured.snapshot.repositoryId !== input.changeIntent.repositoryId) {
    return fail(
      'intent-mismatch',
      'Observed repository differs from the ChangeIntent repository; the observed state is not re-labeled.',
    );
  }

  return {
    ok: true,
    context: {
      executionId: input.executionId,
      repositoryId: captured.snapshot.repositoryId,
      baselineSnapshotId: captured.snapshot.snapshotId,
      accessMode: input.accessMode,
      changeIntent: input.changeIntent,
      boundAt: deps.now(),
    },
  };
}
