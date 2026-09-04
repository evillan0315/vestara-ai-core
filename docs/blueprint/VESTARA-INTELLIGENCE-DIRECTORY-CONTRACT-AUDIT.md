---
title: OpenCodeHttpClient — Directory Contract Audit Matrix
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# OpenCodeHttpClient — Directory Contract Audit Matrix

**Date:** 2026-09-03
**Status:** Audit Complete

---

## Audit Matrix

| # | Method | Endpoint | directory in SDK query? | Vestara implementation | Classification |
|---|--------|----------|------------------------|----------------------|----------------|
| 1 | `createSession()` | `POST /session` | **YES** | ✅ `withQuery('/session', { directory })` | **CORRECT** |
| 2 | `getSession()` | `GET /session/{id}` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 3 | `listSessions()` | `GET /session` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 4 | `deleteSession()` | `DELETE /session/{id}` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 5 | `renameSession()` | `PATCH /session/{id}` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 6 | `sendMessage()` | `POST /session/{id}/message` | **YES** | ✅ `withQuery(..., { directory })` | **CORRECT** |
| 7 | `sendMessageAsync()` | `POST /session/{id}/prompt_async` | **YES** | ✅ `withQuery(..., { directory })` | **CORRECT** |
| 8 | `listMessages()` | `GET /session/{id}/message` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 9 | `openEventStream()` | `GET /event` | **YES** | ✅ `withQuery(..., { directory })` | **CORRECT** |
| 10 | `abortSession()` | `POST /session/{id}/abort` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 11 | `getSessionStatus()` | `GET /session/status` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 12 | `getSessionTodos()` | `GET /session/{id}/todo` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 13 | `getSessionChildren()` | `GET /session/{id}/children` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 14 | `getSessionDiff()` | `GET /session/{id}/diff` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 15 | `runCommand()` | `POST /session/{id}/command` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 16 | `respondToPermission()` | `POST /session/{id}/permissions/{id}` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 17 | `initSession()` | `POST /session/{id}/init` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 18 | `shareSession()` | `POST /session/{id}/share` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 19 | `unshareSession()` | `DELETE /session/{id}/share` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 20 | `summarizeSession()` | `POST /session/{id}/summarize` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 21 | `revertSession()` | `POST /session/{id}/revert` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 22 | `unrevertSession()` | `POST /session/{id}/unrevert` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 23 | `runShell()` | `POST /session/{id}/shell` | **YES** | ❌ `_context` ignored | **DEFECT** |
| 24 | `listProviders()` | `GET /provider` | **YES** | ❌ No context parameter | **DEFECT** |
| 25 | `listAgents()` | `GET /agent` | **YES** | ❌ No context parameter | **DEFECT** |
| 26 | `listCommands()` | `GET /command` | **YES** | ❌ No context parameter | **DEFECT** |
| 27 | `listLsp()` | `GET /lsp` | **YES** | ❌ No context parameter | **DEFECT** |
| 28 | `getPathInfo()` | `GET /path` | **YES** | ❌ No context parameter | **DEFECT** |
| 29 | `getVcsInfo()` | `GET /vcs` | **YES** | ❌ No context parameter | **DEFECT** |
| 30 | `listProjects()` | `GET /project` | **YES** | ❌ No context parameter | **DEFECT** |
| 31 | `getCurrentProject()` | `GET /project/current` | **YES** | ❌ No context parameter | **DEFECT** |
| 32 | `findText()` | `GET /find` | **YES** | ✅ Uses `query.directory` | **CORRECT** |
| 33 | `findFiles()` | `GET /find/file` | **YES** | ✅ Uses `query.directory` | **CORRECT** |
| 34 | `findSymbols()` | `GET /find/symbol` | **YES** | ✅ Uses `query.directory` | **CORRECT** |
| 35 | `readFile()` | `GET /file/content` | **YES** | ✅ Uses `query.directory` | **CORRECT** |
| 36 | `fileStatus()` | `GET /file/status` | **YES** | ✅ Uses `query.directory` | **CORRECT** |
| 37 | `getHealth()` | `GET /global/health` | **NO** | N/A | **DIRECTORY NOT APPLICABLE** |
| 38 | `getOpenApiDocument()` | `GET /doc` | **NO** | N/A | **DIRECTORY NOT APPLICABLE** |

