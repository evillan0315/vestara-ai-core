---
title: "ARX-015 REC-C2-I2 PREFLIGHT: HTTP Identity, Trust & Structured Response Ingress Audit"
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015 REC-C2-I2 PREFLIGHT: HTTP Identity, Trust & Structured Response Ingress Audit

**Date**: 2026-08-29
**Status**: AUDIT COMPLETE — NOT AUTHORIZATION
**Frozen baselines**: AR-REC-A `355922b`, AR-REC-B `5dc54ba`, AR-REC-C1 `fc30f8b`, AR-REC-C2-D1 `83e68cc`, AR-REC-C2-I1 `4418709`

---

## Executive Conclusion

I2 can proceed using existing auth/identity authority with a bounded interaction-layer contract correction (Recommendation **B**). The existing `authenticate()` function provides `AuthUser.id` and `AuthUser.name` which are authoritative for server-derived participant identity. The HTTP API already has established conventions for POST mutation routes with manual validation. The frozen B contract cleanly permits server-side construction of `InteractionResponse` from a minimal client request (`interactionId` + `choiceId`). However, a bounded correction is required: `validateResponseForInteraction()` currently does not check for pre-existing responses, and the service throws a raw UNIQUE constraint violation rather than returning a structured idempotent/conflict result. These are transport-layer concerns, not persistence-authority changes.

---

## I2-P1 — Existing Authentication Path

### Production Call Graph

```
HTTP Request
  │
  ├─ server.ts:337 ── http.createServer callback
  │   │
  │   ├─ server.ts:355 ── requestContext.derive(req, pathname)
  │   │   └─ request-context.ts:53-63
  │   │       Extracts: requestId, actor (X-Vestara-Actor), remoteAddress, userAgent
  │   │       STORED IN: AsyncLocalStorage (logging metadata only, NOT auth)
  │   │
  │   └─ server.ts:481 ── dispatcher.dispatch(method, pathname, req, res, ctx, port, url)
  │       │
  │       └─ router.ts:76-78 ── iterates RouteGroup[] in registration order
  │           │
  │           └─ routes/<handler>.ts ── per-route handler
  │               │
  │               ├─ [PUBLIC ROUTES] ── no auth call
  │               │
  │               └─ [AUTHENTICATED ROUTES] ── requireRole(req, ctx, 'editor', res)
  │                   │
  │                   ├─ auth.ts:70 ── authenticate(req, ctx.users)
  │                   │   ├─ Extract Authorization header
  │                   │   ├─ Match /^Bearer\s+(.+)$/i
  │                   │   ├─ userStore.findByToken(token) ── SQLite SELECT
  │                   │   │   ├─ Hit: return { id, name, type:'user', role }
  │                   │   │   └─ Miss: fall through to anonymous
  │                   │   └─ Fallback:
  │                   │       ├─ Read X-Vestara-Actor header
  │                   │       ├─ Default to 'local-operator'
  │                   │       └─ Return { id: name, name, type:'user', role:'admin' }
  │                   │
  │                   └─ auth.ts:71 ── hasRole(user, minimum)
  │                       ├─ Pass: return AuthUser
  │                       └─ Fail: 403 Forbidden JSON, return null
```

### Boundary Inventory

| Boundary | File | Owns | Authoritative Data | Failure |
|---|---|---|---|---|
| Request context | `request-context.ts:53-63` | `apps/api` | `requestId`, `actor` (logging) | Never fails |
| Token lookup | `auth.ts:23-52` + `user-store.ts` | `@vestara/workspace` | `User.id`, `User.username`, `User.role` from SQLite | Falls through to anonymous |
| Role check | `auth.ts:55-58` | `apps/api` | Role hierarchy (viewer < editor < admin) | 403 if insufficient |
| Anonymous fallback | `auth.ts:42-51` | `apps/api` | `local-operator`, `admin` role | Never fails |

### Key Findings

1. **No Fastify** — the API uses raw `http.createServer`. No plugin/hook system.
2. **No global auth middleware** — each route handler calls `requireRole()` or `getActor()` independently.
3. **Unauthenticated requests receive `admin` role** by design (local-first dev tool).
4. **No 401 rejection for missing tokens** at the route level — only 403 for insufficient role.
5. **`AuthUser` is the entire auth context** — no `Principal`, `PrincipalKind`, or `authContext` types.
6. **`Authorization` header NOT in CORS `Access-Control-Allow-Headers`** — browser clients may face CORS issues with Bearer tokens unless preflight is handled.

