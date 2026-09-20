/**
 * Versioning Engine Tests — Verify versioning and migration.
 *
 * Architecture Traceability:
 *   Settings Framework: 09-VersioningEngine.md → Purpose
 *   Natural Law: Evolution must preserve purpose
 *   Purpose: Let's Change the World
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ModuleRegistry, type SettingsDatabase, SettingsStore, VersioningEngine, VersionUtils } from '../src/index.js';

// ─── Mock Database ───────────────────────────────────────────

class MockDatabase implements SettingsDatabase {
  private data = new Map<string, Record<string, unknown>>();

  run(sql: string, params?: unknown[]): void {
    if (sql.includes('INSERT OR REPLACE')) {
      const [moduleId, key, value, updatedAt, updatedBy] = params || [];
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

// ─── Tests ─────────────────────────────────────────────────

describe('VersioningEngine', () => {
  let registry: ModuleRegistry;
  let store: SettingsStore;
  let versioningEngine: VersioningEngine;
  let db: MockDatabase;
  let moduleId: string;

  beforeEach(async () => {
    registry = new ModuleRegistry();
    db = new MockDatabase();
    store = new SettingsStore(registry, db);
    versioningEngine = new VersioningEngine(registry, store);

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

  describe('registerMigrations', () => {
    it('should register migrations', () => {
      versioningEngine.registerMigrations(moduleId, [
        {
          id: 'm1',
          fromVersion: '0.0.0',
          toVersion: '1.0.0',
          migrate: (data) => data,
          description: 'Initial migration',
        },
      ]);

      const migrations = versioningEngine.getMigrations(moduleId);
      expect(migrations.length).toBe(1);
      expect(migrations[0].description).toBe('Initial migration');
    });
  });

  describe('getVersion', () => {
    it('should return default version', () => {
      const version = versioningEngine.getVersion(moduleId);
      expect(version).toBe('0.0.0');
    });

    it('should return set version', () => {
      versioningEngine.setVersion(moduleId, '1.0.0');
      const version = versioningEngine.getVersion(moduleId);
      expect(version).toBe('1.0.0');
    });
  });

  describe('setVersion', () => {
    it('should set version', () => {
      versioningEngine.setVersion(moduleId, '1.0.0');
      const version = versioningEngine.getVersion(moduleId);
      expect(version).toBe('1.0.0');
    });

    it('should create version record', () => {
      versioningEngine.setVersion(moduleId, '1.0.0');
      const record = versioningEngine.getVersionRecord(moduleId);
      expect(record).toBeDefined();
      expect(record?.version).toBe('1.0.0');
      expect(record?.moduleId).toBe(moduleId);
      expect(record?.lastMigration).toBeDefined();
    });
  });

  describe('needsMigration', () => {
    it('should return true when migration needed', () => {
      versioningEngine.setVersion(moduleId, '0.0.0');
      const needs = versioningEngine.needsMigration(moduleId, '1.0.0');
      expect(needs).toBe(true);
    });

    it('should return false when no migration needed', () => {
      versioningEngine.setVersion(moduleId, '1.0.0');
      const needs = versioningEngine.needsMigration(moduleId, '1.0.0');
      expect(needs).toBe(false);
    });
  });

  describe('getMigrationPath', () => {
    it('should return migration path', () => {
      versioningEngine.registerMigrations(moduleId, [
        {
          id: 'm1',
          fromVersion: '0.0.0',
          toVersion: '1.0.0',
          migrate: (data) => data,
          description: 'Step 1',
        },
        {
          id: 'm2',
          fromVersion: '1.0.0',
          toVersion: '2.0.0',
          migrate: (data) => data,
          description: 'Step 2',
        },
      ]);

      versioningEngine.setVersion(moduleId, '0.0.0');
      const path = versioningEngine.getMigrationPath(moduleId, '2.0.0');
      expect(path.length).toBe(2);
      expect(path[0].description).toBe('Step 1');
      expect(path[1].description).toBe('Step 2');
    });

    it('should return empty path when no migration needed', () => {
      versioningEngine.setVersion(moduleId, '1.0.0');
      const path = versioningEngine.getMigrationPath(moduleId, '1.0.0');
      expect(path.length).toBe(0);
    });
  });

  describe('migrate', () => {
    it('should migrate to target version', async () => {
      versioningEngine.registerMigrations(moduleId, [
        {
          id: 'm1',
          fromVersion: '0.0.0',
          toVersion: '1.0.0',
          migrate: (data) => {
            // Transform the data (e.g., uppercase model name)
            return {
              ...data,
              'default-model': data['default-model']?.toString().toUpperCase() || 'GPT-4',
            };
          },
          description: 'Uppercase model name',
        },
      ]);

      versioningEngine.setVersion(moduleId, '0.0.0');
      const result = await versioningEngine.migrate(moduleId, '1.0.0');

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe('0.0.0');
      expect(result.toVersion).toBe('1.0.0');

      // Verify version was updated
      const version = versioningEngine.getVersion(moduleId);
      expect(version).toBe('1.0.0');
    });

    it('should return success when already at target version', async () => {
      versioningEngine.setVersion(moduleId, '1.0.0');
      const result = await versioningEngine.migrate(moduleId, '1.0.0');

      expect(result.success).toBe(true);
    });

    it('should fail when no migration path found', async () => {
      versioningEngine.setVersion(moduleId, '0.0.0');
      const result = await versioningEngine.migrate(moduleId, '2.0.0');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No migration path found');
    });

    it('should fail when migration step fails', async () => {
      versioningEngine.registerMigrations(moduleId, [
        {
          id: 'm1',
          fromVersion: '0.0.0',
          toVersion: '1.0.0',
          migrate: () => {
            throw new Error('Migration failed');
          },
          description: 'Failing migration',
        },
      ]);

      versioningEngine.setVersion(moduleId, '0.0.0');
      const result = await versioningEngine.migrate(moduleId, '1.0.0');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Migration failed');
    });
  });

  describe('getAllVersions', () => {
    it('should get all version records', () => {
      versioningEngine.setVersion(moduleId, '1.0.0');
      versioningEngine.setVersion('module2', '2.0.0');

      const records = versioningEngine.getAllVersions();
      expect(records.length).toBe(2);
    });
  });

  describe('clearVersions', () => {
    it('should clear all versions', () => {
      versioningEngine.setVersion(moduleId, '1.0.0');
      versioningEngine.clearVersions();

      const records = versioningEngine.getAllVersions();
      expect(records.length).toBe(0);
    });
  });

  describe('clearMigrationHistory', () => {
    it('should clear migration history', () => {
      versioningEngine.setVersion(moduleId, '1.0.0');
      const record = versioningEngine.getVersionRecord(moduleId);
      record?.history.push({
        fromVersion: '0.0.0',
        toVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        success: true,
      });

      versioningEngine.clearMigrationHistory(moduleId);

      const updatedRecord = versioningEngine.getVersionRecord(moduleId);
      expect(updatedRecord?.history.length).toBe(0);
    });
  });
});

describe('VersionUtils', () => {
  it('should compare versions', () => {
    expect(VersionUtils.compare('1.0.0', '1.0.0')).toBe(0);
    expect(VersionUtils.compare('1.0.0', '2.0.0')).toBe(-1);
    expect(VersionUtils.compare('2.0.0', '1.0.0')).toBe(1);
    expect(VersionUtils.compare('1.0.0', '1.1.0')).toBe(-1);
    expect(VersionUtils.compare('1.1.0', '1.0.0')).toBe(1);
    expect(VersionUtils.compare('1.0.0', '1.0.1')).toBe(-1);
    expect(VersionUtils.compare('1.0.1', '1.0.0')).toBe(1);
  });

  it('should check isNewer', () => {
    expect(VersionUtils.isNewer('2.0.0', '1.0.0')).toBe(true);
    expect(VersionUtils.isNewer('1.0.0', '2.0.0')).toBe(false);
    expect(VersionUtils.isNewer('1.0.0', '1.0.0')).toBe(false);
  });

  it('should check isOlder', () => {
    expect(VersionUtils.isOlder('1.0.0', '2.0.0')).toBe(true);
    expect(VersionUtils.isOlder('2.0.0', '1.0.0')).toBe(false);
    expect(VersionUtils.isOlder('1.0.0', '1.0.0')).toBe(false);
  });

  it('should get next version', () => {
    expect(VersionUtils.next('1.0.0', 'major')).toBe('2.0.0');
    expect(VersionUtils.next('1.0.0', 'minor')).toBe('1.1.0');
    expect(VersionUtils.next('1.0.0', 'patch')).toBe('1.0.1');
  });

  it('should validate version format', () => {
    expect(VersionUtils.isValid('1.0.0')).toBe(true);
    expect(VersionUtils.isValid('1.0')).toBe(false);
    expect(VersionUtils.isValid('1')).toBe(false);
    expect(VersionUtils.isValid('1.0.0.0')).toBe(false);
    expect(VersionUtils.isValid('v1.0.0')).toBe(false);
  });
});
