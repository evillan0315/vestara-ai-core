import { describe, expect, it } from 'vitest';
import { TelegramWorkspaceBindingService } from '../src/workspace-binding';

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
