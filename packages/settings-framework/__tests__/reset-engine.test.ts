/**
 * Reset Engine Tests — Verify reset and rollback functionality.
 *
 * Architecture Traceability:
 *   Settings Framework: 07-ResetEngine.md → Purpose
 *   Natural Law: Evolution must preserve purpose
 *   Purpose: Let's Change the World
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ModuleRegistry, ResetEngine, type SettingsDatabase, SettingsStore } from '../src/index.js';

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

describe('ResetEngine', () => {
  let registry: ModuleRegistry;
  let store: SettingsStore;
  let resetEngine: ResetEngine;
  let db: MockDatabase;
  let moduleId: string;

  beforeEach(async () => {
    registry = new ModuleRegistry();
    db = new MockDatabase();
    store = new SettingsStore(registry, db);
    resetEngine = new ResetEngine(registry, store);

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

  describe('createRollbackPoint', () => {
    it('should create a rollback point', async () => {
      const rollbackPoint = await resetEngine.createRollbackPoint('Before changes');

      expect(rollbackPoint).toBeDefined();
      expect(rollbackPoint.id).toBeDefined();
      expect(rollbackPoint.description).toBe('Before changes');
      expect(rollbackPoint.snapshot.length).toBe(2);
      expect(rollbackPoint.timestamp).toBeDefined();
    });

    it('should store rollback points', async () => {
      await resetEngine.createRollbackPoint('First rollback point');
      // Add small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      await resetEngine.createRollbackPoint('Second rollback point');

      const rollbackPoints = resetEngine.getRollbackPoints();
      expect(rollbackPoints.length).toBe(2);
      expect(rollbackPoints[0].description).toBe('Second rollback point'); // Most recent first
    });
  });

  describe('reset', () => {
    it('should reset all settings to defaults', async () => {
      const result = await resetEngine.reset({ createRollbackPoint: true });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      // Verify values were reset
      const model = await store.get(moduleId, 'default-model');
      expect(model?.value).toBe('gpt-4');

      const apiKey = await store.get(moduleId, 'api-key');
      expect(apiKey?.value).toBe('');

      // Verify rollback point was created
      const rollbackPoints = resetEngine.getRollbackPoints();
      expect(rollbackPoints.length).toBe(1);
    });

    it('should reset specific modules', async () => {
      // Register another module
      const module2 = registry.register({
        name: 'Appearance',
        path: '/settings/appearance',
      });

      const section2 = registry.registerSection({
        moduleId: module2.id,
        name: 'Theme Settings',
        component: 'ThemeSettings',
      });

      registry.registerEntry({
        sectionId: section2.id,
        moduleId: module2.id,
        key: 'theme',
        type: 'string',
        label: 'Theme',
        defaultValue: 'light',
      });

      await store.set(module2.id, 'theme', 'dark', 'user');

      // Reset only the first module
      const result = await resetEngine.reset({ modules: [moduleId] });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      // Verify first module was reset
      const model = await store.get(moduleId, 'default-model');
      expect(model?.value).toBe('gpt-4');

      // Verify second module was not reset
      const theme = await store.get(module2.id, 'theme');
      expect(theme?.value).toBe('dark');
    });

    it('should reset specific keys', async () => {
      const result = await resetEngine.reset({
        keys: [{ moduleId, key: 'default-model' }],
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);

      // Verify only the specified key was reset
      const model = await store.get(moduleId, 'default-model');
      expect(model?.value).toBe('gpt-4');

      const apiKey = await store.get(moduleId, 'api-key');
      expect(apiKey?.value).toBe('sk-test-123');
    });

    it('should create operation history', async () => {
      const result = await resetEngine.reset();

      expect(result.operations.length).toBe(2);
      expect(result.operations[0].type).toBe('reset');
      expect(result.operations[0].oldValue).toBe('claude-3-opus');
      expect(result.operations[0].newValue).toBe('gpt-4');

      const history = resetEngine.getOperationHistory();
      expect(history.length).toBe(2);
    });
  });

  describe('rollback', () => {
    it('should rollback to a rollback point', async () => {
      // Create rollback point
      const rollbackPoint = await resetEngine.createRollbackPoint('Before reset');

      // Reset settings
      await resetEngine.reset();

      // Verify settings were reset
      const modelAfterReset = await store.get(moduleId, 'default-model');
      expect(modelAfterReset?.value).toBe('gpt-4');

      // Rollback
      const result = await resetEngine.rollback(rollbackPoint.id);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);

      // Verify settings were restored
      const modelAfterRollback = await store.get(moduleId, 'default-model');
      expect(modelAfterRollback?.value).toBe('claude-3-opus');

      const apiKeyAfterRollback = await store.get(moduleId, 'api-key');
      expect(apiKeyAfterRollback?.value).toBe('sk-test-123');
    });

    it('should return error for non-existent rollback point', async () => {
      const result = await resetEngine.rollback('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].message).toBe('Rollback point not found');
    });

    it('should remove used rollback point', async () => {
      const rollbackPoint = await resetEngine.createRollbackPoint('Test rollback');

      await resetEngine.rollback(rollbackPoint.id);

      const rollbackPoints = resetEngine.getRollbackPoints();
      // rollback() creates a pre-rollback point, so 1 remains
      expect(rollbackPoints.length).toBe(1);
      expect(rollbackPoints[0].description).toContain('Pre-rollback');
    });

    it('should create rollback point before rollback', async () => {
      const rollbackPoint = await resetEngine.createRollbackPoint('First rollback');

      await resetEngine.reset();
      await resetEngine.rollback(rollbackPoint.id);

      // Should have created a new rollback point for the pre-rollback state
      const rollbackPoints = resetEngine.getRollbackPoints();
      expect(rollbackPoints.length).toBe(1);
      expect(rollbackPoints[0].description).toContain('Pre-rollback');
    });
  });

  describe('operation history', () => {
    it('should track operation history', async () => {
      await resetEngine.reset();

      const history = resetEngine.getOperationHistory();
      expect(history.length).toBe(2);
      expect(history[0].type).toBe('reset');
      expect(history[1].type).toBe('reset');
    });

    it('should clear operation history', async () => {
      await resetEngine.reset();

      resetEngine.clearOperationHistory();

      const history = resetEngine.getOperationHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('rollback points', () => {
    it('should list rollback points sorted by timestamp', async () => {
      await resetEngine.createRollbackPoint('First');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await resetEngine.createRollbackPoint('Second');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await resetEngine.createRollbackPoint('Third');

      const rollbackPoints = resetEngine.getRollbackPoints();
      expect(rollbackPoints.length).toBe(3);
      expect(rollbackPoints[0].description).toBe('Third'); // Most recent first
      expect(rollbackPoints[1].description).toBe('Second');
      expect(rollbackPoints[2].description).toBe('First');
    });

    it('should clear all rollback points', async () => {
      await resetEngine.createRollbackPoint('First');
      await resetEngine.createRollbackPoint('Second');

      resetEngine.clearRollbackPoints();

      const rollbackPoints = resetEngine.getRollbackPoints();
      expect(rollbackPoints.length).toBe(0);
    });
  });
});
