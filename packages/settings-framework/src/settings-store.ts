/**
 * @vestara/settings-framework — Settings Store
 *
 * Manages the lifecycle of settings values — from validation through persistence.
 * Ensures settings are always consistent, validated, and available.
 *
 * Architecture Traceability:
 *   Settings Framework: 07-State-Management.md → Settings Store
 *   Natural Law: Knowledge must outlive its creator
 */

import type { ModuleRegistry } from './module-registry.js';
import type {
  SettingsStore as ISettingsStore,
  SettingsEntry,
  SettingsEvent,
  SettingsEventHandler,
  SettingsEventType,
  SettingsValue,
} from './types.js';

// ─── SQLite Database Interface ───────────────────────────────

export interface SettingsDatabase {
  run(sql: string, params?: unknown[]): void;
  get(sql: string, params?: unknown[]): Record<string, unknown> | undefined;
  all(sql: string, params?: unknown[]): Record<string, unknown>[];
}

// ─── Settings Store ──────────────────────────────────────────

export class SettingsStore implements ISettingsStore {
  private eventHandlers = new Map<SettingsEventType, Set<SettingsEventHandler>>();

  constructor(
    private readonly registry: ModuleRegistry,
    private readonly db: SettingsDatabase,
  ) {
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS settings_values (
        module_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        PRIMARY KEY (module_id, key)
      )
    `);
  }

  async get(moduleId: string, key: string): Promise<SettingsValue | null> {
    const entry = this.registry.getEntryByKey(moduleId, key);
    if (!entry) {
      return null;
    }

    const row = this.db.get('SELECT * FROM settings_values WHERE module_id = ? AND key = ?', [moduleId, key]);

    if (row) {
      return {
        entryId: entry.id,
        moduleId: row.module_id as string,
        key: row.key as string,
        value: JSON.parse(row.value as string),
        updatedAt: row.updated_at as string,
        updatedBy: row.updated_by as string,
      };
    }

    // Return default if no stored value
    return {
      entryId: entry.id,
      moduleId,
      key,
      value: entry.defaultValue,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    };
  }

  async getMany(moduleId: string, keys: string[]): Promise<SettingsValue[]> {
    const results: SettingsValue[] = [];
    for (const key of keys) {
      const value = await this.get(moduleId, key);
      if (value) {
        results.push(value);
      }
    }
    return results;
  }

  async getAll(moduleId: string): Promise<SettingsValue[]> {
    const entries = this.registry.getEntriesByModule(moduleId);
    const results: SettingsValue[] = [];

    for (const entry of entries) {
      const value = await this.get(moduleId, entry.key);
      if (value) {
        results.push(value);
      }
    }

    return results;
  }

  async set(moduleId: string, key: string, value: unknown, updatedBy: string): Promise<SettingsValue> {
    // Validate entry exists
    const entry = this.registry.getEntryByKey(moduleId, key);
    if (!entry) {
      throw new Error(`Setting not found: ${moduleId}.${key}`);
    }

    // Validate value
    const validationResult = this.validateValue(entry, value);
    if (!validationResult.success) {
      throw new Error(`Validation failed: ${validationResult.errors?.join(', ') || 'Unknown error'}`);
    }

    const now = new Date().toISOString();

    this.db.run(
      'INSERT OR REPLACE INTO settings_values (module_id, key, value, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)',
      [moduleId, key, JSON.stringify(value), now, updatedBy],
    );

    const settingsValue: SettingsValue = {
      entryId: entry.id,
      moduleId,
      key,
      value,
      updatedAt: now,
      updatedBy,
    };

    this.emit({
      type: 'setting:changed',
      timestamp: now,
      data: { moduleId, key, value, updatedBy },
    });

    return settingsValue;
  }

  async setMany(moduleId: string, entries: Record<string, unknown>, updatedBy: string): Promise<SettingsValue[]> {
    const results: SettingsValue[] = [];
    for (const [key, value] of Object.entries(entries)) {
      const result = await this.set(moduleId, key, value, updatedBy);
      results.push(result);
    }
    return results;
  }

  async delete(moduleId: string, key: string): Promise<void> {
    this.db.run('DELETE FROM settings_values WHERE module_id = ? AND key = ?', [moduleId, key]);

    this.emit({
      type: 'setting:deleted',
      timestamp: new Date().toISOString(),
      data: { moduleId, key },
    });
  }

  async deleteAll(moduleId: string): Promise<void> {
    this.db.run('DELETE FROM settings_values WHERE module_id = ?', [moduleId]);

    this.emit({
      type: 'module:reset',
      timestamp: new Date().toISOString(),
      data: { moduleId },
    });
  }

  async reset(moduleId: string): Promise<void> {
    await this.deleteAll(moduleId);

    this.emit({
      type: 'module:reset',
      timestamp: new Date().toISOString(),
      data: { moduleId },
    });
  }

  getDefault(moduleId: string, key: string): unknown {
    const entry = this.registry.getEntryByKey(moduleId, key);
    return entry?.defaultValue;
  }

  getDefaults(moduleId: string): Record<string, unknown> {
    const entries = this.registry.getEntriesByModule(moduleId);
    const defaults: Record<string, unknown> = {};
    for (const entry of entries) {
      defaults[entry.key] = entry.defaultValue;
    }
    return defaults;
  }

  // ─── Validation ──────────────────────────────────────────

  private validateValue(entry: SettingsEntry, value: unknown): { success: boolean; errors?: string[] } {
    // Basic type validation
    switch (entry.type) {
      case 'string':
        if (typeof value !== 'string') {
          return { success: false, errors: [`Expected string, got ${typeof value}`] };
        }
        break;
      case 'number':
        if (typeof value !== 'number') {
          return { success: false, errors: [`Expected number, got ${typeof value}`] };
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          return { success: false, errors: [`Expected boolean, got ${typeof value}`] };
        }
        break;
      case 'select':
        if (typeof value !== 'string') {
          return { success: false, errors: [`Expected string for select, got ${typeof value}`] };
        }
        break;
      case 'multi-select':
        if (!Array.isArray(value)) {
          return { success: false, errors: [`Expected array for multi-select, got ${typeof value}`] };
        }
        break;
      case 'json':
        if (typeof value !== 'object' || value === null) {
          return { success: false, errors: [`Expected object for json, got ${typeof value}`] };
        }
        break;
      case 'color':
        if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
          return { success: false, errors: [`Expected hex color string, got ${value}`] };
        }
        break;
    }

    return { success: true };
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
