/**
 * Validation Engine Tests — Verify Zod-based schema validation.
 *
 * Architecture Traceability:
 *   Settings Framework: 08-ValidationEngine.md → Purpose
 *   Natural Law: Knowledge must outlive its creator
 *   Purpose: Let's Change the World
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ModuleRegistry,
  type SettingsDatabase,
  SettingsSchemas,
  SettingsStore,
  ValidationEngine,
} from '../src/index.js';

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

describe('ValidationEngine', () => {
  let registry: ModuleRegistry;
  let store: SettingsStore;
  let validationEngine: ValidationEngine;
  let db: MockDatabase;
  let moduleId: string;

  beforeEach(async () => {
    registry = new ModuleRegistry();
    db = new MockDatabase();
    store = new SettingsStore(registry, db);
    validationEngine = new ValidationEngine(registry, store);

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
      key: 'temperature',
      type: 'number',
      label: 'Temperature',
      defaultValue: 0.7,
    });

    registry.registerEntry({
      sectionId: section.id,
      moduleId: module.id,
      key: 'api-key',
      type: 'string',
      label: 'API Key',
      defaultValue: '',
    });

    registry.registerEntry({
      sectionId: section.id,
      moduleId: module.id,
      key: 'enabled',
      type: 'boolean',
      label: 'Enabled',
      defaultValue: true,
    });

    // Set some values
    await store.set(module.id, 'default-model', 'claude-3-opus', 'user');
    await store.set(module.id, 'temperature', 0.7, 'user');
    await store.set(module.id, 'api-key', 'sk-test-123', 'user');
    await store.set(module.id, 'enabled', true, 'user');
  });

  describe('register', () => {
    it('should register a validation rule', () => {
      const rule = validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string(),
        errorMessage: 'Must be a string',
      });

      expect(rule).toBeDefined();
      expect(rule.id).toBeDefined();
      expect(rule.moduleId).toBe(moduleId);
      expect(rule.key).toBe('default-model');
      expect(rule.errorMessage).toBe('Must be a string');
      expect(rule.timestamp).toBeDefined();
    });

    it('should store rules', () => {
      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string(),
      });

      validationEngine.register({
        moduleId,
        key: 'temperature',
        schema: z.number(),
      });

      const rules = validationEngine.getRules();
      expect(rules.length).toBe(2);
    });
  });

  describe('unregister', () => {
    it('should unregister a validation rule', () => {
      const rule = validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string(),
      });

      const result = validationEngine.unregister(rule.id);
      expect(result).toBe(true);

      const rules = validationEngine.getRules();
      expect(rules.length).toBe(0);
    });

    it('should return false for non-existent rule', () => {
      const result = validationEngine.unregister('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getRulesByModule', () => {
    it('should get rules by module', () => {
      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string(),
      });

      validationEngine.register({
        moduleId,
        key: 'temperature',
        schema: z.number(),
      });

      const rules = validationEngine.getRulesByModule(moduleId);
      expect(rules.length).toBe(2);
    });
  });

  describe('getRulesByKey', () => {
    it('should get rules by key', () => {
      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string(),
      });

      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string().min(1),
      });

      const rules = validationEngine.getRulesByKey(moduleId, 'default-model');
      expect(rules.length).toBe(2);
    });
  });

  describe('validate', () => {
    it('should validate a setting with no rules', async () => {
      const result = await validationEngine.validate(moduleId, 'default-model', 'gpt-4');

      expect(result.valid).toBe(true);
      expect(result.moduleId).toBe(moduleId);
      expect(result.key).toBe('default-model');
    });

    it('should validate a setting with passing rule', async () => {
      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string(),
      });

      const result = await validationEngine.validate(moduleId, 'default-model', 'gpt-4');

      expect(result.valid).toBe(true);
    });

    it('should validate a setting with failing rule', async () => {
      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string(),
      });

      const result = await validationEngine.validate(moduleId, 'default-model', 123);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorDetails).toBeDefined();
    });

    it('should use custom error message', async () => {
      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string(),
        errorMessage: 'Model name must be a string',
      });

      const result = await validationEngine.validate(moduleId, 'default-model', 123);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Model name must be a string');
    });

    it('should validate with multiple rules', async () => {
      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string(),
      });

      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string().min(1),
      });

      const result = await validationEngine.validate(moduleId, 'default-model', '');

      expect(result.valid).toBe(false);
    });
  });

  describe('validateMany', () => {
    it('should validate all settings', async () => {
      const result = await validationEngine.validateMany();

      expect(result.valid).toBe(true);
      expect(result.summary.total).toBe(4);
      expect(result.summary.valid).toBe(4);
      expect(result.summary.invalid).toBe(0);
    });

    it('should validate specific modules', async () => {
      const result = await validationEngine.validateMany({ modules: [moduleId] });

      expect(result.valid).toBe(true);
      expect(result.summary.total).toBe(4);
    });

    it('should validate specific keys', async () => {
      const result = await validationEngine.validateMany({
        keys: [{ moduleId, key: 'default-model' }],
      });

      expect(result.valid).toBe(true);
      expect(result.summary.total).toBe(1);
    });

    it('should stop on first error', async () => {
      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.number(), // This will fail for string
      });

      validationEngine.register({
        moduleId,
        key: 'temperature',
        schema: z.string(), // This will fail for number
      });

      const result = await validationEngine.validateMany({ stopOnFirstError: true });

      expect(result.valid).toBe(false);
      // Stops after first invalid result (default-model is string, fails z.number())
      expect(result.results.length).toBe(1);
    });

    it('should report invalid settings', async () => {
      validationEngine.register({
        moduleId,
        key: 'temperature',
        schema: z.string(), // This will fail for number
      });

      const result = await validationEngine.validateMany({
        keys: [{ moduleId, key: 'temperature' }],
      });

      expect(result.valid).toBe(false);
      expect(result.summary.invalid).toBe(1);
      expect(result.results[0].error).toBeDefined();
    });
  });

  describe('clearRules', () => {
    it('should clear all rules', async () => {
      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string(),
      });

      validationEngine.register({
        moduleId,
        key: 'temperature',
        schema: z.number(),
      });

      validationEngine.clearRules();

      const rules = validationEngine.getRules();
      expect(rules.length).toBe(0);
    });

    it('should clear rules by module', async () => {
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

      validationEngine.register({
        moduleId,
        key: 'default-model',
        schema: z.string(),
      });

      validationEngine.register({
        moduleId: module2.id,
        key: 'theme',
        schema: z.string(),
      });

      validationEngine.clearRulesByModule(moduleId);

      const rules = validationEngine.getRules();
      expect(rules.length).toBe(1);
      expect(rules[0].moduleId).toBe(module2.id);
    });
  });
});

describe('SettingsSchemas', () => {
  it('should create string schema with options', () => {
    const schema = SettingsSchemas.string({ minLength: 1, maxLength: 10 });

    expect(() => schema.parse('')).toThrow();
    expect(() => schema.parse('a'.repeat(11))).toThrow();
    expect(schema.parse('hello')).toBe('hello');
  });

  it('should create string schema with pattern', () => {
    const schema = SettingsSchemas.string({ pattern: /^[A-Z]+$/ });

    expect(() => schema.parse('hello')).toThrow();
    expect(schema.parse('HELLO')).toBe('HELLO');
  });

  it('should create number schema with options', () => {
    const schema = SettingsSchemas.number({ min: 0, max: 100, integer: true });

    expect(() => schema.parse(-1)).toThrow();
    expect(() => schema.parse(101)).toThrow();
    expect(() => schema.parse(1.5)).toThrow();
    expect(schema.parse(50)).toBe(50);
  });

  it('should create boolean schema', () => {
    const schema = SettingsSchemas.boolean;

    expect(() => schema.parse('true')).toThrow();
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(false)).toBe(false);
  });

  it('should create email schema', () => {
    const schema = SettingsSchemas.email;

    expect(() => schema.parse('invalid')).toThrow();
    expect(schema.parse('test@example.com')).toBe('test@example.com');
  });

  it('should create url schema', () => {
    const schema = SettingsSchemas.url;

    expect(() => schema.parse('invalid')).toThrow();
    expect(schema.parse('https://example.com')).toBe('https://example.com');
  });

  it('should create json schema', () => {
    const schema = SettingsSchemas.json;

    expect(() => schema.parse('invalid')).toThrow();
    expect(schema.parse('{"key": "value"}')).toBe('{"key": "value"}');
  });

  it('should create enum schema', () => {
    const schema = SettingsSchemas.enum(['light', 'dark', 'auto']);

    expect(() => schema.parse('system')).toThrow();
    expect(schema.parse('light')).toBe('light');
    expect(schema.parse('dark')).toBe('dark');
  });

  it('should create array schema', () => {
    const schema = SettingsSchemas.array(z.string());

    expect(() => schema.parse([1, 2, 3])).toThrow();
    expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('should create object schema', () => {
    const schema = SettingsSchemas.object({
      name: z.string(),
      age: z.number(),
    });

    expect(() => schema.parse({ name: 'John', age: '30' })).toThrow();
    expect(schema.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
  });

  it('should create oneOf schema', () => {
    const schema = SettingsSchemas.oneOf([z.string(), z.number()]);

    expect(() => schema.parse(true)).toThrow();
    expect(schema.parse('hello')).toBe('hello');
    expect(schema.parse(123)).toBe(123);
  });

  it('should create optional schema', () => {
    const schema = SettingsSchemas.optional(z.string());

    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse('hello')).toBe('hello');
    expect(() => schema.parse(123)).toThrow();
  });

  it('should create nullable schema', () => {
    const schema = SettingsSchemas.nullable(z.string());

    expect(schema.parse(null)).toBeNull();
    expect(schema.parse('hello')).toBe('hello');
    expect(() => schema.parse(123)).toThrow();
  });

  it('should create default schema', () => {
    const schema = SettingsSchemas.default(z.string(), 'default');

    expect(schema.parse(undefined)).toBe('default');
    expect(schema.parse('hello')).toBe('hello');
  });

  it('should create custom schema', () => {
    const schema = SettingsSchemas.custom(
      (val): val is string => typeof val === 'string' && val.startsWith('prefix-'),
      'Must start with prefix-',
    );

    expect(() => schema.parse('hello')).toThrow();
    expect(schema.parse('prefix-hello')).toBe('prefix-hello');
  });
});