---

## I2-P2 — Server-Derived Participant Identity

### Existing Identity Sources

| Source | Type | Values | Where |
|---|---|---|---|
| `AuthUser.id` | `string` | `user.id` (SQLite) or `actorName` or `'local-operator'` | `auth.ts:32-37, 46-51` |
| `AuthUser.name` | `string` | `user.username` or `actorName` or `'local-operator'` | `auth.ts:33-34, 47-48` |
| `X-Vestara-Actor` header | `string` | Arbitrary header value | `auth.ts:43-44` |
| `actorOf(req)` | `string` | Header value or `'local-operator'` | `routes/types.ts:31-34` |
| `getActor(req, ctx)` | `AuthUser` | Full auth result | `routes/types.ts:36-39` |

### Identity Fallback Chains

| Context | Chain | Default |
|---|---|---|
| API route handler | `Bearer token → UserStore.findByToken → X-Vestara-Actor → 'local-operator'` | `'local-operator'` |
| M9 human message | `event.actor.id → payload.userId` | `'local'` |
| M9 interaction response | `payload.respondingParticipantId → event.actor.id` | `'local'` |
| Conversation creation | `userId parameter` | `'local'` |
| Activity Room participant | `composeParticipants()` → M10 projection | N/A |

### Can respondingParticipantId be derived from existing authority?

**YES.** `AuthUser.id` is authoritative when a Bearer token is presented. For unauthenticated requests, `AuthUser.id` defaults to `'local-operator'`. The `respondingParticipantId` should be `authUser.id` — the server-derived identity, never client-supplied.

### Can respondingParticipantName be derived from existing authority?

**YES.** `AuthUser.name` provides the display name. For authenticated users, this is `user.username`. For anonymous, `'local-operator'`.

### Canonical Candidate

- `respondingParticipantId` ← `authUser.id`
- `respondingParticipantName` ← `authUser.name`

---

## I2-P3 — Local Human Semantics

### Audit of `local` / `human-local` / `local-operator`

| Value | Type | Classification | Where |
|---|---|---|---|
| `'local'` | Human fallback | Development placeholder / default | M9 bridge fallback (lines 360-369, 471-489, 534-535), conversation default (line 107) |
| `'human-local'` | Activity test fixture | Test identity, not canonical | Interaction contract tests, activity-projection tests |
| `'local-operator'` | API auth fallback | Anonymous identity for unauthenticated requests | `auth.ts:44, 46-51`, `routes/types.ts:34` |
| `'local-user'` | Test fixture | Test-only | `interaction-store.test.ts`, `interaction-service.test.ts` |

### Finding

These are **development placeholders and test fixtures**, not canonical production identities. Using `'local-operator'` as the authoritative responder identity for structured responses would preserve a historical shortcut. The correct identity is `authUser.id` from the authenticated request context, which may be a real user ID (from `UserStore`) or the anonymous fallback. This is the existing authority — no new subsystem is needed.

### Migration Note

Existing M9 activity records using `'local'` as a participant ID are projection-layer artifacts. The I2 ingress should use `authUser.id`, which for unauthenticated requests will be `'local-operator'`. This is the correct identity for that request context. No normalization or migration of existing records is required or authorized.

---

## I2-P4 — Existing Route Conventions

### Canonical POST Mutation Route Pattern

```typescript
// 1. Authentication (opt-in per route)
if (!requireRole(req, ctx, 'editor', res)) return true;

// 2. Read + parse body
const raw = await readBody(req);
const body = raw ? JSON.parse(raw) : {};

// 3. Extract + validate required fields
const value = typeof body.field === 'string' ? body.field.trim() : '';
if (!value) {
  json(res, 400, { error: 'field is required' });
  return true;
}

// 4. Extract actor
const actor = getActor(req, ctx);

// 5. Execute
const result = await ctx.service.doThing(...);

// 6. Audit log (optional)
logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.XXX, 'resource', id, details);

// 7. Response
json(res, 201, { resource: result });
```

### HTTP Status Codes

