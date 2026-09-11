---
title: AR-GA-005 — Activity Room Production Convergence Audit
version: 1.0.0
status: complete
owner: vestara
date: 2026-09-11
mode: exploration / audit / analysis only
---

# AR-GA-005 — Activity Room Production Convergence Audit

## 1. Executive Summary

Activity Room has **three generational layers** running simultaneously with **two separate SQLite databases**. The production architecture (M9→M10→M11A/M11B/M11C) is sound but incomplete — human message writes still route through the legacy path, making them invisible to the production UI. The domain model is mostly clean projections, but presence has three competing models. Global Assistant and Activity Room share Conversation/Message/ToolObservation contracts but have separate execution paths.

**Critical finding**: Human messages sent via `POST /api/messages` persist ONLY to `activity.db` (legacy), NOT to `m9-activity.db` (production). The M11C UI reads exclusively from M9. Human messages are invisible in the production Activity Room.

**Primary recommendation**: Complete the migration of human message writes to the M9 ingestion path before further Activity Room implementation.

## 2. Current Architecture

### Three Generational Layers

```
Legacy Layer (still active):
  activity-room.ts → activity.db → ActivityProjectionService → ActivityStreamHub
  organizational-bridge.ts → EventBus(*) → legacy room
  /api/messages (POST) → legacy room
  /ws/activity (legacy WS)

Production Layer (M11):
  M9IngestionBridge → m9-activity.db → ProjectionRuntime → ActivityStreamHub
  /api/activity-room/v1/* (M11A read API)
  /ws/activity-room/v1 (M11B WebSocket)

Production UI (M11C):
  useM11CActivityRoom hook → M11A snapshot + M11B WS → M11CActivityRoomPage
```

### Dual Persistence Problem

| Database | Writes From | Reads By |
|----------|------------|----------|
| `activity.db` | Human messages, organizational bridge | Legacy WS, workflow.ts |
| `m9-activity.db` | M9IngestionBridge (EventBus) | M11A, M11B, M11C |

**Human messages are invisible to M11C** — they only exist in `activity.db`.

### Domain Model Classification

| Concept | Classification |
|---------|---------------|
| Activity Record (M9) | AUTHORITATIVE |
| Participant (M10) | DERIVED / PROJECTION |
| Room metadata | DERIVED / PROJECTION |
| Execution identity | REFERENCE (from opencode-runtime) |
| Workflow | DERIVED / PROJECTION |
| Task | DERIVED / PROJECTION |
| Tool | DERIVED / PROJECTION |
| Attention | DERIVED / PROJECTION |
| Presence | AMBIGUOUS (3 competing models) |
| Message Receipts | DERIVED (in-memory only) |
| Effective State | DERIVED (pure function) |
| @Mention | UI-ONLY + DERIVED |
| Media Binding | DERIVED |

## 3. Global Assistant Integration

### Current State

| Aspect | Floating Assistant | Activity Room |
|--------|-------------------|---------------|
| Conversation authority | ConversationService (SQLite) | No conversation — messages are Activity Records |
| Message persistence | Message type (text + toolObservations) | ActivityRecord (append-only, 6 kinds) |
| Tool execution | OpenCode adapter → SSE | No direct tool execution |
| Tool observations | GA-CTX-001 (persisted on Message) | Tool calls as AgentMessageKind |
| Context assembly | DefaultContextAssembler | No context assembly |
| Identity | userId + conversationId | participantId + actor |

### Convergence Opportunities

**Shared contracts that could unify**:
- `Message` (conversation) ↔ `ActivityRecord` (room) — different shapes, different lifecycles
- `ToolObservation` (GA-CTX-001) ↔ `AgentMessageActivity.toolName` — overlapping but different
- `StreamChunk` (SSE) ↔ `ActivityRecord` (durable) — different transport, different durability

**Contracts that should NOT converge**:
- Conversation is ephemeral/session-scoped; Activity Room is durable/projected
- Conversation has a provider executor; Activity Room has no execution authority
- Conversation context is turn-bounded; Activity Room context is persistent

### Recommendation

Activity Room and Floating Assistant should remain **two UI surfaces over partially shared contracts**, NOT merge into one runtime. The Conversation service owns ephemeral turn context. Activity Room owns durable operational projection. They share:
- Actor identity (via canonical agent definitions)
- Tool observation semantics (ToolObservation format)
- Execution lineage (executionId, workflowRunId)

They diverge on:
- Persistence model (ephemeral vs durable)
- Execution authority (Conversation has provider executor; Activity Room has none)
- Context scope (turn-bounded vs persistent)

## 4. Entry Point / Surface Model

**Recommendation**: Two independent surfaces, partially shared contracts.

```
Floating Assistant (ephemeral, turn-scoped)
  ├── Conversation authority
  ├── Tool execution via OpenCode
  ├── GA-CTX-001 tool observations
  └── Context assembly per turn

Activity Room (durable, projected)
  ├── No execution authority
  ├── Observes execution via EventBus
  ├── Durable Activity Records
  └── Persistent participant/activity model
```

The Floating Assistant should be able to **project into** Activity Room (via EventBus → M9 ingestion), but Activity Room should NOT execute work.

## 5. Conversation Continuity

| Boundary | Survives? | Evidence |
|----------|----------|----------|
| Conversation identity → Activity Room | NO | Different ID systems (conv-xxx vs activity-xxx) |
| Actor identity | YES | Both use canonical agent IDs |
| Tool observations | PARTIAL | GA-CTX-001 persists on Message; Activity Room has AgentMessageKind |
| Execution lineage | YES | executionId is shared |
| Context | NO | Conversation context is turn-bounded; Activity Room has no context assembly |
| Permissions | YES | Both use governed permission paths |
| Artifacts/evidence | YES | Evidence pipeline is shared |

