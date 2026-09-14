/**
 * VES-REPO-002 — identity separation: seven kinds, never collapsed.
 * A filesystem path is a locator on RepositoryIdentity, never the identity.
 */
import { describe, expect, it } from 'vitest';
import { IDENTITY_KINDS, isIdentityRefOfKind, isValidRepositoryIdentity, makeIdentityRef } from '../src/identity';

describe('identity separation', () => {
  it('declares exactly seven identity kinds', () => {
    expect(IDENTITY_KINDS).toEqual([
      'repository',
      'workflow-run',
      'execution',
      'runtime-session',
      'operation',
      'changeset',
      'snapshot',
    ]);
  });

  it('kind tags never match across kinds', () => {
    const execution = makeIdentityRef('execution', 'same-id');
    const session = makeIdentityRef('runtime-session', 'same-id');
    expect(isIdentityRefOfKind(execution, 'execution')).toBe(true);
    expect(isIdentityRefOfKind(execution, 'runtime-session')).toBe(false);
    expect(isIdentityRefOfKind(session, 'execution')).toBe(false);
    // Identical raw ids with different kinds are still distinct references.
    expect(execution).not.toEqual(session);
  });

  it('repository identity keeps id durable and root a locator', () => {
    const identity = {
      repositoryId: 'repo-abc',
      vcs: 'git',
      root: '/home/user/projects/vestara/vestara-ai-core',
      remote: { name: 'origin', url: 'https://example.invalid/vestara.git' },
    };
    expect(isValidRepositoryIdentity(identity)).toBe(true);
    // The root alone is not an identity.
    expect(isValidRepositoryIdentity({ root: '/x', vcs: 'git' })).toBe(false);
    expect(isValidRepositoryIdentity({ repositoryId: 'r', vcs: 'git' })).toBe(false);
    expect(isValidRepositoryIdentity({ repositoryId: 'r', vcs: 'svn', root: '/x' })).toBe(false);
  });
});