| Code | Usage |
|---|---|
| `200` | Successful GET/PUT/PATCH/DELETE |
| `201` | Resource creation (POST) |
| `202` | Accepted async (OpenCode message dispatch) |
| `400` | Malformed request, missing required fields |
| `403` | Role-based access denial (via `requireRole`) |
| `404` | Resource not found |
| `409` | Conflict (duplicate, state conflict) |
| `500` | Internal errors, catch-all |

### Error Envelope

Two patterns coexist:
- **Simple**: `{ "error": "message" }` (most routes)
- **Structured**: `{ "error": { "code": "CODE", "message": "..." } }` (activity room, marketplace)

### Notable Conventions

- **No TypeBox/Zod** — all validation is manual `typeof` checks
- **No schema-level `additionalProperties: false`** — extra JSON fields are silently ignored
- **Body limits**: 1 MB max, 15s timeout, incremental size checking (`http/body.ts`)
- **JSON content-type enforcement**: `requireJsonContentType()` rejects non-JSON
- **Request ID**: `X-Request-Id` header or `randomUUID()`, attached to every response
- **Actor logging**: `getActor(req, ctx)` for audit trail
- **No response envelope standard** — varies per route group

---

## I2-P5 — Minimum Request Contract

### Minimum Client Submission

```typescript
{
  "choiceId": "..."  // ChoiceId — the selected choice
}
```

### Route Path vs Body

- `interactionId` → **route path** (`POST /api/interactions/:interactionId/responses`)
  - Follows existing convention: resource ID in path for scoped mutations (e.g., `POST /api/agents/:id/run`, `POST /api/conversations/:id/messages`)
- `choiceId` → **request body** (the only client-controlled field)

### Server-Generated Fields (MUST NOT be client-supplied)

| Field | Source | Reason |
|---|---|---|
| `responseId` | `randomUUID()` with prefix | Server identity authority |
| `respondingParticipantId` | `authUser.id` | Server-derived from auth context |
| `respondingParticipantName` | `authUser.name` | Server-derived from auth context |
| `respondedAt` | `new Date().toISOString()` | Server clock authority |
| `correlationId` | `requestId` from request context | Optional, derived from request provenance |

### Frozen B Contract Compatibility

`InteractionResponse` (interaction.ts:123-150) requires:
- `responseId` — server generates
- `interactionId` — from route path
- `selectedChoiceId` — from request body
- `respondingParticipantId` — from `authUser.id`
- `respondingParticipantName` — from `authUser.name`
- `respondedAt` — server clock
- `correlationId?` — optional, from `requestId`

The frozen contract cleanly permits server construction from minimal client input. No contract change is needed for I2.

### What the Client MUST NOT Establish

Per the frozen B contract (interaction.ts:285-295), the client cannot provide:
- `responseId` (server identity)
- `respondingParticipantId` / `respondingParticipantName` (server auth context)
- `respondedAt` (server clock)
- Any `command`, `operation`, `handler`, `approval`, `metadata`, `context`, `payload`, or executable semantics
- `interactionId` is from the route path, not the body (prevents cross-interaction injection)

---

## I2-P6 — Response Identity/Time Generation

### ID Generation Conventions

| Pattern | Example | Where |
|---|---|---|
| `randomUUID()` | `550e8400-e29b-41d4-a716-446655440000` | Request context, activity room messages |
| `prefix-${Date.now()}-${counter}` | `conv-1693000000000-1` | Conversations, messages |
| `prefix-${Date.now()}-${random}` | `exs-1693000000000-a3` | Sessions |

### Recommendation

Use `randomUUID()` from `node:crypto` for `responseId`. This matches the newer convention (activity room messages, request IDs) and avoids timestamp-based correlation issues.

- `responseId` → `randomUUID()` (or `resp-${randomUUID()}` for prefix convention)
- `respondedAt` → `new Date().toISOString()`
- `correlationId` → `requestContext.current().requestId` (optional, derived from request provenance)

### correlationId Semantics

`correlationId` in the frozen B contract (interaction.ts:146-149) is:
- "Correlation/provenance for safe replay"
- "Used to detect and reject duplicate responses"

At the HTTP layer, `correlationId` should be:
- **Request-context-derived** from `X-Request-Id` header or generated `requestId`
- **Optional** — the client need not provide it
- **NOT** response deduplication authority (the frozen rule)

