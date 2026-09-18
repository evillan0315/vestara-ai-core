---
title: Vestara Marketplace Package Policy (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Marketplace Package Policy — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. Technical requirements below mirror evidenced implementation;
> legal enforceability of the policy is UNKNOWN — **LEGAL REVIEW REQUIRED**.

## 1. Manifest and integrity (CURRENT)

- Packages carry manifests with publisher identity, capability declarations,
  compatibility metadata, content digests, and optional signatures
  (`packages/marketplace/src/asset.ts`, `detector/`, `signature.ts`).
- Local registry validates manifests strictly, verifies content digests,
  detects duplicates, and guards path traversal (executable paths confined to
  the installation directory). CURRENT.
- Verification signals are independently reported and never fabricated:
  `signed` (manifest declares signature) vs `signatureValidated` (cryptographic
  check passed) vs `checksumVerified`. Filters support `signed` /
  `checksum-verified` selection. CURRENT.

## 2. Signing (CURRENT limitation — material)

- `signManifest` / `verifyManifest` / `generatePublisherKeys` exist. CURRENT.
- **Validation only occurs when a `publicKeyProvider` is configured; when
  absent, signatures are NOT validated** (`local-registry.ts`). CURRENT.
- Policy consequence: any future claim such as "all packages are
  signature-verified" would be false on current evidence. Withheld —
  **LEGAL REVIEW REQUIRED**, plus mandatory-key-distribution work (future,
  DO NOT IMPLEMENT here).

## 3. Capability declarations

- Packages declare capabilities; installation collects permissions for policy
  check (`service.ts`: `collectPermissions(plan.installOrder)`). Declarations
  are availability signals, never grants (see `MARKETPLACE-TERMS.md`
  invariants). Dynamic privileged capabilities and the System Broker are
  PLANNED per VES-BASELINE-001 §§8–9 — packages must not assume privileged
  executors exist.

## 4. Prohibited content (DRAFT, enforcement future)

- No malicious code, credential harvesting, license misrepresentation,
  falsified signatures/digests, or undisclosed privileged-capability use.
  Detection/enforcement automation is future work; reporting channel defaults
  to `SECURITY.md` until defined — **LEGAL REVIEW REQUIRED**.

## Statements deliberately withheld

Review SLA; quarantine/removal authority; appeal; package-license allowlist;
vulnerability-handling duties for publishers.
