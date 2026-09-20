/**
 * Analytics Engine Tests — Verify usage tracking and optimization.
 *
 * Architecture Traceability:
 *   Settings Framework: 10-AnalyticsEngine.md → Purpose
 *   Natural Law: Knowledge must outlive its creator
 *   Purpose: Let's Change the World
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { AnalyticsEngine, ModuleRegistry, type SettingsDatabase, SettingsStore } from '../src/index.js';

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

describe('AnalyticsEngine', () => {
  let registry: ModuleRegistry;
  let store: SettingsStore;
  let analyticsEngine: AnalyticsEngine;
  let db: MockDatabase;
  let moduleId: string;

  beforeEach(async () => {
    registry = new ModuleRegistry();
    db = new MockDatabase();
    store = new SettingsStore(registry, db);
    analyticsEngine = new AnalyticsEngine(registry, store);

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

  describe('track', () => {
    it('should track a usage event', () => {
      const event = analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');

      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.moduleId).toBe(moduleId);
      expect(event.key).toBe('default-model');
      expect(event.type).toBe('read');
      expect(event.userId).toBe('user-1');
      expect(event.timestamp).toBeDefined();
    });

    it('should track events with metadata', () => {
      const event = analyticsEngine.track(moduleId, 'default-model', 'write', 'user-1', {
        oldValue: 'gpt-4',
        newValue: 'claude-3-opus',
      });

      expect(event.metadata).toBeDefined();
      expect(event.metadata?.oldValue).toBe('gpt-4');
      expect(event.metadata?.newValue).toBe('claude-3-opus');
    });
  });

  describe('getEvents', () => {
    it('should get all events', () => {
      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');
      analyticsEngine.track(moduleId, 'default-model', 'write', 'user-2');

      const events = analyticsEngine.getEvents();
      expect(events.length).toBe(2);
    });

    it('should filter by time range', () => {
      const now = new Date().toISOString();
      const future = new Date(Date.now() + 100000).toISOString();

      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');

      const events = analyticsEngine.getEvents({ startTime: now });
      expect(events.length).toBe(1);

      const futureEvents = analyticsEngine.getEvents({ startTime: future });
      expect(futureEvents.length).toBe(0);
    });

    it('should filter by modules', () => {
      // Register another module
      const module2 = registry.register({
        name: 'Appearance',
        path: '/settings/appearance',
      });

      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');
      analyticsEngine.track(module2.id, 'theme', 'read', 'user-1');

      const events = analyticsEngine.getEvents({ modules: [moduleId] });
      expect(events.length).toBe(1);
      expect(events[0].moduleId).toBe(moduleId);
    });
  });

  describe('getSettingUsage', () => {
    it('should get usage statistics for a setting', () => {
      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');
      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-2');
      analyticsEngine.track(moduleId, 'default-model', 'write', 'user-1');

      const usage = analyticsEngine.getSettingUsage(moduleId, 'default-model');

      expect(usage.reads).toBe(2);
      expect(usage.writes).toBe(1);
      expect(usage.deletes).toBe(0);
      expect(usage.lastAccessed).toBeDefined();
      expect(usage.lastModified).toBeDefined();
      expect(usage.firstAccessed).toBeDefined();
    });

    it('should return empty stats for no events', () => {
      const usage = analyticsEngine.getSettingUsage(moduleId, 'non-existent');

      expect(usage.reads).toBe(0);
      expect(usage.writes).toBe(0);
      expect(usage.deletes).toBe(0);
    });
  });

  describe('getModuleUsage', () => {
    it('should get usage statistics for a module', () => {
      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');
      analyticsEngine.track(moduleId, 'api-key', 'write', 'user-1');

      const usage = analyticsEngine.getModuleUsage(moduleId);

      expect(usage.totalEvents).toBe(2);
      expect(usage.totalReads).toBe(1);
      expect(usage.totalWrites).toBe(1);
      expect(usage.uniqueSettings).toBe(2);
      expect(usage.lastActivity).toBeDefined();
    });
  });

  describe('getAllModuleUsage', () => {
    it('should get usage statistics for all modules', () => {
      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');

      const usages = analyticsEngine.getAllModuleUsage();
      expect(usages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getSuggestions', () => {
    it('should suggest unused settings', async () => {
      const suggestions = await analyticsEngine.getSuggestions({ modules: [moduleId] });

      const unusedSuggestions = suggestions.filter((s) => s.type === 'unused');
      expect(unusedSuggestions.length).toBe(2); // Both settings are unused
    });

    it('should suggest rarely used settings', async () => {
      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');

      const suggestions = await analyticsEngine.getSuggestions({ modules: [moduleId] });

      const rarelyUsedSuggestions = suggestions.filter((s) => s.type === 'rarely_used');
      expect(rarelyUsedSuggestions.length).toBe(1);
    });

    it('should suggest frequently used settings', async () => {
      // Track 100+ events
      for (let i = 0; i < 100; i++) {
        analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');
      }

      const suggestions = await analyticsEngine.getSuggestions({ modules: [moduleId] });

      const frequentlyUsedSuggestions = suggestions.filter((s) => s.type === 'frequently_used');
      expect(frequentlyUsedSuggestions.length).toBe(1);
    });

    it('should suggest security-sensitive settings', async () => {
      const suggestions = await analyticsEngine.getSuggestions({ modules: [moduleId] });

      const securitySuggestions = suggestions.filter((s) => s.type === 'security');
      expect(securitySuggestions.length).toBe(1); // api-key
    });

    it('should suggest default value settings', async () => {
      // Register a module with a setting at its default value
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

      // Don't set a value - it will use the default

      const suggestions = await analyticsEngine.getSuggestions({ modules: [module2.id] });

      const defaultSuggestions = suggestions.filter((s) => s.type === 'default');
      expect(defaultSuggestions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getMostUsed', () => {
    it('should get most used settings', () => {
      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');
      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-2');
      analyticsEngine.track(moduleId, 'api-key', 'read', 'user-1');

      const mostUsed = analyticsEngine.getMostUsed(2);

      expect(mostUsed.length).toBe(2);
      expect(mostUsed[0].reads).toBeGreaterThanOrEqual(mostUsed[1].reads);
    });
  });

  describe('getLeastUsed', () => {
    it('should get least used settings', () => {
      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');
      analyticsEngine.track(moduleId, 'api-key', 'read', 'user-1');
      analyticsEngine.track(moduleId, 'api-key', 'read', 'user-2');
      analyticsEngine.track(moduleId, 'api-key', 'read', 'user-3');

      const leastUsed = analyticsEngine.getLeastUsed(2);

      expect(leastUsed.length).toBe(2);
      expect(leastUsed[0].reads).toBeLessThanOrEqual(leastUsed[1].reads);
    });
  });

  describe('clearEvents', () => {
    it('should clear all events', () => {
      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');
      analyticsEngine.clearEvents();

      const events = analyticsEngine.getEvents();
      expect(events.length).toBe(0);
    });

    it('should clear events by module', () => {
      const module2 = registry.register({
        name: 'Appearance',
        path: '/settings/appearance',
      });

      analyticsEngine.track(moduleId, 'default-model', 'read', 'user-1');
      analyticsEngine.track(module2.id, 'theme', 'read', 'user-1');

      analyticsEngine.clearEventsByModule(moduleId);

      const events = analyticsEngine.getEvents();
      expect(events.length).toBe(1);
      expect(events[0].moduleId).toBe(module2.id);
    });
  });
});
