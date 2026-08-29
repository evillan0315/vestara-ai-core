# ARX-015 M6 — OpenCode Contract & Client Extension: Frozen Evidence

**Milestone:** M6 — OpenCode Contract & Client Extension  
**Status:** ✅ FROZEN  
**Date:** 2026-08-27  
**Repository:** `vestara-ai-core` (authoritative)

---

## 1. Objective

Extend the OpenCode HTTP client for 11 capabilities present in the pinned OpenAPI spec but not yet implemented. Establish the `OpenCodeAdapterBoundary` for raw HTTP contract testing.

## 2. Implementation Summary

### 2.1 New Types Added (`opencode-types.ts`)

| Type | Purpose |
|------|---------|
| `OpenCodeActiveSessionInfo` | Active session status (`{ type: 'running' }`) |
| `OpenCodeModelRef` | Model reference for switching (`{ id, providerID, variant? }`) |
| `OpenCodeSessionDurableEvent` | Single durable event entry |
| `OpenCodeSessionHistory` | Paginated history response (`{ data, hasMore }`) |
| `OpenCodeQuestionOption` | Option within a question (`{ label, description? }`) |
| `OpenCodeQuestionInfo` | Individual question (`{ question, header, options, custom?, multiple? }`) |
| `OpenCodeQuestionTool` | Tool context for a question (`{ name, callID? }`) |
| `OpenCodeQuestionRequest` | Pending question from a session |
| `OpenCodeQuestionAnswer` | Answer array (array of label strings) |
| `OpenCodeQuestionReply` | Reply body (`{ answers: OpenCodeQuestionAnswer[] }`) |

### 2.2 Extended `OpenCodeClient` Interface (11 new methods)

| # | Method | OpenCode Spec Path | HTTP Method | Response |
|---|--------|--------------------|-------------|----------|
| 1 | `listActiveSessions()` | `GET /api/session/active` | GET | `{ data: { [ses_*]: ActiveSessionInfo } }` |
| 2 | `getSessionContext(sessionId)` | `GET /api/session/{id}/context` | GET | `{ data: SessionMessage[] }` |
| 3 | `getSessionHistory(sessionId, opts?)` | `GET /api/session/{id}/history` | GET | `SessionHistory` (paginated) |
| 4 | `switchSessionAgent(sessionId, agent)` | `POST /api/session/{id}/agent` | POST | 204 No Content |
| 5 | `switchSessionModel(sessionId, model)` | `POST /api/session/{id}/model` | POST | 204 No Content |
| 6 | `compactSession(sessionId)` | `POST /api/session/{id}/compact` | POST | 204 No Content |
| 7 | `interruptSession(sessionId)` | `POST /api/session/{id}/interrupt` | POST | 204 No Content |
| 8 | `waitSession(sessionId)` | `POST /api/session/{id}/wait` | POST | 204 No Content |
| 9 | `listQuestions(sessionId)` | `GET /api/session/{id}/question` | GET | `{ data: QuestionRequest[] }` |
| 10 | `replyToQuestion(sessionId, requestId, reply)` | `POST /api/session/{id}/question/{rid}/reply` | POST | 204 No Content |
| 11 | `rejectQuestion(sessionId, requestId)` | `POST /api/session/{id}/question/{rid}/reject` | POST | 204 No Content |

### 2.3 `OpenCodeAdapterBoundary` Class

Raw HTTP operations class for contract validation and escape-hatch access:

- `requestRaw(options)` → `RawHttpResponse { status, headers, body }`
- `getOpenApiDocument()` → raw spec from `/doc`
- `contractProbe(method, path, expectedStatus, body?)` → `{ ok, actualStatus, body }`

### 2.4 Normalizer Functions

Two standalone pure normalizers added to `opencode-http-client.ts`:

- `normalizeSessionDurableEvents(raw)` → `OpenCodeSessionDurableEvent[]`
- `normalizeQuestions(raw)` → `OpenCodeQuestionRequest[]`

Both handle non-array inputs, missing fields, and malformed entries gracefully.

