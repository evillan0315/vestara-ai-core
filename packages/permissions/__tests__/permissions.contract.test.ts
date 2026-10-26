import { describe, expect, it } from 'vitest';
import { InMemoryPermissionStore } from '../src/index';

describe('InMemoryPermissionStore contract', () => {
  it('adds, queries, and removes grants', () => {
    const store = new InMemoryPermissionStore();
    store.addGrant({
      id: 'g1',
      grantee: 'alice',
      role: 'viewer',
      targetType: 'repo',
      targetId: 'r1',
      grantedBy: 'system',
      grantedAt: new Date().toISOString(),
      expiresAt: null,
    } as never);
    expect(store.getGrants('repo', 'r1')).toHaveLength(1);
    expect(store.getGrantsForActor('alice')).toHaveLength(1);
    store.removeGrant('g1');
    expect(store.getGrant('g1')).toBeUndefined();
  });
});
