/**
 * VES-REPO-004 — Repository Snapshot Runtime (capture only, no store).
 *
 * Conceptual flow:
 *   observeRepository() → coherent RepositoryState → capture → RepositorySnapshot S0
 *   …later… observeRepository() → coherent RepositoryState → capture → RepositorySnapshot S1
 *   compareSnapshots(S0, S1) (pure, in `@vestara/repository-contracts`) → SnapshotComparison
 *
 * A snapshot is an observation event with an identity, not a backup and not
 * an attribution claim. Capture refuses (no snapshot) whenever observation
 * fails — unstable, vanished, Git failure, binding failure, or non-Git
 * paths (the snapshot contract requires Git evidence: head/branch).
 *
 * Snapshot fingerprint algorithm (exact):
 *   per-path descriptor = `${path}\n${bucket}` where bucket ∈
 *     {staged, unstaged, untracked} from the observed partition
 *   per-path fingerprint = contentHash(descriptor)  [reused @vestara/diff-engine]
 *   state digest = contentHash(lines joined by '\n') where lines =
 *     ['ves-repo-snapshot/v1', head ?? '', branch ?? '', ...sortedFingerprints]
 *   sortedFingerprints = stored per-path fingerprints sorted lexicographically;
 *     entries predating partition flags contribute `legacy:${path}`.
 * State equivalence for compare = same repositoryId AND equal state digests.
 * The digest covers identity-excluded state only: snapshotIds and timestamps
 * never contribute, so S0 ≠ S1 as events while comparing equal as state.
 */
import { contentHash } from '@vestara/diff-engine';
import type { PathState, RepositorySnapshot, SnapshotId, SnapshotReason } from '@vestara/repository-contracts';
import type {
  ObservationFailure,
  ObserveRepositoryInput,
  ObserveRepositoryResult,
  RepositoryDiscoveryAdapterDeps,
} from './repository-discovery-adapter';
import { observeRepository } from './repository-discovery-adapter';

/** Capture input: observation scope plus the boundary reason. */
export interface CaptureSnapshotInput extends ObserveRepositoryInput {
  readonly reason: SnapshotReason;
}

/** Injectable seams. Defaults use the live observation authority. */
export interface SnapshotRuntimeDeps {
  readonly observe: (
    input: ObserveRepositoryInput,
    deps?: RepositoryDiscoveryAdapterDeps,
  ) => Promise<ObserveRepositoryResult>;
  readonly adapterDeps?: RepositoryDiscoveryAdapterDeps;
  readonly generateId: () => SnapshotId;
  readonly digest: (canonical: string) => string;
  readonly now: () => string;
}

let snapshotCounter = 0;

const defaultDeps: SnapshotRuntimeDeps = {
  observe: (input, deps) => observeRepository(input, deps),
  generateId: () => `snap-${Date.now()}-${++snapshotCounter}` as SnapshotId,
  digest: (canonical) => contentHash(canonical),
  now: () => new Date().toISOString(),
};

export type CaptureSnapshotResult = { readonly ok: true; readonly snapshot: RepositorySnapshot } | ObservationFailure;

/** Canonical per-path descriptor — the unit of state equivalence. */
export function pathDescriptor(path: string, bucket: 'staged' | 'unstaged' | 'untracked'): string {
  return `${path}\n${bucket}`;
}

/**
 * State digest over stored snapshot evidence. Deterministic: same observed
 * state always yields the same digest; snapshot identity and timestamps
 * never contribute.
 */
export function snapshotStateDigest(
  snapshot: RepositorySnapshot,
  digest: (canonical: string) => string = (canonical) => contentHash(canonical),
): string {
  const fingerprints = snapshot.changedPaths.map((entry) => entry.fingerprint ?? `legacy:${entry.path}`).sort();
  return digest(['ves-repo-snapshot/v1', snapshot.head ?? '', snapshot.branch ?? '', ...fingerprints].join('\n'));
}

/**
 * Capture a snapshot. Read-only: observation reads plus hashing, no writes
 * anywhere. Any observation failure propagates — capture never synthesizes
 * a snapshot from a failed or unstable read.
 */
export async function captureRepositorySnapshot(
  input: CaptureSnapshotInput,
  deps: SnapshotRuntimeDeps = defaultDeps,
): Promise<CaptureSnapshotResult> {
  const observation = await deps.observe(input, deps.adapterDeps);
  if (!observation.ok) return observation;

  const { identity, state } = observation;
  const changedPaths: PathState[] = [];
  for (const entry of state.workingTree.staged) {
    changedPaths.push({
      path: entry.path,
      fingerprint: deps.digest(pathDescriptor(entry.path, 'staged')),
      staged: true,
    });
  }
  for (const entry of state.workingTree.unstaged) {
    changedPaths.push({
      path: entry.path,
      fingerprint: deps.digest(pathDescriptor(entry.path, 'unstaged')),
      staged: false,
    });
  }
  for (const entry of state.workingTree.untracked) {
    changedPaths.push({
      path: entry.path,
      fingerprint: deps.digest(pathDescriptor(entry.path, 'untracked')),
      untracked: true,
    });
  }

  return {
    ok: true,
    snapshot: {
      snapshotId: deps.generateId(),
      repositoryId: identity.repositoryId,
      ...(state.head ? { head: state.head } : {}),
      ...(state.branch ? { branch: state.branch } : {}),
      changedPaths,
      capturedAt: deps.now(),
      reason: input.reason,
    },
  };
}
