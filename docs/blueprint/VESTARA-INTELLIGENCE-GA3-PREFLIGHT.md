---
title: VESTARA-INTELLIGENCE M-B1 — GA-3 Surface Context Contract Preflight (Corrected)
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# VESTARA-INTELLIGENCE M-B1 — GA-3 Surface Context Contract Preflight (Corrected)

**Date:** 2026-08-31
**Phase:** GA-3 (Surface Context) — Contract Preflight (Bounded Correction)
**Status:** Zero-mutation preflight (no source/test/schema/persistence/API/UI/config/behavior changes)
**Governing Specification:** VESTARA-INTELLIGENCE Architecture Review (frozen `2661a54`)
**Correction Scope:** Contract type definitions, authority boundaries, connection disposition. No architectural reversal.

---

## DIAG-0 producedAt Spelling Verification

| Check | Result |
|-------|--------|
| Source file `packages/types/src/diagnostic.ts` | ✅ All 3 instances use `producedAt` (lines 138, 162, 202) |
| Test file `packages/types/__tests__/diagnostic-contract.test.ts` | ✅ All 5 instances use `producedAt` (lines 60, 136, 149, 359, 398) |
| No `produatedAt` typo in source or test | ✅ Confirmed |

The "produatedAt" in the previous report was a summary-level typo only. The canonical TypeScript field and all fixtures use `producedAt`.

---

## A. Semantic Boundary

### Surface Context Answers

> "Where is the human in Vestara, and what bounded resources/capabilities are they currently interacting with?"

### Surface Context Does NOT Answer

| Question | Owned By |
|----------|----------|
| What evidence should an agent retrieve? | Context Intelligence (future) |
| What information is relevant to a reasoning task? | Context Intelligence (future) |
| What the conversation means? | Conversation Authority |
| What diagnosis should be made? | Observer (future) |
| What action should execute? | Workflow/Governance Authority |
| Which agent/model/provider should handle work? | Routing Authority |

### Contract

```
Surface Context = location + bounded references
```

NOT:

```
Surface Context = assembled AI prompt/context
```

---

## B. Existing Source Audit

### Field Ownership/Classification Table

| Field | Source | Classification | Authority | In SurfaceContext? |
|-------|--------|---------------|-----------|-------------------|
| `workspace.id` | `WorkspaceManifestData.id` (SHA-256 of canonical path) | **AUTHORITATIVE** | WorkspaceManifest | ✅ Bounded workspace scope |
| `workspace.name` | `WorkspaceManifestData.name` | **AUTHORITATIVE** | WorkspaceManifest | ✅ Human-readable workspace identity |
| `workspace.repoPath` | `useConnection().repoPath` (from `GET /api/health`) | **AUTHORITATIVE** | RepositoryBinding | ❌ **REMOVED** — duplicates RepositoryBinding authority (see §L.1) |
| `surface.routeId` | `APP_ROUTES` match via `useLocation()` | **CLIENT-OBSERVED** | React Router | ✅ Where is the human? |
| `surface.path` | `useLocation().pathname` | **CLIENT-OBSERVED** | React Router | ✅ Where is the human? |
| `surface.title` | `NAV_CATEGORIES` match via `AppHeader` logic | **DERIVED** | Navigation manifest | ✅ Where is the human? |
| `surface.section` | `NAV_CATEGORIES` category match | **DERIVED** | Navigation manifest | ✅ Where is the human? |
| `selected.kind` | `useGraph().inspector.entity.kind` | **CLIENT-OBSERVED** | GraphContext | ✅ What bounded resource? |
| `selected.id` | `useGraph().inspector.entityId` | **CLIENT-OBSERVED** | GraphContext | ✅ What bounded resource? |
| `selected.label` | `useGraph().inspector.entity.label` | **CLIENT-OBSERVED** | GraphContext | ✅ What bounded resource? (display) |
| `repository.canonicalPath` | `GET /api/workspace` → `fingerprint.canonicalPath` | **AUTHORITATIVE** | RepositoryBinding | ❌ **REJECT** — repository authority resolves binding (see §L.1) |
| `repository.gitBranch` | `GET /api/workspace` → `fingerprint.gitBranch` | **AUTHORITATIVE** | RepositoryBinding | ❌ **REJECT** — not location/identity |
| `actor.name` | `useAuth().actor` | **CLIENT-OBSERVED** | localStorage | ❌ **REJECT** — not location/identity (see §L.3) |
| `connection.api` | `useConnection().api` | **DERIVED** | Health probe | ❌ **REMOVED** — operational state, not surface identity (see §L.2) |
| `connection.ws` | `useConnection().ws` | **CLIENT-OBSERVED** | WebSocket state | ❌ **REMOVED** — operational state, not surface identity (see §L.2) |
| diagnostic refs | N/A in Surface Context | **REJECT** | Diagnostics boundary (see §F) | ❌ |
| conversation refs | N/A in Surface Context | **REJECT** | Conversation boundary (see §G) | ❌ |

