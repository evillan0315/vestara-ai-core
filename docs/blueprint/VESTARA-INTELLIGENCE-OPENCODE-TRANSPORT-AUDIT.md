# OpenCode Transport / Session Ownership Audit

**Date:** 2026-09-03
**Status:** Audit Complete — No Mutation
**Authorization:** Audit only

---

## A. Transport Inventory

### A.1 Official SDK

**OFFICIAL SDK NOT CURRENTLY USED AT RUNTIME.**

No `@opencode-ai/sdk` exists in any `package.json`, `pnpm-lock.yaml`, or runtime import. The only `@opencode-ai` reference is `@opencode-ai/plugin` in `.opencode/package.json` (documentation context, not runtime).

### A.2 Generated Contracts

| Artifact | Status | Runtime Use |
|----------|--------|-------------|
| `opencode-contracts.ts` (5,937 lines) | Generated from pinned OpenAPI spec | **NEVER IMPORTED** — CI guard only |
| `opencode.openapi.json` (40,377 lines) | Pinned OpenAPI schema | Reference artifact |
| `opencode-types.ts` (380 lines) | **Hand-written** Vestara-domain DTOs | **Active runtime types** |

The generated contracts prove schema alignment but are not consumed at runtime. The hand-written `opencode-types.ts` is the actual type boundary.

### A.3 Complete Transport Map

| Implementation | Transport | Target | Consumers | Generated? |
|----------------|-----------|--------|-----------|------------|
| `OpenCodeHttpClient` | `fetch()` + Basic auth | `127.0.0.1:4096` | All OpenCode HTTP calls | Hand-written |
| `OpenCodeProvider` | `fetch()` + Bearer token | `opencode.ai/zen/v1` | CLI commands, provider config | Hand-written |
| `OpenCodeGoProvider` | `fetch()` + Bearer token | `zen/go/v1` | CLI commands | Hand-written |
| `OpenAIProvider` | `fetch()` + Bearer token | `api.openai.com/v1` | CLI commands | Hand-written |
| `OpencodeAdapter` | `fetch()` + `execFile` | `127.0.0.1:4096` | External runtime discovery | Hand-written |
| `OpenCodeEventBridge` | SSE via `OpenCodeClient` | `127.0.0.1:4096/event` | Real-time events | Hand-written |
| Browser UI client | `fetch()` to API proxy | `/api/opencode/*` | Workspace UI | Hand-written |

### A.4 Three Distinct Transport Layers

| Layer | Target | Protocol | Use |
|-------|--------|----------|-----|
| **Local Headless** | `127.0.0.1:4096` | HTTP REST + SSE | Session management, generation, events |
| **Cloud API** | `opencode.ai/zen/v1` | OpenAI-compatible HTTP | LLM inference (CLI, provider config) |
| **Browser Proxy** | `/api/opencode/*` | HTTP to Vestara API | UI → API → OpenCode |

---

## B. `/api/sessions` Trace

### B.1 Two Separate Session Systems

| System | Endpoint | Storage | OpenCode Involvement |
|--------|----------|---------|---------------------|
| **Vestara Engineering Sessions** | `/api/sessions` | SQLite (`engineering_sessions` table) | **NONE** — local DB only |
| **OpenCode Sessions** | `/api/opencode/sessions` | OpenCode headless server | **YES** — HTTP proxy |

### B.2 `/api/sessions` (Vestara Engineering)

```
GET /api/sessions     → SessionService.listSessions() → SQLite SELECT
POST /api/sessions    → SessionService.createSession() → SQLite INSERT
GET /api/sessions/:id → SessionService.getSession() → SQLite SELECT
```

**No OpenCode involvement.** This is Vestara's internal session tracking.

### B.3 `/api/opencode/sessions` (OpenCode Proxy)

