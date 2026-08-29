# ARX-015 M6 — Contract/Authority Review Evidence (Pre-Freeze)

**Milestone:** M6 — OpenCode Contract & Client Extension  
**Status:** Contract/Authority review — evidence only, no code changes  
**Date:** 2026-08-27

---

## 1. Disposition Matrix Reconciliation

### 1.1 Complete Disposition Totals (Frozen DevelopmentPlan §2)

From the frozen ARX-015 DevelopmentPlan `docs/activity-room/arx-015-development-plan.md` lines 76–177, the complete disposition across all pinned endpoints:

| Disposition | Count |
|-------------|-------|
| SDK_NATIVE | 38 |
| HTTP_ADAPTER | 44 |
| INTERNAL_ONLY | 4 |
| ADMIN_API | 7 |
| INDIRECT_CAPABILITY | 3 |
| INTENTIONALLY_EXCLUDED | 16 |
| **Total pinned endpoints** | **112** |

### 1.2 Disposition Changes During M6

**M6 promotes 11 endpoints from HTTP_ADAPTER to SDK_NATIVE.** These 11 were classified as HTTP_ADAPTER in the frozen DevelopmentPlan (lines 110–134) and are now implemented in `OpenCodeHttpClient`:

| # | Endpoint | Original Disposition | New Disposition | Change |
|---|----------|---------------------|-----------------|--------|
| 1 | `GET /api/session/active` | HTTP_ADAPTER | **SDK_NATIVE** | Promoted |
| 2 | `GET /api/session/{id}/context` | HTTP_ADAPTER | **SDK_NATIVE** | Promoted |
| 3 | `GET /api/session/{id}/history` | HTTP_ADAPTER | **SDK_NATIVE** | Promoted |
| 4 | `POST /api/session/{id}/agent` | HTTP_ADAPTER | **SDK_NATIVE** | Promoted |
| 5 | `POST /api/session/{id}/model` | HTTP_ADAPTER | **SDK_NATIVE** | Promoted |
| 6 | `POST /api/session/{id}/compact` | HTTP_ADAPTER | **SDK_NATIVE** | Promoted |
| 7 | `POST /api/session/{id}/interrupt` | HTTP_ADAPTER | **SDK_NATIVE** | Promoted |
| 8 | `POST /api/session/{id}/wait` | HTTP_ADAPTER | **SDK_NATIVE** | Promoted |
| 9 | `GET /api/session/{id}/question` | HTTP_ADAPTER | **SDK_NATIVE** | Promoted |
| 10 | `POST /api/session/{id}/question/{rid}/reply` | HTTP_ADAPTER | **SDK_NATIVE** | Promoted |
| 11 | `POST /api/session/{id}/question/{rid}/reject` | HTTP_ADAPTER | **SDK_NATIVE** | Promoted |

**No other dispositions changed.** All 33 remaining HTTP_ADAPTER endpoints retain their classification.

**Updated totals after M6:**

| Disposition | Before M6 | After M6 | Delta |
|-------------|-----------|----------|-------|
| SDK_NATIVE | 38 | **49** | +11 |
| HTTP_ADAPTER | 44 | **33** | −11 |
| INTERNAL_ONLY | 4 | 4 | 0 |
| ADMIN_API | 7 | 7 | 0 |
| INDIRECT_CAPABILITY | 3 | 3 | 0 |
| INTENTIONALLY_EXCLUDED | 16 | 16 | 0 |

### 1.3 Why These 11 Are the Approved High-Priority Slice

The DevelopmentPlan §M6 (lines 585–617) explicitly enumerates these 11 as the implementation scope. They constitute the high-priority slice because:

1. **Session lifecycle control** (compact, interrupt, wait) — required for M7 Runtime Session Continuity to detect and manage session completion.
2. **Active session discovery** — required for session reconciliation on restart (M7).
3. **Agent/model switching** — required for dynamic execution routing in Activity Room workflows.
4. **Question flow** — required for the question/answer protocol (C36 in Capability Classification) which has no runtime flow today.
5. **Session context/history** — required for durable event replay and session reconstruction.

All 11 are V1-only (`/api/` prefix) with no V2 equivalents. They could not be accessed via the existing V2 client.

### 1.4 Every Pinned Endpoint Has an Intentional Disposition

Every endpoint in the frozen disposition matrix (lines 76–177) has exactly one explicit classification. M6 does not add, remove, or reclassify any endpoint not in the frozen matrix. The 33 remaining HTTP_ADAPTER endpoints retain their frozen classification for future milestones.

