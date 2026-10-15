---
id: "adr-115"
adr: "ADR-115"
title: "Marketplace Foundation and Workspace Experience"
category: "platform"
version: 1.0
date: "2026-08-02"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@platform-engineer", "@security-engineer", "@developer-experience-engineer"]
informed: ["@team"]
tags: ["marketplace", "extensions", "registry", "workspace", "api", "reconciliation"]
depends_on: ["adr-112"]
referenced_by:
  - type: "blueprint"
    target: "10-developer-platform/extension-platform.md"
  - type: "blueprint"
    target: "20-roadmaps/extension-platform-roadmap.md"
  - type: "blueprint"
    target: "99-appendix/capability-maturity-matrix.md"
  - type: "blueprint"
    target: "99-appendix/implementation-alignment.md"
---

## Context

ADR-112 established the Extension Platform and Local Package Manager as the
authoritative lifecycle for installable packages and explicitly deferred a
distribution/catalog layer. With the lifecycle engine implemented and verified,
Vestara needs the Marketplace (Engineering Exchange) as the discovery and
installation layer *above* `extension-runtime` — without duplicating integrity
verification, permissions, activation, rollback, durable install state, or
Engineering Graph projection.

## Decision

The Marketplace SHALL own catalog and discovery concerns only:

- `packages/marketplace` provides the asset/catalog model, a read-only local
  registry (symlink-safe, strict manifest validation, content hashing, malformed
  package isolation, bounded scans, incremental rescan), search and filtering,
  compatibility checks, semantic version ordering, a minimum-viable dependency
  resolver (exact/ranges/latest-compatible-stable, cycle and conflict detection,
  deterministic install order, explicit conflict errors), installed/update
  projections, and dry-run install plans.
- Installation, activation, rollback, and uninstall SHALL delegate to
  `extension-runtime` (`LocalExtensionManager`). One authority for lifecycle,
  permissions, durable state, and graph projection.
- `vestara marketplace` SHALL operate the service directly (search, list, info,
  installed, updates, install, update, uninstall, verify, rescan) with `--json`,
  `--dry-run` plan output, and explicit permission confirmation.
- The Workspace SHALL expose the same service through `apps/api` marketplace
  routes returning operation DTOs (planning → awaiting-permission → completed →
  failed) and through Workspace UI views (Discover, Categories, Installed,
  Updates, asset detail, install review, operation center). `marketplace.*`
  lifecycle events SHALL be bridged to the Workspace WebSocket.
- The `MarketplaceRegistry` interface SHALL be designed for future
  public/enterprise registries; only `LocalMarketplaceRegistry` is implemented.

## Consequences

### Positive

- One authority for lifecycle remains; the Marketplace never reimplements
  integrity, permissions, activation, rollback, or graph recording.
- The dry-run plan is the single contract between service, API, and UI.
- Failed registries do not block healthy registries.
- No second installation database; projections read `extensions.json`.
- The API/UI/CLI share one operation vocabulary.

### Negative

- Remote registries, publishing, signature enforcement, storefront governance,
  reviews, collections, and commercial services remain future.
- Local discovery reads unpacked directories, not portable archives.
- The first resolver is minimum-viable, not an npm-equivalent solver.

## Alternatives considered

| Alternative | Decision |
|-------------|----------|
| UI-first (screen-driven catalog) | rejected: forces API/model to emerge reactively |
| Marketplace reimplements lifecycle | rejected: splits authority |
| npm-equivalent dependency solver | rejected: report conflicts explicitly instead |
| Second installation database | rejected: project from `extension-runtime` state |

## Implementation evidence

- Repository: `evillan0315/vestara-ai-core`
- `packages/marketplace/src/index.ts` and `packages/marketplace/__tests__/`
- `apps/api/src/routes/marketplace.ts`
- `apps/api/src/workspace-context.ts` (service wiring + WebSocket event bridge)
- `apps/workspace/src/pages/Marketplace/` and `apps/workspace/src/lib/marketplace.ts`
- `apps/cli/src/commands/marketplace.ts`
- `docs/marketplace/MARKETPLACE-PLAN.md`
- `docs/marketplace/MARKETPLACE-V0.2-WORKSPACE-EXPERIENCE.md`

## Related

- ADR-112 (Extension Platform and Local Package Manager)
- ADR-109 (Blueprint implementation-alignment metadata)
- Blueprint volume: `10-developer-platform/extension-platform.md`
