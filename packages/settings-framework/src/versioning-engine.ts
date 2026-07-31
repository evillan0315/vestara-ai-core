/**
 * Versioning Engine — Provides settings versioning and migration.
 *
 * Architecture Traceability:
 *   Settings Framework: 09-VersioningEngine.md → Purpose
 *   Natural Law: Evolution must preserve purpose
 *   Purpose: Let's Change the World
 */

import type { ModuleRegistry } from './module-registry.js';
import type { SettingsStore } from './settings-store.js';

// ─── Types ─────────────────────────────────────────────────

/**
 * Migration function
 */
export type MigrationFunction = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migration step
 */
export interface MigrationStep {
  /** Step ID */
  id: string;
  /** Version to migrate from */
  fromVersion: string;
  /** Version to migrate to */
  toVersion: string;
  /** Migration function */
  migrate: MigrationFunction;
  /** Description */
  description: string;
}

/**
 * Version record
 */
export interface VersionRecord {
  /** Module ID */
  moduleId: string;
  /** Current version */
  version: string;
  /** Last migration timestamp */
  lastMigration: string;
  /** Migration history */
  history: Array<{
    fromVersion: string;
    toVersion: string;
    timestamp: string;
    success: boolean;
  }>;
}

/**
 * Migration result
 */
export interface MigrationResult {
  /** Whether migration was successful */
  success: boolean;
  /** Module ID */
  moduleId: string;
  /** From version */
  fromVersion: string;
  /** To version */
  toVersion: string;
  /** Error message if migration failed */
  error?: string;
}

// ─── Versioning Engine ──────────────────────────────────────

/**
 * Versioning Engine
 *
 * Provides settings versioning and migration capabilities.
 */
export class VersioningEngine {
  private store: SettingsStore;
  private migrations: Map<string, MigrationStep[]> = new Map();
  private versions: Map<string, VersionRecord> = new Map();

  constructor(_registry: ModuleRegistry, store: SettingsStore) {
    this.store = store;
  }

  /**
   * Register migration steps for a module
   */
  registerMigrations(moduleId: string, steps: MigrationStep[]): void {
    this.migrations.set(moduleId, steps);
  }

  /**
   * Get migration steps for a module
   */
  getMigrations(moduleId: string): MigrationStep[] {
    return this.migrations.get(moduleId) || [];
  }

  /**
   * Get current version for a module
   */
  getVersion(moduleId: string): string {
    const record = this.versions.get(moduleId);
    return record?.version || '0.0.0';
  }

  /**
   * Set version for a module
   */
  setVersion(moduleId: string, version: string): void {
    const existing = this.versions.get(moduleId);
    const record: VersionRecord = {
      moduleId,
      version,
      lastMigration: new Date().toISOString(),
      history: existing?.history || [],
    };
    this.versions.set(moduleId, record);
  }

  /**
   * Get version record for a module
   */
  getVersionRecord(moduleId: string): VersionRecord | undefined {
    return this.versions.get(moduleId);
  }

  /**
   * Get all version records
   */
  getAllVersions(): VersionRecord[] {
    return Array.from(this.versions.values());
  }

  /**
   * Check if migration is needed
   */
  needsMigration(moduleId: string, targetVersion: string): boolean {
    const currentVersion = this.getVersion(moduleId);
    return currentVersion !== targetVersion;
  }

  /**
   * Get migration path from current version to target version
   */
  getMigrationPath(moduleId: string, targetVersion: string): MigrationStep[] {
    const currentVersion = this.getVersion(moduleId);
    const migrations = this.getMigrations(moduleId);

    // Sort migrations by version
    const sorted = [...migrations].sort((a, b) => {
      const aParts = a.toVersion.split('.').map(Number);
      const bParts = b.toVersion.split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if (aParts[i] !== bParts[i]) {
          return (aParts[i] || 0) - (bParts[i] || 0);
        }
      }
      return 0;
    });

    // Filter migrations that apply (from current version to target version)
    const path: MigrationStep[] = [];
    let current = currentVersion;

    for (const step of sorted) {
      if (step.fromVersion === current && this.compareVersions(step.toVersion, targetVersion) <= 0) {
        path.push(step);
        current = step.toVersion;
      }
    }

