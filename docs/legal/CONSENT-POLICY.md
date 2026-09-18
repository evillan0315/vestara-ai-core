---
title: Vestara Consent Policy (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Consent Policy — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. Describes the intended model. **No consent runtime exists on
> current evidence** — `ConsentRecord`, consent UX, onboarding consent capture,
> and versioned consent enforcement are all future work (DO NOT IMPLEMENT).

## 1. Intended separation (PLANNED model)

```text
Legal Document
      ↓
Consent / User Choice
      ↓
Policy Contract
      ↓
Runtime Enforcement
      ↓
Evidence / Audit
```

Preserved distinctions — none may be collapsed into another:

```text
Terms acceptance
≠ Privacy consent
≠ Telemetry consent
≠ Third-party authorization
≠ AI-provider authorization
```

## 2. Current evidence vs gaps

| Element | Status |
|---|---|
| Permission allow/ask/deny evaluation + confinement (`packages/permission-contracts`, `apps/api/src/assistant-capability-policy.ts`) | CURRENT plumbing, not consent |
| Authorization callback + policy permission for power ops (OS-0) | CURRENT plumbing, not consent |
| Install-time permission collection (`packages/marketplace/src/service.ts`) | CURRENT signal, not consent |
| Versioned, principal-attributed consent records | UNKNOWN — future `ConsentRecord` runtime |
| Onboarding consent capture | UNKNOWN — onboarding itself is HOLD per VES-BASELINE-001 |
| Telemetry opt-in/out | UNKNOWN — none evidenced |
| Third-party / AI-provider authorization records | Partially CURRENT via OAuth flows (OpenCode); Vestara-native records UNKNOWN |

## 3. Requirements for the future runtime (DO NOT IMPLEMENT here)

- Consent must be versioned (document version + policy version) and
  attributable to a principal (`HumanPrincipal` direction; agents cannot
  consent for humans).
- Each of the five consent types requires its own record, scope, and
  withdrawal path; withdrawal effects (e.g. on cached credentials, ongoing
  runs, retained evidence) must be specified per type — currently UNKNOWN,
  **LEGAL REVIEW REQUIRED**.
- Consent state must project into policy evaluation and be captured in
  evidence/audit; the Assistant must surface consent impact before proposing
  revisions (RAG loop, `README.md`).

## 4. Assistant authority limit

The Assistant must not independently declare legal compliance or publish
binding revisions without the required authority. Consent records, when they
exist, are legal facts — writable only through governed approval, never by
unilateral assistant action.

## Statements deliberately withheld

Consent wording per type; age/capacity rules; withdrawal mechanics; proof of
consent for regulators; dark-pattern prohibitions; record-retention for
consent artifacts themselves.
