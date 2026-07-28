/**
 * Settings Types — Re-exports from @vestara/settings-framework
 *
 * Architecture Traceability:
 *   Settings Framework: 03-Contracts.md → Core Contracts
 *   Natural Law: Identity precedes responsibility
 */

export type {
  SettingsModule,
  SettingsRoute,
  SettingsSection,
  SettingsEntry,
  SettingsValue,
  SettingsPermission,
  SettingsPlugin,
  SettingsProposal,
  AuditEntry,
  SettingsSearchResult,
  SettingsExportResult,
  SettingsImportResult,
  ValidationResult,
  ValidationError,
  ModuleRegistry,
  SettingsStore,
  PermissionEngine,
  SearchEngine,
  SettingsEventType,
  SettingsEvent,
  SettingsEventHandler,
  CreateModuleInput,
  UpdateModuleInput,
  ModuleStatus,
  EntryType,
  PermissionAction,
  ProposalType,
  ProposalStatus,
} from '@vestara/settings-framework';