```
GET  /api/opencode/sessions          → client.listSessions(ctx)       → GET /session
POST /api/opencode/sessions          → client.createSession({title}, ctx) → POST /session?directory=...
GET  /api/opencode/sessions/:id      → client.getSession(id, ctx)     → GET /session/{id}
DELETE /api/opencode/sessions/:id    → client.deleteSession(id, ctx)  → DELETE /session/{id}
PATCH /api/opencode/sessions/:id     → client.renameSession(id, ...)  → PATCH /session/{id}
POST /api/opencode/sessions/:id/abort → client.abortSession(id, ctx)  → POST /session/{id}/abort
GET  /api/opencode/sessions/:id/messages → client.listMessages(id, ctx) → GET /session/{id}/message
POST /api/opencode/sessions/:id/messages → client.sendMessage(id, ...) → POST /session/{id}/message?directory=...
POST /api/opencode/sessions/:id/messages/async → client.sendMessageAsync(...) → POST /session/{id}/prompt_async
```

**All proxy through `OpenCodeHttpClient`** — hand-written HTTP client, not SDK.

### B.4 Directory Flow

```
WorkspaceContext.workspaceDir (workspace-context.ts:438)
    ↓
workspaceContext(_ctx) (opencode.ts:712-718)
    ↓
OpenCodeRequestContext.directory
    ↓
OpenCodeHttpClient.createSession() → query: ?directory=...
OpenCodeHttpClient.sendMessage()   → query: ?directory=...
OpenCodeHttpClient.listSessions()  → IGNORED (no directory)
OpenCodeHttpClient.getSession()    → IGNORED (no directory)
```

---

## C. Agent Control Generation Path

### C.1 Complete Call Graph

```
AgentCard.runAgent() (AgentCard.tsx:70)
    ↓ harnessApi.createRun(agent.id, { instruction })
    ↓ POST /api/agents/:agentId/runs
    ↓
agent-harness.ts:34-58 (route handler)
    ↓ harness.createThread({ taskId, title, environment })
    ↓ harness.run({ threadId, instruction, agentId, environment })
    ↓
AgentHarnessRuntime.continueTurn() (index.ts:607)
    ↓ resolveExecutionOverride(agentId) → { providerId, modelId, runtimeAgent }
    ↓ provider.complete({ model, messages, agent, title, ... })
    ↓
OpenCodeRuntimeProvider.complete() (runtime-provider.ts:199)
    ↓ createSession(title) → this.client().createSession({ title }, { workspaceId, directory })
    ↓ streamReply(sessionId, prompt, agent, model)
    ↓   sendMessageAsync(sessionId, { parts, agent, model }, context)
    ↓   openEventStream(context) → SSE
    ↓   for await (event of stream) { ... }
    ↓   abortSession(sessionId)
```

### C.2 Transport Identity

| Concern | Agent Control Path | /api/opencode/sessions Path |
|---------|-------------------|---------------------------|
| Client class | `OpenCodeHttpClient` | `OpenCodeHttpClient` |
| Client instance | **Cached singleton** (per provider) | **New instance per request** |
| Target server | `127.0.0.1:4096` | `127.0.0.1:4096` |
| Credentials | Same (env vars) | Same (env vars) |
| Session lifecycle | Ephemeral (create → use → abort) | Long-lived (interactive) |
| SSE consumption | Internal (streamReply) | External (EventBridge → browser) |

**Same class, different instances, same upstream server.**

---

## D. Session Ownership Overlap

### D.1 Capability Matrix

| Capability | OpenCodeRuntimeProvider | OpenCodeRuntimeService | /api/opencode routes |
|-----------|------------------------|----------------------|---------------------|
| Create session | ✅ (ephemeral, per-turn) | ❌ | ✅ (interactive) |
| Send message | ✅ (async, SSE-based) | ❌ | ✅ (sync + async) |
| Abort session | ✅ (always in finally) | ❌ | ✅ (user-initiated) |
| Delete session | ❌ | ❌ | ✅ |
| List sessions | ✅ (provider discovery) | ✅ (health/providers) | ✅ |
| Get session | ❌ | ❌ | ✅ |
| Rename session | ❌ | ❌ | ✅ |
| List messages | ❌ | ❌ | ✅ |
| Open event stream | ✅ (internal SSE) | ❌ | ✅ (EventBridge) |

### D.2 Classification