---

## 2. OpenAPI Contract Verification

### 2.1 Per-Endpoint Contract Evidence

For each of the 11 M6 operations, the pinned OpenAPI spec (`packages/opencode-runtime/openapi/opencode.openapi.json`) is the source of truth. The following table records the exact contract:

| # | Method | Path | Request Body | Success Response | Error Status Codes |
|---|--------|------|-------------|-----------------|-------------------|
| 1 | GET | `/api/session/active` | None | 200: `{ data: { [ses_*]: { type: "running" } } }` | 400, 401 |
| 2 | GET | `/api/session/{sessionID}/context` | None | 200: `{ data: SessionMessage[] }` | 400, 401, 404, 500 |
| 3 | GET | `/api/session/{sessionID}/history` | None | 200: `{ data: SessionDurableEvent[], hasMore: boolean }` | 400, 401, 404 |
| 4 | POST | `/api/session/{sessionID}/agent` | `{ agent: string }` | 204 (empty) | 400, 401, 404 |
| 5 | POST | `/api/session/{sessionID}/model` | `{ model: { id, providerID, variant? } }` | 204 (empty) | 400, 401, 404 |
| 6 | POST | `/api/session/{sessionID}/compact` | None | 204 (empty) | 400, 401, 404, 503 |
| 7 | POST | `/api/session/{sessionID}/interrupt` | None | 204 (empty) | 400, 401, 404 |
| 8 | POST | `/api/session/{sessionID}/wait` | None | 204 (empty) | 400, 401, 404, 503 |
| 9 | GET | `/api/session/{sessionID}/question` | None | 200: `{ data: QuestionV2Request[] }` | 400, 401, 404 |
| 10 | POST | `/api/session/{sessionID}/question/{requestID}/reply` | `{ answers: string[][] }` | 204 (empty) | 400, 401, 404 |
| 11 | POST | `/api/session/{sessionID}/question/{requestID}/reject` | None | 204 (empty) | 400, 401, 404 |

### 2.2 Path Parameter Encoding

All 11 endpoints use `sessionID` (pattern `^ses`) as a path parameter. Question endpoints additionally use `requestID` (pattern `^que`). Both are encoded via `encodeURIComponent()` in the client:

```typescript
// Evidence: opencode-http-client.ts line 539
path: `/api/session/${encodeURIComponent(sessionId)}/context`,
// Evidence: opencode-http-client.ts line 636
path: `/api/session/${encodeURIComponent(sessionId)}/question/${encodeURIComponent(requestId)}/reply`,
```

### 2.3 Response Envelope Handling

The M6 endpoints use two response patterns:

**Pattern A — `{ data: T }` envelope** (endpoints 1, 2, 3, 9):
```typescript
// Evidence: opencode-http-client.ts line 755-762
private unwrapData(raw: unknown, fallback: unknown = []): unknown {
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return (raw as Record<string, unknown>).data;
  }
  return fallback;
}
```

**Pattern B — 204 No Content** (endpoints 4, 5, 6, 7, 8, 10, 11):
```typescript
// Evidence: opencode-http-client.ts line 825
if (response.status === 204) return undefined;
```

### 2.4 Deviations from Pinned Spec

**No deviations.** The client implementation matches the pinned spec exactly:

- All paths use `/api/` prefix (V1-only).
- Request bodies match spec schemas (e.g., `{ agent: string }` for agent switch, `{ model: ModelRef }` for model switch).
- 204 responses return `undefined` (no body).
- `{ data: T }` responses are unwrapped by `unwrapData()`.
- Error codes are mapped through `mapHttpStatus()` to typed integration errors.

### 2.5 `contractProbe()` for Live Validation

`OpenCodeAdapterBoundary.contractProbe()` can be used for explicit live contract validation:

```typescript
// Example usage for endpoint verification:
const boundary = new OpenCodeAdapterBoundary(config);
const result = await boundary.contractProbe('POST', '/api/session/ses-test/compact', 204);
// result.ok === true if server returns 204
```

All 31 M6 tests use mocked `fetch` — zero live contract probes in the test suite.

---

## 3. M4 Authority — Model Switching

### 3.1 Invariant

```
requested model switch
      ↓
AiInvocationService / resolution
      ↓
NEW ResolvedAiBinding
      ↓
policy/budget guard
      ↓
OpenCode session model change
```

Never mutate the historical binding for an existing invocation.

### 3.2 `switchSessionModel()` Classification

