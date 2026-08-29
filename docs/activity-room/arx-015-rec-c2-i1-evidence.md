# AR-REC-C2-I1: Durable Interaction Authority + Publication Substrate — Evidence

**Frozen D1 architecture**: `83e68cc` (D1 accepted and frozen)
**I1 commit**: `TBD`

## Files Changed

### New packages
- `packages/interaction-persistence/` — Port interfaces, publication port, EventBus adapter, SQLite store, migrations
- `packages/interaction-app/` — Producer-neutral InteractionService

### Modified files
- `packages/types/src/activity.ts` — Extended `ActivityType` with `interaction.presented` / `interaction.responded`
- `packages/types/src/activity.ts` — Extended `ActivitySource` with `'interaction-app'`
- `packages/activity-projection/src/m9-adapter.ts` — Added `fromInteractionPresented()` and `fromInteractionResponded()` adapters
- `packages/activity-projection/src/m9-ingestion-bridge.ts` — Added `interaction:presented` / `interaction:responded` to `PATTERN_DISPOSITIONS`
- `packages/activity-projection/src/index.ts` — Exported new adapters

## Final Package Dependency Graph

```
@vestara/types (frozen B contract)
  ↑
@vestara/interaction-persistence (port + SQLite impl + EventBus adapter)
  ↑
@vestara/interaction-app (InteractionService)
  ↑
apps/api (future) + future producers

@vestara/activity-projection → consumes EventBus events only
  NO dependency on interaction-persistence or interaction-app
```

## Final SQLite Schema

```sql
-- interactions: immutable presentation facts
CREATE TABLE interactions (
  interaction_id TEXT PRIMARY KEY,
  conversation_id TEXT,
  presenting_participant_id TEXT NOT NULL,
  presenting_participant_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content TEXT NOT NULL,
  choices_json TEXT NOT NULL
);

-- interaction_responses: immutable response facts
CREATE TABLE interaction_responses (
  interaction_id TEXT PRIMARY KEY,     -- at most one response per interaction
  response_id TEXT NOT NULL,           -- globally unique identity
  selected_choice_id TEXT NOT NULL,
  responding_participant_id TEXT NOT NULL,
  responding_participant_name TEXT NOT NULL,
  responded_at TEXT NOT NULL,
  correlation_id TEXT,
  FOREIGN KEY (interaction_id) REFERENCES interactions(interaction_id)
);

-- interaction_publication_ledger: delivery/recovery state only
CREATE TABLE interaction_publication_ledger (
  event_id TEXT PRIMARY KEY,           -- deterministic: interaction:presented:${id}
  interaction_id TEXT NOT NULL,
  published_at TEXT                    -- NULL = needs publication; timestamp = delivered
);
```

## Transaction Boundaries

### Presentation (I1-3)
```
BEGIN TRANSACTION;
  INSERT INTO interactions (...)           -- authoritative fact
  INSERT INTO interaction_publication_ledger (..., published_at = NULL);  -- marker
COMMIT;
→ EventBus.emit('interaction:presented', ...)
→ on ack: UPDATE SET published_at = now WHERE event_id = ?;
```

### Response (I1-4)
```
-- Validation outside transaction (sql.js prepare() interference)
SELECT choices_json FROM interactions WHERE interaction_id = ?;
-- Validate choice exists

BEGIN TRANSACTION;
  INSERT INTO interaction_responses (...)  -- UNIQUE constraint = concurrency authority
  INSERT INTO interaction_publication_ledger (..., published_at = NULL);  -- marker
COMMIT;
→ EventBus.emit('interaction:responded', ...)
→ on ack: UPDATE SET published_at = now WHERE event_id = ?;
```

## Publication/Recovery Call Graph

```
InteractionService.present(interaction)
  → persistence.put(interaction)           [atomic: fact + marker]
  → publication.onInteractionPresented()   [after-commit]
  → persistence.markPublished(eventId)     [on ack]

Recovery (async, after boot):
  → persistence.getPendingPublications(100)  [WHERE published_at IS NULL, indexed]
  → for each: reconstruct payload, EventBus.emit(...)
  → on ack: persistence.markPublished(eventId)
```

## EventBus/M9 Call Graph

```
EventBus.emit('interaction:presented', { eventId, ... })
  → M9IngestionBridge.mapToActivityEvent()
    → fromInteractionPresented() adapter
    → M9.append(activityEvent)
      → M10 ProjectionRuntime
        → ActivityStreamHub.broadcast()
          → WebSocket → Activity Room UI
```

## Focused Test Results

- **56/56 tests pass** across 5 test files
- **19 store tests**: persistence, restart, concurrent, publication
- **15 service tests**: validation, persistence, publication, recovery
- **10 restart/crash-window tests**: Windows B–E, bounded query
- **8 publication recovery tests**: pending, bounded, deterministic
- **4 concurrent response tests**: exactly one winner, rollback

## Restart/Recovery Evidence

- Interaction survives restart (Window B): ✓
- Response survives restart (Window B): ✓
- Pending publication survives restart (Window B): ✓
- Recovery finds only unpublished entries: ✓
- Deterministic eventId enables safe republishing: ✓
- Duplicate publication is safe: ✓
- Bounded batch LIMIT respected: ✓
- Crash window C (committed + recoverable): ✓
- Crash window D (emitted, not acknowledged): ✓
- Crash window E (duplicate recovery): ✓

## Concurrent Response Evidence

- Exactly one authoritative response from concurrent requests: ✓
- Losing request rolls back completely: ✓
- Concurrent same-choice requests are idempotent: ✓
- Publication marker for losing request is rolled back: ✓

## No-Execution Evidence

- No domain execution occurs during presentation: ✓
- No domain execution occurs during response: ✓
- No domain execution occurs during recovery: ✓
- Zero domain execution after successful response: ✓

## Adjacent Findings

1. **sql.js transaction behavior**: `prepare()` within explicit `BEGIN TRANSACTION` causes issues. Validation queries must happen outside the transaction boundary. The UNIQUE constraint is the real concurrency authority.

2. **ActivityType extension**: Adding new activity types requires updating `ActivitySource` union as well when using custom source strings.

## Commit

`TBD` — implementation of AR-REC-C2-I1
