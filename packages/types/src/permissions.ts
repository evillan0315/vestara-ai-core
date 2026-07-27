import type { Brand } from './common';

export type Role = 'owner' | 'admin' | 'manager' | 'developer' | 'contributor' | 'observer' | 'guest' | 'system';

export type RoleLevel = 100 | 90 | 70 | 50 | 40 | 20 | 10 | 99;

export const ROLE_LEVELS: Record<Role, RoleLevel> = {
  owner: 100,
  admin: 90,
  system: 99,
  manager: 70,
  developer: 50,
  contributor: 40,
  observer: 20,
  guest: 10,
};

export type PermissionOperation =
  | 'runtime:create'
  | 'runtime:read'
  | 'runtime:update'
  | 'runtime:delete'
  | 'runtime:start'
  | 'runtime:stop'
  | 'runtime:suspend'
  | 'runtime:resume'
  | 'runtime:quarantine'
  | 'runtime:unquarantine'
  | 'job:submit'
  | 'job:read'
  | 'job:cancel'
  | 'job:approve'
  | 'job:reassign'
  | 'worker:register'
  | 'worker:read'
  | 'worker:update'
  | 'worker:unregister'
  | 'resource:read'
  | 'resource:write'
  | 'resource:lock'
  | 'resource:unlock'
  | 'resource:transfer'
  | 'permission:grant'
  | 'permission:revoke'
  | 'system:configure'
  | 'system:monitor'
  | 'system:shutdown'
  | 'event:subscribe'
  | 'event:publish'
  | 'intent:submit'
  | 'intent:plan'
  | 'intent:approve'
  | 'verification:override'
  | 'recovery:trigger';

export const ROLE_PERMISSIONS: Record<Role, PermissionOperation[]> = {
  owner: [
    'runtime:create',
    'runtime:read',
    'runtime:update',
    'runtime:delete',
    'runtime:start',
    'runtime:stop',
    'runtime:suspend',
    'runtime:resume',
    'runtime:quarantine',
    'runtime:unquarantine',
    'job:submit',
    'job:read',
    'job:cancel',
    'job:approve',
    'job:reassign',
    'worker:register',
    'worker:read',
    'worker:update',
    'worker:unregister',
    'resource:read',
    'resource:write',
    'resource:lock',
    'resource:unlock',
    'resource:transfer',
    'permission:grant',
    'permission:revoke',
    'system:configure',
    'system:monitor',
    'system:shutdown',
    'event:subscribe',
    'event:publish',
    'intent:submit',
    'intent:plan',
    'intent:approve',
    'verification:override',
    'recovery:trigger',
  ],
  admin: [
    'runtime:create',
    'runtime:read',
    'runtime:update',
    'runtime:start',
    'runtime:stop',
    'runtime:suspend',
    'runtime:resume',
    'runtime:quarantine',
    'runtime:unquarantine',
    'job:submit',
    'job:read',
    'job:cancel',
    'job:approve',
    'job:reassign',
    'worker:register',
    'worker:read',
    'worker:update',
    'worker:unregister',
    'resource:read',
    'resource:write',
    'resource:lock',
    'resource:unlock',
    'permission:grant',
    'system:configure',
    'system:monitor',
    'event:subscribe',
    'event:publish',
    'intent:submit',
    'intent:plan',
    'intent:approve',
    'verification:override',
    'recovery:trigger',
  ],
  system: [
    'runtime:create',
    'runtime:read',
    'runtime:update',
    'runtime:delete',
    'runtime:start',
    'runtime:stop',
    'runtime:suspend',
    'runtime:resume',
    'runtime:quarantine',
    'runtime:unquarantine',
    'job:submit',
    'job:read',
    'job:cancel',
    'job:approve',
    'job:reassign',
    'worker:register',
    'worker:read',
    'worker:update',
    'worker:unregister',
    'resource:read',
    'resource:write',
    'resource:lock',
    'resource:unlock',
    'resource:transfer',
    'permission:grant',
    'permission:revoke',
    'system:configure',
    'system:monitor',
    'system:shutdown',
    'event:subscribe',
    'event:publish',
    'intent:submit',
    'intent:plan',
    'intent:approve',
    'verification:override',
    'recovery:trigger',
  ],
  manager: [
    'runtime:create',
    'runtime:read',
    'runtime:update',
    'runtime:start',
    'runtime:stop',
    'runtime:suspend',
    'runtime:resume',
    'runtime:quarantine',
    'job:submit',
    'job:read',
    'job:cancel',
    'job:approve',
    'job:reassign',
    'worker:register',
    'worker:read',
    'worker:update',
    'worker:unregister',
    'resource:read',
    'resource:write',
    'resource:lock',
    'resource:unlock',
    'system:monitor',
    'event:subscribe',
    'event:publish',
    'intent:submit',
    'intent:plan',
    'intent:approve',
    'recovery:trigger',
  ],
  developer: [
    'runtime:create',
    'runtime:read',
    'runtime:start',
    'job:submit',
    'job:read',
    'worker:read',
    'resource:read',
    'resource:write',
    'resource:lock',
    'resource:unlock',
    'event:subscribe',
    'event:publish',
    'intent:submit',
  ],
  contributor: [
    'runtime:read',
    'job:submit',
    'job:read',
    'worker:read',
    'resource:read',
    'event:subscribe',
    'intent:submit',
  ],
  observer: ['runtime:read', 'job:read', 'worker:read', 'resource:read', 'event:subscribe'],
  guest: ['runtime:read', 'resource:read', 'event:subscribe'],
};

export interface PermissionCheck {
  actor: string;
  operation: PermissionOperation;
  targetType: string;
  targetId: string;
}

export interface PermissionGrant {
  id: Brand<string, 'PermissionId'>;
  grantee: string;
  role: Role;
  targetType: string;
  targetId: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt: string | null;
}
