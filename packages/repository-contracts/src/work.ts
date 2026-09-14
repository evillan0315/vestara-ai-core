/**
 * VES-REPO-002 — ActiveRepositoryWork: canonical view, not a store.
 *
 * This contract describes repository-bound work currently happening so that
 * later milestones (VES-REPO-009+) can project a unified view. It creates
 * no lock, no lease, and no persistence. Worktree leases, orchestrated file
 * locks, and task leases remain the existing authorities until adaptation.
 */
import type { RepositoryAccessMode } from './access-mode';
import { isMutationMode } from './access-mode';
import type { ExecutionId, RepositoryId, RuntimeSessionId } from './identity';
import type { ChangeIntent } from './intent';

/** Lifecycle position of repository-bound work. Closed vocabulary. */
export type ActiveWorkState = 'registered' | 'waiting' | 'active' | 'verifying' | 'completed' | 'failed' | 'cancelled';

export const ACTIVE_WORK_STATES: readonly ActiveWorkState[] = [
  'registered',
  'waiting',
  'active',
  'verifying',
  'completed',
  'failed',
  'cancelled',
];

/** Canonical view of one repository-bound execution. Read-only projection. */
export interface ActiveRepositoryWork {
  readonly executionId: ExecutionId;
  readonly repositoryId: RepositoryId;
  readonly actorId: string;
  readonly runtimeSessionId?: RuntimeSessionId;
  readonly accessMode: RepositoryAccessMode;
  readonly changeIntent?: ChangeIntent;
  readonly state: ActiveWorkState;
}

/**
 * True only when the work is both live (`active`) and mutation-authorized
 * (`MUTATE`). Waiting, verifying, or read-only work is never mutating —
 * presence in the registry confers no authority (REPO-INV-007).
 */
export function isActivelyMutating(work: ActiveRepositoryWork): boolean {
  return work.state === 'active' && isMutationMode(work.accessMode);
}

/** True for terminal states — the work no longer holds any authority. */
export function isTerminalWorkState(state: ActiveWorkState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}
