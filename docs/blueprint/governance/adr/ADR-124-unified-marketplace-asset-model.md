---
id: "adr-124"
adr: "ADR-124"
title: "Unified Marketplace Asset and Installation Model"
category: "architecture"
version: 1.0
date: "2026-08-03"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@frontend-engineer", "@security-engineer"]
consulted: ["@team"]
informed: ["@team"]
tags: ["marketplace", "extension", "asset-model", "installation", "reconciliation"]
depends_on: ["adr-112", "adr-115", "adr-116"]
referenced_by:
  - type: "blueprint"
    target: "10-developer-platform/marketplace-asset-model.md"
  - type: "blueprint"
    target: "10-developer-platform/extension-manifest.md"
  - type: "blueprint"
    target: "10-developer-platform/install-lifecycle.md"
---

## Context

The Vestara Marketplace needs a unified model for distributing packages, Workspace modules, and applications. Currently, the extension platform distinguishes between modules, plugins, providers, and agent packs, but these are not formalized as distinct asset kinds with different activation models and runtime boundaries.

The recommendation is to keep one Marketplace and one installer, but support three distinct installable asset kinds: Package, Workspace Module, and App. They should share identity, versioning, integrity, dependency resolution, permissions, transactions, rollback, events, and Engineering Graph projection. They should differ only in activation model and runtime boundary.

## Decision

Vestara distributes packages, Workspace modules, and applications as unified extension packages. Marketplace owns discovery and planning; Extension Runtime owns transactional lifecycle; Workspace Runtime owns module activation; App Runtime owns isolated application execution. Installation and workspace enablement remain separate, and all lifecycle operations emit attributable engineering events.

### Asset Taxonomy

Three asset kinds:

1. **Package**: Adds capabilities to existing Vestara runtimes but does not create a standalone Workspace surface. Examples: provider adapter, agent capability, verification rule pack, theme, language support, builder domain pack, tool adapter, standards pack, connector.

2. **Workspace Module**: Contributes an interactive Workspace experience through `WorkspaceModule` and `WorkspaceSDK`. Examples: Messages, Calendar, IDE, GitHub, GitLab, Jira, Linear, Slack, Azure DevOps, Database Builder, Infrastructure Builder.

3. **App**: Larger independently executable product with its own process, runtime lifecycle, storage boundary, and potentially multiple Workspace modules. Examples: Vestara IDE Desktop, Local Model Manager, Database Administration Studio, Deployment Control Center, Visual Testing Studio, Data Pipeline Studio, Onboarding Lab.

### Canonical Manifest

One top-level manifest for all Marketplace assets:

```yaml
schemaVersion: "1.0"
id: "com.vestara.github"
name: "GitHub"
version: "1.2.0"
kind: "workspace-module"
```

### Installation Scopes

Three explicit scopes:

1. **User scope**: Asset is available to the user but not automatically active everywhere. Located at `~/.vestara/extensions/`.

2. **Workspace enablement**: Workspace selects an already installed version and configuration. Located at `<workspace>/.vestara/extensions.lock` and `<workspace>/.vestara/extensions.json`.

3. **System installation**: Reserved for Vestara OS, administrators, or managed enterprise deployment. Located at `/opt/vestara/extensions/`.

### Install ≠ Enable

A package may be installed once and enabled in zero, one, or many workspaces.

### Transactional Lifecycle

Same transactional lifecycle for all three asset types:

```text
Discover → Resolve → Plan → Review permissions → Acquire → Verify integrity/signature → Stage immutable version → Run compatibility checks → Activate → Health check → Commit durable state → Enable in workspace → Emit events and graph projection
```

Failure at any stage produces rollback.

### Trust Boundaries

```text
Trusted package/module → in-process may be permitted
Third-party app → process, worker, container, or VM isolation required
```

## Alternatives Considered

1. **Separate installers for each asset kind**: Rejected because it adds complexity without benefit. One installer with asset-kind awareness is simpler and more consistent.

2. **npm-style dependency resolution**: Rejected because it favors implicit resolution over explicit conflicts. Vestara intentionally favors explicit conflict errors and deterministic install order.

3. **Mutable installation directories**: Rejected because it prevents atomic activation, retained rollback versions, and deduplication. Immutable content storage is preferred.

## Consequences

### Positive

- One Marketplace without forcing fundamentally different extension types into the same execution boundary
- Shared infrastructure for identity, versioning, integrity, dependency resolution, permissions, transactions, rollback, events, and Engineering Graph projection
- Clear activation models for each asset kind
- Explicit trust boundaries for security
- Deterministic and reproducible installations through lockfiles

### Negative

- Increased complexity in the manifest format
- Need for isolation infrastructure for apps
- Need for process supervision for apps

### Risks

- Manifest schema evolution may break backward compatibility
- App isolation may have performance overhead
- Trust verification may create publishing bottlenecks

## Implementation Plan

### Phase 1: Foundation

1. Implement canonical manifest schema
2. Implement asset kind detection
3. Implement installation scopes
4. Implement immutable storage model

### Phase 2: Activation

1. Implement package activation
2. Implement workspace module activation
3. Implement app activation
4. Implement trust boundaries

### Phase 3: Publishing

1. Implement publishing pipeline
2. Implement signature verification
3. Implement vulnerability scanning
4. Implement license compliance

### Phase 4: Polish

1. Implement Marketplace UI
2. Implement CLI commands
3. Implement API endpoints
4. Implement documentation

## References

- `10-developer-platform/marketplace-asset-model.md`
- `10-developer-platform/extension-manifest.md`
- `10-developer-platform/install-lifecycle.md`
- `10-developer-platform/package-activation.md`
- `10-developer-platform/workspace-module-installation.md`
- `10-developer-platform/app-runtime-and-isolation.md`
- `10-developer-platform/extension-lockfile.md`
- `10-developer-platform/dependency-resolution.md`
- `10-developer-platform/trust-and-signing.md`
- `10-developer-platform/publishing.md`
- ADR-112: Extension Platform and Local Package Manager
- ADR-115: Marketplace Foundation and Workspace Experience
- ADR-116: Capability System
