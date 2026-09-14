/**
 * VES-REPO-003 — Repository Discovery Adapter tests (controlled fakes).
 *
 * Covers: clean/dirty/staged/unstaged/untracked, detached HEAD, empty repo,
 * missing upstream, non-Git path, vanished repository, Git failure, HEAD
 * race (unstable), binding failures, and the copied/unmerged mapping.
 */
import { describe, expect, it } from 'vitest';
import type {
  DiscoveryBindingEvidence,
  DiscoveryGitService,
  RepositoryDiscoveryAdapterDeps,
} from '../src/repository-discovery-adapter';
import { observeRepository } from '../src/repository-discovery-adapter';

interface FakeGitOptions {
  readonly isRepository?: boolean;
  readonly branch?: string | null;
  readonly branchThrows?: boolean;
  /** HEAD hashes returned per log() call, in order. */
  readonly logHeads?: (string | undefined)[];
  readonly logThrows?: boolean;
  readonly entries?: {
    path: string;
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'unmerged' | 'untracked';
    staged: boolean;
  }[];
  readonly statusThrows?: boolean;
  readonly statusNull?: boolean;
}

function makeGit(options: FakeGitOptions = {}): DiscoveryGitService {
  let logCalls = 0;
  return {
    isRepository: options.isRepository ?? true,
    branch: () => {
      if (options.branchThrows) throw new Error('branch read failed');
      return options.branch ?? 'main';
    },
    log: () => {
      if (options.logThrows) throw new Error('log read failed');
      const heads = options.logHeads ?? ['abc123'];
      const head = heads[Math.min(logCalls, heads.length - 1)];
      logCalls += 1;
      return head ? [{ hash: head }] : [];
    },
    status: () => {
      if (options.statusThrows) throw new Error('status read failed');
      if (options.statusNull) return null;
      return { entries: options.entries ?? [] };
    },
  };
}

function makeDeps(
  overrides: {
    readonly binding?: DiscoveryBindingEvidence | (() => never);
    readonly bindingThrows?: string;
    readonly git?: FakeGitOptions;
    readonly fingerprintId?: string;
    readonly gitRemote?: string | null;
    readonly fingerprintThrows?: boolean;
    readonly pathExists?: boolean;
  } = {},
): RepositoryDiscoveryAdapterDeps {
  const git = makeGit(overrides.git);
  return {
    resolveBinding: () => {
      if (overrides.bindingThrows) throw new Error(overrides.bindingThrows);
      const binding =
        typeof overrides.binding === 'function'
          ? (overrides.binding as () => never)()
          : (overrides.binding ?? { canonicalPath: '/repo', workspaceId: 'ws-1', gitRoot: '/repo/.git' });
      return { binding };
    },
    createGit: () => git,
    fingerprint: async () => {
      if (overrides.fingerprintThrows) throw new Error('fingerprint failed');
      return {
        id: overrides.fingerprintId ?? 'fp-1',
        gitRemote: overrides.gitRemote ?? 'https://example.invalid/r.git',
      };
    },
    pathExists: () => overrides.pathExists ?? true,
    now: () => '2026-09-14T00:00:00.000Z',
  };
}

describe('observeRepository', () => {
  it('observes a clean repository with workspace-derived identity', async () => {
    const result = await observeRepository({}, makeDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity.repositoryId).toBe('ws-1');
    expect(result.identity.vcs).toBe('git');
    expect(result.identity.root).toBe('/repo');
    expect(result.identity.remote).toEqual({ name: 'origin', url: 'https://example.invalid/r.git' });
    expect(result.state.branch).toBe('main');
    expect(result.state.head).toBe('abc123');
    expect(result.state.workingTree.clean).toBe(true);
    expect(result.state.upstream).toBeUndefined();
    expect(result.state.observedAt).toBe('2026-09-14T00:00:00.000Z');
  });

  it('splits staged/unstaged/untracked and keeps partial staging in both lists', async () => {
    const result = await observeRepository(
      {},
      makeDeps({
        git: {
          entries: [
            { path: 'staged.ts', status: 'modified', staged: true },
            { path: 'partial.ts', status: 'modified', staged: true },
            { path: 'partial.ts', status: 'modified', staged: false },
            { path: 'work.ts', status: 'modified', staged: false },
            { path: 'new.ts', status: 'untracked', staged: false },
          ],
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.workingTree.clean).toBe(false);
    expect(result.state.workingTree.staged.map((e) => e.path)).toEqual(['staged.ts', 'partial.ts']);
    expect(result.state.workingTree.unstaged.map((e) => e.path)).toEqual(['partial.ts', 'work.ts']);
    expect(result.state.workingTree.untracked.map((e) => e.path)).toEqual(['new.ts']);
    // Observation only — no attribution keys anywhere.
    expect('actor' in result.state).toBe(false);
    expect('executionId' in result.state).toBe(false);
    expect('sessionId' in result.state).toBe(false);
  });

  it('falls back to the fingerprint id when no workspace id exists', async () => {
    const result = await observeRepository(
      {},
      makeDeps({ binding: { canonicalPath: '/repo', workspaceId: null, gitRoot: '/repo/.git' } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.identity.repositoryId).toBe('fp-1');
    expect(result.state.repositoryId).toBe('fp-1');
  });

  it('treats empty branch as detached HEAD and keeps the commit', async () => {
    const result = await observeRepository({}, makeDeps({ git: { branch: '' } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.branch).toBeUndefined();
    expect(result.state.head).toBe('abc123');
  });

  it('observes a commit-less repository with absent HEAD, not a failure', async () => {
    const result = await observeRepository({}, makeDeps({ git: { logHeads: [undefined] } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.head).toBeUndefined();
    expect(result.state.branch).toBe('main');
  });

  it('maps copied to added and unmerged to modified (documented, explicit)', async () => {
    const result = await observeRepository(
      {},
      makeDeps({
        git: {
          entries: [
            { path: 'copy.ts', status: 'copied', staged: true },
            { path: 'conflict.ts', status: 'unmerged', staged: false },
          ],
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.workingTree.staged).toEqual([{ path: 'copy.ts', difference: 'added', staged: true }]);
    expect(result.state.workingTree.unstaged).toEqual([{ path: 'conflict.ts', difference: 'modified', staged: false }]);
  });

  it('reports non-Git paths as explicit failure, never clean', async () => {
    const git = makeGit({ isRepository: false });
    const deps = { ...makeDeps(), createGit: () => git };
    const result = await observeRepository({}, deps);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('non-git-path');
  });

  it('reports a vanished repository instead of a Git error', async () => {
    const result = await observeRepository({}, makeDeps({ git: { statusThrows: true }, pathExists: false }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('repository-vanished');
  });

  it('reports Git failure when the path still exists', async () => {
    const result = await observeRepository({}, makeDeps({ git: { statusThrows: true }, pathExists: true }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('git-failure');
  });

  it('returns unstable instead of manufacturing coherence when HEAD moves', async () => {
    const result = await observeRepository({}, makeDeps({ git: { logHeads: ['aaa', 'bbb'] } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unstable-observation');
  });

  it('maps binding disappearance to vanished and other binding errors to binding-failed', async () => {
    const vanished = await observeRepository({}, makeDeps({ bindingThrows: 'Repository path does not exist: /gone' }));
    expect(vanished.ok).toBe(false);
    if (!vanished.ok) expect(vanished.reason).toBe('repository-vanished');

    const failed = await observeRepository({}, makeDeps({ bindingThrows: 'boom' }));
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.reason).toBe('binding-failed');
  });
});