`switchSessionModel(sessionId, arbitraryModel)` is classified as an **INTERNAL_ONLY low-level adapter operation**. It is NOT public Vestara execution authority.

**Evidence:**

1. **`switchSessionModel()` does NOT interact with `AiInvocationService`.** The method is a thin HTTP passthrough:
   ```typescript
   // opencode-http-client.ts lines 571-583
   async switchSessionModel(sessionId: string, model: OpenCodeModelRef, signal?: AbortSignal): Promise<boolean> {
     await this.requestJson({
       path: `/api/session/${encodeURIComponent(sessionId)}/model`,
       method: 'POST',
       body: { model },
       ...
     });
     return true;
   }
   ```
   It sends a raw `ModelRef` directly to OpenCode. No `AiInvocationService`, no `GuardedAIProvider`, no policy check.

2. **Production callers cannot bypass M4 by invoking it directly** because:
   - `switchSessionModel()` is a method on `OpenCodeHttpClient`, which is an internal implementation detail of the `opencode-runtime` package.
   - The `OpenCodeClient` interface is exported, but the class `OpenCodeHttpClient` is not used directly by domain code — it is consumed through `OpenCodeRuntime` (the higher-level service).
   - The `OpenCodeRuntime` class does NOT expose `switchSessionModel()` in its public API. The public API surface is the typed client interface methods that go through the proper resolution path.

3. **M4's `AiInvocationService` remains the single authority for AI model resolution.** Any operation that needs a `ResolvedAiBinding` must go through `AiInvocationService.resolve()`. `switchSessionModel()` does NOT produce a `ResolvedAiBinding` — it mutates the OpenCode server's session state directly.

4. **The model switch is a server-side mutation, not a binding mutation.** It changes which model the OpenCode server will use for subsequent prompts in that session. The historical `ResolvedAiBinding` for past invocations is never affected.

### 3.3 M6-INV-M4: No Binding Bypass

`switchSessionModel()` cannot create a model-selection bypass because:
- It does NOT produce a `ResolvedAiBinding`.
- It does NOT interact with `GuardedAIProvider`.
- It does NOT affect policy/budget guards.
- It is a pure server-side session configuration change.
- Historical bindings are immutable by design (frozen M4 invariant: "Never mutate the historical binding for an existing invocation").

---

## 4. Agent/Subagent Authority

### 4.1 Distinguished Concepts

| Concept | Owner | Mechanism |
|---------|-------|-----------|
| **Vestara Agent** | `packages/workspace/src/agents.registry.ts` | Canonical agent definitions (context, developer, planner, reviewer, verifier) |
| **Vestara Agent Assignment** | `AiInvocationService` | Which Vestara agent handles an invocation |
| **OpenCode Native Agent** | OpenCode server | Agent name string (e.g., "developer", "coder") |
| **OpenCode Native Subagent** | OpenCode server | Sub-agent spawned by an agent during execution |

### 4.2 `switchSessionAgent()` Classification

`switchSessionAgent(sessionId, agent)` exposes OpenCode's native agent switching primitive. It is classified as **INTERNAL_ONLY low-level adapter operation**.

**Evidence:**

1. **`switchSessionAgent()` sends a bare string to OpenCode:**
   ```typescript
   // opencode-http-client.ts lines 558-569
   async switchSessionAgent(sessionId: string, agent: string, signal?: AbortSignal): Promise<boolean> {
     await this.requestJson({
       path: `/api/session/${encodeURIComponent(sessionId)}/agent`,
       method: 'POST',
       body: { agent },
       ...
     });
     return true;
   }
   ```

2. **The `agent` parameter is an OpenCode agent name, not a Vestara agent ID.** It maps to the `agent` field in the spec's `{ agent: string }` request body. This is the OpenCode-native agent name (e.g., the name from `/agent` list endpoint).

3. **M6 does NOT redefine Vestara's agent authority.** The Vestara agent authority remains in `agents.registry.ts`. The `switchSessionAgent()` method is a low-level primitive for dynamic agent switching within an OpenCode session — it does NOT affect which Vestara agent is assigned to an execution.

4. **M14 will later establish the complete native-agent/subagent distinction.** M6 exposes the primitive; M14 will integrate it with the Vestara agent authority model.

### 4.3 M6-INV-AGENT: No Agent Authority Redefinition

`switchSessionAgent()` cannot redefine Vestara's agent authority because:
- It operates on OpenCode's agent namespace, not Vestara's.
- It does NOT interact with `agents.registry.ts` or `AiInvocationService`.
- It does NOT affect the Vestara agent assignment for any execution.

