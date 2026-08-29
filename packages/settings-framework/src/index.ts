/**
 * @vestara/settings-framework — Vestara's Engineering Reference Project
 *
 * The Settings Framework is the first framework that proves Vestara can build
 * a complete AI engineering organization.
 *
 * Architecture Traceability:
 *   Settings Framework: 01-Overview.md → Purpose
 *   Natural Law: Intelligence exists in many forms
 *   Purpose: Let's Change the World
 */

// ─── Types ───────────────────────────────────────────────────

export type {
  // Audit
  AuditEntry,
  CreateModuleInput,
  // Entry
  EntryType,
  // Module
  ModuleStatus,
  // Permission
  PermissionAction,
  ProposalStatus,
  // Proposal
  ProposalType,
  SettingsEntry,
  SettingsEvent,
  SettingsEventHandler,
  // Events
  SettingsEventType,
  // Export/Import
  SettingsExportResult,
  SettingsImportResult,
  SettingsModule,
  SettingsPermission,
  // Plugin
  SettingsPlugin,
  SettingsProposal,
  // Route
  SettingsRoute,
  // Search
  SettingsSearchResult,
  // Section
  SettingsSection,
  // Value
  SettingsValue,
  UpdateModuleInput,
  // Validation
  ValidationError,
} from './types.js';

// ─── Implementations ─────────────────────────────────────────

export type {
  AnalyticsOptions,
  ModuleUsage,
  OptimizationSuggestion,
  SettingUsage,
  UsageEvent,
} from './analytics-engine.js';
export { AnalyticsEngine } from './analytics-engine.js';
export type { SettingsExportData } from './import-export-engine.js';
export { ImportExportEngine } from './import-export-engine.js';
export { ModuleRegistry } from './module-registry.js';
export type { Role } from './permission-engine.js';
export { DEFAULT_PERMISSIONS, PermissionEngine, ROLE_DEFINITIONS } from './permission-engine.js';
export type { ResetOperation, ResetOptions, ResetResult, RollbackPoint } from './reset-engine.js';
export { ResetEngine } from './reset-engine.js';
export { SearchEngine } from './search-engine.js';
export { type SettingsDatabase, SettingsStore } from './settings-store.js';
export type {
  SettingValidationResult,
  ValidationOptions,
  ValidationResult,
  ValidationRule,
} from './validation-engine.js';
export { SettingsSchemas, ValidationEngine } from './validation-engine.js';
export type { MigrationFunction, MigrationResult, MigrationStep, VersionRecord } from './versioning-engine.js';
export { VersioningEngine, VersionUtils } from './versioning-engine.js';

// ─── Modules ──────────────────────────────────────────────────

export {
  registerThemeBuilderModule,
  THEME_BUILDER_MODULE_ID,
  THEME_BUILDER_MODULE_PATH,
  themeBuilderEntries,
  themeBuilderModule,
  themeBuilderPermissions,
  themeBuilderRoutes,
  themeBuilderSections,
} from './modules/theme-builder.js';
