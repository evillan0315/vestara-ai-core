---
id: "adr-127"
adr: "ADR-127"
title: "Local-First Marketplace with Optional Cloud Identity"
category: "architecture"
version: 1.0
date: "2026-08-06"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@platform-engineer"]
consulted: ["@backend-engineer"]
informed: ["@team"]
tags: ["marketplace", "identity", "offline", "authorization", "rbac"]
depends_on: ["adr-115", "adr-124"]
referenced_by:
  - type: "blueprint"
    target: "10-developer-platform/marketplace-implementation.md#16-future-architecture-identity-and-authorization"
---

## Context

The Vestara Marketplace must work offline (local-first) while supporting future
cloud features (purchasing, publishing, organizations). An early assumption was
that Marketplace requires a Vestara account. Practice showed that local product
installation, enablement, and lifecycle management must work without any cloud
dependency.

## Decision

The Marketplace is **local-first**. Offline mode is fully functional:

- Local identity (Local User, Local Administrator, Local Workspace Owner)
- Local first-party catalog
- Local installation, activation, lifecycle
- Local permissions and budgets

Online mode is additive, enabled by linking a Vestara account:

- OAuth login (Google, GitHub) → Vestara Account
- Organization membership with RBAC
- Remote catalog (community + commercial products)
- Licensing, entitlements, publishing

Linking an account attaches cloud identity and entitlements; it does not
recreate the local environment. The local installation transitions online without
losing installed state.

The three authorization layers remain separate:

```text
User identity (authentication)
  → User or organization authorization (RBAC + policy)
  → Installed-product capability authorization (governed permissions)
```

## Consequences

- Vestara is usable without internet or cloud account
- Cloud features are additive, not prerequisites
- RBAC supports platform, organization, publisher, and workspace roles
- Capability-based policy prevents RBAC from becoming too coarse
