/**
 * @vestara/settings-framework — Core types and contracts.
 *
 * This package defines the stable contract surface of the Settings Framework.
 * Every module, plugin, and integration must conform to these contracts.
 *
 * Architecture Traceability:
 *   Settings Framework: 03-Contracts.md → Module, Route, Section, Entry, Value
 *   Natural Law: Intelligence exists in many forms
 *   Purpose: Let's Change the World
 */

// ─── Module ──────────────────────────────────────────────────

export type ModuleStatus = 'active' | 'inactive' | 'suspended' | 'archived';

export interface SettingsModule {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly icon?: string;
  readonly path: string;
  readonly parentId?: string;
  readonly permissions?: string[];
  readonly capabilities?: string[];
  readonly order?: number;
  readonly status: ModuleStatus;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CreateModuleInput = Omit<SettingsModule, 'id' | 'status' | 'createdAt' | 'updatedAt'>;
export type UpdateModuleInput = Partial<Omit<SettingsModule, 'id' | 'createdAt' | 'updatedAt'>>;

// ─── Route ───────────────────────────────────────────────────

export interface SettingsRoute {
  readonly moduleId: string;
  readonly path: string;
  readonly exact?: boolean;
  readonly component: string;
  readonly permissions?: string[];
  readonly metadata?: Record<string, unknown>;
}

// ─── Section ─────────────────────────────────────────────────

export interface SettingsSection {
  readonly id: string;
  readonly moduleId: string;
  readonly name: string;
  readonly description?: string;
  readonly component: string;
  readonly order?: number;
  readonly permissions?: string[];
}

// ─── Entry ───────────────────────────────────────────────────

export type EntryType = 'string' | 'number' | 'boolean' | 'select' | 'multi-select' | 'json' | 'color';

export interface SettingsEntry {
  readonly id: string;
  readonly sectionId: string;
  readonly moduleId: string;
  readonly key: string;
  readonly type: EntryType;
  readonly label: string;
  readonly description?: string;
  readonly defaultValue: unknown;
  readonly validation?: Record<string, unknown>;
  readonly permissions?: string[];
  readonly metadata?: Record<string, unknown>;
}

// ─── Value ───────────────────────────────────────────────────

export interface SettingsValue {
  readonly entryId: string;
  readonly moduleId: string;
  readonly key: string;
  readonly value: unknown;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

// ─── Permission ──────────────────────────────────────────────

export type PermissionAction = 'read' | 'write' | 'admin';

export interface SettingsPermission {
  readonly moduleId: string;
  readonly action: PermissionAction;
  readonly roles: string[];
  readonly conditions?: Record<string, unknown>;
}

// ─── Plugin ──────────────────────────────────────────────────

export interface SettingsPlugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly author: string;
  readonly modules: SettingsModule[];
  readonly permissions?: string[];
  readonly metadata?: Record<string, unknown>;
}

// ─── Proposal ────────────────────────────────────────────────

export type ProposalType =
  | 'create-module'
  | 'update-module'
  | 'delete-module'
  | 'create-section'
  | 'update-section'
  | 'delete-section'
  | 'create-entry'
  | 'update-entry'
  | 'delete-entry'
  | 'create-permission'
  | 'update-permission'
  | 'delete-permission';

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'implemented' | 'rolled-back';

export interface SettingsProposal {
  readonly uid: string;
  readonly type: ProposalType;
  readonly moduleId: string;
  readonly changes: {
    readonly current?: unknown;
    readonly proposed: unknown;
    readonly reason?: string;
  };
  readonly proposedBy: string;
  readonly proposedAt: string;
  readonly status: ProposalStatus;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
  readonly rejectedBy?: string;
  readonly rejectedAt?: string;
  readonly rejectionReason?: string;
}

// ─── Audit ───────────────────────────────────────────────────

export interface AuditEntry {
  readonly uid: string;
  readonly moduleId: string;
  readonly action: string;
  readonly key?: string;
  readonly previousValue?: unknown;
  readonly newValue?: unknown;
  readonly performedBy: string;
  readonly performedAt: string;
  readonly metadata?: Record<string, unknown>;
}

// ─── Search ──────────────────────────────────────────────────

export interface SettingsSearchResult {
  readonly moduleId: string;
  readonly sectionId?: string;
  readonly entryId?: string;
  readonly name: string;
  readonly description?: string;
  readonly path: string;
  readonly score: number;
}

// ─── Export/Import ───────────────────────────────────────────

export interface SettingsExportResult {
  readonly success: boolean;
  readonly data?: string;
  readonly error?: string;
  readonly count?: number;
}

export interface SettingsImportResult {
  readonly success: boolean;
  readonly count?: number;
  readonly errors?: Array<{
    readonly moduleId: string;
    readonly key: string;
    readonly message: string;
  }>;
}

// ─── Validation ──────────────────────────────────────────────

export interface ValidationResult {
  readonly success: boolean;
  readonly errors?: ValidationError[];
}

export interface ValidationError {
  readonly moduleId: string;
  readonly key: string;
  readonly message: string;
  readonly path: string[];
}

// ─── Registry ────────────────────────────────────────────────

export interface ModuleRegistry {
  register(module: CreateModuleInput): SettingsModule;
  unregister(moduleId: string): void;
  get(moduleId: string): SettingsModule | undefined;
  getAll(): SettingsModule[];
  getByParent(parentId: string): SettingsModule[];
  search(query: string): SettingsModule[];
}

export interface RouteRegistry {
  register(route: SettingsRoute): void;
  unregister(moduleId: string): void;
  get(path: string): SettingsRoute | undefined;
  getByModule(moduleId: string): SettingsRoute[];
  getAll(): SettingsRoute[];
}

export interface SectionRegistry {
  register(section: Omit<SettingsSection, 'id'>): SettingsSection;
  unregister(sectionId: string): void;
  get(sectionId: string): SettingsSection | undefined;
  getByModule(moduleId: string): SettingsSection[];
  getAll(): SettingsSection[];
}

export interface EntryRegistry {
  register(entry: Omit<SettingsEntry, 'id'>): SettingsEntry;
  unregister(entryId: string): void;
  get(entryId: string): SettingsEntry | undefined;
  getBySection(sectionId: string): SettingsEntry[];
  getByModule(moduleId: string): SettingsEntry[];
  getAll(): SettingsEntry[];
}

// ─── Store ───────────────────────────────────────────────────

export interface SettingsStore {
  get(moduleId: string, key: string): Promise<SettingsValue | null>;
  getMany(moduleId: string, keys: string[]): Promise<SettingsValue[]>;
  getAll(moduleId: string): Promise<SettingsValue[]>;
  set(moduleId: string, key: string, value: unknown, updatedBy: string): Promise<SettingsValue>;
  setMany(moduleId: string, entries: Record<string, unknown>, updatedBy: string): Promise<SettingsValue[]>;
  delete(moduleId: string, key: string): Promise<void>;
  deleteAll(moduleId: string): Promise<void>;
  reset(moduleId: string): Promise<void>;
  getDefault(moduleId: string, key: string): unknown;
  getDefaults(moduleId: string): Record<string, unknown>;
}

// ─── Permission Engine ───────────────────────────────────────

export interface PermissionEngine {
  register(permission: SettingsPermission): void;
  check(moduleId: string, action: PermissionAction, roles: string[]): boolean;
  getByModule(moduleId: string): SettingsPermission[];
}

// ─── Search Engine ───────────────────────────────────────────

export interface SearchEngine {
  index(module: SettingsModule): void;
  deindex(moduleId: string): void;
  search(query: string): SettingsSearchResult[];
}

// ─── Event Types ─────────────────────────────────────────────

export type SettingsEventType =
  | 'module:registered'
  | 'module:unregistered'
  | 'module:updated'
  | 'section:registered'
  | 'section:unregistered'
  | 'entry:registered'
  | 'entry:unregistered'
  | 'setting:changed'
  | 'setting:deleted'
  | 'module:reset'
  | 'proposal:created'
  | 'proposal:approved'
  | 'proposal:rejected'
  | 'proposal:implemented'
  | 'permission:registered'
  | 'index:updated';

export interface SettingsEvent {
  readonly type: SettingsEventType;
  readonly timestamp: string;
  readonly data: Record<string, unknown>;
}

export type SettingsEventHandler = (event: SettingsEvent) => void;