---

## I2-P7 — Same-Choice Retry and Conflict Semantics

### Current Durable Behavior

```
first response:
  → validateResponseForInteraction() checks choiceId exists
  → recordResponse() does UNIQUE INSERT on interaction_id
  → succeeds → returns InteractionResponse

second response (same interaction, same choice):
  → validateResponseForInteraction() passes (choice exists)
  → recordResponse() UNIQUE INSERT on interaction_id
  → throws UNIQUE constraint violation
  → service throws raw error

second response (same interaction, different choice):
  → validateResponseForInteraction() passes (choice exists)
  → recordResponse() UNIQUE INSERT on interaction_id
  → throws UNIQUE constraint violation
  → service throws raw error
```

### Existing Lookup Capability

`InteractionPersistencePort.getResponse(interactionId)` returns `PersistedResponse | undefined`. This is sufficient to recover the existing authoritative response after detecting a conflict.

### Distinguishing Idempotent vs Conflict

To distinguish same-choice retry from conflicting choice:

1. Attempt `recordResponse()` (UNIQUE insert)
2. On UNIQUE failure, call `getResponse(interactionId)` to retrieve existing
3. Compare `existing.selectedChoiceId` with `request.selectedChoiceId`:
   - **Same choice** → idempotent: return existing response (200)
   - **Different choice** → conflict: return 409

### Recommended HTTP Semantics

| Scenario | HTTP | Body |
|---|---|---|
| New response (first) | `201 Created` | `{ response: InteractionResponse }` |
| Same-choice retry | `200 OK` | `{ response: InteractionResponse }` (existing) |
| Conflicting choice | `409 Conflict` | `{ error: "Response already recorded for this interaction" }` |
| Unknown interaction | `404 Not Found` | `{ error: "Interaction not found" }` |
| Invalid choiceId | `400 Bad Request` | `{ error: "Invalid choice" }` |

### Boundary Clarification

This retry/conflict logic is a **transport-layer concern** in the route handler or a thin service method. It does NOT change the frozen persistence authority (`InteractionPersistencePort.recordResponse()` still uses UNIQUE constraint). The service layer adds a catch-and-compare pattern around the existing persistence call.

---

## I2-P8 — Mechanical Validation Boundary

### What I2 CAN Establish (Transport/Mechanical)

| Check | Authority | Evidence |
|---|---|---|
| Interaction exists | `InteractionPersistencePort.get()` | I1 frozen |
| Choice exists in immutable interaction | `validateResponseForInteraction()` | B frozen |
| Request is authenticated | `requireRole()` / `authenticate()` | `auth.ts` |
| Responder identity is server-derived | `authUser.id` / `authUser.name` | `auth.ts` |
| Interaction has no authoritative response | `hasResponse()` | I1 frozen |
| Same-choice retry | `getResponse()` + comparison | I2-P7 above |
| Conflicting-choice response | `getResponse()` + comparison | I2-P7 above |
| Request body is valid JSON | `readBody()` + `JSON.parse()` | `http/body.ts` |
| Body size within limits | `readBody()` max bytes | `http/body.ts` |

### What I2 MUST NOT Establish (Domain/Downstream)

| Check | Owner | Status |
|---|---|---|
| Package still exists | Unknown domain owner | Unresolved |
| Recommendation is still useful | Unknown domain owner | Unresolved |
| Repository still has same state | Unknown domain owner | Unresolved |
| Permission still valid | Unknown domain owner | Unresolved |
| Policy still permits operation | Unknown domain owner | Unresolved |
| Workflow should start | Workflow/Orchestration | Outside I2 |
| Agent should execute | Agent/Harness | Outside I2 |
| Human choice constitutes approval | Governance | Outside I2 |
| Underlying domain action remains valid | Domain owner | Unresolved |

The interaction layer must not pretend it can determine domain-specific staleness merely from age or timestamps. These checks belong to downstream consumers who interpret the response.

---

## I2-P9 — Staleness

### What "Stale Interaction" Can Truthfully Mean

At the I2 transport layer, staleness can only mean:

1. **Mechanically unavailable interaction** — `get(interactionId)` returns `undefined` → 404
2. **Already responded interaction** — `hasResponse(interactionId)` returns `true` → idempotent or conflict
3. **Conflicting response** — existing response has different `selectedChoiceId` → 409

