---
title: "ARX-015 Participant Audit: Why Only the Local Human Appears"
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015 Participant Audit: Why Only the Local Human Appears

**Date**: 2026-08-28
**Classification**: Audit-only (no implementation changes)
**Trigger**: Workspace UI Participants panel shows only `human-local`

---

## 1. Root Cause

**The M9IngestionBridge subscribes to EventBus event types that no production code emits for agent activity.**

The bridge's 12 INGEST patterns (`agent:started`, `agent:completed`, `conversation:response.completed`, `orchestration.*`, etc.) do not overlap with the event types the agent harness actually produces (`harness.*`). As a result, zero agent activity records exist in M9, the M10 projection has no agent actors to derive participants from, and the M11A API returns only the human participant.

### Evidence

| Source | Agent Records | Human Records | Total |
|--------|:------------:|:-------------:|:-----:|
| M9 DurableActivityStore | **0** | 10 | 10 |
| Legacy ActivityLogStore | ~100+ | varies | ~25,000+ |

The legacy Activity Room (`GET /api/activity-room`) has agent participants (agent-reviewer, agent-developer, etc.) because they were ingested through the old `ActivityService → ActivityLogStore` path. The M9 bridge path — which is the M11A/M11C Activity Room's authority — has none.

---

## 2. Canonical Participant Authority

### Where participants are created

**Single creation site**: `M10ProjectionRuntime.updateParticipantFromRecord()` at `packages/activity-projection/src/m10-projection-runtime.ts:128-161`.

Every M9 `ActivityRecord` that passes through `rebuild()` or `processRecord()` triggers this method. The participant ID formula is:

```
participantId = `${actor.type}-${actor.id}`
```

Examples:
- `human-local` (human, id=local)
- `agent-developer` (agent, id=developer)
- `agent-vestara` (agent, id=vestara)

### How the human is seeded

The human participant is **not hardcoded in the UI**. It is derived from durable M9 records:

1. `POST /api/conversations` → `conversationService.createConversation()` → emits `conversation:created`
2. M9IngestionBridge catches `conversation:created` → calls `fromHumanMessage()` adapter
3. `fromHumanMessage()` produces `ActivityEvent` with `actor: { type: 'human', id: 'local' }`
4. `DurableActivityStore.append()` persists to M9
5. M10 `updateParticipantFromRecord()` creates `human-local` participant
6. M11A `/snapshot` returns it in `participants[]`
7. Workspace UI `useM11CActivityRoom` hook sets `setParticipants(snapshot.participants)`
8. `M11CParticipantRail` renders whatever it receives

**Key**: The human's `participantId` depends on `event.actor?.id` or `event.payload.userId` from the EventBus, with `'local'` as fallback.

### Do AI agents have an equivalent path?

**No.** The bridge expects `agent:started`/`agent:completed` events, but:

- **`agent:started`**: No production emitter exists. Zero matches in non-test code.
- **`agent:completed`**: One emitter exists in `packages/workspace/src/agent-service.ts:94`, but this is the legacy agent service, not the harness.
- **`conversation:response.completed`**: Emitted by the conversation service (`packages/conversation/src/index.ts:348`), but the bridge hardcodes `agentId: 'vestara'` for this event. Even if received, it would produce `agent-vestara` only.
- **`orchestration.*`**: Emitted by `OrchestrationEventBridge` (`apps/api/src/bridges/orchestration-event-bridge.ts:78`), but with `actor: { id: 'orchestrator', role: 'system' }` — producing `system-orchestrator`, not agent participants.

---

## 3. Participant Identity Semantics

### Current type definition

**File**: `packages/types/src/projection.ts:100-131`

```typescript
interface ParticipantProjection {
  participantId: string;          // "human-local", "agent-developer"
  type: ActivityActorType;       // 'human' | 'agent' | 'system'
  displayName: string;
  membership: MembershipState;   // 'joined' | 'left' | 'assigned'
  presence: PresenceState;       // 'online' | 'offline' | 'idle' | 'disconnected'
  workState: WorkState;          // 'available' | 'working' | 'waiting' | 'blocked' | 'attention-required'
  currentAssignment?: { workflowRunId, taskId, taskTitle? };
  joinedAt: string;
  lastActivityAt: string;
}
```

### Identity derivation chain

```
EventBus event
  → M9IngestionBridge.mapToActivityEvent()
    → adapter (fromHumanMessage / fromAgentLifecycle / fromWorkflowEvent)
      → ActivityEvent { actor: { type, id, displayName } }
        → DurableActivityStore.append()
          → ActivityRecord { actor: { type, id, displayName } }
            → M10 updateParticipantFromRecord()
              → ParticipantProjection { participantId: "${type}-${id}", ... }
```

### Stable identity vs runtime binding

