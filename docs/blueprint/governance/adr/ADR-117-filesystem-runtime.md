---
id: "adr-117"
adr: "ADR-117"
title: "Filesystem Runtime — Sandboxed, Approval-Gated Executor"
category: "implementation"
version: 1.0
date: "2026-08-02"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@backend-engineer", "@security-engineer"]
consulted: ["@security-engineer"]
informed: ["@team"]
tags: ["filesystem", "security", "sandbox", "approvals", "reconciliation"]
depends_on: ["adr-103", "adr-111"]
referenced_by:
  - type: "runtime"
    target: "vestara-ai-core/packages/filesystem-runtime/src/index.ts"
  - type: "blueprint"
    target: "06-workspace/workspace-native-context.md"
---

## Context

Filesystem access is the highest-risk surface for agent execution. The implementation
had a `FilesystemRuntime` that resolved paths without enforcing containment (absolute
paths and `..` escaped the root), and a separate sandboxed `FilesystemService` with no
approval gates. Two parallel stacks existed and neither served agent execution
end-to-end.

## Decision

Make `FilesystemRuntime` the single controlled executor for agent filesystem work:

- **Containment**: every resolved path must stay inside the configured root; absolute
  escapes are rejected.
- **Deny list**: sensitive basenames (`.env`, `credentials.json`, …) are always denied.
- **Risk-classified operations** with approval gates (high-risk = delete).
- **Dry-run mode**: validate and gate without mutating disk.
- **Bounded operation history** + `onOperation` audit hook + change summaries.
- **Structured `FsObservation`** returned for every operation.
- **Operations**: read, write, update (patch), create, delete, rename, copy, list,
  stat, exists, search, references.

`FilesystemService`/`PathSecurity` remain for the workspace/UI tool path; the stacks
are not merged, but agent execution uses only `FilesystemRuntime`.

## Alternatives Considered

- **Merge both stacks**: rejected — `FilesystemService` is sync/UI-oriented with
  different guarantees; merging would churn the UI path for no functional gain.
- **Patch the legacy tools/filesystem adapter**: rejected — it used `process.cwd()`
  with a weak `..` check and no approval model.
- **Rely on OS permissions only**: rejected — insufficient for an agent sandbox with
  per-operation policy.

## Trade-offs

- Two filesystem abstractions coexist; the boundary is documented: agents →
  FilesystemRuntime, UI/tools → FilesystemService.
- The async, gated API is slightly more ceremony than raw `node:fs`.

## Consequences

- Path traversal, absolute-path escapes, and deny-list paths are rejected end-to-end
  (covered by tests).
- High-risk operations require explicit approval before disk mutation.
- Operation history and observations feed the audit trail and Understanding Runtime.
- Implementation ADR: `vestara-ai-core/docs/ADR/ADR-003-filesystem-runtime.md`.

---

- Supersedes: the un-contained `FilesystemRuntime` path resolution
- Dependencies: ADR-111, ADR-116
