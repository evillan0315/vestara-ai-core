---
title: Vestara Software License Posture (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Software License — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. Records findings; grants no license until Legal resolves the
> missing-license-text hold.

## 1. HEADLINE FINDING — LEGAL REVIEW REQUIRED

- `README.md` displays an MIT-license badge (`License: MIT`, shields.io) and
  links to opensource.org/licenses/MIT. CURRENT (badge present in repo).
- **No `LICENSE`, `LICENCE`, `COPYING`, or `NOTICE` file exists at the
  repository root** (verified 2026-09-17). CURRENT (absence verified).
- No `"license"` field was found in sampled `packages/*/package.json` files.
  CURRENT (absence in sampled files; full-tree confirmation is future work).
- Consequence: the repository **claims** MIT but does not **convey** MIT
  license text. Redistribution, sublicensing, and warranty-disclaimer terms
  are therefore UNKNOWN. **LEGAL REVIEW REQUIRED: add an authoritative
  LICENSE file (or correct the badge) before any distribution.**

## 2. Current licensing posture

- Root `package.json`: `"private": true`, version 0.3.0, engineering phase.
  CURRENT. A `private` flag is a package-manager signal, not a license.
- Until the headline finding is resolved, Vestara source must be treated as
  **all rights reserved / unlicensed for redistribution** as the conservative
  default. Withheld as legal conclusion — **LEGAL REVIEW REQUIRED**.

## 3. What this means for deployments

- Building/running Vestara locally from source for development is the
  evidenced use (`README.md` quick start, `AGENTS.md`). CURRENT.
- Standalone distribution (installers, desktop bundles, OS images), cloud
  operation, and Marketplace redistribution each require resolved licensing.
  PLANNED deployments; licensing position UNKNOWN — **LEGAL REVIEW REQUIRED**.

## 4. Future work

- Add root `LICENSE` (+ `NOTICE` if needed); add per-package `license` fields;
  confirm full tree; record decision in `DECISIONS.md` or ADR. None of this is
  done in LEGAL-TRUST-001 (documentation only).

## Statements deliberately withheld

Whether MIT is the intended license; copyright holder and year; contributor
license terms; patent grants; trademark rights (none evidenced).
