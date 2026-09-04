---
title: Data Model
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Data Model

## RepositoryWorkspace (canonical domain object)

- `identity`: RepositoryFingerprint (id, name, path, git metadata)
- `discovery`: DiscoveryResult (files, size, extensions)
- `analysis`: RepositoryProfile (language, packages, entry points, risks, health)
- `index`: IndexReport (documents, chunks)
- `presentation`: PresentedSummary (facts + optional AI narrative)

## Key Types

- `WorkspaceStatus`: idle → discovering → fingerprinting → analyzing → indexing → presenting → ready
- `RepositoryProfile`: language, framework, packages, entry points, risks, healthScore
- `HealthScore`: overall 0-10, categories (codeQuality, testCoverage, dependencyHealth, documentation)
