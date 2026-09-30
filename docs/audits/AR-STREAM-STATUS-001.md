# AR-STREAM-STATUS-001 — Activity Stream Connectivity Semantics Audit

Audit mode: read-only. No production code, database, API process, browser
state, or repository history was mutated by this audit.

## 1. Executive finding

Root-cause classification: **EXPECTED_DEGRADED_MODE_WITH_MISLEADING_LABEL**.

`Activity Stream: OFFLINE` is the M11B browser WebSocket lifecycle state. It
is not an aggregate health indicator for M11A snapshot/history reads or the
durable Activity projection. A new snapshot can therefore populate newer
records, entities, cursor/frontier, and freshness while the M11B socket is
offline or reconnecting. The label makes one transport state look like a
statement about the whole Activity Room.

This is a real UI semantic contradiction, but it does not prove that M11B is
live while its state says Offline, nor that its state transition is stale.

## 2. Live reproduction evidence

- Read-only service inspection reported `vestara-api.service` active with
  `MainPID=372125`, started at `2026-09-26 03:08:14 PST`.
- Current logs from that process show successful HTTP requests to
  `/api/activity-room/v1/participants` and `/api/activity-room/v1/attention`,
  plus successful `/api/codex/status` requests. This confirms the post-reload
  HTTP boundary was serving requests; it does not prove an M11B browser socket
  was live.
- The reported `25 records · seq 11728` to `50 records · seq 11807 · updated
  just now` sequence is consistent with a fresh M11A snapshot after the
  reported browser reload. The source paths below establish why.
- This audit did not restart the API, reload the browser, click Reconnect,
  click Load Older History, mutate production state, stage, commit, or push.

## 3. Status ownership

`ActivityRoomHeader` receives `room.state`, maps it through
`CONNECTION_STATUS_CONFIG`, and renders `config.label`. `offline` renders
`Offline`; `error` also renders `Offline`.

Evidence: `apps/workspace/src/pages/activity/ActivityRoomHeader.tsx:58-66,119-121`;
`apps/workspace/src/pages/activity/status-config.ts:18-27`.

The hook owns `M11CConnectionState`:
`connecting | live | reconnecting | offline | paused | error`.
M11B owns the transport subset:
`connecting | live | reconnecting | offline`.

Evidence: `apps/workspace/src/hooks/useM11CActivityRoom.ts:579-599`;
`apps/workspace/src/lib/m11b-client.ts:33-34,59-66`.

M11B transitions are authoritative as follows:

- initial state is `offline`;
- `connect()` sets `connecting`;
- a `subscribed` frame sets `live`;
- unexpected close sets `reconnecting` and schedules backoff;
- intentional disconnect sets `offline`;
- socket construction failure sets `offline` and schedules retry;
- catch-up completion sets the hook to `live` unless locally paused.

Evidence: `apps/workspace/src/lib/m11b-client.ts:89-117,175-235,250-305`;
`apps/workspace/src/hooks/useM11CActivityRoom.ts:950-977`.

Snapshot failure sets hook state `error`, which the UI presents as Offline.
Unmount calls `disconnect()`, intentionally producing Offline. There is no
dedicated M11B `failed` or authentication state.

## 4. Update-path ownership

| Visible value | Actual path |
| --- | --- |
| Initial record count, stream, and entities | M11A HTTP snapshot; applied by the hook |
| Initial cursor/frontier | `snapshot.cursor.sequenceNumber` |
| Later live records | M11B WebSocket `activity` frames, merged/deduplicated by the hook |
| Attention/participants | Snapshot seed plus separate debounced HTTP reads |
| Operation/session state | Snapshot `entities[].operations`, then live/history correlation |
| Working/completed state | Derived from authoritative operation statuses |
| Freshness timestamp | Written on snapshot application and each M11B activity |

