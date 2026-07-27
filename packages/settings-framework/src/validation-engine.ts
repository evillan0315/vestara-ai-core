/**
 * Validation Engine — Provides Zod-based schema validation for settings.
 *
 * Architecture Traceability:
 *   Settings Framework: 08-ValidationEngine.md → Purpose
 *   Natural Law: Knowledge must outlive its creator
 *   Purpose: Let's Change the World
 */

import { type ZodError, type ZodSchema, z } from 'zod';
import type { ModuleRegistry } from './module-registry.js';
import type { SettingsStore } from './settings-store.js';

// ─── Types ─────────────────────────────────────────────────

/**
 * Validation rule
 */
export interface ValidationRule {
  /** Rule ID */
  id: string;
  /** Module ID */
  moduleId: string;
  /** Setting key */
  key: string;
  /** Zod schema */
  schema: ZodSchema;
  /** Error message */
  errorMessage?: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * Validation result for a single setting
 */
export interface SettingValidationResult {
  /** Module ID */
  moduleId: string;
  /** Setting key */
  key: string;
  /** Whether validation passed */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Error details if validation failed */
  errorDetails?: ZodError;
}

/**
 * Validation result for multiple settings
 */
export interface ValidationResult {
  /** Whether all validations passed */
  valid: boolean;
  /** Results for each setting */
  results: SettingValidationResult[];
  /** Summary */
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Stop on first error */
  stopOnFirstError?: boolean;
  /** Specific modules to validate */
  modules?: string[];
  /** Specific keys to validate */
  keys?: Array<{ moduleId: string; key: string }>;
}

// ─── Validation Engine ──────────────────────────────────────

/**
 * Validation Engine
 *
 * Provides Zod-based schema validation for settings.
 */
export class ValidationEngine {
  private registry: ModuleRegistry;
  private store: SettingsStore;
  private rules: Map<string, ValidationRule> = new Map();

  constructor(registry: ModuleRegistry, store: SettingsStore) {
    this.registry = registry;
    this.store = store;
  }

  /**
   * Register a validation rule
   */
  register(rule: Omit<ValidationRule, 'id' | 'timestamp'>): ValidationRule {
    const newRule: ValidationRule = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    this.rules.set(newRule.id, newRule);
    return newRule;
  }

  /**
   * Unregister a validation rule
   */
  unregister(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Get all validation rules
   */
  getRules(): ValidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rules for a specific module
   */
  getRulesByModule(moduleId: string): ValidationRule[] {
    return Array.from(this.rules.values()).filter((r) => r.moduleId === moduleId);
  }

  /**
   * Get rules for a specific key
   */
  getRulesByKey(moduleId: string, key: string): ValidationRule[] {
    return Array.from(this.rules.values()).filter((r) => r.moduleId === moduleId && r.key === key);
  }

  /**
   * Validate a single setting
   */
  async validate(moduleId: string, key: string, value: unknown): Promise<SettingValidationResult> {
    const rules = this.getRulesByKey(moduleId, key);

    // If no rules, validation passes
    if (rules.length === 0) {
      return {
        moduleId,
        key,
        valid: true,
      };
    }

    // Apply each rule
    for (const rule of rules) {
      try {
        rule.schema.parse(value);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            moduleId,
            key,
            valid: false,
            error: rule.errorMessage || error.errors[0]?.message || 'Validation failed',
            errorDetails: error,
          };
        }
        return {
          moduleId,
          key,
          valid: false,
          error: rule.errorMessage || 'Validation failed',
        };
      }
    }

    return {
      moduleId,
      key,
      valid: true,
    };
  }

  /**
   * Validate multiple settings
   */
  async validateMany(options: ValidationOptions = {}): Promise<ValidationResult> {
    const results: SettingValidationResult[] = [];

    // Determine what to validate
    const targets = await this.getValidationTargets(options);

    for (const target of targets) {
      try {
        const value = await this.store.get(target.moduleId, target.key);
        const result = await this.validate(target.moduleId, target.key, value?.value);
        results.push(result);

        if (options.stopOnFirstError && !result.valid) {
          break;
        }
      } catch (error) {
        results.push({
          moduleId: target.moduleId,
          key: target.key,
          valid: false,
          error: error instanceof Error ? error.message : 'Validation failed',
        });

        if (options.stopOnFirstError) {
          break;
        }
      }
    }

    const validCount = results.filter((r) => r.valid).length;
    const invalidCount = results.filter((r) => !r.valid).length;

    return {
      valid: invalidCount === 0,
      results,
      summary: {
        total: results.length,
        valid: validCount,
        invalid: invalidCount,
      },
    };
  }

  /**
   * Clear all validation rules
   */
  clearRules(): void {
    this.rules.clear();
  }

  /**
   * Clear rules for a specific module
   */
  clearRulesByModule(moduleId: string): void {
    for (const [id, rule] of this.rules) {
      if (rule.moduleId === moduleId) {
        this.rules.delete(id);
      }
    }
  }

  private async getValidationTargets(options: ValidationOptions): Promise<Array<{ moduleId: string; key: string }>> {
    const targets: Array<{ moduleId: string; key: string }> = [];

    if (options.keys && options.keys.length > 0) {
      return options.keys;
    }

    // Get modules to validate
    const modules = options.modules || this.registry.getAll().map((m) => m.id);

    for (const moduleId of modules) {
      const entries = this.registry.getEntriesByModule(moduleId);
      for (const entry of entries) {
        targets.push({ moduleId, key: entry.key });
      }
    }

    return targets;
  }
}

// ─── Common Schemas ─────────────────────────────────────────

/**
 * Common validation schemas for settings
 */
export const SettingsSchemas = {
  /** String with min/max length */
  string: (options?: { minLength?: number; maxLength?: number; pattern?: RegExp }) => {
    let schema = z.string();
    if (options?.minLength !== undefined) {
      schema = schema.min(options.minLength);
    }
    if (options?.maxLength !== undefined) {
      schema = schema.max(options.maxLength);
    }
    if (options?.pattern) {
      schema = schema.regex(options.pattern);
    }
    return schema;
  },

  /** Number with min/max value */
  number: (options?: { min?: number; max?: number; integer?: boolean }) => {
    let schema = z.number();
    if (options?.integer) {
      schema = schema.int();
    }
    if (options?.min !== undefined) {
      schema = schema.min(options.min);
    }
    if (options?.max !== undefined) {
      schema = schema.max(options.max);
    }
    return schema;
  },

  /** Boolean */
  boolean: z.boolean(),

  /** Email */
  email: z.string().email(),

  /** URL */
  url: z.string().url(),

  /** JSON */
  json: z.string().refine(
    (val) => {
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid JSON string' },
  ),

  /** Enum */
  enum: <const T extends readonly [string, ...string[]]>(values: T) => z.enum(values),

  /** Array */
  array: <T extends ZodSchema>(schema: T) => z.array(schema),

  /** Object */
  object: <T extends z.ZodRawShape>(shape: T) => z.object(shape),

  /** One of multiple schemas */
  oneOf: <T extends readonly [ZodSchema, ZodSchema, ...ZodSchema[]]>(schemas: T) => z.union(schemas),

  /** Optional */
  optional: <T extends ZodSchema>(schema: T) => z.optional(schema),

  /** Nullable */
  nullable: <T extends ZodSchema>(schema: T) => z.nullable(schema),

  /** Default value */
  default: <T extends ZodSchema>(schema: T, defaultValue: unknown) => schema.default(defaultValue),

  /** Custom validation */
  custom: <T>(validator: (val: unknown) => val is T, message: string) => z.custom<T>((val) => validator(val), message),
};