### What the Client Already Has (No Server Endpoint Needed)

| Data | Hook | In SurfaceContext? |
|------|------|-------------------|
| Workspace id, name | `GET /api/workspace` (imperative) | ✅ workspace scope |
| Current route | `useLocation()` | ✅ surface location |
| Route params | `useParams()` | ✅ surface location |
| Nav section/title | `AppHeader` logic | ✅ surface location |
| Selected entity kind, id, label | `useGraph().inspector` | ✅ selected reference |
| Workspace repoPath | `useConnection()` | ❌ RepositoryBinding authority |
| Actor name | `useAuth()` | ❌ Not location/identity |
| API connectivity | `useConnection().api` | ❌ Operational state (see §L.2) |
| WS connectivity | `useConnection().ws` | ❌ Operational state (see §L.2) |

### What Requires a Server Call

| Data | Endpoint | Latency |
|------|----------|---------|
| Workspace identity (id, name) | `GET /api/workspace` | On-demand |
| Repository binding details | `GET /api/workspace` | On-demand |
| Graph entity data | `GET /api/graph/entity/:id` | On-demand (Inspector) |

---

## C. Client/Server Ownership

### What Can Only Be Known by the Client

- Current route path, params, search, hash (React Router state)
- Current navigation section/title (NAV_CATEGORIES match)
- Selected entity in Inspector (GraphContext client state)
- Actor name (localStorage)
- WebSocket connection state (client socket)
- Toast/notification presentation state (client state)

### What the Server Knows Authoritatively

- Workspace identity (id, name, fingerprint)
- Repository binding (canonicalPath, gitBranch, gitRoot)
- All graph entity data
- All diagnostics, telemetry, activity data

### Architecture Recommendation: Client-Composed Surface Context

**The frozen plan's proposed read-only GET endpoint is NOT the correct architecture for Surface Context.**

Reasoning:
1. The primary Surface Context fields (route, selected entity, navigation section) are **client-only state** that the server cannot observe.
2. A server endpoint would return stale data for UI-state fields that change on every navigation.
3. The server's contribution (workspace identity) is already available via `GET /api/workspace` — no new endpoint needed.
4. The client already has all the hooks needed to compose Surface Context locally.

**Recommended architecture: Client-composed Surface Context.**

```
SurfaceContext (React Context, client-composed)
├── workspace: { id, name }                    ← from getWorkspace() (server-derived, client-cached)
├── surface: { routeId, path, title, section } ← from useLocation() + NAV_CATEGORIES
└── selected?: SurfaceReference                ← from useGraph().inspector (bounded kind/id/label)
```

**Excluded from SurfaceContext:**
- `repoPath` — RepositoryBinding authority resolves execution binding (§L.1)
- `connection` — Operational state, not surface identity (§L.2)
- `actor` — Client-only localStorage value, not authoritative identity (§L.3)
- `repository.*` — Existing repository authority (§L.1)

No new API endpoint. No new server-side persistence. The client composes Surface Context from existing hooks.

If future consumers need server-enriched data (e.g., resolving a graph entity reference to full details), that is a consumer responsibility — not a Surface Context responsibility.

---

## D. Surface-Generic Requirement

### Contract Against Arbitrary Surfaces

| Surface | routeId | path | title | selected (kind) |
|---------|---------|------|-------|-----------------|
| Activity Room | `'activity-v2'` | `'/activity-v2'` | `'Activity Room (M11C)'` | N/A (no Inspector) |
| Engineering Workspace | `'sessions'` | `'/sessions'` | `'Sessions'` | N/A (page-local) |
| Marketplace | `'marketplace'` | `'/marketplace'` | `'Marketplace'` | N/A |
| Agent Control | `'agents'` | `'/agents'` | `'Agents'` | `agent://...` (via Inspector) |
| Workflow | `'orchestration'` | `'/orchestration'` | `'Orchestration'` | N/A (page-local) |
| Diagnostics | `'diagnostics'` | `'/diagnostics'` | `'Diagnostics'` | N/A |
| Chat | `'chat'` | `'/chat'` | `'Chat'` | N/A |
| Graph | `'graph'` | `'/graph'` | `'Graph'` | any entity kind |
| Unknown future | `null` | `'/unknown-path'` | `null` | N/A |

