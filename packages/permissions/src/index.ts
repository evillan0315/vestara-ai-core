import type {
  PermissionCheck,
  PermissionGrant,
  PermissionOperation,
  Role,
  RoleLevel,
  RuntimeType,
} from '@vestara/types';
import { ROLE_LEVELS, ROLE_PERMISSIONS } from '@vestara/types';

export type { PermissionCheck, PermissionGrant, PermissionOperation, Role, RoleLevel };
export { ROLE_LEVELS, ROLE_PERMISSIONS };

export interface PermissionStore {
  getGrants(targetType: string, targetId: string): PermissionGrant[];
  getGrantsForActor(actor: string): PermissionGrant[];
  getGrant(id: string): PermissionGrant | undefined;
  addGrant(grant: PermissionGrant): void;
  removeGrant(id: string): void;
}

export class InMemoryPermissionStore implements PermissionStore {
  private grants: PermissionGrant[] = [];

  getGrants(targetType: string, targetId: string): PermissionGrant[] {
    return this.grants.filter((g) => g.targetType === targetType && g.targetId === targetId);
  }

  getGrantsForActor(actor: string): PermissionGrant[] {
    return this.grants.filter((g) => g.grantee === actor);
  }

  getGrant(id: string): PermissionGrant | undefined {
    return this.grants.find((g) => g.id === id);
  }

  addGrant(grant: PermissionGrant): void {
    this.grants.push(grant);
  }

  removeGrant(id: string): void {
    this.grants = this.grants.filter((g) => g.id !== id);
  }
}

export interface PermissionManager {
  check(check: PermissionCheck): boolean;
  getEffectiveRole(actor: string, targetType: string, targetId: string): Role | null;
  hasOperation(role: Role, operation: PermissionOperation): boolean;
  grant(actor: string, role: Role, targetType: string, targetId: string, grantedBy: string): PermissionGrant;
  revoke(grantId: string): void;
  registerDefaultGrants(actor: string, runtimeType: RuntimeType, runtimeId: string): PermissionGrant[];
  getGrantsForTarget(targetType: string, targetId: string): PermissionGrant[];
  getGrantsForActor(actor: string): PermissionGrant[];
}

export const DEFAULT_ROLES_BY_RUNTIME_TYPE: Record<string, Role> = {
  system: 'system',
  kernel: 'system',
  scheduler: 'system',
  'job-manager': 'system',
  'event-bus': 'system',
  verification: 'system',
  trust: 'system',
  recovery: 'system',
  lock: 'system',
  permission: 'system',
  state: 'system',
  config: 'system',
  health: 'system',
  workspace: 'owner',
  repository: 'owner',
  project: 'owner',
  agent: 'developer',
  'ai-agent': 'developer',
  session: 'contributor',
  widget: 'developer',
  plugin: 'developer',
  tool: 'contributor',
  model: 'developer',
  'worker-pool': 'manager',
  dashboard: 'manager',
};

export function createPermissionManager(store?: PermissionStore): PermissionManager {
  const permissionStore = store ?? new InMemoryPermissionStore();

  function getEffectiveRole(actor: string, targetType: string, targetId: string): Role | null {
    const targetGrants = permissionStore.getGrants(targetType, targetId);
    const actorGrant = targetGrants.find((g) => g.grantee === actor);
    if (actorGrant) return actorGrant.role;
    return null;
  }

  function hasOperation(role: Role, operation: PermissionOperation): boolean {
    const ops = ROLE_PERMISSIONS[role];
    if (!ops) return false;
    return ops.includes(operation);
  }

  function check(check: PermissionCheck): boolean {
    const role = getEffectiveRole(check.actor, check.targetType, check.targetId);
    if (!role) return false;
    return hasOperation(role, check.operation);
  }

  function grant(actor: string, role: Role, targetType: string, targetId: string, grantedBy: string): PermissionGrant {
    const grant: PermissionGrant = {
      id: `${actor}-${targetType}-${targetId}-${Date.now()}` as PermissionGrant['id'],
      grantee: actor,
      role,
      targetType,
      targetId,
      grantedBy,
      grantedAt: new Date().toISOString(),
      expiresAt: null,
    };
    permissionStore.addGrant(grant);
    return grant;
  }

  function revoke(grantId: string): void {
    permissionStore.removeGrant(grantId);
  }

  function registerDefaultGrants(actor: string, runtimeType: RuntimeType, runtimeId: string): PermissionGrant[] {
    const role = DEFAULT_ROLES_BY_RUNTIME_TYPE[runtimeType];
    if (!role) return [];
    const selfGrant = grant(actor, role, runtimeType, runtimeId, 'system');
    return [selfGrant];
  }

  function getGrantsForTarget(targetType: string, targetId: string): PermissionGrant[] {
    return permissionStore.getGrants(targetType, targetId);
  }

  function getGrantsForActor(actor: string): PermissionGrant[] {
    return permissionStore.getGrantsForActor(actor);
  }

  return {
    check,
    getEffectiveRole,
    hasOperation,
    grant,
    revoke,
    registerDefaultGrants,
    getGrantsForTarget,
    getGrantsForActor,
  };
}
