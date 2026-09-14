/**
 * VES-REPO-002 — RepositoryState is observation, not attribution
 * (REPO-INV-001, REPO-INV-008).
 *
 * A state snapshot records what is different. It never records who caused
 * it. There are no actor, execution, or session fields by design — a dirty
 * path must not imply an actor, execution, or session.
 */
import type { RepositoryId } from './identity';

/** How a path differs from HEAD. Observation only. */
export type PathDifference = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';

/** A single observed path difference. No attribution fields. */
export interface ChangedPath {
  readonly path: string;
  readonly difference: PathDifference;
  readonly staged: boolean;
}

/** Upstream position. Observation only. */
export interface UpstreamPosition {
  readonly remote: string;
  readonly branch: string;
  readonly ahead: number;
  readonly behind: number;
}

/** Observed working-tree state. Observation only. */
export interface WorkingTreeObservation {
  readonly clean: boolean;
  readonly staged: readonly ChangedPath[];
  readonly unstaged: readonly ChangedPath[];
  readonly untracked: readonly ChangedPath[];
}

/**
 * Observed repository state at an instant. The `observedAt` timestamp marks
 * the observation; it is not a claim about when changes were made or by whom.
 */
export interface RepositoryState {
  readonly repositoryId: RepositoryId;
  readonly branch?: string;
  readonly head?: string;
  readonly upstream?: UpstreamPosition;
  readonly workingTree: WorkingTreeObservation;
  readonly observedAt: string;
}

/** True when the observed tree has no differences. Pure. */
export function isCleanState(state: RepositoryState): boolean {
  return state.workingTree.clean;
}

/**
 * Every differing path in the observation, staged first. Returns paths only —
 * never an actor, execution, or session (REPO-INV-001).
 */
export function dirtyPaths(state: RepositoryState): readonly string[] {
  const all = [...state.workingTree.staged, ...state.workingTree.unstaged, ...state.workingTree.untracked];
  return all.map((entry) => entry.path);
}