### What I2 CANNOT Determine

- Whether the underlying package/recommendation/plan still exists
- Whether the repository state has changed since the interaction was presented
- Whether the human's choice is still relevant
- Whether downstream domain conditions have expired

The generic interaction layer must not introduce an interaction expiry policy. Staleness evaluation against current system state is a downstream concern.

---

## I2-P10 — Authorization Semantics

### Existing Auth Capability Patterns

| Layer | Mechanism | Scope |
|---|---|---|
| HTTP RBAC | `requireRole('editor')` | Route-level, 3-tier |
| Session ownership | `requireSessionOwnership()` | OpenCode sessions |
| Permission governance | `InMemoryPermissionRegistry` | Tool execution approval |
| Kernel RBAC | `PermissionManager` (8 roles, ~20 ops) | Not wired to HTTP API |
| Agent permissions | `AgentPermission` tuples | Per-agent, per-resource |

### Is Authentication Sufficient for Response Ingress?

**YES, for this narrow response ingress.** The conversation routes (`POST /api/conversations/:id/messages`) have zero authorization — anyone can send a message to any conversation. The interaction response route should follow the same pattern: authentication (via `requireRole`) is sufficient. No additional `interaction.respond` permission is needed.

### Is Conversation/Interaction Membership Required?

**NO.** Conversations have no membership model. Any client who knows a conversation ID can interact with it. The interaction response route should not introduce membership checks that don't exist elsewhere.

### Does an Existing Authorization Capability Already Apply?

**NO.** There is no `interaction.respond` permission. The kernel-level `PermissionManager` is not wired to the HTTP API. Creating such a permission would be an architecture change outside I2 scope.

### Separation

- **Permission to respond conversationally** → authentication (existing `requireRole`)
- **Permission to perform whatever downstream operation the response might eventually imply** → downstream governance, outside I2

---

## I2-P11 — Conversation Binding

### StructuredInteraction.conversationId

- **Optional** (`readonly conversationId?: string`) by design (interaction.ts:72-75)
- "Undefined when the interaction is not conversation-contextualized"
- The B contract is domain-neutral and may exist outside conversation context

### Conversation Ownership

- Conversations have **no membership model** — identified by ID only
- `ConversationService.sendMessage()` loads by ID, throws if not found
- No ownership validation at the service level
- Route-level: `POST /api/conversations/:id/messages` has zero auth

### Cross-Conversation Contamination

- Prevented by service-level ID-based isolation, not ownership checks
- `conversationId` is consistently treated as correlation, not execution identity (ARX-015 fail-closed pattern)

### Route Decision

- If `StructuredInteraction.conversationId` is set, the route MAY validate that the interaction belongs to the expected conversation
- If `conversationId` is absent (domain-neutral interaction), no conversation binding is needed
- The route should NOT require a conversation context — the B contract explicitly allows non-conversation interactions

---

## I2-P12 — Proposed Route Shape

### Recommended Route

```
POST /api/interactions/:interactionId/responses
```

### Request Schema

```json
{
  "choiceId": "string (required)"
}
```

No other client-supplied fields. The route handler ignores extra properties.

### Server-Derived Fields

```typescript
const response: InteractionResponse = {
  responseId: randomUUID() as ResponseId,
  interactionId: interactionId from route path,
  selectedChoiceId: body.choiceId,
  respondingParticipantId: authUser.id,
  respondingParticipantName: authUser.name,
  respondedAt: new Date().toISOString(),
  correlationId: requestId from request context,
};
```

### Response Semantics

| Scenario | Status | Body |
|---|---|---|
| New response created | `201 Created` | `{ response: InteractionResponse }` |
| Same-choice retry (idempotent) | `200 OK` | `{ response: InteractionResponse }` |
| Conflicting choice | `409 Conflict` | `{ error: "Response already recorded for this interaction" }` |
| Interaction not found | `404 Not Found` | `{ error: "Interaction not found" }` |
| Invalid choiceId | `400 Bad Request` | `{ error: "Invalid choice" }` |
| Malformed body | `400 Bad Request` | `{ error: "Invalid JSON" }` or `{ error: "choiceId is required" }` |
| Unauthenticated (if auth required) | `403 Forbidden` | `{ error: "Forbidden: requires role 'editor' or higher" }` |
| Publication failed (M9 down) | `201 Created` | `{ response: InteractionResponse }` |
| Body too large | `413` | (handled by `readBody()`) |

