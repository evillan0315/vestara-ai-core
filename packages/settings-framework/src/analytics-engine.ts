/**
 * Analytics Engine — Provides settings usage tracking and optimization.
 *
 * Architecture Traceability:
 *   Settings Framework: 10-AnalyticsEngine.md → Purpose
 *   Natural Law: Knowledge must outlive its creator
 *   Purpose: Let's Change the World
 */

import type { ModuleRegistry } from './module-registry.js';
import type { SettingsStore } from './settings-store.js';

// ─── Types ─────────────────────────────────────────────────

/**
 * Usage event
 */
export interface UsageEvent {
  /** Event ID */
  id: string;
  /** Module ID */
  moduleId: string;
  /** Setting key */
  key: string;
  /** Event type */
  type: 'read' | 'write' | 'delete';
  /** Event timestamp */
  timestamp: string;
  /** User who performed the action */
  userId: string;
  /** Event metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Usage statistics for a setting
 */
export interface SettingUsage {
  /** Module ID */
  moduleId: string;
  /** Setting key */
  key: string;
  /** Total reads */
  reads: number;
  /** Total writes */
  writes: number;
  /** Total deletes */
  deletes: number;
  /** Last accessed timestamp */
  lastAccessed: string;
  /** Last modified timestamp */
  lastModified: string;
  /** First accessed timestamp */
  firstAccessed: string;
}

/**
 * Module usage statistics
 */
export interface ModuleUsage {
  /** Module ID */
  moduleId: string;
  /** Total events */
  totalEvents: number;
  /** Total reads */
  totalReads: number;
  /** Total writes */
  totalWrites: number;
  /** Total deletes */
  totalDeletes: number;
  /** Unique settings accessed */
  uniqueSettings: number;
  /** Last activity timestamp */
  lastActivity: string;
}

/**
 * Optimization suggestion
 */
export interface OptimizationSuggestion {
  /** Suggestion ID */
  id: string;
  /** Suggestion type */
  type: 'unused' | 'rarely_used' | 'frequently_used' | 'conflict' | 'default' | 'security';
  /** Module ID */
  moduleId: string;
  /** Setting key */
  key?: string;
  /** Description */
  description: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high';
  /** Recommended action */
  action: string;
}

/**
 * Analytics options
 */
export interface AnalyticsOptions {
  /** Time range start */
  startTime?: string;
  /** Time range end */
  endTime?: string;
  /** Specific modules to analyze */
  modules?: string[];
  /** Include suggestions */
  includeSuggestions?: boolean;
}

// ─── Analytics Engine ──────────────────────────────────────

/**
 * Analytics Engine
 *
 * Provides settings usage tracking and optimization suggestions.
 */
export class AnalyticsEngine {
  private registry: ModuleRegistry;
  private store: SettingsStore;
  private events: UsageEvent[] = [];

  constructor(registry: ModuleRegistry, store: SettingsStore) {
    this.registry = registry;
    this.store = store;
  }

  /**
   * Track a usage event
   */
  track(
    moduleId: string,
    key: string,
    type: UsageEvent['type'],
    userId: string,
    metadata?: Record<string, unknown>,
  ): UsageEvent {
    const event: UsageEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      moduleId,
      key,
      type,
      timestamp: new Date().toISOString(),
      userId,
      metadata,
    };

    this.events.push(event);
    return event;
  }

