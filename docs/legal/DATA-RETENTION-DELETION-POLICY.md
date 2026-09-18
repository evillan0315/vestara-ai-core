---
title: Vestara Data Retention and Deletion Policy (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Data Retention & Deletion Policy — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. States evidenced persistence; every retention period and every
> deletion capability not evidenced below is UNKNOWN — **LEGAL REVIEW REQUIRED**.

## 1. Evidenced persistence (CURRENT)

- Conversations + messages persist in SQLite across restarts
  (`packages/conversation-runtime/src/conversation-store.ts`). CURRENT.
- Interactions persist via `SqliteInteractionStore` with file-backed export of
  the DB (`packages/interaction-persistence/src/sqlite-store.ts`). CURRENT.
- Activity, engineering events (`engineering_events`), evidence bundles, and
  telemetry snapshots persist locally (activity-room, engineering-event-store,
  evidence, telemetry packages). CURRENT.
- Schema evolution is migration-governed (`@vestara/sqlite-migrations`,
  per-package manifests). CURRENT.
- Test/DB paths use in-memory `sql.js`; production paths use file-backed
  SQLite / better-sqlite3. CURRENT.

## 2. Deletion and export (mostly UNKNOWN)

- **No user-facing data-deletion or erasure API was evidenced** in the audit
  (no delete/retention/purge handling found in event-store sources; no export
  API evidenced for conversations). Deletion/export behavior is UNKNOWN.
  **LEGAL REVIEW REQUIRED** — data-deletion APIs are future work, DO NOT
  IMPLEMENT in LEGAL-TRUST-001.
- Uninstalling a Marketplace package removes the package, not history:
  `Package removal ≠ Historical evidence deletion` (see `MARKETPLACE-TERMS.md`).
  Evidence-retention-after-removal rules are UNKNOWN — **LEGAL REVIEW REQUIRED**.

## 3. Draft retention posture (all periods TBD)

- Until Legal sets a schedule: retain local operational data for the
  functioning of the product; do not represent any fixed retention period,
  auto-expiry, or deletion SLA. Any such claim would be unsupported.

## 4. Workspace selection (`VESTARA_REPO`)

- The operator selects the workspace path; repository binding is authoritative
  for execution scope. Data follows the selected repository/host. CURRENT.
  Multi-workspace and cloud data-residency questions are PLANNED/UNKNOWN.

## Statements deliberately withheld

Retention schedule per category; deletion procedure and SLA; export format;
backup handling; evidence-immutability vs erasure conflict resolution.
