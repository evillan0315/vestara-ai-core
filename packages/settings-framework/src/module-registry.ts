/**
 * @vestara/settings-framework — Module Registry
 *
 * The central coordination point for settings modules.
 * Manages module registration, route generation, and search indexing.
 *
 * Architecture Traceability:
 *   Settings Framework: 06-Registry.md → Module Registry
 *   Natural Law: Identity precedes responsibility
 */

import type {
  CreateModuleInput,
  ModuleRegistry as IModuleRegistry,
  PermissionAction,
  SettingsEntry,
  SettingsEvent,
  SettingsEventHandler,
  SettingsEventType,
  SettingsModule,
  SettingsPermission,
  SettingsRoute,
  SettingsSearchResult,
  SettingsSection,
} from './types.js';

// ─── ID Generation ───────────────────────────────────────────

let idCounter = 0;

function generateId(): string {
  idCounter += 1;
  return `sm_${Date.now()}_${idCounter}`;
}

// ─── Module Registry ─────────────────────────────────────────

export class ModuleRegistry implements IModuleRegistry {
  private modules = new Map<string, SettingsModule>();
  private routes = new Map<string, SettingsRoute>();
  private sections = new Map<string, SettingsSection>();
  private entries = new Map<string, SettingsEntry>();
  private permissions = new Map<string, SettingsPermission>();
  private searchIndex = new Map<string, SettingsSearchResult>();
  private eventHandlers = new Map<SettingsEventType, Set<SettingsEventHandler>>();

  register(input: CreateModuleInput): SettingsModule {
    const now = new Date().toISOString();
    const module: SettingsModule = {
      ...input,
      id: generateId(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    this.modules.set(module.id, module);

    // Auto-generate route
    if (!this.routes.has(module.id)) {
      this.routes.set(module.id, {
        moduleId: module.id,
        path: module.path,
        component: `Settings${module.id.charAt(0).toUpperCase()}${module.id.slice(1)}`,
        permissions: module.permissions,
      });
    }

    // Index for search
    this.indexModule(module);

    // Emit event
    this.emit({
      type: 'module:registered',
      timestamp: now,
      data: { moduleId: module.id, module },
    });

    return module;
  }

  unregister(moduleId: string): void {
    const module = this.modules.get(moduleId);
    if (!module) {
      throw new Error(`Module not found: ${moduleId}`);
    }

    this.modules.delete(moduleId);
    this.routes.delete(moduleId);
    this.deindexModule(moduleId);

    this.emit({
      type: 'module:unregistered',
      timestamp: new Date().toISOString(),
      data: { moduleId },
    });
  }

  get(moduleId: string): SettingsModule | undefined {
    return this.modules.get(moduleId);
  }

  getAll(): SettingsModule[] {
    return Array.from(this.modules.values());
  }

  getByParent(parentId: string): SettingsModule[] {
    return this.getAll().filter((m) => m.parentId === parentId);
  }

  search(query: string): SettingsModule[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(
      (m) =>
        m.name.toLowerCase().includes(lowerQuery) ||
        m.description?.toLowerCase().includes(lowerQuery) ||
        m.path.toLowerCase().includes(lowerQuery),
    );
  }

  // ─── Route Operations ────────────────────────────────────

  getRoute(path: string): SettingsRoute | undefined {
    return Array.from(this.routes.values()).find((r) => r.path === path);
  }

  getRoutesByModule(moduleId: string): SettingsRoute[] {
    return Array.from(this.routes.values()).filter((r) => r.moduleId === moduleId);
  }

  getAllRoutes(): SettingsRoute[] {
    return Array.from(this.routes.values());
  }

  // ─── Section Operations ──────────────────────────────────

  registerSection(section: Omit<SettingsSection, 'id'>): SettingsSection {
    const newSection: SettingsSection = {
      ...section,
      id: generateId(),
    };

    this.sections.set(newSection.id, newSection);

    this.emit({
      type: 'section:registered',
      timestamp: new Date().toISOString(),
      data: { sectionId: newSection.id, section: newSection },
    });

    return newSection;
  }

  unregisterSection(sectionId: string): void {
    this.sections.delete(sectionId);

    this.emit({
      type: 'section:unregistered',
      timestamp: new Date().toISOString(),
      data: { sectionId },
    });
  }

  getSection(sectionId: string): SettingsSection | undefined {
    return this.sections.get(sectionId);
  }

  getSectionsByModule(moduleId: string): SettingsSection[] {
    return Array.from(this.sections.values()).filter((s) => s.moduleId === moduleId);
  }

  getAllSections(): SettingsSection[] {
    return Array.from(this.sections.values());
  }

  // ─── Entry Operations ────────────────────────────────────

  registerEntry(entry: Omit<SettingsEntry, 'id'>): SettingsEntry {
    const newEntry: SettingsEntry = {
      ...entry,
      id: generateId(),
    };

    this.entries.set(newEntry.id, newEntry);

    this.emit({
      type: 'entry:registered',
      timestamp: new Date().toISOString(),
      data: { entryId: newEntry.id, entry: newEntry },
    });

    return newEntry;
  }

  unregisterEntry(entryId: string): void {
    this.entries.delete(entryId);

    this.emit({
      type: 'entry:unregistered',
      timestamp: new Date().toISOString(),
      data: { entryId },
    });
  }

  getEntry(entryId: string): SettingsEntry | undefined {
    return this.entries.get(entryId);
  }

  getEntryByKey(moduleId: string, key: string): SettingsEntry | undefined {
    return Array.from(this.entries.values()).find((e) => e.moduleId === moduleId && e.key === key);
  }

  getEntriesBySection(sectionId: string): SettingsEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.sectionId === sectionId);
  }

  getEntriesByModule(moduleId: string): SettingsEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.moduleId === moduleId);
  }

  getAllEntries(): SettingsEntry[] {
    return Array.from(this.entries.values());
  }

  // ─── Permission Operations ───────────────────────────────

  registerPermission(permission: SettingsPermission): void {
    const key = `${permission.moduleId}:${permission.action}`;
    this.permissions.set(key, permission);

    this.emit({
      type: 'permission:registered',
      timestamp: new Date().toISOString(),
      data: { permission },
    });
  }

  checkPermission(moduleId: string, action: PermissionAction, roles: string[]): boolean {
    const key = `${moduleId}:${action}`;
    const permission = this.permissions.get(key);
    if (!permission) {
      return false;
    }
    return roles.some((role) => permission.roles.includes(role));
  }

  getPermissionsByModule(moduleId: string): SettingsPermission[] {
    return Array.from(this.permissions.values()).filter((p) => p.moduleId === moduleId);
  }

  // ─── Search Index ────────────────────────────────────────

  private indexModule(module: SettingsModule): void {
    this.searchIndex.set(module.id, {
      moduleId: module.id,
      name: module.name,
      description: module.description,
      path: module.path,
      score: 1,
    });
  }

  private deindexModule(moduleId: string): void {
    this.searchIndex.delete(moduleId);
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