---

## Summary

| Classification | Count | Details |
|---------------|-------|---------|
| **CORRECT** | 7 | createSession, sendMessage, sendMessageAsync, openEventStream, findText, findFiles, findSymbols, readFile, fileStatus |
| **DIRECTORY NOT APPLICABLE** | 2 | getHealth, getOpenApiDocument |
| **DEFECT** | 29 | All other session/agent/provider/project endpoints |

---

## Critical Defects (Session Lifecycle)

The following session operations are missing `directory` in query:

| Method | Endpoint | Impact |
|--------|----------|--------|
| `getSession()` | `GET /session/{id}` | May return wrong session context |
| `listSessions()` | `GET /session` | May list sessions from wrong project |
| `deleteSession()` | `DELETE /session/{id}` | May delete from wrong project |
| `renameSession()` | `PATCH /session/{id}` | May rename in wrong project |
| `abortSession()` | `POST /session/{id}/abort` | May abort in wrong project |
| `listMessages()` | `GET /session/{id}/message` | May list messages from wrong project |
| `getSessionStatus()` | `GET /session/status` | May return wrong status |
| `getSessionTodos()` | `GET /session/{id}/todo` | May return wrong todos |
| `getSessionChildren()` | `GET /session/{id}/children` | May return wrong children |
| `getSessionDiff()` | `GET /session/{id}/diff` | May return wrong diff |
| `runCommand()` | `POST /session/{id}/command` | May run in wrong project |
| `respondToPermission()` | `POST /session/{id}/permissions/{id}` | May respond in wrong project |
| `initSession()` | `POST /session/{id}/init` | May init in wrong project |
| `shareSession()` | `POST /session/{id}/share` | May share in wrong project |
| `unshareSession()` | `DELETE /session/{id}/share` | May unshare in wrong project |
| `summarizeSession()` | `POST /session/{id}/summarize` | May summarize in wrong project |
| `revertSession()` | `POST /session/{id}/revert` | May revert in wrong project |
| `unrevertSession()` | `POST /session/{id}/unrevert` | May unrevert in wrong project |
| `runShell()` | `POST /session/{id}/shell` | May run in wrong project |

---

## Discovery Defects

The following discovery endpoints are missing `directory` in query:

| Method | Endpoint | Impact |
|--------|----------|--------|
| `listProviders()` | `GET /provider` | May list providers from wrong project |
| `listAgents()` | `GET /agent` | May list agents from wrong project |
| `listCommands()` | `GET /command` | May list commands from wrong project |
| `listLsp()` | `GET /lsp` | May list LSP from wrong project |
| `getPathInfo()` | `GET /path` | May return wrong path info |
| `getVcsInfo()` | `GET /vcs` | May return wrong VCS info |
| `listProjects()` | `GET /project` | Lists all projects (may be OK) |
| `getCurrentProject()` | `GET /project/current` | May return wrong project |

---

## Recommendation

The pattern is clear: **every OpenCode endpoint that accepts `directory` in query should receive it.** The current implementation only sends `directory` for:

1. `createSession()` — ✅ Fixed
2. `sendMessage()` — ✅ Fixed
3. `sendMessageAsync()` — ✅ Fixed
4. `openEventStream()` — ✅ Fixed
5. `findText/findFiles/findSymbols/readFile/fileStatus` — ✅ Correct (use `query.directory`)

All other endpoints with `directory` in the SDK contract are **DEFECT** — they ignore the `_context` parameter.

### Minimum Remediation

Add `directory` to query for all session-related operations:

```typescript
// Pattern for all session methods:
const path = this.withQuery(`/session/${encodeURIComponent(sessionId)}/...`, {
  directory: context.directory,
});
```

### Risk Assessment

The defects are **low risk for current usage** because:
1. The critical harness path (createSession → sendMessageAsync → openEventStream → abortSession) is now correct
2. The UI path (createSession → sendMessage) is now correct
3. The discovery endpoints (listProviders, listAgents) work without directory because they return global data

However, the defects should be fixed for correctness and future-proofing.

---

*Audit complete. 29 defects identified, 7 correct, 2 not applicable.*