    return path;
  }

  /**
   * Migrate a module to target version
   */
  async migrate(moduleId: string, targetVersion: string): Promise<MigrationResult> {
    const currentVersion = this.getVersion(moduleId);

    if (currentVersion === targetVersion) {
      return {
        success: true,
        moduleId,
        fromVersion: currentVersion,
        toVersion: targetVersion,
      };
    }

    const migrationPath = this.getMigrationPath(moduleId, targetVersion);

    if (migrationPath.length === 0) {
      return {
        success: false,
        moduleId,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        error: 'No migration path found',
      };
    }

    // Get current settings
    const currentSettings = await this.store.getAll(moduleId);
    let data: Record<string, unknown> = {};
    for (const setting of currentSettings) {
      data[setting.key] = setting.value;
    }

    // Apply migrations
    let lastVersion = currentVersion;
    for (const step of migrationPath) {
      try {
        data = step.migrate(data);

        // Store migrated values
        for (const [key, value] of Object.entries(data)) {
          await this.store.set(moduleId, key, value, 'migration');
        }

        lastVersion = step.toVersion;
      } catch (error) {
        // Record failed migration
        this.recordMigration(moduleId, lastVersion, step.toVersion, false);

        return {
          success: false,
          moduleId,
          fromVersion: currentVersion,
          toVersion: targetVersion,
          error: error instanceof Error ? error.message : 'Migration failed',
        };
      }
    }

    // Update version
    this.setVersion(moduleId, targetVersion);

    // Record successful migration
    this.recordMigration(moduleId, currentVersion, targetVersion, true);

    return {
      success: true,
      moduleId,
      fromVersion: currentVersion,
      toVersion: targetVersion,
    };
  }

  /**
   * Rollback to previous version
   */
  async rollback(moduleId: string, targetVersion: string): Promise<MigrationResult> {
    const currentVersion = this.getVersion(moduleId);

    // Find reverse migration path
    const migrations = this.getMigrations(moduleId);
    const reversePath: MigrationStep[] = [];

    for (const step of migrations) {
      if (step.toVersion === currentVersion && step.fromVersion === targetVersion) {
        reversePath.push({
          ...step,
          fromVersion: step.toVersion,
          toVersion: step.fromVersion,
          migrate: (data) => {
            // Reverse migration is not automatically generated
            // This is a simplified implementation
            return data;
          },
        });
        break;
      }
    }

    if (reversePath.length === 0) {
      return {
        success: false,
        moduleId,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        error: 'No reverse migration path found',
      };
    }

    // Apply reverse migration
    const currentSettings = await this.store.getAll(moduleId);
    let data: Record<string, unknown> = {};
    for (const setting of currentSettings) {
      data[setting.key] = setting.value;
    }

    try {
      for (const step of reversePath) {
        data = step.migrate(data);

        for (const [key, value] of Object.entries(data)) {
          await this.store.set(moduleId, key, value, 'rollback');
        }
      }

      this.setVersion(moduleId, targetVersion);
      this.recordMigration(moduleId, currentVersion, targetVersion, true);

      return {
        success: true,
        moduleId,
        fromVersion: currentVersion,
        toVersion: targetVersion,
      };
    } catch (error) {
      return {
        success: false,
        moduleId,
        fromVersion: currentVersion,
        toVersion: targetVersion,
        error: error instanceof Error ? error.message : 'Rollback failed',
      };
    }
  }

  /**
   * Clear version records
   */
  clearVersions(): void {
    this.versions.clear();
  }

  /**
   * Clear migration history for a module
   */
  clearMigrationHistory(moduleId: string): void {
    const record = this.versions.get(moduleId);
    if (record) {
      record.history = [];
    }
  }

  private recordMigration(moduleId: string, fromVersion: string, toVersion: string, success: boolean): void {
    const record = this.versions.get(moduleId);
    if (record) {
      record.history.push({
        fromVersion,
        toVersion,
        timestamp: new Date().toISOString(),
        success,
      });
      record.lastMigration = new Date().toISOString();
    }
  }

  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((aParts[i] || 0) !== (bParts[i] || 0)) {
        return (aParts[i] || 0) - (bParts[i] || 0);
      }
    }
    return 0;
  }
}

// ─── Version Helpers ────────────────────────────────────────

/**
 * Version comparison utilities
 */
export const VersionUtils = {
  /**
   * Compare two versions
   */
  compare(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((aParts[i] || 0) !== (bParts[i] || 0)) {
        return (aParts[i] || 0) - (bParts[i] || 0);
      }
    }
    return 0;
  },

  /**
   * Check if version a is newer than version b
   */
  isNewer(a: string, b: string): boolean {
    return this.compare(a, b) > 0;
  },

  /**
   * Check if version a is older than version b
   */
  isOlder(a: string, b: string): boolean {
    return this.compare(a, b) < 0;
  },

  /**
   * Get next version
   */
  next(version: string, type: 'major' | 'minor' | 'patch' = 'patch'): string {
    const parts = version.split('.').map(Number);
    const [major = 0, minor = 0, patch = 0] = parts;

    switch (type) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
        return `${major}.${minor}.${patch + 1}`;
    }
  },

  /**
   * Validate version format
   */
  isValid(version: string): boolean {
    return /^\d+\.\d+\.\d+$/.test(version);
  },
};