- **Stable identity**: `participantId` (e.g., `agent-developer`) — derived from actor type + id
- **Display name**: `displayName` — comes from EventBus event payload
- **Role**: Not stored in participant. The harness emits `actor.role: 'system'` for all agents.
- **Provider/model**: Not stored in participant. Changes silently.
- **Presence**: Always initialized to `'offline'` (line 154). Never derived from history.
- **Work state**: Derived from activity type (`agent.started` → `'working'`, `agent.completed` → `'available'`)

### Where identity is impoverished

1. **`mapWorkflowActor()` at `m9-adapter.ts:74-79`**: Workflow events without `agentAssignmentId` become `{ type: 'system', id: 'workflow-engine' }` — original agent identity lost.
2. **`fromAgentLifecycle()` at `m9-adapter.ts:239-244`**: Agent identity comes from caller. Bridge uses `event.payload.agentId` with `'unknown'` fallback.
3. **Harness `emit()` at `agent-harness/src/index.ts:1095`**: Sets `actor: { id: identity.agentId || 'agent-harness', role: 'system' }` — role is always `'system'`.

---

## 4. Runtime Lifecycle

### What event should make an AI visible?

The M10 projection creates participants from `ActivityRecord.actor` fields. The expected event flow:

```
Agent becomes involved in workflow
  → EventBus emits agent lifecycle event
    → M9IngestionBridge catches it
      → fromAgentLifecycle() adapter
        → DurableActivityStore.append()
          → M10 updateParticipantFromRecord()
            → Participant appears in projection
```

### Does such an event exist?

**Partially.** The harness emits `harness.turn.started`, `harness.model.started`, etc. These carry `identity.agentId`. But:

1. The bridge does not subscribe to `harness.*` patterns
2. The bridge subscribes to `agent:started`/`agent:completed` — which the harness does not emit
3. The `OrchestrationEventBridge` emits `orchestration.*` events, but with `actor.id = 'orchestrator'`, not the agent

### What happens on workflow completion?

No participant state transition occurs. The M10 projection does not have a concept of "agent left the room." Participants persist forever in the projection once created.

---

## 5. Persistence/Projection Path

### M9 → M10 → M11A path

```
M9 DurableActivityStore (SQLite)
  → store.rebuild() → all ActivityRecords
    → M10 ProjectionRuntime.rebuild(records)
      → for each record: updateParticipantFromRecord()
        → this.participants Map (in-memory)
          → getProjection() → { participants: [...], ... }
            → M11A /snapshot → sanitizeParticipant()
              → JSON response
                → Workspace UI setParticipants()
```

### Where agent identity is lost

**The loss is at the source: M9 has zero agent records.**

The M10/M11A layers are identity-transparent. They faithfully reflect whatever M9 contains. The problem is upstream:

| Layer | Status | Agent Records? |
|-------|--------|:--------------:|
| EventBus | `harness.*` events emitted | N/A (different namespace) |
| M9 Bridge INGEST patterns | Expects `agent:started/completed` | **Gap: no overlap** |
| M9 DurableActivityStore | Only `human.message` records | **0** |
| M10 ProjectionRuntime | Projects from M9 records | **0 participants** |
| M11A API | Returns projection | **1 participant (human-local)** |
| Workspace UI | Renders received participants | **1 participant** |

### Is this missing ingestion, materialization, projection loss, API filtering, or UI filtering?

**Missing ingestion.** The M9 bridge never receives agent activity events because the harness emits `harness.*` events, not `agent:started`/`agent:completed`. The bridge's INGEST patterns were designed for a different event namespace than what the harness actually produces.

---

## 6. Existing Architectural Decisions (UD-3)

**UD-3** recommends a participant table in `activity.db` but remains **pending and unauthorized**.

Current state: Participants are **derived entirely from M9 activity records** at projection time. There is no persistent participant registry. This means:

- Participants appear only after their first activity record
- Participants persist forever once created (no leave/disconnect lifecycle)
- No pre-population of known agents
- No stable identity independent of activity history

**UD-3 would add**: A durable participant table that stores participant identity separately from activity records. This would enable:
- Pre-population of known agents at room creation
- Stable identity across provider/model changes
- Explicit join/leave lifecycle
- Presence tracking independent of activity

**Whether UD-3 is required for this fix**: No. The immediate defect is that the bridge doesn't ingest agent events. Fixing the ingestion gap would make agents appear in the M9 store, which would flow through the existing M10 projection. UD-3 would improve participant quality but is not required for basic visibility.

---

## 7. Data-Flow Diagram

### Current (broken)

```
Harness emits harness.turn.started
  → EventBus (type: "harness.turn.started")
  → M9 Bridge: not subscribed to "harness.*" → SILENTLY DROPPED
  → M9: zero agent records
  → M10: zero agent participants
  → M11A: 1 participant (human-local)
  → UI: 1 participant shown
```

### Legacy path (working, different system)