**No field requires Activity Room semantics.** The `selected` reference is generic — it works for any entity kind in the Engineering Graph. The `surface.routeId` is a string that works for any route.

### Surface-Specific Information

Surface-specific information (e.g., Activity Room participant count, Workflow task status) should NOT be in the base Surface Context contract. If needed, consumers extend the contract with typed surface-specific fields. The base contract remains generic.

---

## E. Reference Semantics

### Existing Bounded Reference Primitives

The codebase has an established `*Ref` pattern for lightweight bounded references:

| Primitive | Location | Fields | Pattern |
|-----------|----------|--------|---------|
| `DiagnosticSourceRef` | `packages/types/src/diagnostic.ts:43-55` | `id`, `kind`, `name`, `component?` | `id` + `kind` + `name` |
| `DiagnosticEvidenceRef` | `packages/types/src/diagnostic.ts:148-163` | `bundleId`, `evidenceRef`, `evidenceKind`, `summary`, `producedAt` | identity + context |
| `ResourceRef` | `packages/types/src/metadata.ts:10-14` | `type`, `id`, `name?` | `type` + `id` + `name` |
| `GraphEntity.id` | `apps/workspace/src/lib/graph.ts:255-257` | `{kind}://{id}` format | `kind://id` URI |

**No universal Resource abstraction exists** and production evidence does not require one.

### SurfaceReference — Following Existing Pattern

Surface Context uses a `SurfaceReference` that follows the established `*Ref` pattern:

```typescript
interface SurfaceReference {
  readonly kind: string;    // entity kind (e.g., 'agent', 'plan', 'task', 'file')
  readonly id: string;      // entity ID (e.g., 'developer-001', 'plan-abc')
  readonly label?: string;  // human-readable label (optional, for display)
}
```

This is deliberately NOT a full `GraphEntity` — it carries only identity and kind. It follows the same pattern as `DiagnosticSourceRef` (`id` + `kind` + `name`) and `ResourceRef` (`type` + `id` + `name`). Resolution of the full entity (loading relationships, metadata, etc.) is a consumer responsibility.

### Reference Visibility ≠ Resource Access Authorization

A reference visible in Surface Context does NOT authorize the consumer to resolve or access the referenced resource. When a consumer resolves a reference, authorization must be re-evaluated against the consumer's permissions and the resource's access control.

---

## F. Diagnostics Boundary

### Decision: No Diagnostic Field in Surface Context

DIAG-0 types are available, but Surface Context must not become a diagnostic aggregator.

**Surface Context needs:** No diagnostic field, no diagnostic source references, no evidence references.

**Rationale:**
- Surface Context answers "where is the human?" — not "what is the health of the system?"
- Diagnostic data is owned by Diagnostics (RI-3). Surface Context referencing diagnostics would create a coupling that violates surface-generality.
- If a consumer needs diagnostic data alongside Surface Context, it fetches diagnostics independently and composes locally.
- DIAG-0 types exist for DIAG-1+ consumers, not for Surface Context embedding.

**Preserves:**
```
Surface Context → location + bounded references (generic)
Diagnostics → diagnostic snapshots (separate authority)
Consumer → composes both locally if needed
```

---

## G. Conversation Boundary

### Decision: No Conversation Field in Surface Context

Surface Context must not contain:
- Conversation history
- Messages
- Generated summaries
- Inferred intent
- Conversation ID references

**GA-2/ConversationService owns conversation continuity.** Surface Context is about location and capability references, not conversation state.

If a future consumer needs to associate a conversation with a surface, it does so independently — Surface Context does not carry the association.

---

## H. Context Intelligence Boundary

### Decision: Surface Context is a Passive Input

Future Context Intelligence may consume Surface Context as one input among many. Surface Context itself must:

| Constraint | Status |
|-----------|--------|
| Not perform retrieval | ✅ Surface Context is data, not logic |
| Not rank evidence | ✅ No relevance calculation |
| Not calculate relevance | ✅ No scoring |
| Not summarize repository state | ✅ No aggregation |
| Not construct model prompts | ✅ No prompt engineering |
| Not decide context budgets | ✅ No budget allocation |
| Not refresh reasoning context | ✅ No lifecycle management |

