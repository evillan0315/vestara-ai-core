/**
 * Reset Engine — Provides selective reset and rollback capabilities.
 *
 * Architecture Traceability:
 *   Settings Framework: 07-ResetEngine.md → Purpose
 *   Natural Law: Evolution must preserve purpose
 *   Purpose: Let's Change the World
 */

import type { ModuleRegistry } from './module-registry.js';
import type { SettingsStore } from './settings-store.js';

// ─── Types ─────────────────────────────────────────────────

/**
 * Reset operation
 */
export interface ResetOperation {
  /** Operation ID */
  id: string;
  /** Module ID */
  moduleId: string;
  /** Setting key */
  key: string;
  /** Old value */
  oldValue: unknown;
  /** New value (after reset) */
  newValue: unknown;
  /** Operation type */
  type: 'reset' | 'rollback';
  /** Timestamp */
  timestamp: string;
}

/**
 * Reset result
 */
export interface ResetResult {
  /** Whether operation was successful */
  success: boolean;
  /** Number of settings reset */
  count: number;
  /** Operation details */
  operations: ResetOperation[];
  /** Error messages */
  errors?: Array<{
    moduleId: string;
    key?: string;
    message: string;
  }>;
}

/**
 * Rollback point
 */
export interface RollbackPoint {
  /** Rollback point ID */
  id: string;
  /** Description */
  description: string;
  /** Settings snapshot */
  snapshot: Array<{
    moduleId: string;
    key: string;
    value: unknown;
  }>;
  /** Timestamp */
  timestamp: string;
}

/**
 * Reset options
 */
export interface ResetOptions {
  /** Reset to default values */
  resetToDefaults?: boolean;
  /** Specific modules to reset */
  modules?: string[];
  /** Specific keys to reset */
  keys?: Array<{ moduleId: string; key: string }>;
  /** Create rollback point before reset */
  createRollbackPoint?: boolean;
  /** Description for rollback point */
  rollbackDescription?: string;
}

// ─── Reset Engine ──────────────────────────────────────────

/**
 * Reset Engine
 *
 * Provides selective reset and rollback capabilities for settings.
 */
export class ResetEngine {
  private registry: ModuleRegistry;
  private store: SettingsStore;
  private rollbackPoints: Map<string, RollbackPoint> = new Map();
  private operationHistory: ResetOperation[] = [];

  constructor(registry: ModuleRegistry, store: SettingsStore) {
    this.registry = registry;
    this.store = store;
  }

  /**
   * Create a rollback point
   */
  async createRollbackPoint(description: string): Promise<RollbackPoint> {
    const snapshot = await this.getAllSettings();
    const rollbackPoint: RollbackPoint = {
      id: `rp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      description,
      snapshot,
      timestamp: new Date().toISOString(),
    };
    this.rollbackPoints.set(rollbackPoint.id, rollbackPoint);
    return rollbackPoint;
  }

  /**
   * Reset settings
   */
  async reset(options: ResetOptions = {}): Promise<ResetResult> {
    const operations: ResetOperation[] = [];
    const errors: Array<{ moduleId: string; key?: string; message: string }> = [];

    // Create rollback point if requested
    if (options.createRollbackPoint) {
      await this.createRollbackPoint(options.rollbackDescription || 'Pre-reset rollback point');
    }

    // Determine what to reset
    const resetTargets = await this.getResetTargets(options);

    for (const target of resetTargets) {
      try {
        // Get current value
        const current = await this.store.get(target.moduleId, target.key);
        const oldValue = current?.value;

        // Get default value
        const defaultValue = this.getDefaultValue(target.moduleId, target.key);

        // Reset to default
        await this.store.set(target.moduleId, target.key, defaultValue, 'system');

        const operation: ResetOperation = {
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          moduleId: target.moduleId,
          key: target.key,
          oldValue,
          newValue: defaultValue,
          type: 'reset',
          timestamp: new Date().toISOString(),
        };

        operations.push(operation);
        this.operationHistory.push(operation);
      } catch (error) {
        errors.push({
          moduleId: target.moduleId,
          key: target.key,
          message: error instanceof Error ? error.message : 'Reset failed',
        });
      }
    }

    return {
      success: errors.length === 0,
      count: operations.length,
      operations,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Rollback to a rollback point
   */
  async rollback(rollbackPointId: string): Promise<ResetResult> {
    const rollbackPoint = this.rollbackPoints.get(rollbackPointId);
    if (!rollbackPoint) {
      return {
        success: false,
        count: 0,
        operations: [],
        errors: [{ moduleId: '', message: 'Rollback point not found' }],
      };
    }

    const operations: ResetOperation[] = [];
    const errors: Array<{ moduleId: string; key?: string; message: string }> = [];

    // Create rollback point for current state
    await this.createRollbackPoint(`Pre-rollback to ${rollbackPoint.description}`);

    for (const item of rollbackPoint.snapshot) {
      try {
        // Get current value
        const current = await this.store.get(item.moduleId, item.key);
        const oldValue = current?.value;

        // Restore value
        await this.store.set(item.moduleId, item.key, item.value, 'system');

        const operation: ResetOperation = {
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          moduleId: item.moduleId,
          key: item.key,
          oldValue,
          newValue: item.value,
          type: 'rollback',
          timestamp: new Date().toISOString(),
        };

        operations.push(operation);
        this.operationHistory.push(operation);
      } catch (error) {
        errors.push({
          moduleId: item.moduleId,
          key: item.key,
          message: error instanceof Error ? error.message : 'Rollback failed',
        });
      }
    }

    // Remove the used rollback point
    this.rollbackPoints.delete(rollbackPointId);

    return {
      success: errors.length === 0,
      count: operations.length,
      operations,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get rollback points
   */
  getRollbackPoints(): RollbackPoint[] {
    return Array.from(this.rollbackPoints.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  /**
   * Get operation history
   */
  getOperationHistory(): ResetOperation[] {
    return [...this.operationHistory];
  }

  /**
   * Clear operation history
   */
  clearOperationHistory(): void {
    this.operationHistory = [];
  }

  /**
   * Clear rollback points
   */
  clearRollbackPoints(): void {
    this.rollbackPoints.clear();
  }

  private async getResetTargets(options: ResetOptions): Promise<Array<{ moduleId: string; key: string }>> {
    const targets: Array<{ moduleId: string; key: string }> = [];

    if (options.keys && options.keys.length > 0) {
      // Reset specific keys
      return options.keys;
    }

    // Get modules to reset
    const modules = options.modules || this.registry.getAll().map((m) => m.id);

    for (const moduleId of modules) {
      const entries = this.registry.getEntriesByModule(moduleId);
      for (const entry of entries) {
        targets.push({ moduleId, key: entry.key });
      }
    }

    return targets;
  }

  private getDefaultValue(moduleId: string, key: string): unknown {
    const entries = this.registry.getEntriesByModule(moduleId);
    const entry = entries.find((e) => e.key === key);
    return entry?.defaultValue;
  }

  private async getAllSettings(): Promise<Array<{ moduleId: string; key: string; value: unknown }>> {
    const modules = this.registry.getAll();
    const snapshot: Array<{ moduleId: string; key: string; value: unknown }> = [];

    for (const module of modules) {
      const entries = this.registry.getEntriesByModule(module.id);
      for (const entry of entries) {
        const value = await this.store.get(module.id, entry.key);
        if (value) {
          snapshot.push({
            moduleId: module.id,
            key: entry.key,
            value: value.value,
          });
        }
      }
    }

    return snapshot;
  }
}
