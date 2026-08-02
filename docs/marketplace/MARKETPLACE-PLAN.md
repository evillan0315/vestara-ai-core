---
title: Marketplace (Engineering Exchange) — Grounded Implementation Plan
version: 1
status: proposed
owner: vestara
last-reviewed: 2026-08-02
next-review: 2026-09-02
---

# Vestara Marketplace (Engineering Exchange) — Implementation Plan

The Marketplace is the place where users discover, install, update, publish, share, and
monetize engineering assets that extend Vestara. It is not an "app store": every installable
item is an engineering resource with lifecycle management, versioning, verification,
compatibility, and provenance, and it is represented as a first-class entity in the
Engineering Graph.

This plan is grounded in the existing implementation. It does not redesign or duplicate the
package lifecycle engine; it defines the missing marketplace domain, catalog, registry,
discovery, search, resolution, CLI, API, UI, publishing, governance, and enterprise layers on
top of what exists.

## Grounding — what already exists (verified in source)

| Package | Existing capability | Authority for |
| --- | --- | --- |
| `packages/extension-contracts/` | `VestaraPackageManifest` schema (schemaVersion 1), `validatePackageManifest`, `VestaraPackageType` (provider, module, plugin, agent-pack, integration, theme, verification-pack, standards-pack), permissions, contributions, integrity (sha256 + signature) | Package identity, validation |
| `packages/extension-runtime/` | `LocalExtensionManager`: transactional install/enable/disable/rollback/uninstall with staged copy, integrity verification, permission approval, cycle/range enforcement (`satisfies`), durable state in `<root>/extensions.json`, contribution registry, `marketplace.*` lifecycle events | Installation mechanics |
| `packages/engineering-graph/` | `EngineeringGraph`, `ENTITY_KINDS` (includes `marketplace-package`, `package-version`, `publisher`, `installed-package`, `extension`), relationship types (`published-by`, `depends-on`, `installed-in`, `provides`, `requests-permission`, …). `EngineeringGraphExtensionProjection` records installs. | Install provenance recording |

The lifecycle engine is the authority for install, integrity verification, permissions,
activation, rollback, uninstall, and graph recording. The Marketplace never duplicates those;
it owns catalog, discovery, search, resolution, and projections.

`LocalExtensionManager` is currently un-wired (no consumer outside its own tests). The
Marketplace service and CLI are its first consumers.

## Architecture

```text
                       Marketplace Service
                                │
        ┌───────────────────────┼───────────────────────┐
   LocalRegistry           PublicRegistry*         EnterpriseRegistry*
   (read-only scan)        (remote protocol)       (private scopes)
        └───────────────────────┼───────────────────────┘
                                │
              Catalog lookup → version resolution → compatibility check
              → dependency resolution → policy check
              → extension-runtime install → operation projection
                                │
                      LocalExtensionManager
                  (extensions.json + packages/)
```

`*` public/enterprise registries are future phases. The `MarketplaceRegistry` interface is
designed for them from day one; the first increment ships only `LocalMarketplaceRegistry`,
but the service aggregates multiple registries and preserves result provenance from day one.

## Phase map

| Phase | Existing foundation | New work |
| --- | --- | --- |
| 1 Contracts and lifecycle | Complete | No duplication |
| 2 Local catalog and discovery | Missing | `packages/marketplace` |
| 3 CLI and API | Missing | `vestara marketplace` commands and read/install routes |
| 4 Workspace Marketplace UI | Missing | Discover, details, installed, updates |
| 5 Publishing and signing | Partial integrity contracts only | Publisher workflows and registry ingestion |
| 6 Public/enterprise registries | Missing | Remote protocol, authentication, private scopes |
| 7 Governance and organization controls | Partial permissions lifecycle | Policies, approval, allow/deny, audit |
| 8 Commercial ecosystem | Missing | Licensing, billing, revenue, analytics |

This document covers phases 1-2 in detail and phase 3 (CLI) as an implemented contract. API,
UI, publishing, registries, governance, and commercial layers are defined below as contracts
to implement in later phases.

## First increment — `packages/marketplace/`

The package owns catalog and discovery concerns, not installation mechanics.

```text
packages/marketplace/
├── src/
│   ├── asset.ts          # MarketplaceAsset, version summaries, verification, details
│   ├── catalog.ts        # Aggregated asset catalog (keyed, provenance-aware)
│   ├── registry.ts       # MarketplaceRegistry interface, references, health, events
│   ├── local-registry.ts # Read-only local directory scanner + index
│   ├── search.ts         # Query types and scoring
│   ├── filters.ts        # Static field filters (type, publisher, tags, visibility, verification)
│   ├── compatibility.ts  # Runtime compatibility checks (Vestara/Node/OS/arch)
│   ├── versions.ts       # Semver parsing/ordering/stability
│   ├── updates.ts        # Installed projection + update detection
│   ├── resolver.ts       # Minimum-viable dependency/version resolver
│   ├── service.ts        # MarketplaceService aggregating registries + extension-runtime
│   ├── errors.ts         # Typed error codes and classes
│   └── index.ts
├── __tests__/            # Vitest suite (repo convention; not tests/)
├── package.json
└── tsconfig.json
```

