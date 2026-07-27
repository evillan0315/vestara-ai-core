/**
 * @vestara/settings-framework — Permission Engine
 *
 * Role-based access control for settings modules.
 * Enforces permissions at the API level, not UI level.
 *
 * Architecture Traceability:
 *   Settings Framework: 08-Governance.md → Permission System
 *   Natural Law: Trust is earned, never assumed
 */

import type {
  PermissionEngine as IPermissionEngine,
  PermissionAction,
  SettingsEvent,
  SettingsEventHandler,
  SettingsEventType,
  SettingsPermission,
} from './types.js';

// ─── Permission Engine ───────────────────────────────────────

export class PermissionEngine implements IPermissionEngine {
  private permissions = new Map<string, SettingsPermission>();
  private eventHandlers = new Map<SettingsEventType, Set<SettingsEventHandler>>();

  register(permission: SettingsPermission): void {
    const key = `${permission.moduleId}:${permission.action}`;
    this.permissions.set(key, permission);

    this.emit({
      type: 'permission:registered',
      timestamp: new Date().toISOString(),
      data: { permission },
    });
  }

  check(moduleId: string, action: PermissionAction, roles: string[]): boolean {
    const key = `${moduleId}:${action}`;
    const permission = this.permissions.get(key);

    // If no permission is defined, deny access
    if (!permission) {
      return false;
    }

    // Check if any of the user's roles match the required roles
    return roles.some((role) => permission.roles.includes(role));
  }

  getByModule(moduleId: string): SettingsPermission[] {
    return Array.from(this.permissions.values()).filter((p) => p.moduleId === moduleId);
  }

  getAll(): SettingsPermission[] {
    return Array.from(this.permissions.values());
  }

  // ─── Event System ────────────────────────────────────────

  on(type: SettingsEventType, handler: SettingsEventHandler): () => void {
    const handlers = this.eventHandlers.get(type) || new Set();
    handlers.add(handler);
    this.eventHandlers.set(type, handlers);

    return () => {
      handlers.delete(handler);
    };
  }

  private emit(event: SettingsEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }
}

// ─── Default Permissions ─────────────────────────────────────

export const DEFAULT_PERMISSIONS: SettingsPermission[] = [
  // AI Module
  { moduleId: 'ai', action: 'read', roles: ['user', 'admin', 'superadmin'] },
  { moduleId: 'ai', action: 'write', roles: ['admin', 'superadmin'] },
  { moduleId: 'ai', action: 'admin', roles: ['superadmin'] },

  // AI Providers
  { moduleId: 'providers', action: 'read', roles: ['user', 'admin', 'superadmin'] },
  { moduleId: 'providers', action: 'write', roles: ['admin', 'superadmin'] },
  { moduleId: 'providers', action: 'admin', roles: ['superadmin'] },

  // AI Routing
  { moduleId: 'routing', action: 'read', roles: ['user', 'admin', 'superadmin'] },
  { moduleId: 'routing', action: 'write', roles: ['admin', 'superadmin'] },
  { moduleId: 'routing', action: 'admin', roles: ['superadmin'] },

  // Workspace
  { moduleId: 'workspace', action: 'read', roles: ['user', 'admin', 'superadmin'] },
  { moduleId: 'workspace', action: 'write', roles: ['user', 'admin', 'superadmin'] },
  { moduleId: 'workspace', action: 'admin', roles: ['superadmin'] },

  // Appearance
  { moduleId: 'appearance', action: 'read', roles: ['user', 'admin', 'superadmin'] },
  { moduleId: 'appearance', action: 'write', roles: ['user', 'admin', 'superadmin'] },
  { moduleId: 'appearance', action: 'admin', roles: ['superadmin'] },

  // System
  { moduleId: 'system', action: 'read', roles: ['admin', 'superadmin'] },
  { moduleId: 'system', action: 'write', roles: ['superadmin'] },
  { moduleId: 'system', action: 'admin', roles: ['superadmin'] },
];

// ─── Role Definitions ────────────────────────────────────────

export const ROLE_DEFINITIONS = {
  user: {
    name: 'User',
    description: 'Basic user with read access to most settings',
    permissions: ['settings:read'],
  },
  admin: {
    name: 'Administrator',
    description: 'Administrator with write access to most settings',
    permissions: ['settings:read', 'settings:write'],
  },
  superadmin: {
    name: 'Super Administrator',
    description: 'Full access to all settings including system settings',
    permissions: ['settings:read', 'settings:write', 'settings:admin'],
  },
} as const;

export type Role = keyof typeof ROLE_DEFINITIONS;
