---
id: DOC-PKG-SETTINGS-FRAMEWORK-API-001
kind: api
authority: reference
status: current
owner: settings-framework
version: 0.1.0
last-reviewed: 2026-08-01
next-review: 2026-11-01
implementation-ref: packages/settings-framework/src/index.ts
verification-status: verified
---

# Settings Framework Public API

## Import boundary

All supported imports come from the ESM package root:

```ts
import { ModuleRegistry, SettingsStore } from '@vestara/settings-framework';
```

Deep imports into `src` or `dist` are not public API.

## Core domain contracts

`SettingsModule`, `CreateModuleInput`, `UpdateModuleInput`, `ModuleStatus`,
`SettingsRoute`, `SettingsSection`, `SettingsEntry`, `EntryType`,
`SettingsValue`, `SettingsPlugin`, `SettingsProposal`, `ProposalType`,
`ProposalStatus`, `AuditEntry`, `SettingsSearchResult`, `SettingsExportResult`,
`SettingsImportResult`, `ValidationError`, `SettingsEvent`,
`SettingsEventType`, and `SettingsEventHandler` define the framework's data
boundary.

Registry and service-facing interfaces are exported as `ModuleRegistry`,
`RouteRegistry`, `SectionRegistry`, `EntryRegistry`, `SettingsStore`,
`PermissionEngine`, and `SearchEngine` type contracts where applicable. Runtime
classes with the same names implement those contracts.

## Registry and storage

### `ModuleRegistry`

Registers and queries modules, generated routes, sections, and entries. It emits
registry events and throws when destructive operations target unknown required
entities.

### `SettingsDatabase`

Caller-supplied adapter with `run`, `get`, and `all` operations. The adapter owns
durability, transaction, encryption, and availability semantics.

### `SettingsStore`

Reads defaults or persisted values, validates typed writes, deletes values, and
records in-memory audit entries.

## Policy and discovery

### `PermissionEngine`

Evaluates `PermissionAction` values (`read`, `write`, `admin`) against
`SettingsPermission` records. `DEFAULT_PERMISSIONS`, `ROLE_DEFINITIONS`, and
`Role` expose the built-in policy vocabulary.

### `SearchEngine`

Searches registry modules, sections, and entries and returns ranked
`SettingsSearchResult` values.

## Import and export

### `ImportExportEngine`

Exports settings to JSON-compatible `SettingsExportData` and imports controlled
data with structured `SettingsExportResult` and `SettingsImportResult` outcomes.

## Reset and rollback

### `ResetEngine`

Creates and executes reset operations and rollback points. Supporting contracts
are `ResetOperation`, `ResetOptions`, `ResetResult`, and `RollbackPoint`.

## Validation

### `ValidationEngine`

Registers Zod-backed `ValidationRule` values and returns
`SettingValidationResult` or `ValidationResult` under `ValidationOptions`.

### `SettingsSchemas`

Exports reusable Zod schemas for framework domain values.

## Versioning

### `VersioningEngine`

Registers and executes `MigrationStep` values using `MigrationFunction`, records
`VersionRecord` state, and returns `MigrationResult` outcomes.

### `VersionUtils`

Provides semantic-version comparison, age checks, format validation, and
major/minor/patch increment helpers used by migration policy.

## Analytics

### `AnalyticsEngine`

Tracks `UsageEvent` values and derives `SettingUsage`, `ModuleUsage`, and
`OptimizationSuggestion` results. `AnalyticsOptions` controls filtering and
retention behavior.

## Compatibility policy

- Removing or renaming a barrel export is a breaking change.
- Changing stored value interpretation requires migration guidance.
- Adding required peer dependencies requires release documentation.
- Internal implementation changes are non-breaking when these contracts and observed behavior remain stable.

## Verification evidence

Public APIs are imported through [src/index.ts](src/index.ts) by the package's
[test suites](__tests__/). Build and test commands are defined in
[TESTING.md](TESTING.md).
