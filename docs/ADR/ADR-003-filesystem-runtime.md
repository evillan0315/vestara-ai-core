---
id: adr-003
adr: ADR-003
title: Filesystem Runtime
category: implementation
version: 1.0
date: 2026-07-31
status: accepted
author: @chief-architect
deciders: "["@chief-architect", "@backend-engineer", "@security-engineer"]"
consulted: "["@security-engineer"]"
tags: "["filesystem", "security", "sandbox", "approvals"]"
referenced_by: 
influences: 
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# ADR-003 — Filesystem Runtime

## Context

Filesystem access is the highest-risk surface for agent execution. The pre-existing
`FilesystemRuntime` resolved paths without enforcing containment (absolute paths and
`..` escaped the root), had no update/stat/copy operations, no dry-run, and no
operation history. Meanwhile `FilesystemService` (workspace) enforced sandboxing via
`PathSecurity` but had no approval gates. Two parallel stacks existed, and neither
served agent execution end-to-end.

## Decision

Make `FilesystemRuntime` the single controlled executor for agent filesystem work:

- **Containment**: every resolved path must stay inside the configured root
  (`path.relative` must not start with `..`); absolute escapes are rejected.
- **Deny list**: sensitive basenames (`.env`, `credentials.json`, …) are always denied.
- **Risk-classified operations** with approval gates (high-risk = delete).
- **Dry-run mode**: validate + gate without mutating disk.
- **Bounded operation history** + `onOperation` audit hook + change summaries.
- **Structured `FsObservation`** returned for every operation (feedback to Understanding).
- **Operations**: read, write, update (patch), create, delete, rename, copy, list,
  stat, exists, search, references.

`FilesystemService`/`PathSecurity` remain for the workspace/UI tool path; the two
stacks are not merged, but agent execution uses only `FilesystemRuntime`.

## Alternatives Considered

- **Merge both stacks**: rejected — `FilesystemService` is sync/UI-oriented with
  different guarantees; merging would churn the UI path for no functional gain.
- **Patch tools/filesystem package instead**: rejected — that adapter used
  `process.cwd()` with a weak `..` check and no approval model.
- **Rely on OS permissions only**: rejected — insufficient for an agent sandbox with
  per-operation policy.

## Trade-offs

- Two filesystem abstractions coexist; documented boundary: agents → FilesystemRuntime,
  UI/tools → FilesystemService.
- Sync API kept simple; async ops in FilesystemRuntime are slightly more ceremony.

## Consequences

- Path traversal, absolute-path escapes, and deny-list paths are rejected end-to-end
  (covered by tests).
- High-risk operations require explicit approval before disk mutation.
- Operation history + observations feed the audit trail and Understanding Runtime.

---

- Supersedes: the un-contained `FilesystemRuntime` path resolution
- Dependencies: ADR-001, ADR-002