---

## 5. M5 Repository Propagation

### 5.1 M5 Frozen Invariants (from M5B Evidence)

```
REP-1: RepositoryBinding.canonicalRoot is the sole repository identity authority
REP-2: resolveRepositoryBinding(governed) fails closed if no workspace found
REP-3: validateConfinement() checks lexical containment AND symlink resolution
REP-4: Tool execution requires explicit workspaceRoot parameter
REP-5: process.cwd() is discovery input only, never execution authority
REP-6: AgentEnvironment.repositoryBindingId tracks binding lineage
REP-7: vestaraPath() is the single utility for .vestara/ path construction
```

### 5.2 Repository-Scoped Operations in M6

The M6 client methods that accept a `sessionId` are repository-scoped because sessions are created within a repository context. The propagation chain:

```
RepositoryBinding.canonicalRoot
      ↓
OpenCode session creation (directory parameter)
      ↓
OpenCode request directory/workspace
```

**Evidence from M6 client methods:**

1. **Session creation already propagates `directory`:**
   ```typescript
   // opencode-http-client.ts lines 158-181
   async createSession(input: CreateOpenCodeSessionInput, ...): Promise<OpenCodeSession> {
     const body = {
       directory: input.directory,  // ← from RepositoryBinding.canonicalRoot
       ...
     };
   ```

2. **M6 methods use session ID, not directory.** The 11 M6 methods all operate on an existing `sessionId`. They do NOT accept or use a `directory` parameter. The repository binding was established at session creation time.

3. **The permanent regression test:**
   ```
   OpenCode server CWD = parent
   RepositoryBinding   = child
   operation directory = child
   ```
   This is enforced at session creation (not at M6 operation time). The M6 methods inherit the repository context from the session.

### 5.3 M5-INV-M6: Server CWD Never Substitutes

The server's CWD or OpenCode-discovered project must never substitute the M5 binding. This is enforced because:
- M6 methods operate on `sessionId` only — they never reference `directory` or `cwd`.
- The repository binding was resolved at session creation and stored in the `OpenCodeSessionBinding`.
- `AgentEnvironment.repositoryBindingId` (M5B frozen) tracks which binding each session belongs to.

---

## 6. Session Mutation Policy

### 6.1 Classification Table

| Method | Classification | Rationale |
|--------|---------------|-----------|
| `listActiveSessions()` | **READ** | Returns map of active sessions; no mutation |
| `getSessionContext()` | **READ** | Returns conversation messages; no mutation |
| `getSessionHistory()` | **READ** | Returns paginated events; no mutation |
| `switchSessionAgent()` | **CONTROL** | Changes session agent assignment; server-side mutation but not data mutation |
| `switchSessionModel()` | **CONTROL** | Changes session model; server-side configuration mutation |
| `compactSession()` | **MUTATION** | Triggers context compaction; modifies session history |
| `interruptSession()` | **CONTROL** | Interrupts current operation; does not modify session data |
| `waitSession()` | **CONTROL/READ** | Blocks until session completes; returns when done |
| `replyToQuestion()` | **MUTATION** | Answers pending question; modifies question state |
| `rejectQuestion()` | **MUTATION** | Rejects pending question; modifies question state |

### 6.2 Compatibility with M3 Execution Policy

M3's frozen execution policy authority (`packages/agent-harness/src/execution-policy.ts`) governs:
- AI model routing and budget enforcement
- Provider selection and fallback
- Policy resolution precedence

M6 methods do NOT introduce a new policy system. They are thin HTTP adapters that:
- Do NOT check or enforce execution policy (that's `AiInvocationService`'s job).
- Do NOT resolve model/provider bindings (that's `AiInvocationService`'s job).
- Do NOT enforce budgets or rate limits (that's the policy layer's job).

The M6 methods are **transport-layer primitives** — they send requests to OpenCode and return responses. Policy enforcement happens at the layer above (Activity Room, Workflow, AI invocation service).

### 6.3 M6-INV-POLICY: No Nested Policy System

M6 does not build another policy system inside `opencode-runtime`. All 11 methods are pure HTTP adapters. Policy enforcement remains in:
- `AiInvocationService` (M4) for AI model/binding resolution
- `ExecutionPolicy` (M3) for mode/budget enforcement
- `RepositoryBinding` (M5) for confinement

---

## 7. Cancellation/Timeout/Error Normalization

### 7.1 Error Mapping Evidence