```
Harness emits harness.turn.started
  → ActivityService (subscribes to harness.*)
  → ActivityLogStore (packages/activity-log)
  → Legacy /api/activity-room endpoint
  → Legacy ActivityRoom component
  → Agent participants visible (agent-reviewer, agent-developer, etc.)
```

### Two parallel Activity Room systems

| System | Store | API | UI Component | Agent Visible? |
|--------|-------|-----|-------------|:--------------:|
| Legacy | ActivityLogStore | `/api/activity-room` | `ActivityRoom.tsx` | **Yes** |
| M11C | M9 DurableActivityStore | `/api/activity-room/v1/snapshot` | `M11CActivityRoomPage.tsx` | **No** |

The Workspace UI calls **both** endpoints. The Participants panel uses the M11A snapshot (which has no agents). The stream/history uses the legacy endpoint (which has agents).

---

## 8. Smallest Correct Remediation

### Option A: Add `harness.*` to bridge INGEST patterns (minimal)

Add `harness.turn.started`, `harness.model.started`, `harness.tool.*` etc. to the bridge's INGEST patterns, with adapters that map harness identity to agent participant identity.

**Pros**: Minimal change, works within existing architecture
**Cons**: Bridge accumulates knowledge of harness internals; harness events are operational, not all are "Activity Room facts"

### Option B: Emit `agent:started`/`agent:completed` from the harness (clean)

Add `agent:started` and `agent:completed` emissions to the harness at appropriate lifecycle points (turn start, turn completion). These would be caught by the existing bridge patterns.

**Pros**: Clean separation; bridge stays generic; harness owns its lifecycle events
**Cons**: Requires harness modification; need to determine exact emission points

### Option C: Emit `agent:started`/`agent:completed` from a composition-root bridge (compositional)

Create an `AgentLifecycleBridge` in `apps/api/src/bridges/` that subscribes to `harness.*` events and re-emits `agent:started`/`agent:completed` with proper actor identity.

**Pros**: No harness modification; composition root owns the mapping; follows existing bridge pattern (like `OrchestrationEventBridge`)
**Cons**: Additional bridge to maintain

### Recommendation

**Option C** is the smallest correct remediation. It follows the existing composition-root bridge pattern, doesn't modify the harness, and gives the bridge clean `agent:started`/`agent:completed` events to ingest.

However, this is an **implementation recommendation**, not an authorization. The Director decides.

---

## 9. Tests/Evidence Required

If remediation is authorized:

1. **Unit test**: `AgentLifecycleBridge` maps `harness.turn.started` → `agent:started` with correct actor identity
2. **Integration test**: End-to-end from harness emit → M9 record → M10 participant → M11A API response
3. **Production evidence**: After fix, M9 contains agent records; M11A `/participants` returns agent participants
4. **Regression test**: Existing M9 ingestion tests still pass
5. **UI evidence**: Workspace UI Participants panel shows agent participants

---

## 10. Adjacent Findings

1. **Two parallel Activity Room systems**: Legacy (`ActivityLogStore` + `/api/activity-room`) and M11C (`M9` + `/api/activity-room/v1/*`) coexist. The UI calls both. This creates confusion about which is authoritative. **Classification: OBSERVATION** — architectural debt, not blocking.

2. **Harness role always `'system'`**: The harness sets `actor.role: 'system'` for all agents (`agent-harness/src/index.ts:1095`). This means even if agent events were ingested, participants would have `role: 'system'` instead of their actual role (Planner, Developer, etc.). **Classification: OBSERVATION** — identity quality issue.

3. **No participant leave/disconnect lifecycle**: Once created, participants persist forever in the M10 projection. There is no mechanism for an agent to "leave" the room or transition to offline. **Classification: OBSERVATION** — lifecycle gap.

4. **`conversation:response.completed` hardcodes `agentId: 'vestara'`**: The bridge hardcodes the agent identity for conversation responses (`m9-ingestion-bridge.ts:338-339`). Even if this event were received, it would only produce `agent-vestara`, not the specific model/provider. **Classification: OBSERVATION** — identity quality issue.

5. **Presence always `'offline'`**: The M10 projection initializes all participants to `presence: 'offline'` (`m10-projection-runtime.ts:154`). Presence is never derived from history or updated by the projection. It would need a separate realtime mechanism. **Classification: OBSERVATION** — design gap, not blocking.

---

## 11. Conclusion

The Participants panel shows only the local human because the M9IngestionBridge's INGEST patterns (`agent:started`, `agent:completed`) do not match the event types the harness actually emits (`harness.*`). Zero agent records exist in M9, so zero agent participants appear in the M10 projection.

This is an **implementation defect under already-frozen contracts** — the bridge was designed to ingest agent events, but the harness was never wired to emit them in the bridge's expected namespace. The fix is a composition-root bridge that maps `harness.*` events to `agent:started`/`agent:completed` events.

UD-3 (participant table) is **not required** for this fix. The existing M10 projection can derive participants from M9 records — the records just need to exist.
