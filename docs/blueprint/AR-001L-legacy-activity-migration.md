---
title: AR-001L — Legacy Activity Migration & Removal
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# AR-001L — Legacy Activity Migration & Removal

**Author**: Vestara Developer Agent  
**Date**: 2026-09-04  
**Prerequisite**: AR-000, AR-001, AR-001R, AR-001C (all frozen)

---

## Summary

Removed `@vestara/activity-log` package and all legacy Activity infrastructure. Vestara now has ONE Activity capability (`@vestara/activity-room`), ONE contract authority, and ONE canonical realtime architecture (M11B WebSocket).

---

## Consumer Inventory (AR-001L.1)

### Production Consumers Removed

| Consumer | File | Action |
|----------|------|--------|
| Legacy API routes | `apps/api/src/routes/activity.ts` | **REMOVED** — superseded by M11A API |
| Activity service wiring | `apps/api/src/workspace-context.ts` | **REMOVED** — ActivityLogStore, ActivityService, NotificationService, NotificationStore creation |
| Server ActivityService | `apps/api/src/server.ts` | **REMOVED** — ActivityService import, onEvent wiring, emitDirect |
| API runtime | `apps/api/src/runtime/api-runtime.ts` | **REMOVED** — ActivityService type, activity getter |
| Activity route registration | `apps/api/src/routes/index.ts` | **REMOVED** — handleActivityRoute export |
| Activity route in server | `apps/api/src/server.ts` | **REMOVED** — `/api/activity-log` and `/api/activity` route registration |
| Legacy activity query | `apps/api/src/routes/execution.ts` | **REMOVED** — `ctx.activityStore.query()` call |
| Legacy activity query | `apps/api/src/routes/diagnostics.ts` | **REMOVED** — `ctx.activityStore.query()` call |
| Notifications route | `apps/api/src/routes/notifications.ts` | **REWRITTEN** — returns empty results (NotificationService removed) |
| CLI activity | `apps/cli/src/context/cli-context.ts` | **REMOVED** — ActivityLogStore, ActivityService creation |
| CLI runtime | `apps/cli/src/runtime/cli-runtime.ts` | **REMOVED** — ActivityService type, activity getter |
| events-server bridge | `packages/events-server/src/index.ts` | **REMOVED** — registerActivityService function |
| events-server query | `packages/events-server/src/index.ts` | **REWRITTEN** — returns empty results |

### Package Removal

| Package | Action |
|---------|--------|
| `packages/activity-log/` | **REMOVED** — entire directory |
| `apps/api/package.json` | `@vestara/activity-log` dependency removed |
| `apps/cli/package.json` | `@vestara/activity-log` dependency removed |
| `apps/api/tsconfig.reference.json` | activity-log reference removed |
| `apps/cli/tsconfig.reference.json` | activity-log reference removed |

### Test/Config Consumers Updated

| File | Action |
|------|--------|
| `packages/sqlite-migrations/__tests__/drift-guard.test.ts` | activity-log store references removed |
| `packages/conversation-runtime/src/audit/scanner.ts` | activity-log package reference removed |

---

## Capability Equivalence (AR-001L.2)

| Capability | Legacy (activity-log) | Activity Room | Migration |
|-----------|----------------------|---------------|-----------|
| Append | `ActivityLogStore.append()` | `ActivityProjectionService.appendActivity()` | ✅ Canonical |
| Query | `ActivityLogStore.query()` | `M9ActivityStore.query()` | ✅ Canonical |
| Ordering | SQLite sequence | MonotonicSequence | ✅ Canonical |
| Persistence | SQLite (vestara-activity.db) | SQLite (activity.db) | ✅ Canonical |
| Filtering | category, type, limit, before | workflowId, kind, severity, limit | ✅ Canonical |
| Streaming | ActivityService.onEvent | ActivityStreamHub + M11B WebSocket | ✅ Canonical |
| Serialization | JSON | JSON | ✅ Same |
| Identifiers | id, timestamp | activityId, eventId, sequenceNumber | ✅ Canonical |
| Pagination | limit, before | afterSequence, beforeSequence, limit | ✅ Canonical |
| Error behavior | graceful fallback | graceful fallback | ✅ Same |

---

## Legacy API Disposition (AR-001L.3)

