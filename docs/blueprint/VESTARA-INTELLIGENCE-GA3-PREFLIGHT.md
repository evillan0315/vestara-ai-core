# VESTARA-INTELLIGENCE M-B1 — GA-3 Surface Context Contract Preflight

**Date:** 2026-08-31
**Phase:** GA-3 (Surface Context) — Contract Preflight
**Status:** Zero-mutation preflight (no source/test/schema/persistence/API/UI/config/behavior changes)
**Governing Specification:** VESTARA-INTELLIGENCE Architecture Review (frozen `2661a54`)

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

| Field | Source | Classification | Authority |
|-------|--------|---------------|-----------|
| `workspace.id` | `GET /api/workspace` → `fingerprint.id` (SHA-256 of canonical path) | **AUTHORITATIVE** | WorkspaceManifest |
| `workspace.name` | `GET /api/workspace` → `fingerprint.name` | **AUTHORITATIVE** | WorkspaceManifest |
| `workspace.repoPath` | `useConnection().repoPath` (from `GET /api/health`) | **AUTHORITATIVE** | RepositoryBinding |
| `surface.routeId` | `APP_ROUTES` match via `useLocation()` | **CLIENT-OBSERVED** | React Router |
| `surface.path` | `useLocation().pathname` | **CLIENT-OBSERVED** | React Router |
| `surface.title` | `NAV_CATEGORIES` match via `AppHeader` logic | **DERIVED** | Navigation manifest |
| `surface.section` | `NAV_CATEGORIES` category match | **DERIVED** | Navigation manifest |
| `selected.entity` | `useGraph().inspector.entity` | **CLIENT-OBSERVED** | GraphContext (client state) |
| `selected.entityId` | `useGraph().inspector.entityId` | **CLIENT-OBSERVED** | GraphContext (client state) |
| `repository.canonicalPath` | `GET /api/workspace` → `fingerprint.canonicalPath` | **AUTHORITATIVE** | RepositoryBinding |
| `repository.gitBranch` | `GET /api/workspace` → `fingerprint.gitBranch` | **AUTHORITATIVE** | RepositoryBinding |
| `actor.name` | `useAuth().actor` | **CLIENT-OBSERVED** | localStorage |
| `connection.api` | `useConnection().api` | **DERIVED** | Health probe |
| `connection.ws` | `useConnection().ws` | **CLIENT-OBSERVED** | WebSocket state |
| diagnostic refs | N/A in Surface Context | **REJECT** | Diagnostics boundary (see §F) |
| conversation refs | N/A in Surface Context | **REJECT** | Conversation boundary (see §G) |

### What the Client Already Has (No Server Endpoint Needed)

| Data | Hook | Always Available? |
|------|------|-------------------|
| Workspace repoPath | `useConnection()` | Yes (global) |
| Current route | `useLocation()` | Yes (during render) |
| Route params | `useParams()` | Yes (during render) |
| Nav section/title | `AppHeader` logic | Yes (during render) |
| Selected entity | `useGraph().inspector` | Yes (shell layout) |
| Actor name | `useAuth()` | Yes (global) |
| API connectivity | `useConnection().api` | Yes (polled) |
| WS connectivity | `useConnection().ws` | Yes (socket state) |

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
├── workspace: { id, name, repoPath }  ← from useConnection() + getWorkspace()
├── surface: { routeId, path, title, section }  ← from useLocation() + NAV_CATEGORIES
├── selected: { entityId, entity? }  ← from useGraph().inspector
└── connection: { api, ws }  ← from useConnection()
```

No new API endpoint. No new server-side persistence. The client composes Surface Context from existing hooks.

If future consumers need server-enriched data (e.g., resolving a graph entity reference to full details), that is a consumer responsibility — not a Surface Context responsibility.

---

## D. Surface-Generic Requirement

### Contract Against Arbitrary Surfaces

| Surface | routeId | path | title | selected.entity kind |
|---------|---------|------|-------|---------------------|
| Activity Room | `'activity-v2'` | `'/activity-v2'` | `'Activity Room (M11C)'` | N/A (no Inspector) |
| Engineering Workspace | `'sessions'` | `'/sessions'` | `'Sessions'` | N/A (page-local) |
| Marketplace | `'marketplace'` | `'/marketplace'` | `'Marketplace'` | N/A |
| Agent Control | `'agents'` | `'/agents'` | `'Agents'` | `agent://...` (via Inspector) |
| Workflow | `'orchestration'` | `'/orchestration'` | `'Orchestration'` | N/A (page-local) |
| Diagnostics | `'diagnostics'` | `'/diagnostics'` | `'Diagnostics'` | N/A |
| Chat | `'chat'` | `'/chat'` | `'Chat'` | N/A |
| Graph | `'graph'` | `'/graph'` | `'Graph'` | any entity kind |
| Unknown future | `null` | `'/unknown-path'` | `null` | N/A |

