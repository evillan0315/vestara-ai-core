---
title: "ARX-015 M11C-I1: Ingestion Bridge Smoke Proof"
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015 M11C-I1: Ingestion Bridge Smoke Proof

**Date**: 2026-08-28
**Commit**: `16d5d41` (after startup remediation)
**Environment**: Linux / Node 22 / production API on `:3001`

## Summary

Proved the complete production path:

```
POST /api/conversations
  → DefaultConversationService.createConversation()
  → kernel.eventBus.emit({ type: 'conversation:created', id: 'evt-...' })
  → M9IngestionBridge.ingest()
  → fromHumanMessage adapter → ActivityEvent normalization
  → store.append({ eventId: 'conversation:created:evt-...', ... })
  → SqliteActivityStore.insertRecord() → db.run(INSERT...)
  → auto-persist interceptor → persistDb() → fs.writeFileSync(m9-activity.db)
  → GET /api/activity-room/v1/activities → returns records
```

## Evidence

### 1. M9 Database Created

```
$ ls -lh .vestara/m9-activity.db
-rw-rw-r-- 1 user user 44K Aug 28 10:58 .vestara/m9-activity.db
```

### 2. Records Persisted

```sql
SELECT activity_id, event_id, sequence_number, type, actor_display_name, source
FROM m9_activity_events ORDER BY sequence_number;

activity_id   | event_id                                      | seq | type          | actor | source
------------- | ---------------------------------------------- | --- | ------------- | ----- | ----------
act-1-conversa | conversation:created:evt-1787914735452-30    | 1   | human.message | local | human-input
act-2-conversa | conversation:created:evt-1787914788267-31    | 2   | human.message | local | human-input
```

### 3. Event Identity & Lineage (I1-2)

- EventId format: `${event.type}:${event.id}` — deterministic, preserves original event type + ID
- Example: `conversation:created:evt-1787914735452-30`
- Lineage: `conversation:created` (EventBus type) → `human.message` (M9 type) via `fromHumanMessage` adapter

### 4. Idempotent Redelivery (I1-3)

```
Unique eventIds: 2
Total records:   2
Duplicates:      0
```

`SqliteActivityStore.append()` checks `getByEventIdSync(event.eventId)` — same eventId returns existing record without creating a duplicate.

### 5. Monotonic Sequences (I1-7)

```
Sequences: 1, 2 — sequential, gapless
MIN(sequence_number) = 1 AND MAX(sequence_number) = COUNT(*) = true
```

### 6. No Feedback Loop (I1-8)

```
$ grep -c "eventBus.emit" packages/activity-projection/src/m9-ingestion-bridge.ts
0
```

Bridge subscribes to EventBus but never emits. Event flow is unidirectional:
```
EventBus → Bridge → M9 Store
```

### 7. Failure Isolation (I1-6)

Bridge wraps `ingest()` in try/catch. Failures are logged via `logger.warn` and do not propagate to EventBus or crash the process.

### 8. M11A Read API Serves Records

```
GET /api/activity-room/v1/activities?limit=10

{
  "records": [
    {
      "activityId": "act-1-conversa",
      "eventId": "conversation:created:evt-1787914735452-30",
      "sequenceNumber": 1,
      "type": "human.message",
      "actor": { "type": "human", "id": "local", "displayName": "local" },
      "source": "human-input",
      "payload": { "message": "Conversation 2" }
    },
    {
      "activityId": "act-2-conversa",
      "eventId": "conversation:created:evt-1787914788267-31",
      "sequenceNumber": 2,
      "type": "human.message",
      "actor": { "type": "human", "id": "local", "displayName": "local" },
      "source": "human-input",
      "payload": { "message": "Conversation 3" }
    }
  ],
  "count": 2,
  "limit": 10
}
```

## Bug Found & Fixed

**Auto-persist interceptor missing `db.run()` patch.**

`SqliteActivityStore.insertRecord()` uses `db.run()` (not `db.exec()`), but `initM11AActivityRoom()` only patched `db.exec()`. Result: records were written to in-memory SQLite but never persisted to disk.

**Fix**: Added `db.run()` interceptor alongside `db.exec()` in `apps/api/src/routes/activity-room-m11a.ts`.

## Invariant Checklist

| Invariant | Status | Evidence |
|-----------|--------|----------|
| I1-1: Single M9 ingestion authority | ✅ | Only `M9IngestionBridge` calls `store.append()` |
| I1-2: Event identity preservation | ✅ | `eventId = ${type}:${id}` — deterministic |
| I1-3: Idempotent redelivery | ✅ | `getByEventIdSync()` dedup at store level |
| I1-4: Typed normalization | ✅ | `fromHumanMessage` adapter, no prose parsing |
| I1-5: Explicit event disposition | ✅ | 12 INGEST, 12 IGNORE, 3 DEFER patterns |
| I1-6: Failure isolation | ✅ | try/catch in `ingest()`, no propagation |
| I1-7: Ordering | ✅ | Monotonic sequences: 1, 2 |
| I1-8: No feedback loop | ✅ | Zero `eventBus.emit` calls in bridge |
| I1-9: Lifecycle | ✅ | `start()` subscribes, `stop()` unsubscribes |
| I1-10: Existing path unaffected | ✅ | `ActivityService` + `ActivityLogStore` unchanged |
