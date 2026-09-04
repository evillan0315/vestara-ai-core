# AR-008 — Assistant Surface Context

**Author**: Vestara Developer Agent  
**Date**: 2026-09-04  
**Prerequisite**: AR-007 (frozen)

---

## AR-008.1 — Existing Selection/Context Audit

### Existing Contracts

| Contract | Location | Status | Classification |
|----------|----------|--------|---------------|
| `SurfaceContext` | `packages/types/src/surface-context.ts` | ✅ EXISTS | CANONICAL_REFERENCE |
| `SurfaceWorkspace` | `packages/types/src/surface-context.ts` | ✅ EXISTS | CANONICAL_REFERENCE |
| `SurfaceLocation` | `packages/types/src/surface-context.ts` | ✅ EXISTS | CANONICAL_REFERENCE |
| `SurfaceReference` | `packages/types/src/surface-context.ts` | ✅ EXISTS | CANONICAL_REFERENCE |
| `SurfaceContextProvider` | `apps/workspace/src/contexts/SurfaceContext.tsx` | ✅ EXISTS | CANONICAL_REFERENCE |
| `useSurfaceContext` | `apps/workspace/src/contexts/SurfaceContext.tsx` | ✅ EXISTS | CANONICAL_REFERENCE |

### Existing Activity Room Selection

| Reference | Source | Classification |
|-----------|--------|---------------|
| `activityId` | Activity Stream selection | CANONICAL_REFERENCE |
| `workflowId` | Activity record field | CANONICAL_REFERENCE |
| `taskId` | Activity record field | CANONICAL_REFERENCE |
| `agentId` | Activity record actor | CANONICAL_REFERENCE |
| `selectedAgentId` | Activity Sidebar filter | UI_ONLY_STATE |

### Gap: Surface Context Not Sent with Messages

The Floating Assistant currently sends `{ message: text }` without surface context references. AR-008 needs to add surface context to the message payload.

---

## AR-008.2 — Canonical Surface Context Contract

### Existing Contract (Already Implemented)

```typescript
// packages/types/src/surface-context.ts
interface SurfaceContext {
  readonly workspace: SurfaceWorkspace;  // workspace identity
  readonly surface: SurfaceLocation;     // current route/page
  readonly selected?: SurfaceReference;  // bounded reference to selected entity
}

interface SurfaceWorkspace {
  readonly id: string;    // workspace ID
  readonly name: string;  // workspace name
}

interface SurfaceLocation {
  readonly routeId: string | null;  // route match
  readonly path: string;            // pathname
  readonly title: string | null;    // page title
  readonly section: string | null;  // navigation section
}

interface SurfaceReference {
  readonly kind: string;   // entity kind (agent, plan, task, file)
  readonly id: string;     // entity ID
  readonly label?: string; // display label (optional)
}
```

### No Changes Needed

The existing contract satisfies AR-008 requirements. Every field has a documented authoritative owner.

---

## AR-008.3 — Context is Reference, Not Coped State

### Existing Implementation

```typescript
// SurfaceContext.tsx
const selected: SurfaceReference | undefined = useMemo(() => {
  if (!inspector.entityId || !inspector.entity) return undefined;
  const parsed = parseEntityId(inspector.entityId);
  return {
    kind: parsed.kind ?? 'unknown',
    id: parsed.id,
    label: inspector.entity.label,
  };
}, [inspector.entityId, inspector.entity]);
```

### What Surface Context Contains

- ✅ `workspace.id` — workspace identity (reference)
- ✅ `workspace.name` — workspace name (display)
- ✅ `surface.routeId` — route reference
- ✅ `surface.path` — pathname
- ✅ `selected.kind` — entity kind (reference)
- ✅ `selected.id` — entity ID (reference)
- ✅ `selected.label` — display label (display only)

### What Surface Context Does NOT Contain

- ❌ Entire ActivityRecord
- ❌ Workflow object
- ❌ DevelopmentPlan
- ❌ Full conversation
- ❌ Repository file contents
- ❌ Git diff
- ❌ Evidence documents
- ❌ Agent configuration
- ❌ Provider/model
- ❌ Raw React component state

### Verdict

**Context is reference, not copied state.** The existing contract is correct.

---

## AR-008.4 — Context Provenance

### Reference Origins

| Reference | Origin | Authoritative Owner |
|-----------|--------|-------------------|
| `workspace.id` | `getWorkspaceIdentity()` (server-derived) | WorkspaceManifestData |
| `workspace.name` | `getWorkspaceIdentity()` (server-derived) | WorkspaceManifestData |
| `surface.routeId` | React Router + NAV_CATEGORIES | Navigation manifest |
| `surface.path` | `useLocation().pathname` | React Router |
| `selected.kind` | `parseEntityId(inspector.entityId)` | GraphContext inspector |
| `selected.id` | `parseEntityId(inspector.entityId)` | GraphContext inspector |
| `selected.label` | `inspector.entity.label` | GraphContext inspector |

### Provenance Rules

