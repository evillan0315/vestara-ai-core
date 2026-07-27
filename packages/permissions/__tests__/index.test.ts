import { describe, expect, it } from 'vitest';

describe('@vestara/permissions', () => {
  it('exports ROLE_LEVELS and ROLE_PERMISSIONS', () => {
    const mod = require('../dist/index.js');
    expect(mod.ROLE_LEVELS.owner).toBe(100);
    expect(mod.ROLE_LEVELS.guest).toBe(10);
    expect(mod.ROLE_PERMISSIONS.owner.length).toBeGreaterThan(0);
  });

  it('exports DEFAULT_ROLES_BY_RUNTIME_TYPE', () => {
    const mod = require('../dist/index.js');
    expect(mod.DEFAULT_ROLES_BY_RUNTIME_TYPE.workspace).toBe('owner');
    expect(mod.DEFAULT_ROLES_BY_RUNTIME_TYPE.agent).toBe('developer');
    expect(mod.DEFAULT_ROLES_BY_RUNTIME_TYPE.kernel).toBe('system');
  });

  it('createPermissionManager creates a manager', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    expect(pm).toBeDefined();
    expect(typeof pm.check).toBe('function');
    expect(typeof pm.grant).toBe('function');
    expect(typeof pm.revoke).toBe('function');
  });

  it('owner can perform any operation', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    expect(pm.hasOperation('owner', 'runtime:delete')).toBe(true);
    expect(pm.hasOperation('owner', 'permission:grant')).toBe(true);
    expect(pm.hasOperation('owner', 'system:shutdown')).toBe(true);
  });

  it('guest has minimal operations', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    expect(pm.hasOperation('guest', 'runtime:read')).toBe(true);
    expect(pm.hasOperation('guest', 'runtime:create')).toBe(false);
    expect(pm.hasOperation('guest', 'job:submit')).toBe(false);
  });

  it('check returns false for unknown actor with no grants', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    const result = pm.check({
      actor: 'unknown-user',
      operation: 'runtime:read',
      targetType: 'workspace',
      targetId: 'test-workspace',
    });
    expect(result).toBe(false);
  });

  it('check returns true with explicit grant', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    pm.grant('test-user', 'admin', 'workspace', 'ws-1', 'system');
    const result = pm.check({
      actor: 'test-user',
      operation: 'runtime:create',
      targetType: 'workspace',
      targetId: 'ws-1',
    });
    expect(result).toBe(true);
  });

  it('grant does not affect other targets', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    pm.grant('test-user', 'admin', 'workspace', 'ws-1', 'system');
    const result = pm.check({
      actor: 'test-user',
      operation: 'runtime:create',
      targetType: 'workspace',
      targetId: 'ws-2',
    });
    expect(result).toBe(false);
  });

  it('revoke removes permission', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    const grant = pm.grant('test-user', 'admin', 'workspace', 'ws-1', 'system');
    expect(
      pm.check({ actor: 'test-user', operation: 'runtime:create', targetType: 'workspace', targetId: 'ws-1' }),
    ).toBe(true);
    pm.revoke(grant.id);
    expect(
      pm.check({ actor: 'test-user', operation: 'runtime:create', targetType: 'workspace', targetId: 'ws-1' }),
    ).toBe(false);
  });

  it('getEffectiveRole returns null for unknown actor', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    expect(pm.getEffectiveRole('user', 'workspace', 'ws-1')).toBeNull();
  });

  it('getEffectiveRole returns granted role', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    pm.grant('user', 'observer', 'workspace', 'ws-1', 'admin');
    expect(pm.getEffectiveRole('user', 'workspace', 'ws-1')).toBe('observer');
  });

  it('registerDefaultGrants creates grants from default roles', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    const grants = pm.registerDefaultGrants('workspace-1', 'workspace', 'ws-1');
    expect(grants).toHaveLength(1);
    expect(grants[0].role).toBe('owner');
    const result = pm.check({
      actor: 'workspace-1',
      operation: 'runtime:delete',
      targetType: 'workspace',
      targetId: 'ws-1',
    });
    expect(result).toBe(true);
  });

  it('registerDefaultGrants does not grant to external actors', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    pm.registerDefaultGrants('workspace-1', 'workspace', 'ws-1');
    const result = pm.check({
      actor: 'other-user',
      operation: 'runtime:read',
      targetType: 'workspace',
      targetId: 'ws-1',
    });
    expect(result).toBe(false);
  });

  it('registerDefaultGrants returns empty for unknown runtime type', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    const grants = pm.registerDefaultGrants('test', 'custom-type' as any, 'test-1');
    expect(grants).toHaveLength(0);
  });

  it('getGrantsForTarget returns grants for target', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    pm.grant('user1', 'admin', 'agent', 'agent-1', 'system');
    pm.grant('user2', 'observer', 'agent', 'agent-1', 'system');
    const grants = pm.getGrantsForTarget('agent', 'agent-1');
    expect(grants).toHaveLength(2);
  });

  it('getGrantsForActor returns grants for actor', () => {
    const mod = require('../dist/index.js');
    const pm = mod.createPermissionManager();
    pm.grant('user1', 'admin', 'agent', 'agent-1', 'system');
    pm.grant('user1', 'observer', 'agent', 'agent-2', 'system');
    const grants = pm.getGrantsForActor('user1');
    expect(grants).toHaveLength(2);
  });

  it('InMemoryPermissionStore stores and retrieves grants', () => {
    const mod = require('../dist/index.js');
    const store = new mod.InMemoryPermissionStore();
    const grant1 = {
      id: 'g1' as any,
      grantee: 'user1',
      role: 'admin' as any,
      targetType: 'agent',
      targetId: 'agent-1',
      grantedBy: 'system',
      grantedAt: new Date().toISOString(),
      expiresAt: null,
    };
    const grant2 = {
      id: 'g2' as any,
      grantee: 'user2',
      role: 'observer' as any,
      targetType: 'agent',
      targetId: 'agent-1',
      grantedBy: 'system',
      grantedAt: new Date().toISOString(),
      expiresAt: null,
    };
    store.addGrant(grant1);
    store.addGrant(grant2);
    expect(store.getGrants('agent', 'agent-1')).toHaveLength(2);
    expect(store.getGrantsForActor('user1')).toHaveLength(1);
    store.removeGrant('g1');
    expect(store.getGrants('agent', 'agent-1')).toHaveLength(1);
  });
});