  /**
   * Get all events
   */
  getEvents(options: AnalyticsOptions = {}): UsageEvent[] {
    let filtered = [...this.events];

    if (options.startTime) {
      filtered = filtered.filter((e) => e.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      filtered = filtered.filter((e) => e.timestamp <= options.endTime!);
    }
    if (options.modules && options.modules.length > 0) {
      filtered = filtered.filter((e) => options.modules!.includes(e.moduleId));
    }

    return filtered;
  }

  /**
   * Get usage statistics for a setting
   */
  getSettingUsage(moduleId: string, key: string): SettingUsage {
    const settingEvents = this.events.filter((e) => e.moduleId === moduleId && e.key === key);

    const reads = settingEvents.filter((e) => e.type === 'read').length;
    const writes = settingEvents.filter((e) => e.type === 'write').length;
    const deletes = settingEvents.filter((e) => e.type === 'delete').length;

    const timestamps = settingEvents.map((e) => e.timestamp).sort();
    const writeTimestamps = settingEvents
      .filter((e) => e.type === 'write')
      .map((e) => e.timestamp)
      .sort();

    return {
      moduleId,
      key,
      reads,
      writes,
      deletes,
      lastAccessed: timestamps[timestamps.length - 1] || '',
      lastModified: writeTimestamps[writeTimestamps.length - 1] || '',
      firstAccessed: timestamps[0] || '',
    };
  }

  /**
   * Get usage statistics for a module
   */
  getModuleUsage(moduleId: string): ModuleUsage {
    const moduleEvents = this.events.filter((e) => e.moduleId === moduleId);
    const uniqueSettings = new Set(moduleEvents.map((e) => `${e.moduleId}:${e.key}`)).size;

    return {
      moduleId,
      totalEvents: moduleEvents.length,
      totalReads: moduleEvents.filter((e) => e.type === 'read').length,
      totalWrites: moduleEvents.filter((e) => e.type === 'write').length,
      totalDeletes: moduleEvents.filter((e) => e.type === 'delete').length,
      uniqueSettings,
      lastActivity: moduleEvents.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.timestamp || '',
    };
  }

  /**
   * Get usage statistics for all modules
   */
  getAllModuleUsage(): ModuleUsage[] {
    const modules = this.registry.getAll();
    return modules.map((m) => this.getModuleUsage(m.id));
  }

  /**
   * Get optimization suggestions
   */
  async getSuggestions(options: AnalyticsOptions = {}): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Analyze each module
    const modules = options.modules || this.registry.getAll().map((m) => m.id);

    for (const moduleId of modules) {
      const entries = this.registry.getEntriesByModule(moduleId);

      for (const entry of entries) {
        const usage = this.getSettingUsage(moduleId, entry.key);
        const totalUsage = usage.reads + usage.writes + usage.deletes;

        // Check for unused settings
        if (totalUsage === 0) {
          suggestions.push({
            id: `sug_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'unused',
            moduleId,
            key: entry.key,
            description: `Setting "${entry.label}" has never been accessed`,
            priority: 'low',
            action: 'Consider removing this setting if it serves no purpose',
          });
        }

        // Check for rarely used settings
        if (totalUsage > 0 && totalUsage <= 2) {
          suggestions.push({
            id: `sug_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'rarely_used',
            moduleId,
            key: entry.key,
            description: `Setting "${entry.label}" is rarely used (${totalUsage} times)`,
            priority: 'low',
            action: 'Consider grouping this with related settings or simplifying the UI',
          });
        }

        // Check for frequently used settings
        if (totalUsage >= 100) {
          suggestions.push({
            id: `sug_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'frequently_used',
            moduleId,
            key: entry.key,
            description: `Setting "${entry.label}" is frequently used (${totalUsage} times)`,
            priority: 'medium',
            action: 'Consider making this setting more prominent in the UI',
          });
        }

        // Check for settings at default value
        const value = await this.store.get(moduleId, entry.key);
        if (value && value.value === entry.defaultValue && entry.defaultValue !== undefined) {
          suggestions.push({
            id: `sug_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'default',
            moduleId,
            key: entry.key,
            description: `Setting "${entry.label}" is still at its default value`,
            priority: 'low',
            action: 'Consider if this setting needs to be exposed to users',
          });
        }

        // Check for security-sensitive settings
        if (entry.key.includes('key') || entry.key.includes('secret') || entry.key.includes('password')) {
          suggestions.push({
            id: `sug_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            type: 'security',
            moduleId,
            key: entry.key,
            description: `Setting "${entry.label}" appears to be security-sensitive`,
            priority: 'high',
            action: 'Ensure this setting is properly encrypted and access-controlled',
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Get most used settings
   */
  getMostUsed(limit: number = 10): SettingUsage[] {
    const modules = this.registry.getAll();
    const usages: SettingUsage[] = [];

    for (const module of modules) {
      const entries = this.registry.getEntriesByModule(module.id);
      for (const entry of entries) {
        usages.push(this.getSettingUsage(module.id, entry.key));
      }
    }

    return usages.sort((a, b) => b.reads + b.writes - (a.reads + a.writes)).slice(0, limit);
  }

  /**
   * Get least used settings
   */
  getLeastUsed(limit: number = 10): SettingUsage[] {
    const modules = this.registry.getAll();
    const usages: SettingUsage[] = [];

    for (const module of modules) {
      const entries = this.registry.getEntriesByModule(module.id);
      for (const entry of entries) {
        usages.push(this.getSettingUsage(module.id, entry.key));
      }
    }

    return usages.sort((a, b) => a.reads + a.writes - (b.reads + b.writes)).slice(0, limit);
  }

  /**
   * Clear events
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Clear events for a specific module
   */
  clearEventsByModule(moduleId: string): void {
    this.events = this.events.filter((e) => e.moduleId !== moduleId);
  }
}