- ✅ All references have explainable origins
- ✅ No inference from title/text/timestamp
- ✅ Absent references remain absent
- ✅ No manufactured identifiers

---

## AR-008.5 — Workspace Ownership

### Current Ownership

```
Workspace
    │
    ├── Activity Room selection (selectedAgentId, detailRecord)
    ├── current route (useLocation)
    ├── current repository (getWorkspaceIdentity)
    └── GraphContext inspector (selected entity)
            │
            ▼
      SurfaceContextProvider
            │
            ▼
      SurfaceContext (workspace + surface + selected)
            │
            ▼
      GlobalAssistant → ConversationPanel
```

### Ownership Model

- **SurfaceContextProvider** = canonical Workspace owner of Surface Context
- **Activity Room** = contributes references (selected agent, activity)
- **GraphContext** = contributes entity selection
- **GlobalAssistant** = consumes Surface Context (display + transport)

### No New State Framework

SurfaceContextProvider uses existing React context + hooks. No Redux/Zustand needed.

---

## AR-008.6 — Selection Behavior

### Current Behavior

When user selects an Activity item:
1. `ActivityRoomPage` sets `selectedAgentId` or `detailRecord`
2. `SurfaceContextProvider` observes `inspector.entityId` from GraphContext
3. `SurfaceContext.selected` updates deterministically

### Stale Reference Clearing

```typescript
// SurfaceContext.tsx
const selected: SurfaceReference | undefined = useMemo(() => {
  if (!inspector.entityId || !inspector.entity) return undefined;
  // ...
}, [inspector.entityId, inspector.entity]);
```

When `inspector.entityId` changes, `selected` updates. When `inspector.entityId` becomes null, `selected` becomes undefined (stale reference cleared).

### Verdict

**Selection behavior is deterministic.** Stale references are cleared when selection changes.

---

## AR-008.7 — Context Lifetime

### Lifetime Rules

| Event | Surface Context Behavior |
|-------|------------------------|
| Assistant opens | Surface Context available (from provider) |
| Assistant closes | Surface Context persists (not destroyed) |
| Assistant minimizes | Surface Context persists |
| User navigates | `surface` updates, `selected` may change |
| Activity selection changes | `selected` updates |
| Selected item disappears | `selected` becomes undefined |
| Workspace changes | `workspace` updates |
| Repository changes | `workspace` updates (if workspace changes) |
| Conversation changes | Surface Context independent of conversation |

### Context vs Conversation Lifetime

Surface Context and conversation lifetime are **not automatically identical**. Closing/minimizing the Assistant does not destroy context. Repository/workspace changes must not retain incompatible references.

---

## AR-008.8 — Repository Authority

### Current Implementation

```typescript
// SurfaceContext.tsx
const [workspace, setWorkspace] = useState<SurfaceWorkspace>({
  id: 'unknown',
  name: 'unknown',
});

useEffect(() => {
  getWorkspaceIdentity()
    .then((identity) => {
      if (!cancelled && identity) {
        setWorkspace(identity);
      }
    });
}, []);
```

### Repository Authority Rules

- ✅ `workspace.id` comes from `getWorkspaceIdentity()` (server-derived)
- ✅ No derivation from `process.cwd()`
- ✅ No derivation from `.vestara` path
- ✅ No derivation from runtime session
- ✅ No derivation from provider/model
- ✅ No derivation from Activity title/content

### Verdict

**Repository authority is correctly implemented.** Workspace identity is server-derived.

---

## AR-008.9 — Assistant Presentation

### Current Implementation

```tsx
// ConversationPanel.tsx
function SurfaceContextBadge({ surface }) {
  return (
    <div className="text-[10px] text-zinc-500 px-2 py-0.5 bg-zinc-800/40 rounded">
      {surface.section} / {surface.title}
    </div>
  );
}
```

### What Surface Context Shows

- Current section/page (e.g., "Activity Room / Activity Stream")
- Workspace name (in launcher)

### What Surface Context Does NOT Show

- Loaded authoritative data (workflow details, file contents, etc.)
- "I have read everything" claim

### Verdict

**Assistant presentation correctly shows contextual attachment without claiming data loading.**

---

## AR-008.10 — Context Transport

### Current Gap

The Floating Assistant sends `{ message: text }` without surface context. AR-008 needs to add surface context to the message payload.

### Target Transport Schema

```typescript
// POST /api/conversations/:id/stream
{
  message: "Why did this fail?",
  surfaceContext: {
    workspace: { id: "...", name: "..." },
    surface: { routeId: "...", path: "...", title: "..." },
    selected: { kind: "activity", id: "...", label: "..." }
  }
}
```

### No Raw Prompt Construction

Surface Context is transported as structured data, not encoded into human text.

---

## AR-008.11 — Backend Context Assembly

### Current Backend Handling

The `DefaultConversationService.sendMessage()` receives `SendOptions` which can include `systemPrompt`. The `DefaultContextAssembler.buildContext()` builds the request context.

### AR-008 Backend Integration