**Preserves INV-CTX-1:** Surface Context relevance does not confer routing, execution, mutation, or authorization authority.
**Preserves INV-CTX-2:** Surface Context has no cache — it is real-time client state.
**Preserves INV-CTX-3:** Surface Context does not trigger context refresh — it is a passive data structure.

---

## I. Security

### Reference Visibility ≠ Resource Access Authorization

| Principle | Implementation |
|-----------|---------------|
| Surface Context shows references | A `SurfaceReference` to `agent://developer` is visible |
| Reference visibility does not authorize resolution | Consumer must re-check permissions when resolving |
| Resolution requires authorization | `PermissionManager.check()` or route-level `requireRole()` |
| Server enforces access control | API endpoints enforce auth; Surface Context is client-only |

**Authorization boundary:** When a consumer uses a `SurfaceReference` to fetch entity data (e.g., `GET /api/graph/entity/:id`), the API endpoint enforces access control. Surface Context itself has no auth gate — it is a client-side data structure.

---

## J. Degraded Mode

| Failure | Impact on Surface Context | Degrades By |
|---------|--------------------------|-------------|
| Activity Room unavailable | Surface Context unaffected. Route info still available. | N/A — no dependency |
| Diagnostics unavailable | Surface Context unaffected (no diagnostic fields). | N/A — no dependency |
| ConversationService unavailable | Surface Context unaffected (no conversation fields). | N/A — no dependency |
| AI provider unavailable | Surface Context unaffected (no AI fields). | N/A — no dependency |
| Referenced resource disappears | `selected` reference may become stale. Consumer handles gracefully. | Loses optional `selected` reference |
| Future Marketplace module disabled | Route still exists, but page may show empty state. Surface Context still reports route. | N/A — route info persists |
| API server down | `workspace.id`/`name` may be stale (last known). Route info still works (client-only). | May lose workspace identity freshness |
| Graph API down | `selected` entity data unavailable. Entity ID still known from Inspector state. | Loses entity metadata, retains ID |

**Surface Context degrades by losing optional references, not by collapsing globally.** The core fields (workspace, surface) remain available even when optional references (selected entity) are unavailable.

---

## K. Canonical Incident (GA-ACCEPT-SELF-MAINTENANCE-001)

### What Surface Context Would Have Contained

During the M11C WASM incident, while the user was viewing the broken Activity Room:

```typescript
{
  workspace: {
    id: 'a1b2c3d4e5f6...',           // workspace identity (unaffected)
    name: 'vestara-ai-core'           // workspace name (unaffected)
  },
  surface: {
    routeId: 'activity-v2',           // current route
    path: '/activity-v2',             // URL path
    title: 'Activity Room (M11C)',    // page title
    section: 'Workspace'              // navigation section
  }
  // selected: undefined — no Inspector entity selected
  // No connection, no repoPath, no actor — all excluded
}
```

### What Surface Context Would NOT Have Claimed

| Not Claimed | Reason |
|-------------|--------|
| root cause = WASM corruption | Observer owns analysis (RI-2) |
| Activity Room state = degraded | Surface Context has no health/status fields |
| diagnostic evidence = ... | Surface Context has no diagnostic fields |
| recovery needed | Workflow/Governance owns recovery |
| which agent should fix it | Routing Authority owns provider/model selection |
| API connectivity = ok | Operational state belongs to separate consumer input (§L.2) |
| repository binding = ... | RepositoryBinding authority resolves binding (§L.1) |

### Surface Context Accuracy

Surface Context correctly reports:
- **workspace = X** — the workspace identity is stable and unaffected by WASM corruption
- **surface = Activity Room** — the user is viewing the Activity Room route
- **route = /activity-v2** — the URL path is factual

Surface Context does NOT claim:
- Why the Activity Room is broken (root cause)
- What should be done about it (recovery)
- Who should fix it (routing)
- Whether the API is operational (connection state — separate input)

---

## L. Corrected Minimum Surface Context Contract

### Authority Resolution

**Workspace/Repository Authority:**
- Surface Context carries `{ id, name }` for workspace identity — bounded scope reference only
- `repoPath` is removed — RepositoryBinding authority resolves execution binding
- A consumer must not treat Surface Context workspace values as execution authorization or canonical repository binding
- Existing authority: `RepositoryBinding.canonicalPath`, `RepositoryBinding.bindingId`, `WorkspaceManifestData.fingerprint`
- Surface Context may identify a workspace; existing repository authority resolves authoritative execution binding