## 6. Production Readiness Assessment

| Area | Status |
|------|--------|
| Architecture / authority | NEAR READY — dual persistence needs resolution |
| Conversation continuity | PARTIAL — Floating Assistant → Activity Room path incomplete |
| Global Assistant integration | PARTIAL — shared contracts exist, convergence not wired |
| Execution integration | READY — M9 ingestion + agent lifecycle bridge |
| Tool continuity | PARTIAL — GA-CTX-001 done, Activity Room tool projection works |
| Context continuity | NOT READY — no context assembly in Activity Room |
| Permissions/governance | READY — governed permission paths |
| Realtime reliability | NEAR READY — M11B protocol solid, legacy WS still active |
| Persistence/recovery | PARTIAL — M9 durable, but human messages only in legacy DB |
| Failure handling | PARTIAL — basic error states exist |
| Observability | NEAR READY — Activity Room projects execution well |
| Performance | NEAR READY — 500-item backpressure, 500ms polling |
| UI/UX | NEAR READY — M11C is production-quality |
| Accessibility | PARTIAL — keyboard nav exists, audit needed |
| Testing | PARTIAL — 28 test files, coverage gaps |
| Dogfood usability | PARTIAL — human message visibility is the blocker |

## 7. Dogfood Scenario Status

| Step | Status | Evidence |
|------|--------|----------|
| 1. User opens Vestara Workspace | ✅ PASS | ShellLayout renders |
| 2. User invokes Floating Assistant | ✅ PASS | Ctrl+J toggle works |
| 3. User discusses a development task | ✅ PASS | Conversation service works |
| 4. Assistant inspects workspace using tools | ✅ PASS | Tool execution via OpenCode |
| 5. Tool observations survive subsequent turns | ⚠️ PARTIAL | GA-CTX-001 implemented, runtime HOLD |
| 6. User opens Activity Room | ✅ PASS | M11C page renders |
| 7. Conversation/execution context available | ⚠️ PARTIAL | Execution events projected, but conversation not shared |
| 8. User @mentions an agent | ⚠️ PARTIAL | @mention parsed in UI, but no execution dispatch |
| 9. Governed execution begins | ⚠️ PARTIAL | Harness path works, but not wired from Activity Room |
| 10. Activity Room displays execution/tool progress | ✅ PASS | M9 ingestion + projection works |
| 11. Permission requests appear | ✅ PASS | Interaction system works |
| 12. Agent produces artifacts/changes | ✅ PASS | Evidence pipeline works |
| 13. Verification/evidence projected | ✅ PASS | Verification projector works |
| 14. User and Assistant discuss result | ⚠️ PARTIAL | Assistant works, but Activity Room conversation is separate |
| 15. Work survives reload/reconnect | ⚠️ PARTIAL | M9 durable, but human messages only in legacy DB |
| 16. Vestara can build Vestara through this path | ⚠️ PARTIAL | Core path works, but gaps in continuity |

## 8. Recommended Milestone Sequence

### AR-GA-006: Human Message Migration to M9

**Objective**: Route human message writes through M9IngestionBridge so they appear in M11C.

**Scope**:
- Update `POST /api/messages` to emit through EventBus → M9 ingestion
- OR create M9 adapter for human messages
- Verify M11C displays human messages

**Dependencies**: None (uses existing M9 infrastructure)
**Risk**: Low — additive change, legacy path remains as fallback
**Authority affected**: Activity Room write path only

### AR-GA-007: Activity Room Context Assembly

**Objective**: Give Activity Room participants access to relevant context (recent tool observations, execution state).

**Scope**:
- Define Activity Room context contract
- Wire tool observations from EventBus into Activity Room projection
- Make execution context visible in Activity Room detail views

**Dependencies**: AR-GA-006
**Risk**: Medium — context scope needs careful design
**Authority affected**: Activity Room projection

### AR-GA-008: Floating Assistant ↔ Activity Room Bridge

**Objective**: Allow Floating Assistant work to be visible in Activity Room and vice versa.

**Scope**:
- Project Floating Assistant conversations into Activity Room as activity records
- Allow Activity Room to inspect prior assistant work
- Define explicit isolation boundaries

**Dependencies**: AR-GA-006, AR-GA-007
**Risk**: Medium — cross-surface integration
**Authority affected**: Conversation service, Activity Room projection

## 9. Blockers

1. **Human message visibility** — M11C cannot show human messages (AR-GA-006)
2. **Context continuity** — Activity Room has no context assembly (AR-GA-007)
3. **Presence model ambiguity** — 3 competing presence models need resolution
4. **Dual persistence** — activity.db and m9-activity.db coexist (AR-GA-006)

## 10. What NOT to Rebuild

- Activity Room projection pipeline (M9→M10→M11) — production quality
- M11B WebSocket protocol — frozen and working
- M11C UI hook — production quality
- Conversation service — works correctly
- Floating Assistant — works correctly
- Agent Harness — works correctly
- Evidence pipeline — works correctly
- Tool governance — works correctly

## 11. HOLDs

1. **Runtime verification of GA-CTX-001** — requires live Floating Assistant session
2. **Presence model convergence** — three competing models need architectural decision
3. **Activity Room conversation semantics** — whether Activity Room should have its own conversation model or share Conversation service

---

> **AR-GA-005 AUDIT COMPLETE**
