import { describe, expect, it } from 'vitest';
import type { RuntimeId } from '../src/index';
import { OwnershipRegistry, ResourceLockManager } from '../src/index';

const runtime = (id: string): RuntimeId => id as RuntimeId;

describe('OwnershipRegistry', () => {
  it('claims ownership and reports the owner', () => {
    const registry = new OwnershipRegistry();
    const entry = registry.claim({ kind: 'repository', id: 'repo-1' }, runtime('runtime-a'));
    expect(registry.ownerOf({ kind: 'repository', id: 'repo-1' })).toBe('runtime-a');
    expect(registry.isOwner({ kind: 'repository', id: 'repo-1' }, runtime('runtime-a'))).toBe(true);
    expect(entry.owner).toBe('runtime-a');
  });

  it('allows a new owner to take over after release', () => {
    const registry = new OwnershipRegistry();
    registry.claim({ kind: 'file', id: 'f1' }, runtime('a'));
    expect(registry.release({ kind: 'file', id: 'f1' })).toBe(true);
    registry.claim({ kind: 'file', id: 'f1' }, runtime('b'));
    expect(registry.ownerOf({ kind: 'file', id: 'f1' })).toBe('b');
  });

  it('lists all ownership entries', () => {
    const registry = new OwnershipRegistry();
    registry.claim({ kind: 'file', id: 'f1' }, runtime('a'));
    registry.claim({ kind: 'module', id: 'm1' }, runtime('b'));
    expect(registry.list()).toHaveLength(2);
  });
});

describe('ResourceLockManager', () => {
  it('acquires a lock and reports the holder', () => {
    const manager = new ResourceLockManager();
    const result = manager.acquire({ kind: 'file', id: 'f1' }, runtime('a'));
    expect(result.status).toBe('acquired');
    expect(manager.holderOf({ kind: 'file', id: 'f1' })).toBe('a');
    expect(manager.isHeld({ kind: 'file', id: 'f1' })).toBe(true);
  });

  it('rejects a second runtime while the lock is held', () => {
    const manager = new ResourceLockManager();
    manager.acquire({ kind: 'file', id: 'f1' }, runtime('a'));
    const second = manager.acquire({ kind: 'file', id: 'f1' }, runtime('b'));
    expect(second.status).toBe('busy');
    expect(second.status === 'busy' && second.reason.length > 0).toBe(true);
  });

  it('allows reentrant acquisition by the same runtime', () => {
    const manager = new ResourceLockManager();
    manager.acquire({ kind: 'file', id: 'f1' }, runtime('a'));
    const reentrant = manager.acquire({ kind: 'file', id: 'f1' }, runtime('a'));
    expect(reentrant.status).toBe('held');
  });

  it('releases a lock only to its holder', () => {
    const manager = new ResourceLockManager();
    manager.acquire({ kind: 'file', id: 'f1' }, runtime('a'));
    expect(manager.release({ kind: 'file', id: 'f1' }, runtime('b'))).toBe(false);
    expect(manager.release({ kind: 'file', id: 'f1' }, runtime('a'))).toBe(true);
    expect(manager.isHeld({ kind: 'file', id: 'f1' })).toBe(false);
  });

  it('lets an expired lock be reacquired (deadlock prevention)', async () => {
    const manager = new ResourceLockManager({ defaultTimeoutMs: 20 });
    manager.acquire({ kind: 'file', id: 'f1' }, runtime('a'));
    await new Promise((resolve) => setTimeout(resolve, 40));
    const second = manager.acquire({ kind: 'file', id: 'f1' }, runtime('b'));
    expect(second.status).toBe('acquired');
    expect(manager.holderOf({ kind: 'file', id: 'f1' })).toBe('b');
  });

  it('sweeps expired locks', async () => {
    const manager = new ResourceLockManager({ defaultTimeoutMs: 10 });
    manager.acquire({ kind: 'file', id: 'f1' }, runtime('a'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(manager.sweepExpired()).toBe(1);
    expect(manager.list()).toHaveLength(0);
  });
});