**Selected Entity Bounding:**
- Surface Context carries `SurfaceReference` (kind/id/label) — identifies the selected thing
- Surface Context does NOT carry the selected thing (no full entity payload, no metadata bag, no relationships)
- Consumer resolves full entity via `GET /api/graph/entity/:id` with its own authorization

**Connection State Disposition: SEPARATE CONSUMER INPUT**
- `connection: { api, ws }` does NOT belong in Surface Context
- Classification: operational platform state, not "where is the human?" or "what bounded resource?"
- API/WS connectivity describes platform operational state — it does not answer any of the three Surface Context questions
- Must not compete with DIAG-0/DIAG-1 (capability health ≠ platform connectivity)
- Consumer that needs connectivity composes `useConnection()` independently alongside Surface Context

**Actor Disposition: REJECT**
- `actor.name` from localStorage is not an authoritative identity
- Not location/identity — does not answer "where is the human?" (that is the route, not who is viewing it)

### TypeScript Types (for `packages/types/src/surface-context.ts`)

```typescript
/**
 * Bounded reference to an entity or resource.
 * Follows the established *Ref pattern (DiagnosticSourceRef, ResourceRef).
 * Carries identity only — not the full entity.
 * Consumer resolves full entity via its own authority.
 */
export interface SurfaceReference {
  readonly kind: string;    // entity kind (e.g., 'agent', 'plan', 'task', 'file')
  readonly id: string;      // entity ID (e.g., 'developer-001', 'plan-abc')
  readonly label?: string;  // human-readable label (optional, for display)
}

/**
 * Workspace identity — bounded scope reference.
 * Does NOT include repoPath or repository binding details.
 * Existing RepositoryBinding authority resolves execution binding.
 */
export interface SurfaceWorkspace {
  readonly id: string;      // WorkspaceManifestData.id (SHA-256 of canonical path)
  readonly name: string;    // WorkspaceManifestData.name
}

/**
 * Current surface/page location — where is the human?
 * Client-observed via React Router + NAV_CATEGORIES.
 */
export interface SurfaceLocation {
  readonly routeId: string | null;   // APP_ROUTES match
  readonly path: string;             // useLocation().pathname
  readonly title: string | null;     // NAV_CATEGORIES title
  readonly section: string | null;   // NAV_CATEGORIES category
}

/**
 * Complete Surface Context — location + bounded references.
 * Every field answers: where is the human? what bounded resource? under which workspace scope?
 * Passive data structure — no retrieval, ranking, budget, or lifecycle management.
 * Client-composed from existing hooks. No server endpoint.
 */
export interface SurfaceContext {
  readonly workspace: SurfaceWorkspace;           // under which workspace scope?
  readonly surface: SurfaceLocation;              // where is the human?
  readonly selected?: SurfaceReference;           // what bounded resource? (optional)
}
```

### Contract Summary

| Field | Type | Source | Answers |
|-------|------|--------|---------|
| `workspace.id` | string | Server (WorkspaceManifest) | Under which workspace scope? |
| `workspace.name` | string | Server (WorkspaceManifest) | Under which workspace scope? |
| `surface.routeId` | string \| null | Client (React Router) | Where is the human? |
| `surface.path` | string | Client (React Router) | Where is the human? |
| `surface.title` | string \| null | Client (NAV_CATEGORIES) | Where is the human? |
| `surface.section` | string \| null | Client (NAV_CATEGORIES) | Where is the human? |
| `selected.kind` | string | Client (GraphContext) | What bounded resource? |
| `selected.id` | string | Client (GraphContext) | What bounded resource? |
| `selected.label` | string \| undefined | Client (GraphContext) | What bounded resource? (display) |

**Removed fields and rationale:**

| Removed Field | Rationale |
|---------------|-----------|
| `workspace.repoPath` | Duplicates RepositoryBinding authority. Surface Context must not become a second directory authority. |
| `selected.entity` (full payload) | Surface Context identifies the selected thing; it does not carry the selected thing. |
| `selected.entityId` (redundant) | Merged into `selected.id` via `SurfaceReference`. |
| `connection.api` | Operational state. Does not answer "where is the human?" Must not compete with DIAG-0/DIAG-1. |
| `connection.ws` | Operational state. Same rationale as `connection.api`. |
| `actor.name` | Not an authoritative identity. Not location/identity. |

---

## M. Implementation Slice Recommendation

### Recommended: Client-Composed Context Provider

