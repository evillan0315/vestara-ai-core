---
title: VSDE-003 — Artifact Contracts
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# VSDE-003 — Artifact Contracts

## Purpose

Every durable domain artifact has an independent versioned contract. These contracts live outside capability specifications because multiple capabilities may consume or produce the same artifact.

## Contracts

| Artifact | Contract | Version | Source |
|----------|----------|---------|--------|
| RepositoryWorkspace | `docs/artifacts/RepositoryWorkspace.md` | 1.0 | `types.ts` |
| Plan | `docs/artifacts/Plan.md` | 1.0 | `types.ts` |
| ChangeSet | `docs/artifacts/ChangeSet.md` | 1.0 | `types.ts` |
| VerificationReport | `docs/artifacts/VerificationReport.md` | 1.0 | `types.ts` |
| ImpactAssessment | `docs/artifacts/ImpactAssessment.md` | 1.0 | `types.ts` |
| Decision | `docs/artifacts/Decision.md` | 1.0 | `types.ts` |
| CollaborationRecord | `docs/artifacts/CollaborationRecord.md` | 1.0 | `types.ts` |
| ImpactAssessment | `docs/artifacts/ImpactAssessment.md` | 1.0 | `types.ts` |
| Decision | `docs/artifacts/Decision.md` | 1.0 | `types.ts` |
| VerificationReport | `docs/artifacts/VerificationReport.md` | 1.0 | `types.ts` |

## Contract Structure

Each artifact contract documents:

- Identity (ID format, namespace)
- Required fields
- Optional fields
- Lifecycle (state machine)
- Relationships (which artifacts reference it)
- Persistence (SQLite schema, file format)
- Versioning strategy