**No field requires Activity Room semantics.** The `selected.entity` field is generic — it works for any entity kind in the Engineering Graph. The `surface.routeId` is a string that works for any route.

### Surface-Specific Information

Surface-specific information (e.g., Activity Room participant count, Workflow task status) should NOT be in the base Surface Context contract. If needed, consumers extend the contract with typed surface-specific fields. The base contract remains generic.

---

## E. Reference Semantics

### Existing Bounded Reference Primitive

The Engineering Graph's `GraphEntity.id` (`kind://id` format, e.g., `agent://developer-001`, `plan://plan-abc`) is the closest existing bounded reference. However, it is specific to the Engineering Graph and requires graph resolution.

**No universal Resource abstraction exists** and production evidence does not require one.

### Recommended Reference Pattern

For Surface Context, references should be minimal and self-describing:

```typescript
interface SurfaceReference {
  readonly kind: string;    // entity kind (e.g., 'agent', 'plan', 'task', 'file')
  readonly id: string;      // entity ID (e.g., 'developer-001', 'plan-abc')
  readonly label?: string;  // human-readable label (optional, for display)
}
```

This is deliberately NOT a full `GraphEntity` — it carries only identity and kind. Resolution of the full entity (loading relationships, metadata, etc.) is a consumer responsibility.

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
| Referenced resource disappears | `selected.entity` may become stale. Consumer handles gracefully. | Loses optional `selected` reference |
| Future Marketplace module disabled | Route still exists, but page may show empty state. Surface Context still reports route. | N/A — route info persists |
| API server down | `workspace.id`/`name` may be stale (last known). Route info still works (client-only). | May lose workspace identity freshness |
| Graph API down | `selected.entity` data unavailable. Entity ID still known from Inspector state. | Loses entity metadata, retains ID |

**Surface Context degrades by losing optional references, not by collapsing globally.** The core fields (workspace, surface, connection) remain available even when optional references (selected entity, graph data) are unavailable.

---

## K. Canonical Incident (GA-ACCEPT-SELF-MAINTENANCE-001)

### What Surface Context Would Have Contained

During the M11C WASM incident, while the user was viewing the broken Activity Room:

```typescript
{
  workspace: {
    id: 'a1b2c3d4e5f6...',           // workspace identity (unaffected)
    name: 'vestara-ai-core',          // workspace name (unaffected)
    repoPath: '/home/user/...'        // repository path (unaffected)
  },
  surface: {
    routeId: 'activity-v2',           // current route
    path: '/activity-v2',             // URL path
    title: 'Activity Room (M11C)',    // page title
    section: 'Workspace'              // navigation section
  },
  selected: {
    entityId: null,                   // no Inspector entity selected
    entity: null
  },
  connection: {
    api: 'ok',                        // API server was running (WASM was in-process, not API-down)
    ws: 'open'                        // WebSocket was connected
  }
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

### Surface Context Accuracy

Surface Context correctly reports:
- **workspace = X** — the workspace identity is stable and unaffected by WASM corruption
- **surface = Activity Room** — the user is viewing the Activity Room route
- **route = /activity-v2** — the URL path is factual
- **connection = ok** — the API server was running; the WASM issue was in-process, not an API failure

Surface Context does NOT claim:
- Why the Activity Room is broken (root cause)
- What should be done about it (recovery)
- Who should fix it (routing)

---

## L. Proposed Minimum Surface Context Contract

### TypeScript Types (for `packages/types/src/surface-context.ts`)

```typescript
/** Bounded reference to an entity or resource */
export interface SurfaceReference {
  readonly kind: string;
  readonly id: string;
  readonly label?: string;
}

/** Workspace identity (server-derived, client-cached) */
export interface SurfaceWorkspace {
  readonly id: string;
  readonly name: string;
  readonly repoPath: string;
}

