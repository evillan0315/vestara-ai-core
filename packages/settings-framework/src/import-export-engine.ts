/**
 * @vestara/settings-framework — Import/Export Engine
 *
 * Settings portability and backup.
 * Enables export of settings as JSON and import with validation.
 *
 * Architecture Traceability:
 *   Settings Framework: 02-Architecture.md → Import/Export
 *   Natural Law: Knowledge must outlive its creator
 */

import type { ModuleRegistry } from './module-registry.js';
import type { SettingsStore } from './settings-store.js';
import type {
  SettingsEventHandler,
  SettingsEventType,
  SettingsExportResult,
  SettingsImportResult,
  SettingsModule,
} from './types.js';

// ─── Export/Import Data Structure ────────────────────────────

export interface SettingsExportData {
  version: string;
  exportedAt: string;
  modules: Array<{
    id: string;
    name: string;
    values: Record<string, unknown>;
  }>;
}

// ─── Import/Export Engine ────────────────────────────────────

export class ImportExportEngine {
  private eventHandlers = new Map<SettingsEventType, Set<SettingsEventHandler>>();

  constructor(
    private readonly registry: ModuleRegistry,
    private readonly store: SettingsStore,
  ) {}

  // ─── Export ──────────────────────────────────────────────

  async export(moduleIds?: string[]): Promise<SettingsExportResult> {
    try {
      const modules = moduleIds
        ? (moduleIds.map((id) => this.registry.get(id)).filter(Boolean) as SettingsModule[])
        : this.registry.getAll();

      const exportData: SettingsExportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        modules: [],
      };

      for (const module of modules) {
        const values = await this.store.getAll(module.id);
        const valuesRecord: Record<string, unknown> = {};

        for (const value of values) {
          valuesRecord[value.key] = value.value;
        }

        exportData.modules.push({
          id: module.id,
          name: module.name,
          values: valuesRecord,
        });
      }

      const jsonString = JSON.stringify(exportData, null, 2);

      return {
        success: true,
        data: jsonString,
        count: exportData.modules.reduce((sum, m) => sum + Object.keys(m.values).length, 0),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown export error',
      };
    }
  }

  // ─── Import ──────────────────────────────────────────────

  async import(data: string, options?: { overwrite?: boolean }): Promise<SettingsImportResult> {
    try {
      const exportData: SettingsExportData = JSON.parse(data);

      // Validate export data structure
      if (!exportData.version || !exportData.modules || !Array.isArray(exportData.modules)) {
        return {
          success: false,
          errors: [{ moduleId: '', key: '', message: 'Invalid export data structure' }],
        };
      }

      const errors: Array<{ moduleId: string; key: string; message: string }> = [];
      let importCount = 0;

      for (const moduleData of exportData.modules) {
        const module = this.registry.get(moduleData.id);

        // Skip if module doesn't exist
        if (!module) {
          continue;
        }

        for (const [key, value] of Object.entries(moduleData.values)) {
          try {
            // Check if setting exists
            const existing = await this.store.get(moduleData.id, key);

            if (existing && !options?.overwrite) {
              // Skip if exists and not overwriting
              continue;
            }

            await this.store.set(moduleData.id, key, value, 'import');
            importCount++;
          } catch (error) {
            errors.push({
              moduleId: moduleData.id,
              key,
              message: error instanceof Error ? error.message : 'Import failed',
            });
          }
        }
      }

      return {
        success: errors.length === 0,
        count: importCount,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        errors: [{ moduleId: '', key: '', message: error instanceof Error ? error.message : 'Parse error' }],
      };
    }
  }

  // ─── Validation ──────────────────────────────────────────

  validate(data: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const exportData: SettingsExportData = JSON.parse(data);

      if (!exportData.version) {
        errors.push('Missing version field');
      }

      if (!exportData.modules || !Array.isArray(exportData.modules)) {
        errors.push('Missing or invalid modules array');
      } else {
        for (const module of exportData.modules) {
          if (!module.id) {
            errors.push('Module missing id field');
          }
          if (!module.name) {
            errors.push(`Module ${module.id} missing name field`);
          }
          if (!module.values || typeof module.values !== 'object') {
            errors.push(`Module ${module.id} missing or invalid values`);
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch {
      return {
        valid: false,
        errors: ['Invalid JSON format'],
      };
    }
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
}
