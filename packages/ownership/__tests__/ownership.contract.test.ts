import { describe, expect, it } from 'vitest';
import { OwnershipRegistry, ResourceLockManager } from '../src/ownership';

describe('ownership contract', () => {
  it('claims, checks, and releases resource ownership', () => {
    const registry = new OwnershipRegistry();
    const resource = { kind: 'file', id: 'a.ts' } as const;
    registry.claim(resource, 'runtime-1' as never);
    expect(registry.ownerOf(resource)).toBe('runtime-1');
    expect(registry.isOwner(resource, 'runtime-1' as never)).toBe(true);
    expect(registry.release(resource)).toBe(true);
    expect(registry.ownerOf(resource)).toBeUndefined();
  });

  it('acquires and releases locks through the lock manager', () => {
    const locks = new ResourceLockManager();
    const resource = { kind: 'session', id: 's1' } as const;
    const acquired = locks.acquire(resource, 'runtime-1' as never);
    expect(acquired.status).toBe('acquired');
    expect(locks.isHeld(resource)).toBe(true);
    expect(locks.release(resource, 'runtime-1' as never)).toBe(true);
  });
});
