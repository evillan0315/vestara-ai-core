---
title: ARX-015 M9 — Durable Activity Room Evidence
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015 M9 — Durable Activity Room Evidence

**Status:** FROZEN  
**Date:** 2026-08-27  
**Build:** `tsc -b` clean, `pnpm lint:check` clean  
**Tests:** 46/46 M9 evidence, 197/197 agent-harness, 179/179 opencode-runtime, 141/141 activity-projection, 36/36 engineering-event-store

---

## M9 Objective

Establish the durable Activity Store substrate. Activity Room is a durable observer/projection of authoritative platform facts — never an orchestration authority.

---

## Ownership Rule (Proven)

```
WorkflowRunEngine → orchestration state
AiInvocationService → AI provider/model
RuntimeSessionRegistry → runtime continuity
ActivityStore → durable projection of the above
```

---

## Files Created/Modified

| File | Action |
|------|--------|
| `packages/types/src/activity.ts` | Created: ActivityRecord, ActivityEvent, ActivityCursor, ActivityQuery, ActivityStore interface, Participant, MembershipState, PresenceState, WorkState, MembershipEvent |
| `packages/types/src/workflow.ts` | Fixed: `WorkflowEvent.requestId` type (`WorkflowRunId` → `RequestId`) |
| `packages/activity-projection/src/m9-store.ts` | Created: `IdempotentActivityStore` (in-memory, for tests) |
| `packages/activity-projection/src/m9-sqlite-store.ts` | Created: `DurableActivityStore` (SQLite-backed, production persistence) |
| `packages/activity-projection/src/m9-adapter.ts` | Created: `fromWorkflowEvent`, `fromHumanMessage`, `fromAgentLifecycle` |
| `packages/activity-projection/__tests__/m9-durable-activity-room.test.ts` | Created: 32 evidence tests |
| `packages/activity-projection/__tests__/m9-final-durability-evidence.test.ts` | Created: 14 durability evidence tests |
| `docs/activity-room/arx-015-m9-evidence.md` | Created: this evidence document |

---

## Test Results

```
m9-durable-activity-room.test.ts:           32/32 pass
m9-final-durability-evidence.test.ts:       14/14 pass
agent-harness:                             197/197 pass (12 files)
opencode-runtime:                          179/179 pass (14 files)
activity-projection:                       141/141 pass (19 files)
engineering-event-store:                    36/36 pass (2 files)
```

---

## Area-by-Area Evidence

### Area 1-2: Actual Persistence Across Store Recreation ✅

**Proven:** `DurableActivityStore` backed by SQLite. Records survive close/reopen.

```
Store instance A
    ↓
append records
    ↓
close/dispose (db.export())
    ↓
destroy instance A
    ↓
create Store instance B from exported data
    ↓
query/replay
    → records preserved
    → sequence preserved
    → lineage preserved
    → eventId deduplication preserved
    → cursor continuity preserved
```

**Production persistence adapter exists:** `DurableActivityStore` (SQLite-backed). The in-memory `IdempotentActivityStore` is for tests only.

### Area 3: Cursor Stability Across Restart ✅

**Proven:** Client holding cursor C before restart can reconnect after restart with `getAfter(C)` and receive only subsequent records without gaps or duplicates.

### Area 4: Sequence-Number Authority ✅

**Documented:** Monotonic sequence allocation from `MAX(sequence_number)+1` in SQLite. Safe across:
- **Restart:** Continues from `MAX + 1` in persisted data
- **Concurrent append:** `allocateSequence()` reads `MAX` then inserts; serialized by SQLite
- **Replay:** Returns existing records with their original sequence numbers
- **Rebuild:** Returns existing records with their original sequence numbers — does NOT regenerate

### Area 5: Dynamic Participant / Membership ✅

**Proven:** `Participant` interface with `MembershipState`, `PresenceState`, `WorkState`. No hardcoded Planner/Developer/Reviewer/Verifier identities. `ActivityActorType = 'human' | 'agent' | 'system'`.

### Area 6: Membership, Presence, Work State Separation ✅

**Proven:** Three distinct contracts:
- `MembershipState` (joined/left/assigned) — durable
- `PresenceState` (online/offline/idle/disconnected) — transient, M10 owns
- `WorkState` (available/working/waiting/blocked/attention-required) — durable facts

### Area 7: Human Message Restart Durability ✅

**Proven:** Human message + agent activity + workflow activity all survive restart with equal durability.

### Area 8: Rebuild Non-Destructive ✅

**Proven:** `rebuild()` returns all records in deterministic order. Does NOT regenerate:
- Record identity (`activityId`)
- Sequence numbers
- Timestamps
- Canonical lineage

### Area 9: Concurrency Proof ✅

**Proven:**
- `Promise.all(50 × same eventId)` → 1 durable record (both in-memory and SQLite)
- `Promise.all(50 × distinct eventIds)` → 50 unique sequence numbers
- Survives close/reopen (dedup at database level, not just in-memory map)

### Area 10: Future Extensibility ✅

**Proven:** `ActivityRecord.payload` supports arbitrary normalized facts:
- Browser testing: `{ domain: 'browser-testing', artifacts: [...] }`
- Telegram: `{ channel: 'telegram', chatId: '...' }`
- Marketplace agents: `{ marketplace: true, agentType: 'installed' }`

Large evidence (screenshots, video, traces) referenced as artifacts, not embedded.

---

## Final Freeze Scenario

```
Human joins room          → human.message (membership)
Human sends message       → human.message (M1 lineage)
Workflow starts           → workflow.started (M1 lineage)
Planner/agent starts work → task.started + agent.started
Task completes            → task.completed
Another agent begins      → task.started + agent.started
Workflow completes        → workflow.completed (M1 lineage)
```

### Proven Counts

| Check | Result |
|-------|--------|
| Durable records preserved | ✅ 9 records |
| Human messages preserved | ✅ 2 |
| Canonical lineage preserved | ✅ executionId, traceId on all applicable |
| Event deduplication preserved | ✅ 0 duplicates |
| Cursor continuity preserved | ✅ cursor after 9th record |
| Deterministic ordering | ✅ monotonic sequence |
| Hardcoded participants | ✅ 0 (generic agent IDs only) |
| Provider-specific leakage | ✅ 0 |
| OpenCode-specific leakage | ✅ 0 |
| Live provider calls | ✅ 0 |
| Live OpenCode sessions | ✅ 0 |

---

## Sign-off

- [x] All 10 M9 areas proven
- [x] Durable persistence adapter exists (SQLite-backed)
- [x] Persistence survives close/reopen
- [x] Concurrency proof at persistence boundary
- [x] Participant/membership types established
- [x] Rebuild non-destructive
- [x] No regressions in M1–M8 test suites
- [x] Build clean (`tsc -b`)
- [x] Lint clean (`pnpm lint:check`)
- [x] Zero live side effects

**M9 Status: FROZEN. Authorize M10 — Projection & Attention.**
