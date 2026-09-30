# AR-OBSERVABILITY-DOGFOOD-001 — Activity Room Observability Audit

Mode: audit only. No Activity Room state or implementation was changed.

## A. `Activity · N operations` projection

### Authoritative path

```text
runtime tool lifecycle
  → adapter-normalized tool event
  → M9 ingestion bridge
  → durable m9-activity.db
  → M10 ProjectionRuntime
  → M11A snapshot/SSE projection
  → Workspace stream normalization
  → exact lineage/callID correlation
  → `Activity · N operations` presentation
```

Concrete source path:

- OpenCode mirrors tool lifecycle as
  `opencode.message.part.updated` with `part.type = tool`, `part.callID`,
  tool name, status, and conversation/session metadata in
  `apps/api/src/assistant-opencode-adapter.ts`.
- Codex mirrors command lifecycle with namespaced operation IDs and the same
  `codex.message.part.updated` shape in `apps/api/src/assistant-codex-adapter.ts`.
- `packages/activity-room/src/m9-ingestion-bridge.ts` accepts the governed
  tool event sources, extracts `callID`, tool name, status, actor, conversation
  and execution metadata, and converts them with `fromToolEvent()`.
- The bridge deliberately rejects the raw `opencode-event-bridge` duplicate
  source so the actor-bearing governed mirror wins the idempotent event race.
- `packages/activity-room/src/m10-projection-runtime.ts` converts durable
  `tool.called`, `tool.succeeded`, and `tool.failed` records into stream items
  only when `payload.data` contains both a non-empty `callID` and `toolName`.
- M11A persists/reloads M9 records from `.vestara/m9-activity.db`, rebuilds the
  M10 projection, and serves raw stream items in the snapshot and projection
  items through the SSE watcher (`apps/api/src/routes/activity-room-m11a.ts`).
- `apps/workspace/src/pages/activity/correlated-session.ts` derives the
  collapsed operation group. It requires a tool row with a canonical callID,
  a lineage key (`executionId`, runtime session binding, or origin conversation
  ID), and a non-tool parent with the exact same lineage key. Items without all
  three remain top-level stream items.

### Exact conditions for the collapsed group

`Activity · N operations` is therefore not controlled by tool visibility alone.
All of the following are required:

1. the runtime emitted a supported governed tool lifecycle event;
2. the event survived normalization and M9 persistence;
3. the durable payload retained a non-empty callID/toolName;
4. the tool row retained at least one supported lineage key;
5. a non-tool parent row with the exact same lineage key exists in the loaded
   stream window;
6. UI correlation receives both rows in a compatible history/live batch.

The group is a client presentation derived from authoritative lineage; it is
not an additional Activity authority.

### Classification

- **Confirmed behavior:** the UI intentionally refuses to group a tool row
  without exact callID and parent lineage. This is explicit fail-closed logic
  in `correlated-session.ts`.
- **Confirmed behavior:** raw OpenCode bridge duplicates are intentionally
  ignored by M9 ingestion; governed adapter mirrors are the accepted source.
- **Confirmed behavior:** M10 only projects tool lifecycle rows when callID and
  toolName are present.
- **Insufficient evidence for a single runtime-family defect:** the reported
  Muse/OpenCode differences could arise from missing mirror events, missing
  durable metadata, a parent outside the bounded stream window, or an exact
  lineage mismatch. Existing observations do not identify which condition
  occurred for each affected execution.
- **Not established:** a Muse-vs-Codex-specific root cause. The current source
  path supports the observation that the same runtime family can take either
  success or non-grouping paths.

No fallback correlation from prose, timestamps, actor names, adjacency, or
provider labels is authorized.

## B. Working counter semantics

The Activity Room header derives `workingAgentCount` in
`apps/workspace/src/pages/activity/M11CActivityRoomPage.tsx`. It counts only
non-human projected participants whose `workState` is one of:

```text
working | building | testing | verifying
```

M10 derives the base work state from durable lifecycle records in
`packages/activity-room/src/m10-projection-runtime.ts`:

