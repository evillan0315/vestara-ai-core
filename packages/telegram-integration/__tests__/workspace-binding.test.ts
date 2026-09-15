import { migrate } from '@vestara/sqlite-migrations';
import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { TELEGRAM_MANIFEST } from '../src/migrations';
import { TelegramPersistentStore } from '../src/persistent-store';
import { TelegramWorkspaceBindingService } from '../src/workspace-binding';

async function makeStore(): Promise<TelegramPersistentStore> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  migrate(db, TELEGRAM_MANIFEST);
  return new TelegramPersistentStore(db);
}

describe('TelegramWorkspaceBindingService', () => {
  describe('bindWorkspace', () => {
    it('binds a principal to a workspace', () => {
      const service = new TelegramWorkspaceBindingService();
      const binding = service.bindWorkspace('p-1', 'ws-1', 'My Workspace');

      expect(binding.id).toMatch(/^ws-/);
      expect(binding.principalId).toBe('p-1');
      expect(binding.workspaceId).toBe('ws-1');
      expect(binding.workspaceName).toBe('My Workspace');
      expect(binding.preferred).toBe(true); // first workspace is preferred
    });

    it('rejects duplicate binding', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'Workspace 1');

      expect(() => service.bindWorkspace('p-1', 'ws-1', 'Workspace 1')).toThrow(
        'Principal is already bound to this workspace',
      );
    });

    it('enforces workspace limit', () => {
      const service = new TelegramWorkspaceBindingService({ maxWorkspacesPerPrincipal: 2 });
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');
      service.bindWorkspace('p-1', 'ws-2', 'WS 2');

      expect(() => service.bindWorkspace('p-1', 'ws-3', 'WS 3')).toThrow('Maximum workspaces per principal reached');
    });

    it('allows different principals to bind to the same workspace', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'Shared WS');
      const binding = service.bindWorkspace('p-2', 'ws-1', 'Shared WS');

      expect(binding.principalId).toBe('p-2');
    });
  });

  describe('unbindWorkspace', () => {
    it('removes a binding', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');
      service.unbindWorkspace('p-1', 'ws-1');

      expect(service.hasAccess('p-1', 'ws-1')).toBe(false);
    });
  });

  describe('getPreferredWorkspace', () => {
    it('returns the preferred workspace', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');
      service.bindWorkspace('p-1', 'ws-2', 'WS 2');

      const preferred = service.getPreferredWorkspace('p-1');
      expect(preferred?.workspaceId).toBe('ws-1'); // first is preferred
    });

    it('returns undefined when no bindings exist', () => {
      const service = new TelegramWorkspaceBindingService();
      expect(service.getPreferredWorkspace('p-1')).toBeUndefined();
    });
  });

  describe('setPreferredWorkspace', () => {
    it('changes the preferred workspace', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');
      service.bindWorkspace('p-1', 'ws-2', 'WS 2');
      service.setPreferredWorkspace('p-1', 'ws-2');

      const preferred = service.getPreferredWorkspace('p-1');
      expect(preferred?.workspaceId).toBe('ws-2');
    });
  });

  describe('hasAccess', () => {
    it('returns true for bound principal', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');

      expect(service.hasAccess('p-1', 'ws-1')).toBe(true);
    });

    it('returns false for unbound principal', () => {
      const service = new TelegramWorkspaceBindingService();
      expect(service.hasAccess('p-1', 'ws-1')).toBe(false);
    });
  });

  describe('getBindingsByPrincipal', () => {
    it('returns all bindings for a principal', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');
      service.bindWorkspace('p-1', 'ws-2', 'WS 2');
      service.bindWorkspace('p-2', 'ws-3', 'WS 3');

      const bindings = service.getBindingsByPrincipal('p-1');
      expect(bindings).toHaveLength(2);
    });
  });

  describe('setPreferredWorkspace validation', () => {
    it('rejects switching to a workspace the principal is not bound to', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');

      expect(() => service.setPreferredWorkspace('p-1', 'ws-9')).toThrow('Principal is not bound to this workspace');
      // Existing preferred is preserved — never silently cleared.
      expect(service.getPreferredWorkspace('p-1')?.workspaceId).toBe('ws-1');
    });

    it('rejects switching for an unknown principal', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');

      expect(() => service.setPreferredWorkspace('p-unknown', 'ws-1')).toThrow(
        'Principal is not bound to this workspace',
      );
    });
  });

  describe('cross-workspace isolation', () => {
    it('isolates bindings between principals', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');

      expect(service.hasAccess('p-2', 'ws-1')).toBe(false);
      expect(service.getPreferredWorkspace('p-2')).toBeUndefined();
      expect(service.getBindingsByPrincipal('p-2')).toHaveLength(0);
    });

    it('keeps preferred workspaces independent per principal', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');
      service.bindWorkspace('p-1', 'ws-2', 'WS 2');
      service.bindWorkspace('p-2', 'ws-3', 'WS 3');
      service.setPreferredWorkspace('p-1', 'ws-2');

      expect(service.getPreferredWorkspace('p-1')?.workspaceId).toBe('ws-2');
      expect(service.getPreferredWorkspace('p-2')?.workspaceId).toBe('ws-3');
    });
  });

  describe('deleted workspace handling', () => {
    it('resolves no preferred workspace after the preferred is unbound', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');
      service.unbindWorkspace('p-1', 'ws-1');

      expect(service.getPreferredWorkspace('p-1')).toBeUndefined();
      expect(service.hasAccess('p-1', 'ws-1')).toBe(false);
    });

    it('falls back to remaining bindings after one workspace is unbound', () => {
      const service = new TelegramWorkspaceBindingService();
      service.bindWorkspace('p-1', 'ws-1', 'WS 1');
      service.bindWorkspace('p-1', 'ws-2', 'WS 2');
      service.unbindWorkspace('p-1', 'ws-1');

      expect(service.hasAccess('p-1', 'ws-1')).toBe(false);
      expect(service.hasAccess('p-1', 'ws-2')).toBe(true);
    });
  });

  describe('persistence across restart', () => {
    it('retains bindings and preferred selection on a fresh instance', async () => {
      const store = await makeStore();
      const before = new TelegramWorkspaceBindingService({ store });
      before.bindWorkspace('p-1', 'ws-1', 'WS 1');
      before.bindWorkspace('p-1', 'ws-2', 'WS 2');
      before.setPreferredWorkspace('p-1', 'ws-2');

      // Simulate restart: new service, same SQLite store.
      const after = new TelegramWorkspaceBindingService({ store });
      expect(after.hasAccess('p-1', 'ws-1')).toBe(true);
      expect(after.getPreferredWorkspace('p-1')?.workspaceId).toBe('ws-2');
    });

    it('retains unbind on a fresh instance', async () => {
      const store = await makeStore();
      const before = new TelegramWorkspaceBindingService({ store });
      before.bindWorkspace('p-1', 'ws-1', 'WS 1');
      before.unbindWorkspace('p-1', 'ws-1');

      const after = new TelegramWorkspaceBindingService({ store });
      expect(after.hasAccess('p-1', 'ws-1')).toBe(false);
      expect(after.getPreferredWorkspace('p-1')).toBeUndefined();
    });
  });

  describe('touchWorkspace', () => {
    it('updates last accessed timestamp', async () => {
      const service = new TelegramWorkspaceBindingService();
      const binding = service.bindWorkspace('p-1', 'ws-1', 'WS 1');
      const originalTime = binding.lastAccessedAt;

      // Ensure timestamp will differ
      await new Promise((r) => setTimeout(r, 10));
      service.touchWorkspace('p-1', 'ws-1');
      const updated = service.getBinding('p-1', 'ws-1');

      expect(updated?.lastAccessedAt).not.toBe(originalTime);
    });
  });
});
