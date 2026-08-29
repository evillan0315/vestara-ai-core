---
id: DOC-PKG-SETTINGS-FRAMEWORK-001
kind: readme
authority: implementation
status: current
owner: settings-framework
version: 0.1.0
last-reviewed: 2026-08-01
next-review: 2026-11-01
implementation-ref: packages/settings-framework/src/index.ts
verification-status: verified
---

# `@vestara/settings-framework`

## Overview

`@vestara/settings-framework` is Vestara's provider-neutral library for defining,
storing, validating, searching, migrating, importing, exporting, resetting, and
observing modular settings. It is the repository's first non-private package and
the first independent consumer of Vestara's executable public-package
documentation standard.

The package is ESM-only. It exposes framework primitives and accepts a database
adapter from its caller; it is not a managed Vestara Runtime and does not own a
process, network endpoint, or persistence lifecycle.

## Responsibilities

The package owns:

- Module, route, section, and setting-entry registration.
- Typed value persistence through the `SettingsDatabase` adapter.
- Role and capability-based settings permission checks.
- Module and entry search.
- JSON import/export with optional validation and merge behavior.
- Reset, rollback-point, and rollback operations.
- Zod-backed setting and module validation.
- Semantic-version comparison and ordered data migrations.
- In-memory usage analytics and optimization suggestions.

Callers own database transactions, durable backup policy, authentication,
authorization identity, secret storage, process health, and UI presentation.

## Architecture

The framework follows coordinator-composes-specialists at library scope:

```text
ModuleRegistry ────────────────┐
SettingsDatabase → SettingsStore
        │                      │
        ├── PermissionEngine   │
        ├── SearchEngine       │
        ├── ImportExportEngine │
        ├── ResetEngine        │
        ├── ValidationEngine   │
        ├── VersioningEngine   │
        └── AnalyticsEngine ───┘
```

The registry is the structural source of truth. `SettingsStore` owns value
access through parameterized database calls. Each engine performs one policy or
transformation concern and receives collaborators explicitly.

See [ARCHITECTURE.md](ARCHITECTURE.md) for component boundaries and data flow.

## Public API

Consumers import only from the package barrel:

```ts
import {
  ModuleRegistry,
  SettingsStore,
  ValidationEngine,
  VersioningEngine,
} from '@vestara/settings-framework';
```

The supported classes, constants, interfaces, and type contracts are catalogued
in [API.md](API.md). Internal module paths are not public compatibility
boundaries.

## Lifecycle

The package has an object lifecycle rather than a managed-service lifecycle:

```text
construct registry and database adapter
→ construct SettingsStore
→ register modules, sections, and entries
→ construct only the specialist engines needed
→ read, validate, migrate, or mutate settings
→ release references with the owning application
```

No class implements `Runtime` or `VestaraService`, and no background work starts
automatically. Analytics events, validation rules, migrations, and rollback
points are in-memory unless the caller persists their projections separately.

## Failure behavior

- Unknown module unregistration throws `Module not found`.
- Unknown setting reads that require a registered entry throw `Setting not found`.
- Invalid writes throw `Validation failed` before persistence.
- Import, reset, rollback, validation, and migration operations return structured result objects for expected domain failures.
- Database adapter errors propagate to the caller; the framework does not silently retry or partially claim success.
- Migration execution stops on a failing step and reports the failed migration.

Callers should place multi-step mutations inside an adapter-level transaction
when atomicity is required.

## Health behavior

This library has no independent health endpoint because it owns no running
service. Consumers determine readiness by constructing the registry, store, and
required engines with a functioning `SettingsDatabase` implementation.

Operational signals are available through registry events, audit entries,
structured operation results, validation results, version records, and analytics
queries. A host Runtime may project these into its own health and metrics model.

## Security and permissions

`PermissionEngine` evaluates `read`, `write`, and `admin` actions against role
definitions and per-module permission declarations. It is a policy primitive,
not an authentication system.

- The caller must supply a trusted actor and role.
- Secret setting values must be encrypted or redacted by the host and database adapter.
- Exported settings can contain sensitive values; callers must authorize and protect exports.
- Imported data must be validated before application in security-sensitive workflows.
- Reset and migration operations should be guarded by host approval policy.

The package never reads environment variables or provider credentials directly.

## Usage

Install the peer dependency alongside the package:

```bash
pnpm add @vestara/settings-framework zod
```

Create a registry and caller-owned database adapter:

```ts
import {
  ModuleRegistry,
  type SettingsDatabase,
  SettingsStore,
} from '@vestara/settings-framework';

declare const database: SettingsDatabase;

const registry = new ModuleRegistry();
const module = registry.register({
  name: 'Appearance',
  path: '/settings/appearance',
});
const section = registry.registerSection({
  moduleId: module.id,
  name: 'Theme',
  component: 'ThemeSettings',
});
registry.registerEntry({
  moduleId: module.id,
  sectionId: section.id,
  key: 'mode',
  type: 'select',
  label: 'Color mode',
  defaultValue: 'dark',
  metadata: { options: ['dark', 'light'] },
});

const store = new SettingsStore(registry, database);
await store.set(module.id, 'mode', 'light', 'local-operator');
```

## Testing

Tests use deterministic in-memory `SettingsDatabase` adapters while exercising
the real registry, store, validation, reset, versioning, and analytics behavior.

```bash
pnpm --filter @vestara/settings-framework test
```

See [TESTING.md](TESTING.md) for coverage boundaries and exact commands.

## Verification

Run the package checks from the monorepo root:

```bash
pnpm --filter @vestara/settings-framework lint
pnpm --filter @vestara/settings-framework build
pnpm --filter @vestara/settings-framework test
pnpm documentation:check
```

Verification evidence is provided by the five suites under
[__tests__/](__tests__/). The `verification-status` in this README describes
local build, lint, test, and documentation conformance; it does not claim remote
CI success before an actual workflow run completes.

## Dependencies

| Dependency | Contract |
|------------|----------|
| `zod` peer dependency | Runtime schemas used by `ValidationEngine` and `SettingsSchemas` |
| TypeScript | Build-time type checking and ESM declaration output |
| Vitest | Development-only deterministic test runner |

The package has no Vestara package dependency and emits ESM through
NodeNext-compatible `.js` import specifiers.

## Ownership

| Concern | Owner |
|---------|-------|
| Public contracts and compatibility | Settings Framework maintainers |
| Database durability and transactions | Consuming application |
| Authentication and actor identity | Consuming application |
| Permission policy configuration | Workspace governance owner |
| Migration definitions and approval | Owning settings module |
| Public-package documentation conformance | Documentation Automation standards |

Breaking changes require a package version change, migration guidance where
stored data is affected, and corresponding API and test documentation updates.

## Related ADRs

No accepted ADR currently defines this standalone framework. It must not be
described as a Vestara Runtime without an ADR adopting the Runtime lifecycle and
health contract.

## Related documentation

- [Architecture](ARCHITECTURE.md)
- [Public API](API.md)
- [Testing and verification](TESTING.md)
- [Settings Framework overview](../../docs/SettingsFramework/01-Overview.md)
- [Settings Framework architecture](../../docs/SettingsFramework/02-Architecture.md)
- [Settings Framework contracts](../../docs/SettingsFramework/03-Contracts.md)
- [VSDE public-package standard](../../docs/standards/VSDE.md#public-package-documentation-standard)
