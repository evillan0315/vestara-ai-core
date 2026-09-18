---
title: Vestara Acceptable Use Policy (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Acceptable Use Policy — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. Enforcement mechanisms cited are evidenced engineering controls;
> enforcement policy (suspension, termination) is UNKNOWN — **LEGAL REVIEW REQUIRED**.

## 1. Scope

Covers use of Vestara deployments (CURRENT Standalone; PLANNED AI OS / Live /
CLI / cloud), agents, workflows, Marketplace packages, and integrations.

## 2. Prohibited uses (DRAFT)

- Violating applicable law; infringing IP or license terms (including OSS
  copyleft duties — see `OPEN-SOURCE-NOTICES.md`).
- Circumventing authority policy: self-granting capabilities, expanding agent
  scope, altering execution identity or governing policy (prohibited by design
  invariants, VES-BASELINE-001 §§13–14; technical enforcement PLANNED).
- Exfiltrating another principal's credentials, conversations, or artifacts;
  defeating redaction or audit capture.
- Operating agents with deliberately concealed privileged authority; running
  unreviewed privileged executors.
- Publishing malicious Marketplace packages (see `MARKETPLACE-PACKAGE-POLICY.md`).
- Disrupting shared runtimes (when multi-tenant/cloud exists — PLANNED).

## 3. Evidenced controls (CURRENT, not legal sanctions)

- Permission contracts with allow/ask/deny evaluation and repository
  confinement (`packages/permission-contracts/src/`,
  `apps/api/src/assistant-capability-policy.ts`). CURRENT.
- Deny-by-default power operations requiring authorization callback + policy
  permission; no power mutation over HTTP/CLI (OS-0 baseline). CURRENT.
- Evidence/audit capture of executions (evidence pipeline). CURRENT.
- These controls mitigate misuse; they are not adjudication. Account action,
  suspension, and termination rules are UNKNOWN — **LEGAL REVIEW REQUIRED**.

## Statements deliberately withheld

Enforcement ladder; reporting/abuse channel beyond `SECURITY.md`; appeal;
law-enforcement request handling.