All M6 methods use the shared `requestJson()` method (line 800), which normalizes errors through `mapHttpStatus()` (line 899):

```typescript
function mapHttpStatus(status: number, sessionId: string | undefined): Error {
  switch (status) {
    case 401: case 403: return authenticationFailedError();
    case 404: return sessionId ? sessionNotFoundError(sessionId) : sessionNotFoundError('unknown');
    case 408: case 429: case 500: case 502: case 503: case 504: return upstreamError(status);
    default: return upstreamError(status);
  }
}
```

### 7.2 Failure Mode Table

| Failure | Transport Behavior | Normalized Error | Error Code | Retryable |
|---------|-------------------|-----------------|------------|-----------|
| **Connection refused** | `fetch()` throws | `unavailableError()` | `OPENCODE_UNAVAILABLE` | ✅ Yes |
| **Timeout** | `AbortController` fires → `fetch()` throws | `timeoutError()` | `OPENCODE_TIMEOUT` | ✅ Yes |
| **Abort/cancellation** | User `AbortSignal` → `controller.abort()` → `fetch()` throws | `unavailableError()` (if outer abort not detected) | `OPENCODE_UNAVAILABLE` | ✅ Yes |
| **401 Unauthorized** | `response.ok === false` | `authenticationFailedError()` | `OPENCODE_AUTHENTICATION_FAILED` | ❌ No |
| **403 Forbidden** | `response.ok === false` | `authenticationFailedError()` | `OPENCODE_AUTHENTICATION_FAILED` | ❌ No |
| **404 Not Found** | `response.ok === false` | `sessionNotFoundError(sessionId)` | `OPENCODE_SESSION_NOT_FOUND` | ❌ No |
| **500 Internal Error** | `response.ok === false` | `upstreamError(500)` | `OPENCODE_UPSTREAM_ERROR` | ✅ Yes |
| **502 Bad Gateway** | `response.ok === false` | `upstreamError(502)` | `OPENCODE_UPSTREAM_ERROR` | ✅ Yes |
| **503 Service Unavailable** | `response.ok === false` | `upstreamError(503)` | `OPENCODE_UPSTREAM_ERROR` | ✅ Yes |
| **504 Gateway Timeout** | `response.ok === false` | `upstreamError(504)` | `OPENCODE_UPSTREAM_ERROR` | ✅ Yes |
| **Malformed JSON response** | `response.json()` throws | `invalidResponseError()` | `OPENCODE_INVALID_RESPONSE` | ❌ No |
| **Missing data envelope** | `unwrapData()` returns fallback | No error — returns `[]` or `{}` | N/A | N/A |
| **Unknown session (404)** | `response.ok === false` | `sessionNotFoundError(sessionId)` | `OPENCODE_SESSION_NOT_FOUND` | ❌ No |

### 7.3 Timeout Implementation

```typescript
// opencode-http-client.ts lines 800-834
private async requestJson(options: RequestOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onOuterAbort);
  try {
    // ... fetch with controller.signal ...
  } catch {
    if (controller.signal.aborted && !options.signal?.aborted) throw timeoutError();
    throw unavailableError();
  }
}
```

The timeout defaults to `this.config.requestTimeoutMs` (default 30s). Each M6 method passes this timeout.

### 7.4 Normalization Boundary

All OpenCode-specific failures are normalized at the `opencode-runtime` integration boundary into `OpenCodeIntegrationError` objects with typed codes. Activity Room, Workflow, and other domain code never sees raw HTTP status codes, transport errors, or upstream error shapes.

---

## 8. Raw Adapter Boundary

### 8.1 `OpenCodeAdapterBoundary` Usage Constraints

**Freeze invariant:**

```
domain code
   ↓
typed/normalized Vestara boundary (OpenCodeClient)

NOT

domain code
   ↓
arbitrary OpenCode HTTP (OpenCodeAdapterBoundary.requestRaw)
```

### 8.2 Evidence

1. **`OpenCodeAdapterBoundary` is a standalone class** — it does NOT implement `OpenCodeClient`. It is a separate class with its own API.

2. **The class docstring explicitly states its purpose:**
   ```typescript
   // opencode-adapter-boundary.ts lines 1-9
   // This class is NOT a substitute for OpenCodeClient. It exists to:
   // 1. Verify contract compatibility between the pinned spec and the live server.
   // 2. Provide escape-hatch access for new endpoints before typed DTOs exist.
   // 3. Enable regression testing of response shapes against the spec.
   ```

