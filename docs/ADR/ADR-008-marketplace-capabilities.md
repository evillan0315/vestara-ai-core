---
id: "adr-008"
adr: "ADR-008"
title: "Marketplace Remote Registries, Publishing, Signatures & Version Tracking"
category: "implementation"
version: 1.0
date: "2026-08-03"
status: "accepted"
owner: "@chief-architect"
last-reviewed: "2026-08-03"
next-review: "2026-11-03"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
tags: ["marketplace", "registry", "publishing", "signature", "version-tracking", "extension"]
referenced_by:
  - type: "blueprint"
    target: "00-governance/04-decision-log.md (ADR-115 Marketplace Foundation and Workspace Experience)"
  - type: "runtime"
    target: "@vestara/marketplace"
  - type: "runtime"
    target: "@vestara/extension-runtime"
influences:
  - "DevOps Engineer"
---

# ADR-008 — Marketplace Remote Registries, Publishing, Signatures & Version Tracking

## Context

The Marketplace Foundation (ADR-115) delivered a local catalog, search,
resolution, and install orchestration. Its reconcilement note records four
future capabilities: **remote registries**, **publishing**, **signature
enforcement**, and persisted **version tracking / update notifications**.
This implementation ADR records how `@vestara/marketplace` realizes those four
capabilities inside `vestara-ai-core`.

## Decision

Extend `@vestara/marketplace` (depends only on `@vestara/extension-contracts`
and `@vestara/extension-runtime`) with four additions, all additive to the
existing `MarketplaceRegistry` boundary:

### 1. Remote registries — `RemoteMarketplaceRegistry`

Implements the existing `MarketplaceRegistry` interface by fetching a JSON
**registry index** (`${baseUrl}/index.json`, `formatVersion: 1`) describing
catalog assets and versions. It caches the index, serves
search/getAsset/getVersion/listCategories/getHealth against it, and — when a
host-supplied `RemotePackageArchiveFetcher` is injected — materializes remote
versions locally for install. Without a fetcher it is catalog-only (safe
default). The index never causes the client to walk the filesystem.

### 2. Publishing — `MarketplacePublisher`

Validates a package directory via `readManifest`, recomputes the content digest
(`digestPackageDirectory`), optionally signs the digest with the publisher's
Ed25519 key, and rewrites `vestara-package.json` so the package becomes a
publishable artifact. The digest excludes the manifest itself, so signing in
place does not invalidate it. A `keys` helper generates an Ed25519 key pair.

### 3. Signature enforcement — Ed25519 over the digest

`signManifest`/`verifyManifest` sign and verify the string
`"<id>@<version>\n<digest>"` with `node:crypto` Ed25519 (no new dependency).
The local registry accepts an optional `publicKeyProvider` and now reports
`signatureValidated` truthfully (previously hardcoded `false`); without a key
provider signatures are not validated, matching the registry's "never
fabricates" invariant.

### 4. Version tracking & update notifications — `MarketplaceVersionTracker`

Persists installed-version records to a JSON store
(`.vestara/marketplace/versions.json`), computes update candidates against the
catalog, and emits `marketplace.update.notification` **once per target
version** (tracked by `lastNotifiedVersion`, dismissible). A corrupt store is
ignored and re-initialized.

CLI wiring: `vestara marketplace publish <dir> [--key <pem>]`, `keys <dir>`,
`registry list`, and `track` subcommands. The API marketplace adapter already
surfaces `registryStatuses`; remote registries are wired where the host
supplies their base URLs.

## Alternatives Considered

- **npm-equivalent tarball registry** — deferred: requires an archive
  extractor dependency and a hosting service. The index + injectable archive
  fetcher keeps `@vestara/marketplace` dependency-light while allowing a host
  to supply extraction.
- **Trust-on-first-use / no signatures** — rejected: ADR-115 explicitly names
  signature enforcement as future work; signing the digest binds identity to a
  specific package/version without exposing the whole manifest.
- **Ephemeral update checks only** — rejected: the existing `listUpdates`
  computes on the fly but forgets between runs; the tracker gives a durable
  "notify once" contract.

## Trade-offs

- Remote install needs a host-provided archive fetcher; the package itself does
  not extract archives.
- Signature validation is opt-in via `publicKeyProvider`; a registry that lacks
  keys still indexes packages but reports `signatureValidated: false`.
- The registry index is a curated JSON contract; it does not support arbitrary
  npm-style metadata.

## Consequences

- Discovery/search/install can now span multiple registries (local + remote).
- Publishers get a canonical sign-and-publish path; consumers get a truthful
  signature-validated signal.
- Installed-version drift is durable and dismissible across runs.

---

- Supersedes: none
- Dependencies: `@vestara/extension-contracts`, `@vestara/extension-runtime`, `node:crypto`
- Implements (blueprint): ADR-115 (future-work items), `00-governance/07-ai-operating-system-architecture.md`