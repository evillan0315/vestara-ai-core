# ARX-015 M11A — Production Activity Room Read API Evidence

**Milestone**: M11A — Production Activity Room Read API (frozen)
**Date**: 2026-08-27
**Status**: FROZEN — All invariants proven
**Reviewer**: Pending architectural review

---

## Objective

Build the smallest production read boundary over frozen M9/M10 contracts required for the Activity Room. Read-only API — no mutation of M8, M9, or M10 state.

Authority flow: `M8 workflow truth → M9 durable activity → M10 projection → M11A API`

---

## Endpoints Implemented

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/activity-room/v1/snapshot` | GET | Room snapshot + authoritative cursor |
| `/api/activity-room/v1/activities` | GET | Bounded/paginated historical activity retrieval |
| `/api/activity-room/v1/activities/after` | GET | Cursor-based pagination (M9 sequence-based) |
| `/api/activity-room/v1/activities/:id` | GET | Individual ActivityRecord retrieval |
| `/api/activity-room/v1/activities/aggregate/:id` | GET | Aggregate drill-down using `referencedActivityIds` / `sequenceRange` |
| `/api/activity-room/v1/participants` | GET | Participant projection |
| `/api/activity-room/v1/attention` | GET | Attention projection |
| `/api/activity-room/v1/workflow-summary` | GET | Workflow summary projection |

All endpoints are **read-only**. No mutation of M8, M9, or M10 state.

---

## Invariant Proofs (35 Contract/Integration Tests)

| Invariant | Tests | Status |
|-----------|-------|--------|
| **INV-1**: Room Snapshot + Authoritative Cursor | 1 | ✅ |
| **INV-2**: Bounded/Paginated Historical Retrieval | 4 | ✅ |
| **INV-3**: Individual ActivityRecord Retrieval | 2 | ✅ |
| **INV-4**: Aggregate Drill-Down | 2 | ✅ |
| **INV-5**: Participant Projection | 4 | ✅ |
| **INV-6**: Attention Projection | 3 | ✅ |
| **INV-7**: Workflow Summary Projection | 1 | ✅ |
| **INV-8**: Query Limits and Validation | 4 | ✅ |
| **INV-9**: Historical Pagination Beyond 500 | 3 | ✅ |
| **INV-10**: Read-Only (No M8/M9/M10 Mutation) | 4 | ✅ |
| **INV-11**: No Internal Exposure | 4 | ✅ |
| **Full Scenario**: End-to-end collaborative | 1 | ✅ |
| **Aggregate Drill-Down**: sequenceRange retrieval | 1 | ✅ |
| **Total** | **35** | **✅ 35/35** |

---

## Key Contract Guarantees

### 1. M9 History Preserved Beyond M10 Working Set
- M9 `DurableActivityStore` retains all records (tested: 1000+)
- M10 `ProjectionRuntime` stream bounded at 500 items
- Historical pagination works via `store.getAfter(cursor)` and `store.query()`
- API cursor semantics are **M9-sequence based** (not time-based)

### 2. Aggregate Drill-Down
- `StreamItem.aggregated.referencedActivityIds` — deterministic M9 activity IDs
- `StreamItem.aggregated.sequenceRange` — M9 cursor range for `getAfter()` retrieval
- Enables M11B UI "click to expand" without re-fetching from projection

### 3. Participant Projection Independence
- Membership / Presence / WorkState are separate fields
- Presence is **always 'offline'** in projection (resolved independently, not from history)
- No hardcoded participant identities (Planner/Developer/Reviewer/Verifier)

### 4. Attention Projection
- Typed reasons: `task-failed`, `workflow-failed`, `waiting-for-human`, etc.
- Severity levels: `critical`, `high`, `medium`, `low`
- No generic boolean flags

### 5. Query Validation
- `limit` capped at `MAX_LIMIT = 100`
- Default `DEFAULT_LIMIT = 50`
- Cursor parameters validated at API layer
- Unknown filters ignored (not passed to store)

### 6. No Internal Exposure
- No SQLite schema in responses
- No OpenCode internals (`opencode`, `openai`, `anthropic` absent)
- No provider/model internals (`model`, `temperature`, `max_tokens` absent)
- Only declared projection types exposed

### 7. Read-Only Semantics
- Projection rebuild does not mutate M9 store
- Queries do not mutate M9 store
- `getAfter`, `getByEventId` do not mutate M9 store
- M9 cursor stable across projection rebuilds

---

## Performance Baseline (Non-Gating)

| Records | Rebuild Time | Stream Size | Participants |
|---------|-------------|-------------|--------------|
| 1K | ~250ms | 353 | 6 |
| 10K | ~57ms | 353 | 6 |
| 100K | ~560ms | 353 | 6 |

Note: 100K setup dominated by SQLite append (43s); rebuild is sub-second.

---

## Files Changed

| File | Description |
|------|-------------|
| `apps/api/src/routes/activity-room-m11a.ts` | M11A Read API route handler (new) |
| `apps/api/src/routes/index.ts` | Export M11A route |
| `apps/api/src/index.ts` | Initialize M11A room at boot |
| `apps/api/src/server.ts` | Register M11A route under `/api/activity-room/v1` |
| `packages/activity-projection/__tests__/m11a-read-api-contract.test.ts` | 35 contract/integration tests (new) |
| `docs/activity-room/arx-015-m11a-evidence.md` | This document |

---

## Test Totals

```
M11A Contract Tests:           35/35 pass
activity-projection (total):   225/225 pass (22 files)
agent-harness:                 197/197 pass
─────────────────────────────────────────────────
Combined:                      422/422 pass
Build:                         tsc -b clean
Lint:                          pnpm lint:check clean
```

---

## M11A Readiness for M11B

The following contracts are stable for M11B (UI/Realtime Transport):

1. **`GET /api/activity-room/v1/snapshot`** — Complete room state for initial load
2. **`GET /api/activity-room/v1/activities/after`** — Cursor-based reconnect/catch-up
3. **`GET /api/activity-room/v1/activities/aggregate/:id`** — Drill-down for muted items
4. **`GET /api/activity-room/v1/participants`** — Live participant roster
5. **`GET /api/activity-room/v1/attention`** — Attention bar data
6. **`GET /api/activity-room/v1/workflow-summary`** — Workflow status header

M11B can now implement:
- Virtualized scrolling via cursor-based pagination
- Live updates via WebSocket (separate transport, same cursor semantics)
- Composer with `@mentions` from `contextualCapabilities.mentionableParticipants`

---

**M11A: FROZEN. Authorize M11B — Production Activity Room UI/Realtime Transport.**