### Auth Requirement

`requireRole(req, ctx, 'editor', res)` — matches mutation route convention.

### Audit Logging

```typescript
logAudit(ctx.audit, req, actor.id, actor.name, 'interaction.respond', 'interaction', interactionId, { choiceId });
```

---

## I2-P13 — Publication Failure at HTTP Boundary

### I1 Separation

I1 intentionally separates:
1. Authoritative response committed (in `interaction_responses` table)
2. M9 publication acknowledged (`interaction_publication_ledger`)

The `deliveryVerifier.wasDelivered(eventId)` check determines whether M9 received the event.

### HTTP Behavior Analysis

**Case 1: Response committed, M9 delivery succeeds**
→ `201 Created` with response. Normal path.

**Case 2: Response committed, M9 delivery fails**
→ `deliveryVerifier.wasDelivered()` returns false
→ `verifyAndAcknowledge()` throws `"Projection delivery failed"`
→ The authoritative response IS committed, but the service throws before returning to the route handler
→ The route handler sees an error

**The critical question**: What should HTTP return?

**Recommended: `201 Created`** — the authoritative response committed. The publication failure is an internal concern that does not affect the client's contracted result.

**Rationale**:
- The response is durable and authoritative regardless of M9 state
- Returning an error would encourage the client to retry, creating a second conflicting response
- The existing codebase pattern is: "projection failures must not break the primary response" (opencode.ts:179-184, memory projection:156)
- Recovery handles publication on restart — the client need not know

**Implementation**: The route handler should catch the publication-verification error from `InteractionService.recordResponse()` and still return `201 Created`. The publication ledger remains pending for recovery. This is a transport-layer adaptation, not a persistence-authority change.

---

## I2-P14 — Security Matrix

| Attack Vector | Mechanism | Status |
|---|---|---|
| Forged `respondingParticipantId` | Server derives from `authUser.id`, ignores client input | **Prevented by proposed transport** |
| Forged `respondingParticipantName` | Server derives from `authUser.name`, ignores client input | **Prevented by proposed transport** |
| Forged `responseId` | Server generates via `randomUUID()`, ignores client input | **Prevented by proposed transport** |
| Forged `respondedAt` | Server uses `new Date().toISOString()`, ignores client input | **Prevented by proposed transport** |
| Arbitrary `choiceId` | `validateResponseForInteraction()` checks against immutable choices | **Prevented by B contract validation** |
| Response to nonexistent interaction | `get(interactionId)` returns undefined → 404 | **Prevented by I1 persistence** |
| Response to interaction in another conversation | No conversation membership model exists | **Unresolved gap — no conversation gating** |
| Duplicate replay (same choice) | Idempotent: returns existing response (200) | **Prevented by I2-P7 design** |
| Conflicting replay (different choice) | Conflict: returns 409 | **Prevented by I2-P7 design** |
| Unauthenticated request | `requireRole()` returns 403 | **Prevented by existing auth** |
| Unauthorized conversation access | No conversation membership model exists | **Unresolved gap — no conversation gating** |
| Arbitrary extra body properties | Silently ignored (existing convention) | **Prevented by server-side construction** |
| Payload with `command`, `operation`, `metadata` fields | Silently ignored — not mapped to `InteractionResponse` | **Prevented by server-side construction** |
| Model-generated text attempting execution authority | `InteractionResponse` has no executable fields | **Prevented by frozen B contract** |

### Unresolved Gaps

1. **No conversation membership gating** — any client can respond to any interaction in any conversation. This matches existing conversation route behavior but is a known limitation.
2. **CORS `Authorization` header not whitelisted** — browser clients may need preflight handling. Existing issue across all authenticated routes.

---

## I2-P15 — Genericity Proof

### Test: Remove Marketplace Mentally

If Marketplace is deleted from the architecture:
- The interaction ingress still works unchanged
- The route does not know what any `ChoiceId` means
- The route does not interpret the response as approval, execution, or policy
- The route does not route to any specific handler based on choice

### Domain-Neutrality Evidence