| Endpoint | Status | Rationale |
|----------|--------|-----------|
| `GET /api/activity-log` | **REMOVED** | Superseded by `GET /api/activity-room` (M9) and `GET /api/activity-room/v1/activities` (M11A) |
| `GET /api/activity` | **REMOVED** | Superseded by M11A API |
| `GET /api/notifications` | **RETAINED** (empty results) | Returns empty for backward compatibility |
| `POST /api/notifications/read-all` | **RETAINED** (no-op) | Returns `{ markedRead: 0 }` for backward compatibility |

---

## CLI Migration (AR-001L.4)

| Capability | Legacy | Migrated |
|-----------|--------|----------|
| Activity creation | `ActivityLogStore` + `ActivityService` | **REMOVED** — CLI does not need its own activity system |
| Activity querying | `ActivityService.query()` | **REMOVED** — Activity Room provides canonical data |
| Event streaming | `registerActivityService()` | **REMOVED** — Activity Room M11B WebSocket provides realtime |
| Notification | `NotificationService` | **REMOVED** — returns empty |

---

## Persistence Disposition (AR-001L.5)

| Artifact | Disposition | Rationale |
|----------|------------|-----------|
| `vestara-activity.db` (CLI) | **NO ACTION** | Ephemeral development database, no migration needed |
| `activity.db` (API) | **NO ACTION** | Activity Room's own persistence, separate from legacy |
| Activity LogStore schema | **REMOVED** | Package deleted, schema no longer relevant |

---

## Event-Stream Disposition (AR-001L.6)

| Component | Status | Rationale |
|-----------|--------|-----------|
| `ActivityStreamHub` | **RETAINED** | Canonical realtime broadcast |
| M11B WebSocket | **RETAINED** | Canonical realtime transport |
| `registerActivityService()` | **REMOVED** | Legacy bridge to events-server, superseded by M11B |
| `ActivityService.onEvent` | **REMOVED** | Legacy event forwarding, superseded by ActivityStreamHub |

---

## Dead UI Check (AR-001L.8)

| Component | Status | Rationale |
|-----------|--------|-----------|
| `TrialActivityRoom.tsx` | **ACTIVE** | Used by `QualificationActivity.tsx` page — NOT dead |
| `Activities.tsx` | **DEGRADED** | `/api/activity-log` returns empty; notifications return empty. UI still renders but shows no data. Not removed per Director directive ("do not turn AR-001L into general Workspace UI cleanup") |

---

## Verification (AR-001L.9)

| Check | Result |
|-------|--------|
| `@vestara/activity-log` references in source | 0 (3 in `.vestara/workspace.json` — runtime state, not edited) |
| `packages/activity-log` absent | ✅ Confirmed |
| `ActivityService` references | 0 |
| `ActivityLogStore` references | 0 |
| Build | ✅ Passes (96 projects) |
| Lint | ✅ Passes (1342 files) |
| Source artifacts | ✅ Clean |
| Focused tests | ✅ 22 files, 161 tests, all pass |

---

## Architecture Invariant (AR-001L.10)

```
Authoritative systems
       │
       ▼
Activity Room ingestion/projection
       │
       ▼
@vestara/activity-room
       │
       ├── canonical contracts
       ├── projection
       ├── persistence
       ├── query
       └── stream
                │
                ▼
         M11B WebSocket
                │
                ▼
          Workspace UI
```

**Confirmed**:
- ✅ ONE Activity capability: `@vestara/activity-room`
- ✅ ONE Activity contract authority: `@vestara/activity-room`
- ✅ ONE canonical realtime architecture: M11B WebSocket
- ✅ ZERO `@vestara/activity-log` package
- ✅ NO ActivityService #2
- ✅ NO ActivityStore #2
- ✅ NO legacy activity event stream #2
- ✅ NO legacy activity persistence #2

---

## Remaining Compatibility Boundary

| Boundary | Status | Notes |
|----------|--------|-------|
| `/api/notifications` | Empty results | Backward-compatible endpoint returning empty data |
| `/api/notifications/read-all` | No-op | Returns `{ markedRead: 0 }` |
| `Activities.tsx` page | Degraded | Shows empty state for log and notifications tabs |
| `.vestara/workspace.json` | Contains stale refs | Runtime state file — not edited per AGENTS.md |