| Capability | Classification |
|-----------|---------------|
| Create session (ephemeral) | **LEGITIMATE SPECIALIZED PATH** — harness needs ephemeral sessions for agent turns |
| Create session (interactive) | **CANONICAL** — UI-driven session management |
| Send message (async + SSE) | **LEGITIMATE SPECIALIZED PATH** — harness needs streaming completion |
| Send message (sync) | **CANONICAL** — UI-driven message sending |
| Abort session | **CANONICAL** — user-initiated cancellation |
| List/get sessions | **CANONICAL** — UI session management |
| Event streaming | **CANONICAL** — UI real-time updates |

**No DUPLICATE found.** Each capability serves a distinct use case. The harness creates ephemeral sessions; the UI creates interactive sessions. They share the same upstream but serve different purposes.

---

## E. Generated OpenCode Contracts

### E.1 Generation Pipeline

```
OpenCode server (GET /doc)
    ↓ fetch-openapi.ts
openapi/opencode.openapi.json (pinned, 40K lines)
    ↓ generate-contracts.ts
src/generated/opencode-contracts.ts (5,937 lines, ~472 schemas)
    ↓ CI check (diff against committed file)
    ↓ Biome-excluded
    ↓ NEVER imported at runtime
```

### E.2 opencode-types.ts Status

**Hand-written Vestara-domain DTOs.** Not generated. Not derived from the OpenAPI spec. Independently maintained to provide normalized, safe types at the integration boundary.

### E.3 Relationship

The generated contracts and hand-written types model the same upstream system at different abstraction levels:
- `opencode-contracts.ts`: Raw upstream schema shapes (CI guard)
- `opencode-types.ts`: Vestara-domain DTOs (runtime boundary)

**No drift risk** — the CI enforces that generated contracts match the pinned schema. The hand-written types are intentionally different (normalized, camelCase, safe).

---

## F. Official SDK

**OFFICIAL SDK NOT CURRENTLY USED AT RUNTIME.**

No `@opencode-ai/sdk` in any `package.json`, `pnpm-lock.yaml`, or import statement. The entire OpenCode integration is hand-rolled `OpenCodeHttpClient` with raw `fetch()`.

---

## G. Project API

### G.1 OpenCode Projects

OpenCode maintains projects at:
```
GET /project → list all projects
GET /project/current → current project
```

### G.2 Vestara Project Relationship

| Property | Value |
|----------|-------|
| Session projectID | `59d6f60657d7b5d37fda08d80463119964e8fe97` |
| Project worktree | `/home/user/projects/vestara` (parent) |
| Vestara-ai-core projectID | `71578899bb5946c2ee769246d396b6dc7c0398ce` |
| Vestara-ai-core worktree | `/home/user/projects/vestara/vestara-ai-core` |

### G.3 Directory → Project Resolution

OpenCode resolves `directory` query parameter to a project:
- `?directory=/home/user/projects/vestara` → project `59d6f60...` (parent)
- `?directory=/home/user/projects/vestara/vestara-ai-core` → project `715788...` (vestara-ai-core)

### G.4 Vestara Exposes Project Info

`/api/opencode/project` proxies to OpenCode's `GET /project`. The Workspace UI can query project information.

### G.5 Session → Project Relationship

```
Vestara workspaceDir → OpenCode query.directory → OpenCode Project resolution → projectID → Session
```

The session's `projectID` and `directory` are determined by OpenCode's project resolution from the `?directory=` query parameter.

---

## H. Architecture Output

### H.1 Session Management

```
Workspace UI
    ↓ fetch('/api/opencode/sessions')
Vestara API (opencode.ts)
    ↓ OpenCodeHttpClient (new instance per request)
OpenCode Headless Server (127.0.0.1:4096)
    ↓ REST API
OpenCode Session Store
```

**Classification: CANONICAL**

### H.2 Agent Control Generation

```
Workspace UI (AgentCard)
    ↓ fetch('/api/agents/:id/runs')
Vestara API (agent-harness.ts)
    ↓ AgentHarnessRuntime
    ↓ OpenCodeRuntimeProvider (cached OpenCodeHttpClient)
OpenCode Headless Server (127.0.0.1:4096)
    ↓ REST + SSE
OpenCode Session (ephemeral)
```

**Classification: LEGITIMATE SPECIALIZED PATH**

### H.3 Workflow Generation

