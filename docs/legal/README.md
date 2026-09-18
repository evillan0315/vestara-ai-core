---
title: Vestara Legal and Trust Documentation
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Vestara Legal & Trust — README

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> These are initial engineering/legal drafts, not declarations of regulatory
> compliance. No document in this family claims Vestara complies with any law,
> regulation, certification, privacy framework, security standard, or license
> obligation. Every `LEGAL REVIEW REQUIRED` marker is a binding hold: do not
> resolve it by inventing a legal conclusion.

## Document family

| Document | Purpose |
|---|---|
| `TERMS-OF-SERVICE.md` | Draft terms for using Vestara deployments and services |
| `PRIVACY-POLICY.md` | Draft privacy statement grounded in evidenced data behaviors |
| `SOFTWARE-LICENSE.md` | Records the current license posture (including the missing-license finding) |
| `OPEN-SOURCE-NOTICES.md` | Method and placeholder for open-source attribution |
| `THIRD-PARTY-SOFTWARE.md` | Separates Vestara code, OSS dependencies, proprietary services, Marketplace packages |
| `AI-PROVIDER-DISCLOSURE.md` | Discloses external AI provider transmission via the OpenCode boundary |
| `TELEMETRY-DATA-POLICY.md` | Describes evidenced local telemetry; no external telemetry claimed |
| `MARKETPLACE-TERMS.md` | Draft terms for Marketplace distribution and installation |
| `MARKETPLACE-PACKAGE-POLICY.md` | Package requirements: signing, verification signals, capability declarations |
| `ACCEPTABLE-USE-POLICY.md` | Draft acceptable-use rules |
| `SECURITY-POLICY.md` | Mirrors and extends the evidenced `SECURITY.md` posture |
| `DATA-RETENTION-DELETION-POLICY.md` | Records evidenced persistence; marks retention/deletion behavior UNKNOWN unless evidenced |
| `CONSENT-POLICY.md` | Intended consent separation model (all runtime enforcement is future work) |

## Ownership

- Engineering owner: Vestara maintainers (see `SECURITY.md` reporting path).
- Legal owner: **TBD — LEGAL REVIEW REQUIRED.** No organization identity or
  jurisdiction was found in the repository (see `SOFTWARE-LICENSE.md`).

## Status and versioning

- All documents: `Status: DRAFT`, `Version: 0.1`.
- Versioning is manual until a publish/version workflow exists (future work).
- Every material statement carries an evidence tag:
  - `CURRENT` — supported by repository evidence cited inline.
  - `PLANNED` — supported by plans/architecture docs, not implemented.
  - `UNKNOWN` — no evidence; statement deliberately withheld, HOLD recorded.

## Relationships

```text
Legal Document (this family)
      ↓
Consent / User Choice (CONSENT-POLICY.md — future runtime)
      ↓
Policy Contract (permission/policy packages — CURRENT plumbing, § references)
      ↓
Runtime Enforcement (System Broker etc. — PLANNED per VES-BASELINE-001)
      ↓
Evidence / Audit (evidence packages — CURRENT event/evidence capture)
```

Terms acceptance ≠ privacy consent ≠ telemetry consent ≠ third-party
authorization ≠ AI-provider authorization. Each requires its own versioned,
principal-attributed record (future `ConsentRecord` runtime — DO NOT IMPLEMENT
in LEGAL-TRUST-001).

## Review requirements

- Every file requires Legal review before any compliance claim or publication.
- `LEGAL REVIEW REQUIRED` markers must be resolved by Legal, not engineering.
- The Assistant must not independently declare legal compliance or publish
  binding revisions without the required authority (see `CONSENT-POLICY.md`
  future-RAG section, repeated in each policy file's RAG note).

## Future RAG requirement

Legal & Trust material is intended to become machine-retrievable by Vestara
RAG. Future Assistant workflows must be capable of: retrieve authoritative
product evidence → identify legal/privacy impact → identify affected documents
→ propose evidence-backed revisions → human/legal review → approval →
publish/version. Required retrieval metadata per chunk: source/provenance,
product applicability, implementation status (CURRENT/PLANNED/UNKNOWN),
version/revision, data classification, evidence references. RAG itself is
future work — DO NOT IMPLEMENT.