### Boundaries

The package **must**:
- Represent published assets and versions.
- Index manifests from local sources (read-only, symlink-safe, bounded).
- Search by name, description, type, publisher, tags, compatibility, and verification state.
- List categories and publishers.
- Resolve a package and version.
- Detect installed, outdated, incompatible, and blocked packages.
- Delegate install, activate, rollback, and uninstall to `extension-runtime`.

The package **must not**:
- Duplicate signature verification, permissions, activation, rollback, or graph recording.
- Load or execute package code during discovery (no dynamic `import`).
- Create a second installation database (`LocalExtensionManager.extensions.json` is the
  durable, queryable store; the service projects from it via `manager.list()`).
- Fabricate ratings, downloads, reviews, publisher verification, or commercial data.

### Core catalog model

`VestaraPackageManifest` remains the authoritative package definition. The catalog wraps it
with marketplace-specific publication metadata:

```ts
interface MarketplaceAsset {
  id: string;                       // `${publisherId}/${packageName}`
  slug: string;                     // packageName (URL-safe)
  publisherId: string;
  packageName: string;
  displayName: string;
  summary: string;
  description?: string;
  type: VestaraPackageManifest['type'];
  tags: readonly string[];
  license?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
  visibility: 'public' | 'organization' | 'private' | 'local';
  latestVersion: string;
  versions: readonly MarketplaceAssetVersionSummary[];
  verification: MarketplaceVerificationSummary;
  stats?: MarketplaceAssetStats;    // never fabricated locally
  createdAt: string;                // registry-observed scan timestamps
  updatedAt: string;
}
```

`MarketplaceAssetVersionSummary` carries `version`, `isStable`, `compatibility`, and
`checksumVerified`. Full manifests are read on demand from disk (`getVersion`), never kept in
the catalog, so search results stay lightweight.

### Registry abstraction

```ts
interface MarketplaceRegistry {
  readonly id: string;
  readonly kind: 'local' | 'public' | 'enterprise';
  readonly displayName: string;
  scan?(force?: boolean): Promise<MarketplaceRegistryScanResult>; // local registries
  listAssets(): Promise<readonly MarketplaceAsset[]>;             // needed for projections
  search(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult>;
  getAsset(reference: MarketplaceAssetReference): Promise<MarketplaceAsset | undefined>;
  getVersion(reference: MarketplaceVersionReference): Promise<MarketplaceAssetVersion | undefined>;
  listCategories(): Promise<readonly MarketplaceCategory[]>;
  getHealth(): Promise<MarketplaceRegistryHealth>;
}
```

`scan` and `listAssets` are deliberate, documented extensions to the interface: local
registries must populate an index, and the service needs the full asset list for installed
and update projections. Public/enterprise registries will provide equivalent paginated
implementations.

### Local registry behavior

Discovery sources (using actual Vestara path conventions):

```text
<workspace>/.vestara/marketplace/
<workspace>/.vestara/packages/
~/.config/vestara/marketplace/
$VESTARA_MARKETPLACE_ROOTS (path-delimiter separated, additional roots)
```

Requirements implemented by `LocalMarketplaceRegistry`:
- Read-only scanning (never mutates package sources).
- Symlink-safe path handling: symlinked entries are rejected/skipped at the boundary;
  `extension-runtime`'s `digestPackageDirectory` additionally rejects symlinks inside packages.
- Strict manifest validation via `validatePackageManifest`.
- Content hashing per package (excludes the manifest, matching `digestPackageDirectory`).
- Duplicate and version-conflict detection across roots (deterministic: first root wins,
  conflict recorded).
- Incremental rescanning: in-memory directory fingerprint cache; unchanged packages are not
  re-hashed. (Persistent cache across processes is deferred to a later phase.)
- Registry provenance on every search hit and asset.
- Malformed package isolation: one bad package never fails the whole scan.
- No dynamic loading, no execution of package code.
- Bounded manifest sizes and scan depth; cap on packages per scan.

### Dependency and version resolution (`resolver.ts`)

Minimum viable resolver, deliberately not an npm-equivalent solver:
- Exact versions and semver ranges (delegating range semantics to `extension-runtime.satisfies`).
- Latest compatible stable version by default.
- Dependency graph traversal (post-order, dependencies first).
- Circular dependency detection with the offending path.
- Missing dependency errors (optional dependencies become warnings).
- Conflicting version requirements reported explicitly (`MarketplaceResolutionError` with
  package, requester chain, and requirements) rather than unsafe guesses.
