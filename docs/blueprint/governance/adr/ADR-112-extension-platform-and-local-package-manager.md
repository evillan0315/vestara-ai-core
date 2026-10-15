---
id: "adr-112"
adr: "ADR-112"
title: "Extension Platform Before Marketplace Storefront"
category: "platform"
version: 1.0
date: "2026-08-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@platform-engineer", "@security-engineer", "@developer-experience-engineer"]
informed: ["@team"]
tags: ["extensions", "marketplace", "packages", "permissions", "supply-chain"]
depends_on: ["adr-104", "adr-106", "adr-111"]
referenced_by:
  - type: "blueprint"
    target: "10-developer-platform/extension-platform.md"
  - type: "blueprint"
    target: "20-roadmaps/extension-platform-roadmap.md"
---

## Context

A storefront cannot make third-party capabilities safe. Vestara first needs a
stable package identity, lifecycle, permission boundary, contribution model,
integrity contract, transactional installer, and attributable history. Without
those contracts a Marketplace UI would distribute packages that core cannot
reliably activate, govern, update, roll back, or remove.

## Decision

Vestara SHALL build the Extension Platform and Local Package Manager before a
remote Marketplace service or storefront.

Core defines stable manifest, permission, trust, isolation, health, lifecycle,
and contribution contracts. Packages register only through controlled
extension points. Installation verifies compatibility and content integrity,
resolves installed dependencies, requests every declared permission, stages an
immutable version, activates it, and rolls back all state and files on failure.

User installation and workspace enablement are separate. Package versions are
retained for explicit rollback. Lifecycle actions emit attributable events and
project package identity, capabilities, dependencies, publishers, permissions,
and workspace enablement into the Engineering Graph.

The local MVP accepts unpacked package directories and permits only in-process
activation. This is authorization for trusted first-party and local-development
packages, not community code. Worker, process, and sandbox activation require
their own enforceable isolation implementation before use.

## Consequences

### Positive

- Marketplace discovery becomes a replaceable distribution layer.
- Provider, agent, theme, standards, verification, and integration packages use
  one lifecycle and permission model.
- Failed activation cannot leave a half-installed current version.
- Contribution cleanup is owned and testable.
- Historical events and graph relationships explain package provenance.

### Negative

- Remote search, signing, SBOM enforcement, and publishing are delayed.
- The first local package format is a directory, not a portable archive.
- Community packages remain blocked until process isolation exists.

## Alternatives considered

| Alternative | Decision |
|-------------|----------|
| Build storefront first | rejected: distribution without governance |
| Let packages mutate core registries directly | rejected: no cleanup or permission boundary |
| Execute every package in the API process | rejected for community packages |
| Stable contracts plus transactional local manager | accepted |

## Implementation evidence

- Repository: `evillan0315/vestara-ai-core`
- Implementation reference: `45e670d`
- `packages/extension-contracts/src/index.ts`
- `packages/extension-runtime/src/index.ts`
- `packages/extension-contracts/__tests__/index.test.ts`
- `packages/extension-runtime/__tests__/index.test.ts`