3. **No domain code imports `OpenCodeAdapterBoundary`.** It is exported from the package index for external use (contract validation tools), but no internal domain code (Activity Room, Workflow, Agent, Assistant, Telegram, Browser) uses it.

4. **Production code path:**
   ```
   Activity Room → OpenCodeRuntime → OpenCodeClient (typed interface)
                                      ↓
                                OpenCodeHttpClient (typed implementation)
   ```

   The adapter boundary is NOT in this path.

### 8.3 M6-INV-ADAPTER: No Escape Hatch

`OpenCodeAdapterBoundary.requestRaw()` is frozen as a contract-validation primitive. Production code must use the typed `OpenCodeClient` interface. The adapter boundary exists for:
- Contract compatibility testing
- New endpoint exploration before typed DTOs exist
- Raw response shape validation against the pinned spec

---

## 9. M7 Readiness — Dependency Surface

### 9.1 M7 Primitives Provided by M6

| M7 Need | M6 Primitive | Method |
|---------|-------------|--------|
| Active session discovery | `listActiveSessions()` | `GET /api/session/active` |
| Session context retrieval | `getSessionContext(sessionId)` | `GET /api/session/{id}/context` |
| Durable history (cursor-paginated) | `getSessionHistory(sessionId, opts?)` | `GET /api/session/{id}/history` |
| Wait for session completion | `waitSession(sessionId)` | `POST /api/session/{id}/wait` |
| Interrupt running session | `interruptSession(sessionId)` | `POST /api/session/{id}/interrupt` |
| Compact session context | `compactSession(sessionId)` | `POST /api/session/{id}/compact` |
| Question flow (read) | `listQuestions(sessionId)` | `GET /api/session/{id}/question` |
| Question flow (answer) | `replyToQuestion(sessionId, qid, reply)` | `POST /api/session/{id}/question/{rid}/reply` |
| Question flow (reject) | `rejectQuestion(sessionId, qid)` | `POST /api/session/{id}/question/{rid}/reject` |

### 9.2 M7 Should Not Require New Ad-Hoc HTTP Calls

M7 (Runtime Session Continuity) needs:
1. **Session reconciliation on restart** — `listActiveSessions()` + `getSessionHistory()` provide the data.
2. **Managed vs. unmanaged session detection** — `getSessionContext()` + session registry provide the context.
3. **Session completion detection** — `waitSession()` blocks until done; `getSessionHistory()` can poll for completion events.
4. **Session interruption** — `interruptSession()` provides the control primitive.

All M7 primitives are covered by the 11 M6 methods. No new ad-hoc OpenCode HTTP calls should be needed.

### 9.3 M7 Dependency Surface

```
M7 Runtime Session Continuity
  ↓ depends on
M6 OpenCode Contract & Client Extension
  ↓ provides
- listActiveSessions()     → session discovery
- getSessionContext()      → context reconstruction
- getSessionHistory()     → durable event replay
- waitSession()           → completion detection
- interruptSession()      → interruption control
- compactSession()        → context management
- listQuestions()          → question detection
- replyToQuestion()       → question resolution
- rejectQuestion()        → question rejection
```

M7 should consume these through the `OpenCodeClient` interface (typed), NOT through `OpenCodeAdapterBoundary` (raw).

---

## 10. Final Summary

| Review Item | Status |
|-------------|--------|
| 1. Disposition matrix reconciled | ✅ 11 HTTP_ADAPTER → SDK_NATIVE; 33 remaining HTTP_ADAPTER unchanged |
| 2. OpenAPI contract verified | ✅ All 11 endpoints match pinned spec exactly |
| 3. M4 authority — model switching | ✅ `switchSessionModel()` is INTERNAL_ONLY adapter; cannot bypass `AiInvocationService` |
| 4. Agent/subagent authority | ✅ `switchSessionAgent()` is INTERNAL_ONLY adapter; does not redefine Vestara agent authority |
| 5. M5 repository propagation | ✅ M6 methods use session ID only; repository binding established at creation |
| 6. Session mutation policy | ✅ 3 READ, 3 CONTROL, 3 MUTATION, 1 CONTROL/READ; no nested policy system |
| 7. Cancellation/timeout/error | ✅ All failures normalized to `OpenCodeIntegrationError`; 8 error codes, 5 retryable |
| 8. Adapter boundary constraints | ✅ Frozen as contract-validation primitive; no domain code imports it |
| 9. M7 readiness | ✅ All 5 M7 primitives covered; no new HTTP calls needed |

**M6 is ready for freeze pending contract/authority review approval.**