Evidence: `apps/workspace/src/hooks/useM11CActivityRoom.ts:902-943,979-1047`;
`apps/api/src/routes/activity-room-m11a.ts:852-903`;
`apps/workspace/src/pages/activity/ActivityRoomHeader.tsx:24-31,74-76`.

There is no browser periodic snapshot poll in this hook. Load Older History is
an explicit, separate HTTP action and was not used. The server does poll M9
every 500 ms, applies records to M10, and broadcasts through the M11B hub;
that is server ingestion/relay, not a browser fallback transport
(`apps/api/src/routes/activity-room-m11a.ts:228-287`).

## 5. Transport topology

```text
M9 durable store
   +--> M11A snapshot HTTP ----------------> M11C snapshot state
   +--> server watcher -> M10 projection -> M11B hub
                                             +--> browser WebSocket
                                                  /ws/activity-room/v1
```

The browser fetches M11A snapshot, then subscribes M11B from its cursor. M11B
attaches at the current frontier, replays missed history, and delivers live
activity. The local upgrade route is `/ws/activity-room/v1`
(`apps/api/src/server.ts:696-718`); protocol handling is in
`apps/api/src/routes/activity-room-m11b.ts:299-451`.

The topology explicitly permits: snapshot read succeeds while the browser
M11B socket is offline/reconnecting. In that state the visible data is recent
snapshot data, not proof of live delivery.

## 6. Connection state machine

```text
offline -> connect() -> connecting -> subscribed -> live
live -> unexpected close -> reconnecting -> timer -> connecting
any -> intentional cleanup -> offline
resync-required -> HTTP snapshot -> connect(new cursor)
snapshot failure -> hook error (rendered as Offline)
```

Browser reload mounts the hook, fetches a snapshot, then connects from its
cursor. API restart closes sockets; clients use the generic reconnect path.
The subscribe frame, not merely the WebSocket open event, is the transition to
Live. Authentication failure has no special transition and would be observed
through generic close/error handling.

## 7. Authentication analysis

M11A `fetch()` sends only `Content-Type`; `m11aFetch` does not add a Bearer
token or explicit cookie (`apps/workspace/src/lib/m11a-api.ts:195-209`). The
browser M11B client uses `new WebSocket(url)` with no custom headers
(`apps/workspace/src/lib/m11b-client.ts:175-190`). The local upgrade router
does not perform an Activity-specific auth check before handing the socket to
M11B (`apps/api/src/server.ts:716-718`).

The source therefore does not show an Activity HTTP-success/live-stream-401
credential propagation mismatch. A proxy or external deployment layer could
still reject a handshake, but that is not established by repository evidence.

## 8. 401 analysis

The reported `unexpected status 401 Unauthorized` is not emitted by M11B.
M11B has no 401 handling or auth error frame. The Codex App Server client is a
separate WebSocket integration; it connects to `CODEX_APP_SERVER_URL` and
optionally sends `Authorization: Bearer ...`
(`packages/codex-runtime/src/client/codex-app-server-client.ts:71-93`).

No code path found here writes Codex connection state into `M11CConnectionState`
or M11B state into the Codex panel. The 401 is therefore **not proven related**
to Activity Stream and is functionally independent in current source. It may
be a Codex/App Server or upstream authentication problem; the exact target is
not established by the supplied panel text.

## 9. Frontier advancement analysis

The header sequence comes from `room.cursor`, set from the M11A snapshot. The
API returns `projection.room.cursor` after snapshot reconstruction and does
not move that cursor backward (`apps/api/src/routes/activity-room-m11a.ts:863-892`).
The hook applies it and updates `latestSequence`
(`apps/workspace/src/hooks/useM11CActivityRoom.ts:1027-1042`).

Thus `11728 -> 11807` after the reported clean reload is explained by a new
snapshot observing a later durable M9 frontier. The record-count and entity
reconstruction changes are also snapshot outputs. They do not prove M11B
delivered live frames while Offline. A later M11B catch-up is possible, but
the supplied runtime evidence has no browser WebSocket frame capture proving
that for this interval.

