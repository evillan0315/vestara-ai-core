/**
 * @vestara/settings-framework — Module Registry Tests
 *
 * Tests for the Module Registry implementation.
 * Verifies that modules can be registered, retrieved, and searched.
 *
 * Architecture Traceability:
 *   Settings Framework: 06-Registry.md → Module Registry
 *   Natural Law: Identity precedes responsibility
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ImportExportEngine } from '../src/import-export-engine.js';
import { ModuleRegistry } from '../src/module-registry.js';
import { DEFAULT_PERMISSIONS, PermissionEngine } from '../src/permission-engine.js';
import { SearchEngine } from '../src/search-engine.js';
import { type SettingsDatabase, SettingsStore } from '../src/settings-store.js';
import type { CreateModuleInput } from '../src/types.js';

// ─── Mock Database ───────────────────────────────────────────

class MockDatabase implements SettingsDatabase {
  private data = new Map<string, Record<string, unknown>>();

  run(sql: string, params?: unknown[]): void {
    // Simple mock implementation
    if (sql.includes('INSERT OR REPLACE')) {
      const [moduleId, key, value, updatedAt, updatedBy] = params || [];
      // Store value as JSON string (matching SQLite behavior)
      this.data.set(`${moduleId}:${key}`, {
        module_id: moduleId,
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
        updated_at: updatedAt,
        updated_by: updatedBy,
      });
    } else if (sql.includes('DELETE')) {
      const [moduleId, key] = params || [];
      if (key) {
        this.data.delete(`${moduleId}:${key}`);
      } else {
        // Delete all for module
        for (const [mapKey] of this.data) {
          if (mapKey.startsWith(`${moduleId}:`)) {
            this.data.delete(mapKey);
          }
        }
      }
    }
  }

  get(sql: string, params?: unknown[]): Record<string, unknown> | undefined {
    if (sql.includes('WHERE module_id = ? AND key = ?')) {
      const [moduleId, key] = params || [];
      return this.data.get(`${moduleId}:${key}`);
    }
    return undefined;
  }

  all(sql: string, params?: unknown[]): Record<string, unknown>[] {
    if (sql.includes('WHERE module_id = ?')) {
      const [moduleId] = params || [];
      const results: Record<string, unknown>[] = [];
      for (const [mapKey, value] of this.data) {
        if (mapKey.startsWith(`${moduleId}:`)) {
          results.push(value);
        }
      }
      return results;
    }
    return [];
  }
}

describe('ModuleRegistry', () => {
  let registry: ModuleRegistry;

  beforeEach(() => {
    registry = new ModuleRegistry();
  });

  describe('register', () => {
    it('should register a module with generated id', () => {
      const input: CreateModuleInput = {
        name: 'AI Providers',
        description: 'Configure AI provider connections',
        icon: 'cpu',
        path: '/settings/ai/providers',
        parentId: 'ai',
        permissions: ['settings:ai:view', 'settings:ai:write'],
        capabilities: ['ai:provider:manage'],
        order: 1,
      };

      const module = registry.register(input);

      expect(module.id).toBeDefined();
      expect(module.name).toBe('AI Providers');
      expect(module.path).toBe('/settings/ai/providers');
      expect(module.status).toBe('active');
      expect(module.createdAt).toBeDefined();
      expect(module.updatedAt).toBeDefined();
    });

    it('should emit module:registered event', () => {
      let eventEmitted = false;
      registry.on('module:registered', () => {
        eventEmitted = true;
      });

      registry.register({
        name: 'Test Module',
        path: '/settings/test',
      });

      expect(eventEmitted).toBe(true);
    });
  });

  describe('get', () => {
    it('should retrieve a registered module', () => {
      const module = registry.register({
        name: 'Test Module',
        path: '/settings/test',
      });

      const retrieved = registry.get(module.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(module.id);
      expect(retrieved?.name).toBe('Test Module');
    });

    it('should return undefined for non-existent module', () => {
      const retrieved = registry.get('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return all registered modules', () => {
      registry.register({ name: 'Module 1', path: '/settings/1' });
      registry.register({ name: 'Module 2', path: '/settings/2' });
      registry.register({ name: 'Module 3', path: '/settings/3' });

      const all = registry.getAll();
      expect(all.length).toBe(3);
    });
  });

  describe('getByParent', () => {
    it('should return modules by parent id', () => {
      registry.register({ name: 'AI', path: '/settings/ai' });
      registry.register({ name: 'Providers', path: '/settings/ai/providers', parentId: 'ai' });
      registry.register({ name: 'Routing', path: '/settings/ai/routing', parentId: 'ai' });
      registry.register({ name: 'Appearance', path: '/settings/appearance' });

      const aiModules = registry.getByParent('ai');
      expect(aiModules.length).toBe(2);
    });
  });

  describe('search', () => {
    it('should search modules by name', () => {
      registry.register({ name: 'AI Providers', path: '/settings/ai/providers' });
      registry.register({ name: 'AI Routing', path: '/settings/ai/routing' });
      registry.register({ name: 'Appearance', path: '/settings/appearance' });

      const results = registry.search('AI');
      expect(results.length).toBe(2);
    });

    it('should search modules by description', () => {
      registry.register({
        name: 'Providers',
        description: 'Configure AI provider connections',
        path: '/settings/providers',
      });

      const results = registry.search('configure');
      expect(results.length).toBe(1);
    });
  });

  describe('unregister', () => {
    it('should unregister a module', () => {
      const module = registry.register({
        name: 'Test Module',
        path: '/settings/test',
      });

      registry.unregister(module.id);

      const retrieved = registry.get(module.id);
      expect(retrieved).toBeUndefined();
    });

    it('should throw for non-existent module', () => {
      expect(() => registry.unregister('non-existent')).toThrow('Module not found: non-existent');
    });
  });

  describe('routes', () => {
    it('should auto-generate route for module', () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const routes = registry.getRoutesByModule(module.id);
      expect(routes.length).toBe(1);
      expect(routes[0].path).toBe('/settings/ai/providers');
    });

    it('should get route by path', () => {
      registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const route = registry.getRoute('/settings/ai/providers');
      expect(route).toBeDefined();
      expect(route?.path).toBe('/settings/ai/providers');
    });
  });

  describe('sections', () => {
    it('should register and retrieve sections', () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const section = registry.registerSection({
        moduleId: module.id,
        name: 'Provider Settings',
        component: 'ProviderSettings',
      });

      expect(section.id).toBeDefined();
      expect(section.name).toBe('Provider Settings');

      const retrieved = registry.getSection(section.id);
      expect(retrieved).toBeDefined();
    });

    it('should get sections by module', () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      registry.registerSection({
        moduleId: module.id,
        name: 'Section 1',
        component: 'Section1',
      });

      registry.registerSection({
        moduleId: module.id,
        name: 'Section 2',
        component: 'Section2',
      });

      const sections = registry.getSectionsByModule(module.id);
      expect(sections.length).toBe(2);
    });
  });

  describe('entries', () => {
    it('should register and retrieve entries', () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const section = registry.registerSection({
        moduleId: module.id,
        name: 'Provider Settings',
        component: 'ProviderSettings',
      });

      const entry = registry.registerEntry({
        sectionId: section.id,
        moduleId: module.id,
        key: 'default-model',
        type: 'string',
        label: 'Default Model',
        defaultValue: 'gpt-4',
      });

      expect(entry.id).toBeDefined();
      expect(entry.key).toBe('default-model');
      expect(entry.defaultValue).toBe('gpt-4');

      const retrieved = registry.getEntry(entry.id);
      expect(retrieved).toBeDefined();
    });

    it('should get entry by key', () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const section = registry.registerSection({
        moduleId: module.id,
        name: 'Provider Settings',
        component: 'ProviderSettings',
      });

      registry.registerEntry({
        sectionId: section.id,
        moduleId: module.id,
        key: 'default-model',
        type: 'string',
        label: 'Default Model',
        defaultValue: 'gpt-4',
      });

      const entry = registry.getEntryByKey(module.id, 'default-model');
      expect(entry).toBeDefined();
      expect(entry?.key).toBe('default-model');
    });
  });
});

describe('SettingsStore', () => {
  let registry: ModuleRegistry;
  let store: SettingsStore;
  let db: MockDatabase;

  beforeEach(() => {
    registry = new ModuleRegistry();
    db = new MockDatabase();
    store = new SettingsStore(registry, db);
  });

  describe('get', () => {
    it('should return default value for unset setting', async () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const section = registry.registerSection({
        moduleId: module.id,
        name: 'Provider Settings',
        component: 'ProviderSettings',
      });

      registry.registerEntry({
        sectionId: section.id,
        moduleId: module.id,
        key: 'default-model',
        type: 'string',
        label: 'Default Model',
        defaultValue: 'gpt-4',
      });

      const value = await store.get(module.id, 'default-model');

      expect(value).toBeDefined();
      expect(value?.value).toBe('gpt-4');
      expect(value?.key).toBe('default-model');
    });

    it('should return null for non-existent setting', async () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const value = await store.get(module.id, 'non-existent');
      expect(value).toBeNull();
    });
  });

  describe('set', () => {
    it('should set and retrieve a value', async () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const section = registry.registerSection({
        moduleId: module.id,
        name: 'Provider Settings',
        component: 'ProviderSettings',
      });

      registry.registerEntry({
        sectionId: section.id,
        moduleId: module.id,
        key: 'default-model',
        type: 'string',
        label: 'Default Model',
        defaultValue: 'gpt-4',
      });

      await store.set(module.id, 'default-model', 'claude-3-opus', 'user');

      const value = await store.get(module.id, 'default-model');

      expect(value).toBeDefined();
      expect(value?.value).toBe('claude-3-opus');
      expect(value?.updatedBy).toBe('user');
    });

    it('should emit setting:changed event', async () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const section = registry.registerSection({
        moduleId: module.id,
        name: 'Provider Settings',
        component: 'ProviderSettings',
      });

      registry.registerEntry({
        sectionId: section.id,
        moduleId: module.id,
        key: 'default-model',
        type: 'string',
        label: 'Default Model',
        defaultValue: 'gpt-4',
      });

      let eventEmitted = false;
      store.on('setting:changed', () => {
        eventEmitted = true;
      });

      await store.set(module.id, 'default-model', 'claude-3-opus', 'user');

      expect(eventEmitted).toBe(true);
    });

    it('should throw for non-existent entry', async () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      await expect(store.set(module.id, 'non-existent', 'value', 'user')).rejects.toThrow('Setting not found:');
    });

    it('should validate value type', async () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const section = registry.registerSection({
        moduleId: module.id,
        name: 'Provider Settings',
        component: 'ProviderSettings',
      });

      registry.registerEntry({
        sectionId: section.id,
        moduleId: module.id,
        key: 'port',
        type: 'number',
        label: 'Port',
        defaultValue: 3001,
      });

      await expect(store.set(module.id, 'port', 'not-a-number', 'user')).rejects.toThrow('Validation failed');
    });
  });

  describe('getAll', () => {
    it('should return all values for a module', async () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const section = registry.registerSection({
        moduleId: module.id,
        name: 'Provider Settings',
        component: 'ProviderSettings',
      });

      registry.registerEntry({
        sectionId: section.id,
        moduleId: module.id,
        key: 'default-model',
        type: 'string',
        label: 'Default Model',
        defaultValue: 'gpt-4',
      });

      registry.registerEntry({
        sectionId: section.id,
        moduleId: module.id,
        key: 'api-key',
        type: 'string',
        label: 'API Key',
        defaultValue: '',
      });

      const values = await store.getAll(module.id);
      expect(values.length).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset all values for a module', async () => {
      const module = registry.register({
        name: 'AI Providers',
        path: '/settings/ai/providers',
      });

      const section = registry.registerSection({
        moduleId: module.id,
        name: 'Provider Settings',
        component: 'ProviderSettings',
      });

      registry.registerEntry({
        sectionId: section.id,
        moduleId: module.id,
        key: 'default-model',
        type: 'string',
        label: 'Default Model',
        defaultValue: 'gpt-4',
      });

      await store.set(module.id, 'default-model', 'claude-3-opus', 'user');
      await store.reset(module.id);

      const value = await store.get(module.id, 'default-model');
      expect(value?.value).toBe('gpt-4');
    });
  });
});

describe('PermissionEngine', () => {
  let engine: PermissionEngine;

  beforeEach(() => {
    engine = new PermissionEngine();
  });

  describe('register', () => {
    it('should register a permission', () => {
      engine.register({
        moduleId: 'ai',
        action: 'read',
        roles: ['user', 'admin'],
      });

      const permissions = engine.getByModule('ai');
      expect(permissions.length).toBe(1);
      expect(permissions[0].action).toBe('read');
    });

    it('should emit permission:registered event', () => {
      let eventEmitted = false;
      engine.on('permission:registered', () => {
        eventEmitted = true;
      });

      engine.register({
        moduleId: 'ai',
        action: 'read',
        roles: ['user'],
      });

      expect(eventEmitted).toBe(true);
    });
  });

  describe('check', () => {
    beforeEach(() => {
      // Register default permissions
      for (const permission of DEFAULT_PERMISSIONS) {
        engine.register(permission);
      }
    });

    it('should allow access for matching role', () => {
      const result = engine.check('ai', 'read', ['user']);
      expect(result).toBe(true);
    });

    it('should deny access for non-matching role', () => {
      const result = engine.check('ai', 'admin', ['user']);
      expect(result).toBe(false);
    });

    it('should allow access for multiple roles', () => {
      const result = engine.check('ai', 'read', ['user', 'admin']);
      expect(result).toBe(true);
    });

    it('should deny access when no permission defined', () => {
      const result = engine.check('non-existent', 'read', ['user']);
      expect(result).toBe(false);
    });

    it('should deny access for empty roles', () => {
      const result = engine.check('ai', 'read', []);
      expect(result).toBe(false);
    });

    it('should check write permission for admin', () => {
      const result = engine.check('ai', 'write', ['admin']);
      expect(result).toBe(true);
    });

    it('should check admin permission for superadmin', () => {
      const result = engine.check('ai', 'admin', ['superadmin']);
      expect(result).toBe(true);
    });

    it('should deny write for regular user', () => {
      const result = engine.check('ai', 'write', ['user']);
      expect(result).toBe(false);
    });
  });

  describe('getByModule', () => {
    beforeEach(() => {
      for (const permission of DEFAULT_PERMISSIONS) {
        engine.register(permission);
      }
    });

    it('should return all permissions for a module', () => {
      const permissions = engine.getByModule('ai');
      expect(permissions.length).toBe(3);
    });

    it('should return empty array for non-existent module', () => {
      const permissions = engine.getByModule('non-existent');
      expect(permissions.length).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return all permissions', () => {
      for (const permission of DEFAULT_PERMISSIONS) {
        engine.register(permission);
      }

      const all = engine.getAll();
      expect(all.length).toBe(DEFAULT_PERMISSIONS.length);
    });
  });
});

describe('SearchEngine', () => {
  let engine: SearchEngine;

  beforeEach(() => {
    engine = new SearchEngine();
  });

  describe('index', () => {
    it('should index a module', () => {
      engine.index({
        id: 'ai',
        name: 'AI',
        description: 'Configure AI providers',
        path: '/settings/ai',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(engine.getIndexSize()).toBe(1);
    });

    it('should index multiple modules', () => {
      engine.index({
        id: 'ai',
        name: 'AI',
        description: 'Configure AI providers',
        path: '/settings/ai',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      engine.index({
        id: 'workspace',
        name: 'Workspace',
        description: 'Customize workspace',
        path: '/settings/workspace',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      expect(engine.getIndexSize()).toBe(2);
    });
  });

  describe('deindex', () => {
    it('should remove a module from index', () => {
      engine.index({
        id: 'ai',
        name: 'AI',
        description: 'Configure AI providers',
        path: '/settings/ai',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      engine.deindex('ai');
      expect(engine.getIndexSize()).toBe(0);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      engine.index({
        id: 'ai',
        name: 'AI',
        description: 'Configure AI providers, routing, and memory',
        path: '/settings/ai',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      engine.index({
        id: 'providers',
        name: 'Providers',
        description: 'Manage AI provider connections',
        path: '/settings/ai/providers',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      engine.index({
        id: 'appearance',
        name: 'Appearance',
        description: 'Theme, colors, and typography',
        path: '/settings/appearance',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it('should find modules by name', () => {
      const results = engine.search('AI');
      expect(results.length).toBe(2);
    });

    it('should find modules by description', () => {
      const results = engine.search('theme');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('Appearance');
    });

    it('should rank exact matches higher', () => {
      const results = engine.search('Providers');
      expect(results.length).toBe(2);
      expect(results[0].name).toBe('Providers');
    });

    it('should return empty array for no matches', () => {
      const results = engine.search('nonexistent');
      expect(results.length).toBe(0);
    });

    it('should be case insensitive', () => {
      const results = engine.search('ai');
      expect(results.length).toBe(2);
    });
  });

  describe('bulkOperations', () => {
    it('should index multiple modules at once', () => {
      engine.indexModules([
        {
          id: 'ai',
          name: 'AI',
          description: 'Configure AI providers',
          path: '/settings/ai',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'workspace',
          name: 'Workspace',
          description: 'Customize workspace',
          path: '/settings/workspace',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      expect(engine.getIndexSize()).toBe(2);
    });

    it('should clear index', () => {
      engine.index({
        id: 'ai',
        name: 'AI',
        description: 'Configure AI providers',
        path: '/settings/ai',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      engine.clearIndex();
      expect(engine.getIndexSize()).toBe(0);
    });
  });
});

describe('ImportExportEngine', () => {
  let registry: ModuleRegistry;
  let store: SettingsStore;
  let engine: ImportExportEngine;
  let db: MockDatabase;
  let moduleId: string;

  beforeEach(async () => {
    registry = new ModuleRegistry();
    db = new MockDatabase();
    store = new SettingsStore(registry, db);
    engine = new ImportExportEngine(registry, store);

    // Register a module with entries
    const module = registry.register({
      name: 'AI Providers',
      path: '/settings/ai/providers',
    });
    moduleId = module.id;

    const section = registry.registerSection({
      moduleId: module.id,
      name: 'Provider Settings',
      component: 'ProviderSettings',
    });

    registry.registerEntry({
      sectionId: section.id,
      moduleId: module.id,
      key: 'default-model',
      type: 'string',
      label: 'Default Model',
      defaultValue: 'gpt-4',
    });

    registry.registerEntry({
      sectionId: section.id,
      moduleId: module.id,
      key: 'api-key',
      type: 'string',
      label: 'API Key',
      defaultValue: '',
    });

    // Set some values
    await store.set(module.id, 'default-model', 'claude-3-opus', 'user');
    await store.set(module.id, 'api-key', 'sk-test-123', 'user');
  });

  describe('export', () => {
    it('should export all settings', async () => {
      const result = await engine.export();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.count).toBe(2);

      const data = JSON.parse(result.data!);
      expect(data.version).toBe('1.0.0');
      expect(data.modules.length).toBe(1);
      expect(data.modules[0].values['default-model']).toBe('claude-3-opus');
      expect(data.modules[0].values['api-key']).toBe('sk-test-123');
    });

    it('should export specific modules', async () => {
      const result = await engine.export([moduleId]);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
    });

    it('should return empty export for non-existent modules', async () => {
      const result = await engine.export(['non-existent']);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });
  });

  describe('import', () => {
    it('should import settings', async () => {
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        modules: [
          {
            id: moduleId,
            name: 'AI Providers',
            values: {
              'default-model': 'gpt-4',
              'api-key': 'sk-new-456',
            },
          },
        ],
      };

      const result = await engine.import(JSON.stringify(exportData), { overwrite: true });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      // Verify values were imported
      const model = await store.get(moduleId, 'default-model');
      expect(model?.value).toBe('gpt-4');
    });

    it('should skip existing values when not overwriting', async () => {
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        modules: [
          {
            id: moduleId,
            name: 'AI Providers',
            values: {
              'default-model': 'gpt-4',
            },
          },
        ],
      };

      const result = await engine.import(JSON.stringify(exportData), { overwrite: false });

      expect(result.success).toBe(true);
      expect(result.count).toBe(0); // Nothing imported because values exist

      // Verify original values preserved
      const model = await store.get(moduleId, 'default-model');
      expect(model?.value).toBe('claude-3-opus');
    });

    it('should handle invalid JSON', async () => {
      const result = await engine.import('invalid json');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toContain('Unexpected token');
    });

    it('should handle missing version', async () => {
      const exportData = {
        modules: [],
      };

      const result = await engine.import(JSON.stringify(exportData));

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toBe('Invalid export data structure');
    });
  });

  describe('validate', () => {
    it('should validate correct export data', () => {
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        modules: [
          {
            id: 'ai-providers',
            name: 'AI Providers',
            values: { 'default-model': 'gpt-4' },
          },
        ],
      };

      const result = engine.validate(JSON.stringify(exportData));
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect missing version', () => {
      const exportData = {
        modules: [],
      };

      const result = engine.validate(JSON.stringify(exportData));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing version field');
    });

    it('should detect missing modules', () => {
      const exportData = {
        version: '1.0.0',
      };

      const result = engine.validate(JSON.stringify(exportData));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid modules array');
    });

    it('should detect invalid JSON', () => {
      const result = engine.validate('invalid json');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid JSON format');
    });
  });
});