```
Workflow Orchestrator
    ↓ AgentHarnessRuntime (same as Agent Control)
    ↓ OpenCodeRuntimeProvider (same cached client)
OpenCode Headless Server (127.0.0.1:4096)
```

**Classification: LEGITIMATE SPECIALIZED PATH** (same infrastructure as Agent Control)

### H.4 Activity Room / OpenCode Observation

```
Workspace UI
    ↓ fetch('/api/opencode/events')
Vestara API (opencode.ts)
    ↓ OpenCodeEventBridge (persistent SSE)
    ↓ EventBus → Activity Room projection
OpenCode Headless Server (127.0.0.1:4096)
    ↓ SSE /event endpoint
```

**Classification: CANONICAL**

### H.5 Permissions

```
Workspace UI
    ↓ fetch('/api/opencode/sessions/:id/permissions')
Vestara API (opencode.ts)
    ↓ OpenCodeHttpClient
OpenCode Headless Server (127.0.0.1:4096)
```

**Classification: CANONICAL**

### H.6 Events / SSE

```
Workspace UI (useEventStream)
    ↓ WebSocket/SSE
Vestara API (session-stream.ts)
    ↓ OpenCodeEventBridge
    ↓ EventBus
OpenCode Headless Server (127.0.0.1:4096)
    ↓ SSE /event endpoint
```

**Classification: CANONICAL**

### H.7 Project Discovery

```
Workspace UI
    ↓ fetch('/api/opencode/project')
Vestara API (opencode.ts)
    ↓ OpenCodeHttpClient
OpenCode Headless Server (127.0.0.1:4096)
    ↓ GET /project
```

**Classification: CANONICAL**

### H.8 Provider/Model Resolution

```
Workspace UI (ProviderSettingsPanel)
    ↓ fetch('/api/routing/catalog')
Vestara API (routing.ts)
    ↓ ProviderManager → EngineeringProviderCatalog
    ↓ OpenCodeRuntimeProvider.discoverProviders()
    ↓ OpenCodeHttpClient.listProviders()
OpenCode Headless Server (127.0.0.1:4096)
    ↓ GET /provider
```

**Classification: CANONICAL**

---

## I. Classification Summary

| Transport/Capability | Classification | Notes |
|---------------------|---------------|-------|
| `OpenCodeHttpClient` | **CANONICAL** | Single HTTP transport to OpenCode server |
| `OpenCodeProvider` (cloud) | **CANONICAL** | Separate cloud transport, not local headless |
| `/api/opencode/sessions` | **CANONICAL** | UI session management |
| Agent Control generation | **LEGITIMATE SPECIALIZED PATH** | Ephemeral sessions, streaming |
| Workflow generation | **LEGITIMATE SPECIALIZED PATH** | Same infrastructure as Agent Control |
| `/api/sessions` | **CANONICAL** | Vestara internal sessions (no OpenCode) |
| `OpenCodeEventBridge` | **CANONICAL** | SSE → EventBus bridge |
| `OpenCodeRuntimeService` | **CANONICAL** | Health/providers listing |
| `OpencodeAdapter` | **LEGITIMATE SPECIALIZED PATH** | External runtime discovery |
| Generated contracts | **CI GUARD** | Reference artifact, not runtime |
| `@opencode-ai/sdk` | **NOT USED** | No official SDK dependency |

### No DUPLICATE or DEAD transports found.

---

## J. Minimum Consolidation Recommendation

### Current State: Acceptable

The transport architecture is clean:
1. **Single HTTP transport**: `OpenCodeHttpClient` handles all OpenCode communication
2. **No duplicate sessions**: Harness creates ephemeral sessions; UI creates interactive sessions
3. **No duplicate transport layers**: All paths converge on `OpenCodeHttpClient` → `127.0.0.1:4096`
4. **Generated contracts are CI guards**: Not runtime dependencies

### Future Consideration (Not Required Now)

If session ownership becomes complex (e.g., harness needs to query/rename sessions), consider:
1. Adding session query methods to `OpenCodeRuntimeProvider`
2. Sharing `OpenCodeHttpClient` instances between harness and API routes

**No immediate action required.** The current architecture is sound.

---

*Audit complete. No mutation performed.*