## 10. “updated just now” semantics

This is a generic freshness formatter: it means `Date.now() - lastUpdatedAt <
5 seconds`. `lastUpdatedAt` is written on successful initial snapshot,
successful resync snapshot, and every M11B live activity callback
(`useM11CActivityRoom.ts:902-909,993,1033`).

It does not identify live transport activity. In the observed combination it
most directly means “the view was recently hydrated/refreshed,” not “the live
stream transport is connected.”

## 11. Reconnect behavior

The visible Reconnect action is wired to `room.retry` in the error banner.
`retry()` clears the local working set and reruns the lifecycle effect; that
fetches a new snapshot and then connects M11B from its cursor
(`useM11CActivityRoom.ts:810-816,1020-1047`). It does not change credentials
or production data. The lower-level `m11bClient.reconnect()` instead uses the
client’s last sequence.

Normal M11B reconnect does not refetch a snapshot unless the server sends
`resync-required`; resync does refetch and re-subscribe
(`useM11CActivityRoom.ts:979-1009`). Sequence catch-up and ID deduplication
are the intended duplicate/miss controls. The button was not clicked.

## 12. AR-SNAPSHOT-002A interaction

Classification: **incidental, not causal for connectivity**.

002A changed M11A snapshot entity selection, operation attachment, and
completeness transport. Its evidence states that the authoritative cursor and
M11B lifecycle were unchanged (`docs/evidence/AR-SNAPSHOT-002A.md`). It can
explain changed record counts and reconstructed operations after a fresh
snapshot; it cannot explain M11B Offline. This audit did not modify 002A.

## 13. Root cause

The root cause is a semantic projection mismatch: one badge projects M11B live
WebSocket state while adjacent data and freshness indicators project M11A
snapshot state. Vestara supports recent snapshot data plus a disconnected or
reconnecting live socket, but the UI does not name that degraded combination.

This is not proven to be transport-auth, because local Activity HTTP and M11B
paths show no divergent application credential handling. It is not proven to
be a missing-transition defect, because connect, subscribe, close, retry,
resync, and cleanup transitions are explicit.

## 14. Expected status contract

The invariant “Activity Stream status describes connectivity of the transport
responsible for live Activity updates” is valid if Activity Stream means the
M11B WebSocket only. It is invalid if users read it as “Activity Room data is
not updating.”

The supported degraded mode requires separate concepts: M11B live state
(`LIVE`, `CONNECTING`, `RECONNECTING`, `OFFLINE`), snapshot/data freshness and
source, and optionally an explicit aggregate `DEGRADED`. This audit does not
redesign the UI.

## 15. Repair boundary

Repair-ready: **YES**, for AR-STREAM-STATUS-002 as a bounded UI/state-semantic
repair. Ownership and update paths are sufficiently identified to clarify
live transport state versus snapshot freshness without changing M9/M10
authority, M11A selection, or M11B delivery.

The repair must not infer live connectivity from record count, cursor
advancement, or `lastUpdatedAt`, and must not treat the Codex 401 as an
Activity repair prerequisite.

## 16. Remaining unknowns

- No browser network trace independently captures the exact socket outcome for
  the reported `11728 -> 11807` interval.
- No direct M11B frame capture proves whether a reconnect briefly reached Live
  before returning Offline.
- The exact endpoint behind the reported 401 is not in the supplied panel text.
- A deployment proxy could impose WebSocket upgrade/auth policy not present in
  local source; that remains an environmental possibility.

## 17. Recommended next milestone

**AR-STREAM-STATUS-002 — bounded repair:** make live M11B connectivity and
M11A snapshot freshness explicit, preserving their separate authorities and
avoiding causal coupling to Codex authentication. A separate browser/network
capture audit is optional if exact runtime frame proof is required before
implementation.