| Slice | Capability | Files | Authority | Risk |
|-------|-----------|-------|-----------|------|
| **GA-3a** | `SurfaceContextProvider` React context | `apps/workspace/src/contexts/SurfaceContext.tsx` (new) | Client-only, no authority | Low |
| **GA-3b** | Mount in `ShellLayout` | `apps/workspace/src/layouts/ShellLayout.tsx` (extend) | Extends layout | Low |
| **GA-3c** | Type tests | `packages/types/__tests__/surface-context-contract.test.ts` (new) | Types only | Low |

**No server endpoint needed.** The client composes Surface Context from existing hooks:
- `getWorkspace()` → workspace id, name (imperative call, server-derived)
- `useLocation()` → surface path (React Router)
- `useParams()` → surface route params (React Router)
- `NAV_CATEGORIES` match → surface title, section (navigation manifest)
- `useGraph().inspector` → selected reference kind, id, label (GraphContext)

**GA-3 does NOT need:**
- New API endpoint
- New server-side persistence
- `useConnection()` — operational state excluded (§L.2)
- `useAuth()` — actor identity excluded (§L.3)
- ConversationService changes
- Activity Room changes
- Diagnostics changes
- Context Intelligence changes

---

## Discoveries

| # | Classification | Description |
|---|---------------|-------------|
| 1 | **OBSERVATION** | No unified "SurfaceContext" provider exists. Workspace identity, current route, and selected resource are fragmented across separate hooks. GA-3 creates the composition layer. |
| 2 | **OBSERVATION** | The `WorkspaceData` type from `getWorkspace()` drops the `id` field (fingerprint.id). GA-3 needs to include it. |
| 3 | **OBSERVATION** | `GraphEntity.id` (`kind://id` format) is the closest existing bounded reference primitive. GA-3's `SurfaceReference` follows the established `*Ref` pattern (`DiagnosticSourceRef`, `ResourceRef`). |
| 4 | **OBSERVATION** | Activity Room pages use `useM11CActivityRoom()` which is page-scoped — not available to other surfaces. Surface Context does not depend on it. |
| 5 | **ADJACENT** | The `useAuth().actor` returns a string name from localStorage with no server validation. GA-3 excludes this — not an authoritative identity. |
| 6 | **CORRECTION** | `workspace.repoPath` removed from SurfaceContext — duplicates RepositoryBinding authority. Surface Context must not become a second directory authority. |
| 7 | **CORRECTION** | `connection: { api, ws }` removed from SurfaceContext — classified as SEPARATE CONSUMER INPUT. Operational state does not answer "where is the human?" and must not compete with DIAG-0/DIAG-1. |
| 8 | **CORRECTION** | `selected.entity` (full payload) replaced with `SurfaceReference` (kind/id/label) — Surface Context identifies the selected thing; it does not carry the selected thing. |
| 9 | **CORRECTION** | `actor.name` excluded — not an authoritative identity, not location/identity. |

---

## Summary

| Field | Value |
|-------|-------|
| **producedAt spelling** | ✅ Verified correct in all source and test files |
| **Corrected contract** | `SurfaceContext` = workspace(id, name) + surface(routeId, path, title, section) + selected?(kind, id, label) |
| **Client/server split** | Client-composed (no new server endpoint) |
| **Existing primitives reused** | `DiagnosticSourceRef` pattern (id/kind/name), `ResourceRef` pattern (type/id/name), `GraphEntity.id` (kind://id format) |
| **Workspace authority** | Surface Context carries bounded identity only (`id`, `name`). RepositoryBinding resolves execution binding. |
| **Selected entity** | Bounded `SurfaceReference` — identifies, does not carry. Consumer resolves via own authority. |
| **Connection state** | REJECTED — SEPARATE CONSUMER INPUT. Operational state, not surface identity. Must not compete with DIAG-0/DIAG-1. |
| **Surface-generic** | ✅ No Activity Room, Workflow, or domain-specific fields |
| **Diagnostics boundary** | ✅ No diagnostic fields — consumer composes independently |
| **Conversation boundary** | ✅ No conversation fields |
| **CTX boundary** | ✅ Passive data structure, no retrieval/ranking/budget |
| **Degraded mode** | ✅ Degrades by losing optional references, not collapsing |
| **Canonical incident** | ✅ Surface Context correctly reports location without claiming root cause or operational state |
| **Blockers** | None |
| **Recommended slice** | GA-3a: SurfaceContextProvider (client-composed React context, 3 hooks: getWorkspace + useLocation + useGraph) |