## 3. Acceptance Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| ≥10 new client methods | ✅ 11 implemented | `opencode-client.ts` (11 new interface methods), `opencode-http-client.ts` (11 implementations) |
| `OpenCodeAdapterBoundary` exists | ✅ | `opencode-adapter-boundary.ts` (107 lines) |
| All new methods have tests | ✅ | `m6-opencode-contract.test.ts` (31 tests) |
| Existing tests pass | ✅ | 105/105 opencode-runtime tests pass |
| Build clean | ✅ | `pnpm lint:check` + `bash build-order.sh` pass |
| Zero live sessions in tests | ✅ | All tests use mocked fetch (no real OpenCode server) |
| Zero paid provider calls | ✅ | No provider invocations in tests |

## 4. Contract Alignment

All 11 M6 endpoints map directly to the pinned OpenAPI spec (`opencode.openapi.json`):

- All paths use the V1 `/api/` prefix as specified
- Path parameters: `sessionID` (pattern `^ses`) — encoded via `encodeURIComponent()`
- Question endpoints use `requestID` (pattern `^que`)
- Response envelopes: `{ data: T }` unwrapped via `unwrapData()` helper
- 204 No Content responses: `requestJson()` returns `undefined` for status 204

## 5. Frozen Invariants

### M6-INV-1: V1 Path Prefix
All M6 client methods use the `/api/` prefix. No M6 method uses a V2 (no prefix) path.

### M6-INV-2: Data Envelope Unwrapping
Responses with `{ data: T }` envelope are unwrapped by the `unwrapData()` helper before returning to callers.

### M6-INV-3: Question ID Encoding
Question request IDs are URL-encoded via `encodeURIComponent()` to prevent path traversal.

### M6-INV-4: Hermetic Test Isolation
All M6 tests use mocked `fetch` via `vi.stubGlobal()`. Zero live OpenCode sessions. Zero paid provider calls.

### M6-INV-5: Adapter Boundary Independence
`OpenCodeAdapterBoundary` does NOT depend on `OpenCodeClient`. It is a standalone class for contract validation.

### M6-INV-6: Session History Pagination
`getSessionHistory()` passes `limit` and `after` as query parameters. Undefined values are omitted.

### M6-INV-7: Model Switch Preserves ModelRef Shape
`switchSessionModel()` sends the `ModelRef` as-is (with `id`, `providerID`, optional `variant`) inside a `{ model: ModelRef }` wrapper.

## 6. Files Changed

| File | Change | Lines |
|------|--------|-------|
| `packages/opencode-runtime/src/client/opencode-types.ts` | Added 10 new types | +75 |
| `packages/opencode-runtime/src/client/opencode-client.ts` | Added 11 interface methods + imports | +50 |
| `packages/opencode-runtime/src/client/opencode-http-client.ts` | Added 11 method implementations + 2 normalizers + `unwrapData` | +195 |
| `packages/opencode-runtime/src/client/opencode-adapter-boundary.ts` | **NEW** — raw HTTP adapter class | +107 |
| `packages/opencode-runtime/src/index.ts` | Added exports for new types + adapter boundary | +20 |
| `packages/opencode-runtime/__tests__/m6-opencode-contract.test.ts` | **NEW** — 31 hermetic tests | +400 |

**Total:** ~847 lines added, 0 removed (purely additive milestone)

## 7. Test Results

```
Test Files  11 passed (11)
     Tests  105 passed (105)
  Duration  2.46s
```

All 11 opencode-runtime test files pass. The new M6 test file contributes 31 tests across 13 describe blocks.

## 8. Verification Command

```bash
pnpm lint:check && bash build-order.sh && pnpm --filter @vestara/opencode-runtime test
```

## 9. Milestone Frozen

This evidence document is frozen. No further modifications to M6 implementation under subsequent milestones.

---

**Frozen by:** Vestara Developer Agent  
**Date:** 2026-08-27  
**Commit range:** M6 implementation on `vestara-ai-core`
