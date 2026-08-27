# ARX-015 M10 — Projection & Attention Evidence

**Milestone**: M10 — Projection & Attention
**Date**: 2026-08-27
**Status**: FROZEN
**Reviewer**: Pending architectural review

---

## Objective

Transform durable M9 ActivityRoom facts into a live, reconstructable collaboration projection. M10 is a projection layer — never an orchestration authority.

## Deliverables

### Types (`packages/types/src/projection.ts`)

| Type | Description |
|------|-------------|
| `StreamItemKind` | Content classification: conversation, activity, progress, log, diagnostic, evidence, telemetry |
| `StreamImportance` | Visual importance: primary, secondary, muted |
| `StreamItem` | Projected stream item with importance classification |
| `ParticipantProjection` | Projected participant with membership, presence, work state, assignment |
| `AttentionReason` | Typed reasons: task-failed, task-blocked, workflow-failed, attention-required, waiting-for-human, dependency-unavailable, retry-needed, material-change |
| `AttentionSeverity` | Severity levels: critical, high, medium, low |
| `AttentionEntry` | Attention entry with reason, severity, acknowledgement |
| `WorkflowSummary` | Workflow status summary for the room |
| `ContextualCapabilities` | M11 composer discovery: mentionable participants, available commands, referenceable entities |
| `ActivityRoomProjection` | Complete projection state for M11 |

### Projection Runtime (`packages/activity-projection/src/m10-projection-runtime.ts`)

`ProjectionRuntime` class:
- `rebuild(records)` — Rebuild entire projection from M9 durable records
- `processRecord(record)` — Process new activity incrementally (live updates)
- `getProjection()` — Get current projection state

### Evidence Tests (27 tests, 10 areas)

| Area | Tests | What it proves |
|------|-------|----------------|
| 1 | 2 | Projection rebuild equivalence — same records produce equivalent state |
| 2 | 2 | Cursor disconnect/reconnect/catch-up — no lost activities |
| 3 | 5 | Participant projection — dynamic membership, independent presence, work state from facts |
| 4 | 5 | Attention model — typed reasons, severity, auto-resolve, deduplication |
| 5 | 4 | Stream importance — classification, muting, aggregation, backpressure |
| 6 | 1 | Workflow summary — status lifecycle tracking |
| 7 | 3 | Contextual capabilities — mentionable participants, commands, referenceable entities |
| 8 | 2 | No domain-authority leakage — projection doesn't mutate M9, no provider leakage |
| 9 | 1 | Full collaborative scenario — human join → workflow → agents → fail → restart → replay |
| 10 | 2 | Live provider/OpenCode session prohibition |

## Invariant Evidence

### Reconstructability

Given the same ordered M9 records, rebuilding produces equivalent projection state. Proved by rebuilding twice from identical records and comparing participants, stream items, attention entries, cursor, and workflow summary.

### Cursor Semantics

Client lifecycle:
```
initial load → history/snapshot → cursor C → live activity
→ disconnect → durable records continue → reconnect(C) → catch-up → resume live stream
```

Proved by: initial rebuild → capture cursor → append new records → `getAfter(cursor)` → `processRecord()` → verify cursor advances.

### Participant ≠ ActivityActor

ActivityActor tells who produced an activity. ParticipantProjection represents room membership with separate membership/presence/workState fields.

### Presence Not Inferred from History

Historical activity `Developer started task yesterday` does NOT imply `Developer online now`. All participants default to `presence: 'offline'`. Presence requires explicit ephemeral semantics (connection/heartbeat/lease expiry) — M10 does not implement this transport.

### Work State from Authoritative Facts

| Activity Type | Derived Work State |
|---------------|-------------------|
| task.started / agent.started | working |
| task.completed / agent.completed | available |
| task.failed / agent.failed | attention-required |
| agent.waiting | waiting |
| task.runnable (agent) | available |

### Attention Model

Typed reasons and severity:
- `task.failed` → severity: high
- `workflow.failed` → severity: critical
- `agent.waiting` → severity: medium
- `agent.failed` → severity: high

Auto-resolves when task completes. Deduplicates for same task/reason.

### Stream Importance

| Activity Type | Importance |
|---------------|-----------|
| human.message | primary |
| workflow.started/completed/failed | primary |
| task.started/completed/failed | secondary |
| agent.progress/log/telemetry | muted |

Muted items aggregated at threshold (≥5). Aggregated items show summary: "24 logs · 3 tools · 1 warning".

### Backpressure

Stream bounded to MAX_STREAM_ITEMS=500. Old muted items trimmed first.

### No Domain-Authority Leakage

M10 projections say:
- workflow running
- Developer working
- task blocked
- attention required

M10 does NOT cause those authoritative states. Commands flow:
```
UI → owning service → policy → authoritative mutation → canonical event → M9 → M10 → UI
```

## Scenario Evidence

```
Human joins → Human message → Planner working → Developer waiting
→ Planner completes → Developer working → noisy logs/progress
→ summarized muted activity → Developer fails → attention required
→ retry/completion
```

Assertions proved:
- hardcoded participants: 0
- duplicate projected activities: 0
- lost activities after reconnect: 0
- projection rebuild drift: 0
- raw-log flooding: bounded
- stale permanent presence: 0
- authoritative mutations from M10: 0
- provider/OpenCode leakage: 0
- live provider calls: 0
- live OpenCode sessions: 0

## Test Totals

```
M10 evidence:                    27/27 pass
activity-projection (total):    168/168 pass (20 files)
agent-harness:                  197/197 pass (12 files)
─────────────────────────────────────────────────
Combined:                       365/365 pass
Build:                          tsc -b clean
Lint:                           pnpm lint:check clean
```

## Files Changed

| File | Description |
|------|-------------|
| `packages/types/src/projection.ts` | M10 projection types (new) |
| `packages/types/src/index.ts` | Added `projection` export |
| `packages/activity-projection/src/m10-projection-runtime.ts` | ProjectionRuntime implementation (new) |
| `packages/activity-projection/src/index.ts` | Added `ProjectionRuntime` export |
| `packages/activity-projection/__tests__/m10-projection-evidence.test.ts` | 27 evidence tests (new) |
| `docs/activity-room/arx-015-m10-evidence.md` | This document |