| Producer | Does the route know? |
|---|---|
| Marketplace interaction | NO — `POST /api/interactions/:id/responses` does not reference marketplace |
| Agent interaction | NO — route does not reference agents |
| Workflow interaction | NO — route does not reference workflows |
| Repository analysis | NO — route does not reference repositories |
| Configuration | NO — route does not reference configuration |
| Diagnostics | NO — route does not reference diagnostics |
| Future unknown | NO — the route is domain-neutral by construction |

The route handles `interactionId` + `choiceId` → `InteractionResponse`. It has zero knowledge of what the interaction represents. This is the correct boundary.

---

## I2-P16 — Implementation Surface

### Minimum Files for I2 Implementation

| File | Package | Status | Change |
|---|---|---|---|
| `apps/api/src/routes/interactions.ts` | `apps/api` | **REQUIRED** | New route file |
| `apps/api/src/server.ts` | `apps/api` | **REQUIRED** | Register route in `ROUTE_DEFS` |
| `apps/api/src/routes/index.ts` | `apps/api` | **REQUIRED** | Export new handler |
| `packages/interaction-app/src/interaction-service.ts` | `@vestara/interaction-app` | **POSSIBLE** | Add idempotent/conflict handling method |
| `packages/types/src/interaction.ts` | `@vestara/types` | **NOT REQUIRED** | Frozen B contract unchanged |
| `packages/interaction-persistence/src/interaction-persistence-port.ts` | `@vestara/interaction-persistence` | **NOT REQUIRED** | Port unchanged |
| `packages/interaction-persistence/src/sqlite-store.ts` | `@vestara/interaction-persistence` | **NOT REQUIRED** | Store unchanged |
| `packages/activity-projection/*` | `@vestara/activity-projection` | **NOT REQUIRED** | M9 unchanged |
| `apps/api/src/auth.ts` | `apps/api` | **NOT REQUIRED** | Auth unchanged |
| `packages/conversation/*` | `@vestara/conversation` | **NOT REQUIRED** | Conversation unchanged |
| `packages/workspace/*` | `@vestara/workspace` | **NOT REQUIRED** | Workspace unchanged |

### What I2 Does NOT Require

- Changes to `@vestara/types` (frozen B contract)
- Changes to `@vestara/interaction-persistence` (frozen I1 persistence)
- Changes to authentication (`auth.ts`)
- Changes to authorization
- Changes to Conversation
- Changes to M9/M10
- Changes to Activity Room UI
- Changes to Workflow/Harness/Orchestration/Marketplace
- Changes to runtime/session
- Changes to EventBus

**A good I2 design has a very small mutation surface: 3 files in `apps/api` plus optionally 1 service method.**

---

## I2-P17 — Verification Plan

### Route Unit Tests

| Test | Type | Description |
|---|---|---|
| Authenticated valid response | Positive | POST with valid Bearer token, valid choiceId → 201 |
| Server-derived identity | Structural | Verify `respondingParticipantId` = `authUser.id`, not client input |
| Forged identity fields rejected | Negative | POST with `respondingParticipantId` in body → server ignores it |
| Unknown interaction | Negative | POST to nonexistent interactionId → 404 |
| Unknown choiceId | Negative | POST with invalid choiceId → 400 |
| Malformed body | Negative | POST with non-JSON or missing choiceId → 400 |
| Unauthenticated request | Negative | POST without token when auth required → 403 |
| Same-choice retry | Idempotent | POST same choice twice → 200 with existing response |
| Conflicting-choice retry | Conflict | POST different choice after first response → 409 |
| Extra body properties | Negative | POST with extra fields → ignored, 201 with only expected fields |

### API Integration Tests

| Test | Type | Description |
|---|---|---|
| Full chain: present → respond → verify M9 | Integration | Uses real InteractionService + adapter + bridge + M9 store |
| Concurrent HTTP responses | Concurrency | Two parallel POSTs to same interaction → exactly one 201, one 409 |
| Publication failure handling | Resilience | Stop M9 bridge → respond → still 201, publication pending |
| Retry after publication failure | Recovery | Restart bridge → recovery → verify M9 has record |

### Production-Path Integration Tests

