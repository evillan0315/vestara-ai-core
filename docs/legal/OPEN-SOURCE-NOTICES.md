---
title: Vestara Open Source Notices (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Open-Source Notices — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. Attribution method is proposed; no per-package attribution is
> asserted here. Do not treat this file as a complete notice set.

## 1. Method (CURRENT tooling)

- Dependency licenses are auditable today via `pnpm licenses list`
  (verified working: emits per-package license table, e.g. `dompurify →
  (MPL-2.0 OR Apache-2.0)`). CURRENT.
- `pnpm-workspace.yaml` pins workspace layout (`packages/*`,
  `packages/providers/*`, `packages/tools/*`, `apps/*`) and approved builds.
  CURRENT.

## 2. What is NOT yet in place

- No committed SBOM, license manifest, or generated notice file. CURRENT
  (absence verified; reports under `docs/generated/` are local, gitignored
  automation output per `docs/README.md`).
- No SBOM/license/provenance generation pipeline. UNKNOWN automation —
  recorded as future requirement, DO NOT IMPLEMENT in LEGAL-TRUST-001.

## 3. Notice placeholder (structure, not content)

Future generated notices must list, per distributed artifact: package name,
version, license identifier, copyright notice, license text location, and
modification statement where applicable. Population of this list is future
work requiring the SBOM pipeline + Legal review of copyleft obligations
(**LEGAL REVIEW REQUIRED** before distribution; copyleft exposure UNKNOWN).

## 4. Marketplace packages

- Marketplace packages are separately licensed artifacts; availability in a
  catalog does not imply Vestara holds redistribution rights
  (`THIRD-PARTY-SOFTWARE.md`, `MARKETPLACE-PACKAGE-POLICY.md`). Do not assume
  redistribution rights — **LEGAL REVIEW REQUIRED** per package channel.

## Statements deliberately withheld

Complete dependency inventory; copyleft analysis; attribution text for any
specific dependency.