- Compatibility rejection before resolution completes.
- Deterministic install order (dependencies before dependents, ties by package name).

### Installed and update projections (`updates.ts`)

The service projects existing `extension-runtime` state (`manager.list()` →
`InstalledExtension`) into `InstalledMarketplaceAsset`:

```ts
interface InstalledMarketplaceAsset {
  assetId: string;
  packageName: string;
  installedVersion: string;
  latestCompatibleVersion?: string;
  state: 'installed' | 'active' | 'inactive' | 'failed' | 'rollback-available';
  updateStatus: 'current' | 'update-available' | 'incompatible-update' | 'unknown';
  installedAt: string;
}
```

No second installation database.

### Marketplace service

```ts
interface MarketplaceService {
  search(query): Promise<MarketplaceSearchResult>;
  getAsset(reference): Promise<MarketplaceAssetDetails>;
  listInstalled(workspaceId?): Promise<readonly InstalledMarketplaceAsset[]>;
  listUpdates(workspaceId?): Promise<readonly MarketplaceUpdateCandidate[]>;
  install(request): Promise<MarketplaceOperation>;
  update(request): Promise<MarketplaceOperation>;
  uninstall(request): Promise<MarketplaceOperation>;
  rescan(): Promise<MarketplaceOperation>;
  verify(reference): Promise<MarketplaceOperation>;
}
```

Installation flow (all coordination, no lifecycle duplication):

```text
Catalog lookup → version resolution → compatibility check → dependency resolution
→ policy/permission check (dry-run) → extension-runtime install → operation projection
```

The service aggregates registries, isolates registry failures (a broken registry degrades the
result with an explicit error, never fails the call), and preserves provenance.

## Phase 3 — CLI contract

Implemented in this increment: `vestara marketplace` command group.

```bash
vestara marketplace search <query>
vestara marketplace list
vestara marketplace info <package>
vestara marketplace installed
vestara marketplace updates
vestara marketplace install <package>[@version]
vestara marketplace update <package>
vestara marketplace uninstall <package>
vestara marketplace verify <package>
vestara marketplace rescan
```

- Operates directly on the local filesystem (no API dependency), honoring `VESTARA_REPO`.
- `--json` machine output; human-readable tables otherwise.
- Clear registry provenance; compatibility and verification status; permission summary.
- `--dry-run` for install/update prints the full resolution plan (versions, dependencies,
  permissions) without delegating to `extension-runtime`.
- Explicit confirmation when permissions require approval (interactive `y/N`, bypassed by
  `--yes`).

## Phase 3 — future API contract (defined now, implemented later)

```text
GET  /api/marketplace/search
GET  /api/marketplace/categories
GET  /api/marketplace/assets/:publisher/:name
GET  /api/marketplace/assets/:publisher/:name/versions
GET  /api/marketplace/installed
GET  /api/marketplace/updates
POST /api/marketplace/install
POST /api/marketplace/update
POST /api/marketplace/uninstall
POST /api/marketplace/rescan
```

Remote publishing endpoints are explicitly out of scope until phase 5.

## Events

Reuse existing `marketplace.*` lifecycle events emitted by `extension-runtime`. Catalog
events are added by the marketplace package (payloads follow the `ExtensionEventSink`
convention):

```text
marketplace.registry.discovered   marketplace.registry.scanned
marketplace.registry.failed       marketplace.asset.discovered
marketplace.asset.updated         marketplace.asset.removed
marketplace.search.completed      marketplace.update.detected
marketplace.resolution.failed
```

No high-volume per-file events are emitted.

## Engineering Graph

The graph already records installs via `EngineeringGraphExtensionProjection`
(`marketplace-package`, `package-version`, `publisher`, `installed-package`, `extension`,
`depends-on`, `installed-in`, …). The Marketplace does not write graph entities for catalog
search results.

Later phases may add durable entity kinds (`marketplace-registry`, `marketplace-publisher`,
`marketplace-package-version`, `marketplace-installation`) and relationship types
(`registry-contains-package`, `package-has-version`, `package-contributes-agent`,
`package-contributes-skill`, `package-contributes-provider`, `package-contributes-theme`)
only where they carry durable value (installed/activated state, not catalog listings).

## Tests (first increment)

- Valid manifest discovery; invalid manifest isolation
- Secret-safe logging (no manifest content in error output)
- Symlink escape rejection
- Search and filters; category aggregation
- Duplicate package resolution; semantic version ordering
- Compatibility filtering
- Dependency resolution; circular dependency detection; conflicting version detection
- Install delegation to `extension-runtime`
- Update detection; dry-run behavior; CLI JSON output
- Registry failure isolation; deterministic results

## Out of scope for this increment

Reviews, ratings, payments, recommendations, remote publishing, remote registries,
organization/private registries, approval workflows, audit logs, and the Workspace UI page.
All are later phases; the models and interfaces defined here leave room for them without
rework.
