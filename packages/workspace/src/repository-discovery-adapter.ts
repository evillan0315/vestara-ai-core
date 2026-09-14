/**
 * VES-REPO-003 — Repository Discovery Adapter (read-only).
 *
 * Converts existing repository authorities into canonical
 * `@vestara/repository-contracts` observations. No Git execution here, no
 * filesystem mutation, no snapshots, no attribution — observation only.
 *
 * Field provenance:
 *
 *   RepositoryBinding (resolveRepositoryBinding)
 *       ↓ canonical repository/root resolution
 *   canonicalPath → RepositoryIdentity.root / RepositoryState scope
 *   m1WorkspaceId → RepositoryIdentity.repositoryId (durable, path-independent)
 *   gitRoot       → confinement anchor for the Git read surface
 *
 *   RepositoryFingerprint (createFingerprint)
 *       ↓ fallback identity + remote evidence
 *   id            → RepositoryIdentity.repositoryId ONLY when no workspace id
 *                   exists (locator-derived fallback, documented below)
 *   gitRemote     → RepositoryIdentity.remote { name: 'origin', url }
 *                   (fingerprint reads `git remote get-url origin`, hence 'origin')
 *
 *   GitService (branch / log / status — the only Git readers)
 *       ↓ branch, HEAD, working-tree state
 *   branch()                  → RepositoryState.branch (empty ⇒ detached ⇒ absent)
 *   log({ maxCount: 1 })[0]    → RepositoryState.head (absent ⇒ no commits yet)
 *   status().entries          → staged / unstaged / untracked split
 *   status() upstream counts  → NOT surfaced: GitService exposes no upstream
 *                               names, and counts without names would imply a
 *                               named upstream. RepositoryState.upstream stays
 *                               absent until an authority provides names.
 *
 * Status mapping (explicit, documented — never silent):
 *   modified/added/deleted/renamed/untracked → unchanged
 *   copied   → added    (a copied path is a new path in the tree)
 *   unmerged → modified (conflict state is a modification awaiting resolution)
 * A path present both staged and unstaged (partial staging) appears in both
 * lists — the observation reports reads, not interpretations.
 *
 * Identity independence: when `.vestara/workspace.json` provides an id, the
 * repository keeps its identity across moves and mounts. The fingerprint-id
 * fallback is stable per path but moves with it — callers must treat a
 * fallback identity as locator-derived, never as proof of sameness.
 */
import * as fs from 'node:fs';
import type {
  ChangedPath,
  PathDifference,
  RepositoryIdentity,
  RepositoryRoot,
  RepositoryState,
} from '@vestara/repository-contracts';
import type { RepositoryBindingRequest } from '@vestara/types';
import type { GitStatusEntry } from './git-service';
import { GitService } from './git-service';
import { resolveRepositoryBinding } from './repository-binding';
import { createFingerprint } from './repository-fingerprint';

/** Structural Git read surface. GitService satisfies this; tests inject fakes. */
export interface DiscoveryGitService {
  readonly isRepository: boolean;
  branch(): string | null;
  status(): { entries: GitStatusEntry[] } | null;
  log(options?: { maxCount?: number }): { hash: string }[];
}

/** Minimal binding evidence the adapter consumes. */
export interface DiscoveryBindingEvidence {
  readonly canonicalPath: string;
  readonly workspaceId: string | null;
  readonly gitRoot: string | null;
}

/** Minimal fingerprint evidence the adapter consumes. */
export interface DiscoveryFingerprintEvidence {
  readonly id: string;
  readonly gitRemote: string | null;
}

/** Injectable seams — defaults delegate to the existing authorities. */
export interface RepositoryDiscoveryAdapterDeps {
  readonly resolveBinding: (request: RepositoryBindingRequest) => { binding: DiscoveryBindingEvidence };
  readonly createGit: (workDir: string) => DiscoveryGitService;
  readonly fingerprint: (rootDir: string) => Promise<DiscoveryFingerprintEvidence>;
  readonly pathExists: (path: string) => boolean;
  readonly now: () => string;
}

const defaultDeps: RepositoryDiscoveryAdapterDeps = {
  resolveBinding: (request) => resolveRepositoryBinding(request),
  createGit: (workDir) => new GitService(workDir),
  fingerprint: (rootDir) => createFingerprint(rootDir),
  pathExists: (path) => fs.existsSync(path),
  now: () => new Date().toISOString(),
};

/** Adapter input — where to resolve, never what to change. */
export interface ObserveRepositoryInput {
  readonly explicitPath?: string;
  readonly envOverride?: string;
  readonly startDir?: string;
  readonly mode?: RepositoryBindingRequest['mode'];
}

/** Explicit observation failure. UNKNOWN is reported, never normalized. */
export type ObservationFailureReason =
  | 'binding-failed'
  | 'non-git-path'
  | 'repository-vanished'
  | 'git-failure'
  | 'unstable-observation';

export interface ObservationFailure {
  readonly ok: false;
  readonly reason: ObservationFailureReason;
  readonly detail: string;
}

