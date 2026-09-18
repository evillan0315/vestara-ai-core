---
title: Vestara Marketplace Terms (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Marketplace Terms — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. No Marketplace is publicly operated on current evidence
> (registries are local/detector/remote-planned). Terms are preparatory.

## 1. What Marketplace is (CURRENT vs PLANNED)

- CURRENT: local package lifecycle — catalog aggregation, discovery/search,
  dependency resolution with deterministic install order, policy-checked
  install/update/uninstall/verify/rescan (`packages/marketplace/src/service.ts`,
  `resolver.ts`, `catalog.ts`, `updates.ts`). Publisher-keyed assets
  (`publisherId/packageName`), manifest-declared capabilities, content digests.
- PLANNED: public/enterprise remote registries (`registry.ts`: "designed for
  future public/enterprise registries"; `remote-registry.ts` fetcher with host
  integrity verification). No operated public Marketplace evidenced.
- Packages may eventually contribute modules, agents, tools, skills,
  workflows, integrations, runtimes, UI contributions, capability definitions,
  and executor adapters (target direction, VES-BASELINE-001 §7). PLANNED.

## 2. Core invariants (preserved from baseline architecture)

```text
Marketplace availability ≠ Authority
Package installation ≠ Capability grant
Package removal ≠ Historical evidence deletion
```

- Installing a package makes capabilities *available for assignment*; grants
  come from Authority policy, never from installation alone. CURRENT design
  (policy check in install path; permission collection from install plan).
- Uninstall removes the package; historical evidence (events, bundles,
  audit records referencing the package) is a separate retention question —
  see `DATA-RETENTION-DELETION-POLICY.md`. Removal semantics for evidence are
  UNKNOWN — **LEGAL REVIEW REQUIRED**.

## 3. Publisher relationship (DRAFT)

- Publishers are identified by `publisherId`; manifests carry publisher
  identity, integrity digests, and optional signatures (`asset.ts`,
  `local-registry.ts`, `signature.ts`). Signature validation occurs only when
  a public-key provider is configured; absent keys → signatures not validated
  (CURRENT). Publisher verification, takedown, and dispute processes are
  UNKNOWN — **LEGAL REVIEW REQUIRED** before operating any public registry.
- No redistribution-rights assumption: listing or installing a package does
  not establish Vestara's right to redistribute it.

## 4. User obligations (DRAFT)

- Users install packages subject to these terms, `ACCEPTABLE-USE-POLICY.md`,
  and the package's own license. Capability grants requested by packages
  (collected permissions at install) require principal authorization under
  `CONSENT-POLICY.md` when that runtime exists (future).

## Statements deliberately withheld

Fees/revenue share; listing agreement; review/moderation policy; liability
allocation for malicious packages; takedown procedure; governing terms of any
future public registry.