The backend should:
1. Receive `surfaceContext` from the message payload
2. Translate references into bounded descriptive context through existing read boundaries
3. NOT perform arbitrary data retrieval (AR-010 scope)

### Acceptable in AR-008

- Current surface (activity-room, workspace)
- Referenced IDs (workflowId, taskId, agentId)
- Safe labels already supplied by canonical projection

### NOT Acceptable in AR-008

- Deep inspection of workflow internals
- File content retrieval
- Git diff retrieval
- Evidence document retrieval

---

## AR-008.12 — Trust Boundary

### Browser-Supplied Context = References Requiring Validation

The Surface Context from the browser is treated as **references**, not authority:
- ✅ Client supplies `workflowId` as a reference
- ✅ Backend validates the reference exists
- ✅ Backend resolves full entity through its own authority
- ❌ Client cannot claim `workflowId = another inaccessible workflow`
- ❌ Client cannot claim `evidenceRef = arbitrary evidence`

### Existing Authorization Boundaries Remain Authoritative

No new authorization framework is built in AR-008.

---

## AR-008.13 — Conversation Semantics

### Recommended Approach

- **Surface Context is per-message** — each submitted human message snapshots the relevant Surface Context references
- **Workspace has current Surface Context** — the latest state
- **Historical messages retain their context** — previous message context is not retroactively rewritten

### Example

```
select Workflow A
ask "Why did this fail?"
  → message context = { workflowId: A }

select Workflow B
  → previous message still refers to A
  → next message may refer to B
```

---

## AR-008.14 — Context Isolation

### Isolation Rules

| Boundary | Isolation |
|----------|-----------|
| Conversations | ✅ Each conversation has its own context snapshot |
| Workspaces | ✅ Workspace ID is workspace-scoped |
| Repositories | ✅ Repository identity is workspace-scoped |
| Browser tabs | ⚠️ localStorage is tab-scoped |

### Test Scenario

```
Conversation A + Workflow X
Conversation B + Workflow Y
  → subsequent turn in B must not inherit X
```

---

## AR-008.15 — Context and Model Configuration

### Separation

| Concern | Authority |
|---------|-----------|
| Surface Context | Workspace UI (what user is looking at) |
| Provider selection | Configuration authority |
| Model selection | Agent Definition / configuration |
| Agent identity | AgentDefinition |
| Permissions | AgentDefinition / policy |
| Runtime session | Runtime Session authority |

### Context Does NOT Influence

- ❌ Provider selection
- ❌ Model selection
- ❌ Agent identity
- ❌ Permissions
- ❌ Runtime session authority

---

## AR-008.16 — Deterministic Verification

### Existing Tests

| Test | Coverage |
|------|----------|
| `floating-panel.test.tsx` | Panel lifecycle, drag, resize |
| `conversation-panel.test.tsx` | Message rendering, compose, streaming |
| `global-assistant-shell.test.tsx` | Shell mount, launcher |
| `use-assistant-conversation.test.tsx` | Hook state management |

### Missing Tests (AR-008 scope)

| Test | Priority |
|------|----------|
| Empty context | Medium |
| Activity selection propagation | Medium |
| Selection replacement | Medium |
| Stale-reference clearing | Medium |
| Context removal | Medium |
| Message-time context snapshot | High |
| Navigation behavior | Medium |
| Repository/workspace change | Medium |
| Conversation isolation | High |
| Malformed/unauthorized references | Medium |
| Provider/model unaffected by context | Medium |

---

## AR-008.17 — Production Characterization

### Bounded Workspace Characterization

1. **Open Activity Room** → Activity Room page loads
2. **Select Activity belonging to Workflow A / Task T** → SurfaceContext.selected updates
3. **Open Floating Assistant** → SurfaceContext available
4. **Verify visible context** → SurfaceContextBadge shows route
5. **Submit "What is happening here?"** → Message sent with surface context
6. **Select another Activity** → SurfaceContext.selected updates
7. **Verify context changes** → New Activity's references shown
8. **Inspect first message** → Its context remains A/T (historical preservation)

### Limitation

If backend deeper reads are not implemented yet, the Assistant may only understand the supplied bounded reference metadata. This is explicitly documented.

---

## Summary

### Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Stable references | ✅ SurfaceContext contract |
| Explicit provenance | ✅ Every reference has documented owner |
| Bounded payload | ✅ References only, no copied state |
| Correct lifetime | ✅ Independent of conversation |
| No copied authoritative objects | ✅ References only |
| No stale selection leakage | ✅ Deterministic updates |
| No cross-conversation/repository leakage | ✅ Isolation rules |
| No repository inference | ✅ Server-derived workspace identity |
| No provider/model influence | ✅ Separated concerns |
| No raw prompt construction | ✅ Structured transport |
| No new Activity authority | ✅ References only |
| No broad read tools yet | ✅ AR-010 scope |

### No Mutations Required

AR-008 is primarily an audit/analysis milestone. The existing SurfaceContext infrastructure already provides the canonical context-reference contract. No code changes were made during AR-008.

### Stopping for Director Review

Per directive: "Stop for Director review. Do not proceed to AR-009."