/** Current surface/page location (client-observed) */
export interface SurfaceLocation {
  readonly routeId: string | null;
  readonly path: string;
  readonly title: string | null;
  readonly section: string | null;
}

/** Currently selected entity (client-observed, optional) */
export interface SurfaceSelection {
  readonly entityId: string | null;
  readonly entity: SurfaceReference | null;
}

/** API connectivity status (client-observed) */
export interface SurfaceConnection {
  readonly api: 'ok' | 'down' | 'checking';
  readonly ws: 'connecting' | 'open' | 'closed' | 'error';
}

/** Complete Surface Context — location + bounded references */
export interface SurfaceContext {
  readonly workspace: SurfaceWorkspace;
  readonly surface: SurfaceLocation;
  readonly selected: SurfaceSelection;
  readonly connection: SurfaceConnection;
}
```

### Contract Summary

| Field | Type | Source | Always Present? |
|-------|------|--------|-----------------|
| `workspace.id` | string | Server (WorkspaceManifest) | Yes |
| `workspace.name` | string | Server (WorkspaceManifest) | Yes |
| `workspace.repoPath` | string | Server (RepositoryBinding) | Yes |
| `surface.routeId` | string \| null | Client (React Router) | Yes |
| `surface.path` | string | Client (React Router) | Yes |
| `surface.title` | string \| null | Client (NAV_CATEGORIES) | Yes |
| `surface.section` | string \| null | Client (NAV_CATEGORIES) | Yes |
| `selected.entityId` | string \| null | Client (GraphContext) | Yes (null if none) |
| `selected.entity` | SurfaceReference \| null | Client (GraphContext) | Yes (null if none) |
| `connection.api` | 'ok' \| 'down' \| 'checking' | Client (health probe) | Yes |
| `connection.ws` | ConnectionState | Client (socket) | Yes |

---

## M. Implementation Slice Recommendation

### Recommended: Client-Composed Context Provider

| Slice | Capability | Files | Authority | Risk |
|-------|-----------|-------|-----------|------|
| **GA-3a** | `SurfaceContextProvider` React context | `apps/workspace/src/contexts/SurfaceContext.tsx` (new) | Client-only, no authority | Low |
| **GA-3b** | Mount in `ShellLayout` | `apps/workspace/src/layouts/ShellLayout.tsx` (extend) | Extends layout | Low |
| **GA-3c** | Type tests | `packages/types/__tests__/surface-context-contract.test.ts` (new) | Types only | Low |

**No server endpoint needed.** The client composes Surface Context from existing hooks (`useConnection`, `useLocation`, `useParams`, `useGraph`, `useAuth`).

**GA-3 does NOT need:**
- New API endpoint
- New server-side persistence
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
| 3 | **OBSERVATION** | `GraphEntity.id` (`kind://id` format) is the closest existing bounded reference primitive. GA-3's `SurfaceReference` is intentionally simpler (no metadata, no relationships). |
| 4 | **OBSERVATION** | Activity Room pages use `useM11CActivityRoom()` which is page-scoped — not available to other surfaces. Surface Context does not depend on it. |
| 5 | **ADJACENT** | The `useAuth().actor` returns a string name from localStorage with no server validation. GA-3 exposes this as client-observed data only — not as an authoritative identity. |

---

## Summary

| Field | Value |
|-------|-------|
| **producedAt spelling** | ✅ Verified correct in all source and test files |
| **Proposed contract** | `SurfaceContext` = workspace + surface + selected + connection |
| **Client/server split** | Client-composed (no new server endpoint) |
| **Existing primitives** | `GraphEntity.id` (kind://id) as reference pattern; `JsonValue`/`JsonRecord` not needed for Surface Context |
| **Surface-generic** | ✅ No Activity Room, Workflow, or domain-specific fields |
| **Diagnostics boundary** | ✅ No diagnostic fields — consumer composes independently |
| **Conversation boundary** | ✅ No conversation fields |
| **CTX boundary** | ✅ Passive data structure, no retrieval/ranking/budget |
| **Degraded mode** | ✅ Degrades by losing optional references, not collapsing |
| **Canonical incident** | ✅ Surface Context correctly reports location without claiming root cause |
| **Blockers** | None |
| **Recommended slice** | GA-3a: SurfaceContextProvider (client-composed React context) |
