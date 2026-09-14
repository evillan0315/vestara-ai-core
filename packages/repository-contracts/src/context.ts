/**
 * VES-REPO-005 — ExecutionRepositoryContext: execution bound to baseline.
 *
 * Binds one execution to the repository state it is authorized to operate
 * against: `{ repositoryId, baselineSnapshotId, accessMode, changeIntent }`.
 * `boundAt` records when the binding was established so later milestones can
 * capture S1 and compare it against this exact S0.
 *
 * The context carries `executionId` so it remains independently attributable
 * when detached from its request (S1 linkage, audit). Top-level repositoryId
 * and baselineSnapshotId are frozen validated projections of the bind-time
 * evidence — not drifts of the embedded intent. Internal consistency
 * (context ≡ intent on execution and repository) is checked, never assumed.
 *
 * The context grants nothing by itself: MUTATE remains an explicit access
 * mode (see `contextPermitsMutation`), and intent remains a declaration,
 * never proof of resulting changes.
 */
import { isMutationMode, type RepositoryAccessMode } from './access-mode';
import type { ExecutionId, RepositoryId, SnapshotId } from './identity';
import type { ChangeIntent } from './intent';
import { isValidChangeIntent } from './intent';

/** Canonical execution repository context. Immutable value. */
export interface ExecutionRepositoryContext {
  readonly executionId: ExecutionId;
  readonly repositoryId: RepositoryId;
  readonly baselineSnapshotId: SnapshotId;
  readonly accessMode: RepositoryAccessMode;
  readonly changeIntent: ChangeIntent;
  readonly boundAt: string;
}

/**
 * True only for MUTATE contexts. The existence of a context never implies
 * mutation permission — OBSERVE, ANALYZE, and VERIFY contexts observe,
 * analyze, and verify under an explicit baseline (REPO-INV-007).
 */
export function contextPermitsMutation(context: ExecutionRepositoryContext): boolean {
  return isMutationMode(context.accessMode);
}

/**
 * Structural + internal-consistency validity: present identifiers, a valid
 * intent, and agreement between the frozen top-level fields and the
 * embedded declaration. A context whose top level disagrees with its own
 * intent is invalid — divergence is refused, never reconciled silently.
 */
export function isValidExecutionRepositoryContext(value: unknown): value is ExecutionRepositoryContext {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.executionId !== 'string' ||
    (record.executionId as string).length === 0 ||
    typeof record.repositoryId !== 'string' ||
    (record.repositoryId as string).length === 0 ||
    typeof record.baselineSnapshotId !== 'string' ||
    (record.baselineSnapshotId as string).length === 0 ||
    typeof record.boundAt !== 'string' ||
    (record.boundAt as string).length === 0
  ) {
    return false;
  }
  if (!isValidChangeIntent(record.changeIntent)) return false;
  const intent = record.changeIntent as ChangeIntent;
  return intent.executionId === record.executionId && intent.repositoryId === record.repositoryId;
}