| Test | Type | Description |
|---|---|---|
| HTTP → InteractionService → M9 chain | Full | Real HTTP server, real persistence, real M9, real EventBus |
| Identity derivation end-to-end | Full | Verify authUser.id flows to M9 ActivityRecord |

### Security/Negative Tests

| Test | Type | Description |
|---|---|---|
| Forged respondingParticipantId | Security | Body contains `respondingParticipantId: "admin"` → server uses authUser.id |
| Forged responseId | Security | Body contains `responseId: "..."` → server generates its own |
| Arbitrary executable fields | Security | Body contains `command: "rm -rf"` → ignored |
| Cross-conversation response | Security | If conversation binding enforced, verify rejection |

---

## I2-P18 — Decision Gate

### Recommendation: **B**

**I2 can be implemented, but requires a bounded interaction-layer contract correction first.**

### Evidence

1. **Existing auth provides authoritative identity** — `AuthUser.id` and `AuthUser.name` from `authenticate()` are sufficient for `respondingParticipantId` and `respondingParticipantName`. No new identity subsystem needed.

2. **Existing route conventions are clear** — manual validation, `requireRole`, `json()` response, audit logging. I2 follows the established pattern.

3. **Frozen B contract permits server construction** — `InteractionResponse` can be fully constructed from `authUser.id`, `authUser.name`, route path `interactionId`, body `choiceId`, and server clock.

4. **Bounded correction required** — The current service throws a raw UNIQUE constraint violation on duplicate responses. I2 needs a structured idempotent/conflict result. This requires adding a `getResponse()` call around the `recordResponse()` try/catch in the service or route handler. This is a transport-layer adaptation, not a persistence-authority change.

5. **No missing authentication/participant authority** — the gap is not in auth/identity but in the service-layer error classification for duplicate responses.

### Why Not A

While implementation appears straightforward, the idempotent/conflict classification requires a bounded correction to how the service or route handles the UNIQUE constraint violation. This is not a code change to the frozen persistence authority, but it is a behavioral specification that should be documented before implementation.

---

## Unresolved Gaps

1. **No conversation membership model** — any client can respond to any interaction. This matches existing behavior but is a known limitation for future hardening.
2. **CORS `Authorization` header** — not in `Access-Control-Allow-Headers`. Browser clients may need preflight handling. Existing issue across all authenticated routes.
3. **Anonymous admin role** — unauthenticated requests receive `admin` role by design. This is intentional for local-first development but means the interaction route is effectively open when accessed locally.
4. **`correlationId` at HTTP layer** — the frozen B contract makes `correlationId` optional. At the HTTP layer, it should be derived from `requestId`. If the client provides one, it should be ignored (server authority).
5. **Downstream staleness** — the interaction layer cannot determine whether the underlying domain state has changed. This is explicitly outside I2 scope.

---

## Repository Evidence References

| Evidence | File | Lines |
|---|---|---|
| Auth function | `apps/api/src/auth.ts` | 23-81 |
| AuthUser interface | `apps/api/src/auth.ts` | 12-17 |
| Anonymous fallback | `apps/api/src/auth.ts` | 42-51 |
| requireRole guard | `apps/api/src/auth.ts` | 64-81 |
| Route dispatcher | `apps/api/src/http/router.ts` | 67-88 |
| Body parsing | `apps/api/src/http/body.ts` | 11-145 |
| JSON response | `apps/api/src/http/response.ts` | 122+ |
| Route conventions | `apps/api/src/routes/agents.ts`, `plans.ts`, `orchestration.ts` | Various |
| Conversation default userId | `packages/conversation/src/index.ts` | 107 |
| M9 human fallback 'local' | `packages/activity-projection/src/m9-ingestion-bridge.ts` | 360-369 |
| M9 interaction adapter | `packages/activity-projection/src/m9-adapter.ts` | 284-342 |
| Frozen B contract | `packages/types/src/interaction.ts` | 1-295 |
| Frozen I1 persistence | `packages/interaction-persistence/src/interaction-persistence-port.ts` | 1-71 |
| Frozen I1 service | `packages/interaction-app/src/interaction-service.ts` | 1-130 |
| Publication failure pattern | `apps/api/src/routes/opencode.ts` | 179-184 |
| Projection catch-and-swallow | `packages/memory/src/engineering-memory-projection.ts` | 156 |

---

*This document is audit evidence only. No production code was mutated.*