export interface RepositoryObservation {
  readonly ok: true;
  readonly identity: RepositoryIdentity;
  readonly state: RepositoryState;
}

export type ObserveRepositoryResult = RepositoryObservation | ObservationFailure;

function fail(reason: ObservationFailureReason, detail: string): ObservationFailure {
  return { ok: false, reason, detail };
}

function toPathDifference(status: GitStatusEntry['status']): PathDifference {
  switch (status) {
    case 'copied':
      return 'added';
    case 'unmerged':
      return 'modified';
    default:
      return status;
  }
}

/**
 * Observe the repository. Read-only: no filesystem writes, no Git writes.
 * Atomicity is bounded by a double HEAD read — a HEAD move mid-observation
 * yields `unstable-observation` rather than a manufactured coherent state.
 */
export async function observeRepository(
  input: ObserveRepositoryInput = {},
  deps: RepositoryDiscoveryAdapterDeps = defaultDeps,
): Promise<ObserveRepositoryResult> {
  let binding: DiscoveryBindingEvidence;
  try {
    binding = deps.resolveBinding({
      explicitPath: input.explicitPath,
      envOverride: input.envOverride,
      startDir: input.startDir,
      mode: input.mode,
    }).binding;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('does not exist')) return fail('repository-vanished', message);
    return fail('binding-failed', message);
  }

  const git = deps.createGit(binding.canonicalPath);
  if (!git.isRepository || binding.gitRoot === null) {
    return fail(
      'non-git-path',
      `No Git repository at ${binding.canonicalPath}; branch/HEAD/working-tree state is unobservable, not empty.`,
    );
  }

  // First HEAD read opens the observation window.
  let headBefore: string | undefined;
  try {
    headBefore = git.log({ maxCount: 1 })[0]?.hash;
  } catch (error) {
    return classifyGitReadFailure(binding.canonicalPath, deps, error);
  }

  const rawBranch = safeRead(() => git.branch());
  if (rawBranch === null && !deps.pathExists(binding.canonicalPath)) {
    return fail('repository-vanished', `Repository disappeared during observation: ${binding.canonicalPath}`);
  }

  const status = safeRead(() => git.status());
  if (status === null) {
    if (!deps.pathExists(binding.canonicalPath)) {
      return fail('repository-vanished', `Repository disappeared during observation: ${binding.canonicalPath}`);
    }
    return fail(
      'git-failure',
      `Git status unreadable at ${binding.canonicalPath}; state reported as failure, not clean.`,
    );
  }

  // Second HEAD read closes the window — a move inside it invalidates the read.
  let headAfter: string | undefined;
  try {
    headAfter = git.log({ maxCount: 1 })[0]?.hash;
  } catch (error) {
    return classifyGitReadFailure(binding.canonicalPath, deps, error);
  }
  if (headBefore !== headAfter) {
    return fail(
      'unstable-observation',
      `HEAD moved during observation (${headBefore ?? 'absent'} → ${headAfter ?? 'absent'}); no coherent state manufactured.`,
    );
  }

  let fingerprint: DiscoveryFingerprintEvidence;
  try {
    fingerprint = await deps.fingerprint(binding.canonicalPath);
  } catch (error) {
    return classifyGitReadFailure(binding.canonicalPath, deps, error);
  }

  const repositoryId = (binding.workspaceId ?? fingerprint.id) as RepositoryIdentity['repositoryId'];
  const identity: RepositoryIdentity = {
    repositoryId,
    vcs: 'git',
    root: binding.canonicalPath as RepositoryRoot,
    ...(fingerprint.gitRemote ? { remote: { name: 'origin', url: fingerprint.gitRemote } } : {}),
  };

  const staged: ChangedPath[] = [];
  const unstaged: ChangedPath[] = [];
  const untracked: ChangedPath[] = [];
  for (const entry of status.entries) {
    const record: ChangedPath = { path: entry.path, difference: toPathDifference(entry.status), staged: entry.staged };
    if (entry.status === 'untracked') {
      untracked.push(record);
    } else if (entry.staged) {
      staged.push(record);
    } else {
      unstaged.push(record);
    }
  }
  const clean = staged.length === 0 && unstaged.length === 0 && untracked.length === 0;

  const state: RepositoryState = {
    repositoryId,
    ...(rawBranch ? { branch: rawBranch } : {}),
    ...(headAfter ? { head: headAfter } : {}),
    workingTree: { clean, staged, unstaged, untracked },
    observedAt: deps.now(),
  };
  return { ok: true, identity, state };
}

function safeRead<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

function classifyGitReadFailure(
  canonicalPath: string,
  deps: RepositoryDiscoveryAdapterDeps,
  error: unknown,
): ObservationFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (!deps.pathExists(canonicalPath)) {
    return fail('repository-vanished', `Repository disappeared during observation: ${canonicalPath}`);
  }
  return fail('git-failure', `Git read failed at ${canonicalPath}: ${message}`);
}