- `task.started` / `agent.started` → `working`;
- `task.completed` / `agent.completed` → `available`;
- `task.failed` / `agent.failed` → `attention-required`;
- `agent.waiting` → `waiting`;
- `workflow.failed` for an agent → `blocked`.

Therefore `Working: 0` means zero non-human Activity Room participants are
currently projected in those work states. It does not mean:

- zero OpenCode sessions;
- zero Codex threads;
- zero provider processes;
- zero tool operations;
- zero Conversation Runtime calls;
- zero OS-level activity.

This is a confirmed semantic contract, not a diagnosed defect. A runtime
session/process can remain active without a corresponding projected
`agent.started`/`task.started` state or can already have transitioned to
available/waiting. No counter change was made.

## C. Needs Attention and memory diagnostics

### Sources and thresholds

`apps/api/src/diagnostics/snapshots.ts` collects two distinct memory-related
signals:

1. `collectProcessHealth()` measures `process.memoryUsage().heapUsed` against
   the V8 heap-size limit (falling back to `heapTotal` only if unavailable):
   - above 80% → `degraded`;
   - above 90% → `unhealthy`.
2. `collectMemoryHealth()` reads OS memory through `collect.collectMemory()`:
   - above 80% used → `degraded`;
   - above 90% used → `unhealthy`.

They are different denominators and can legitimately disagree. The source
messages identify which signal was measured (`API Server Process` versus
`System Memory`).

`projectSystemAttention()` calls `collectDiagnosticSnapshots(ctx.repoPath)`
and maps degraded/unhealthy snapshots through
`projectDiagnosticAttentionEntries()`. The attention endpoint merges those
diagnostic entries with Activity and repository-verification attention, filters
to open status, deduplicates, and sorts (`apps/api/src/routes/activity-room-m11a.ts`).

### Cadence and freshness

- M11A's diagnostic attention cache is 15 seconds
  (`DIAGNOSTIC_ATTENTION_CACHE_MS`).
- The UI requests the canonical attention endpoint after initial snapshot and
  on live activity bursts.
- `apps/workspace/src/hooks/useM11CActivityRoom.ts` uses a trailing one-second
  timer to coalesce refreshes; it does not create a continuous memory polling
  loop.
- Snapshot `observedAt` is the collector timestamp. The cache can therefore
  serve a recent, but not necessarily instantaneous, diagnostic observation.

There is no hysteresis in the inspected threshold functions. A value crossing
the 80% or 90% boundary can clear or recreate an alert on later collection.

### Classification

- **Confirmed expected behavior:** alert changes reflect fresh diagnostic
  samples, cache expiry, and threshold crossing; completed work is not itself a
  resolution event.
- **Confirmed semantic separation:** Needs Attention is a merged diagnostic /
  activity / verification projection and is independent of the Working counter.
- **Insufficient evidence for causation:** a reported 81–83% value does not by
  itself prove a leak, retained completed execution, or Activity Room defect.
  The denominator and source (`system-memory` versus `api-server`) must be
  recorded with each observation.
- **Not established:** whether historical browser observations came from OS
  memory or V8 heap pressure unless their diagnostic source payload was
  captured.

No process was killed, no threshold was changed, and no alert was cleared.

## D. Safe comparison with OS truth

Future investigation should capture, at the same approximate time:

- the Activity attention entry's source ID, health, observedAt, and payload;
- `free`/`available`/`used` system memory from the existing diagnostics
  collector or an independently authorized read-only OS probe;
- API process heapUsed, heapTotal, heap limit, RSS, and process identity;
- whether the attention entry is cached or freshly collected.

Do not compare the system-memory percentage to the V8 heap percentage as if
they share a denominator. Do not infer execution retention from memory pressure
without process and allocation evidence.

## E. Out of scope and non-mutation confirmation

This audit did not:

- repair operation grouping or lineage;
- change M9 ingestion, M10 projection, M11A routes, or UI correlation;
- redefine Working;
- modify diagnostics thresholds, cache cadence, or attention projection;
- clear Activity Room state;
- refresh the browser, restart services, or kill processes.

