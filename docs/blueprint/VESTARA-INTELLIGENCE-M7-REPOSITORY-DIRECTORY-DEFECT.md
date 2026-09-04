---
title: M7.1 Repository Directory Authority Defect — Trace Evidence
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# M7.1 Repository Directory Authority Defect — Trace Evidence

**Date:** 2026-09-03
**Status:** Root Cause PROVEN — Zero-Mutation Trace
**Classification:** PROVEN

---

## 1. Evidence Summary

| Field | Value |
|-------|-------|
| Expected repository directory | `/home/user/projects/vestara/vestara-ai-core` |
| Observed OpenCode directory | `/home/user/projects/vestara/vestara-ai-core/.vestara` |
| Authoritative RepositoryBinding value | `abs = path.resolve(repoPath)` = `/home/user/projects/vestara/vestara-ai-core` |
| First incorrect derivation boundary | `packages/workspace/src/workspace-runtime.ts:98` |
| Source value | `resolvedPath` = `/home/user/projects/vestara/vestara-ai-core` |
| Transformation | `path.join(resolvedPath, '.vestara')` |
| Resulting value | `/home/user/projects/vestara/vestara-ai-core/.vestara` |
| Classification | **PROVEN** |

---

## 2. Complete Derivation Chain

```
API entry: createWorkspaceContext(repoPath, publish)
    │
    ├─ abs = path.resolve(repoPath)
    │   = /home/user/projects/vestara/vestara-ai-core  ✅ CORRECT
    │
    ├─ runtime.open(abs)
    │   └─ WorkspaceRuntime.open(rootDir)
    │       ├─ resolvedPath = path.resolve(rootDir)
    │       │   = /home/user/projects/vestara/vestara-ai-core  ✅ CORRECT
    │       │
    │       └─ workspaceDir = path.join(resolvedPath, '.vestara')
    │           = /home/user/projects/vestara/vestara-ai-core/.vestara  ❌ INCORRECT
    │
    ├─ session = runtime.getSession()
    ├─ workspaceDir = session.workspaceDir
    │   = /home/user/projects/vestara/vestara-ai-core/.vestara  ❌ PROPAGATED
    │
    ├─ OpenCodeRuntimeProvider({ directory: workspaceDir })
    │   = OpenCodeRuntimeProvider({ directory: '/home/user/projects/vestara/vestara-ai-core/.vestara' })
    │
    └─ OpenCodeHttpClient.createSession()
        → POST /session?directory=/home/user/projects/vestara/vestara-ai-core/.vestara  ❌ WRONG
```

---

## 3. First Incorrect Derivation Boundary

| Boundary | File | Line | Function |
|----------|------|------|----------|
| **FIRST INCORRECT** | `packages/workspace/src/workspace-runtime.ts` | **98** | `WorkspaceRuntime.open()` |

**Source value:** `resolvedPath` = `/home/user/projects/vestara/vestara-ai-core`
**Transformation:** `path.join(resolvedPath, '.vestara')`
**Resulting value:** `/home/user/projects/vestara/vestara-ai-core/.vestara`

---

## 4. Propagation Path

| Step | File | Line | Code | Value |
|------|------|------|------|-------|
| 1 | `workspace-runtime.ts` | 98 | `workspaceDir = path.join(resolvedPath, '.vestara')` | `.vestara` ❌ |
| 2 | `workspace-runtime.ts` | 98 | `session.workspaceDir = workspaceDir` | `.vestara` ❌ |
| 3 | `workspace-context.ts` | 440 | `const workspaceDir = session.workspaceDir` | `.vestara` ❌ |
| 4 | `workspace-context.ts` | 909 | `new OpenCodeRuntimeProvider({ directory: workspaceDir })` | `.vestara` ❌ |
| 5 | `runtime-provider.ts` | 299 | `this.client().createSession({ title }, { directory: this.directory })` | `.vestara` ❌ |
| 6 | `opencode-http-client.ts` | 170 | `withQuery('/session', { directory: context.directory })` | `.vestara` ❌ |

---

## 5. Why workspaceDir = .vestara Is Wrong

The `.vestara` directory is Vestara's metadata/storage directory. It contains:
- `plans/plans.db`
- `conversations/conversations.db`
- `events/engineering-events.db`
- `routing.json`
- `threads/agent-harness.db`
- etc.

OpenCode's `?directory=` parameter is used for **project resolution** — it tells OpenCode which project context to use for:
- Agent definition discovery (`.opencode/agents/*.md`)
- Project configuration (`.opencode/config.json`)
- Session creation context

OpenCode needs the **repository root** (`/home/user/projects/vestara/vestara-ai-core`) to find `.opencode/agents/vestara-developer.md`, NOT the metadata directory (`/home/user/projects/vestara/vestara-ai-core/.vestara`).

---

## 6. Impact

| Impact | Description |
|--------|-------------|
| **Agent discovery** | OpenCode cannot find `.opencode/agents/*.md` files when directory is `.vestara` |
| **Project resolution** | OpenCode resolves to the wrong project (or no project) |
| **Session context** | Sessions are created in the wrong project context |
| **Previous incident** | This is the root cause of the original `Build`/`Nemotron` fallback observed earlier |

---

## 7. Whether ca4b8cb Is Affected

**YES.** The ca4b8cb commit corrected the HTTP client to pass `directory` in query parameters, but it passes the **wrong value** (`.vestara` instead of repository root). The contract fix is correct, but the authority is wrong.

---

## 8. Whether This Was Introduced by M7 Work

**NO.** This is a pre-existing defect in `WorkspaceRuntime.open()` (line 98). The `workspaceDir` has always been `resolvedPath + '.vestara'`. The M7 work merely exposed it by actually using the directory value for OpenCode requests.

---

## 9. Minimum Remediation

The fix must be at the **authority boundary** — where `workspaceDir` is derived. The correct value should be the repository root, not the metadata directory.

**Option A:** Change `workspaceDir` to mean repository root (affects all consumers)
**Option B:** Add a separate `repositoryDir` field to `WorkspaceContext` (preserves existing `workspaceDir` for metadata paths)

**Option B is safer** — it preserves the existing `workspaceDir` semantics for metadata paths while providing the correct repository root for OpenCode.

---

## 10. Additional Finding: Multiple .vestara References

The codebase uses `.vestara` paths in many places for metadata operations:
- `path.join(workspaceDir, 'conversations', ...)` — correct (metadata)
- `path.join(abs, '.vestara', 'marketplace')` — correct (metadata)
- `path.join(workspaceDir, 'routing.json')` — correct (metadata)

These are all correct uses of `.vestara` for Vestara's own storage. The defect is specifically that this same `.vestara` path is being used as the OpenCode project directory.

---

*Trace complete. Root cause PROVEN at workspace-runtime.ts:98.*
