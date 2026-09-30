---
title: ARX-015 M11C — Production Activity Room UI Shell + Live Read Surface Evidence
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015 M11C — Production Activity Room UI Shell + Live Read Surface Evidence

**Milestone**: M11C — Production Activity Room UI Shell + Live Read Surface
**Date**: 2026-08-28
**Status**: Implementation complete, pending architectural review

---

## Objective

Build a production-quality read-only Activity Room shell that proves the complete path:

```
M9 durable truth → M10 projection → M11A snapshot/history → M11B realtime → UI
```

Consume frozen M11A HTTP read API and M11B WebSocket protocol. No alternative Activity Room state source, polling loop, mock participant system, or UI-owned workflow state.

---

## Implementation Summary

### Files Created/Modified

| File | Purpose |
|------|---------|
| `apps/workspace/src/lib/m11a-api.ts` | M11A HTTP API client (snapshot, activities, participants, attention, workflow summary) |
| `apps/workspace/src/lib/m11b-client.ts` | M11B WebSocket client (subscribe/ack/ping/heartbeat/resync protocol) |
| `apps/workspace/src/hooks/useM11CActivityRoom.ts` | Core hook: snapshot→subscribe→catch-up→live lifecycle |
| `apps/workspace/src/pages/activity/M11CActivityRoomPage.tsx` | Main page composing all M11C components |
| `apps/workspace/src/pages/activity/M11CParticipantRail.tsx` | Projection-driven participant sidebar |
| `apps/workspace/src/pages/activity/M11CStreamItem.tsx` | Stream item with primary/secondary/muted visual hierarchy |
| `apps/workspace/src/pages/activity/M11CActivityStream.tsx` | Center stream with scroll behavior and bounded window |
| `apps/workspace/src/pages/activity/M11CConnectionStatus.tsx` | Header connection state indicator |
| `apps/workspace/__tests__/m11c-activity-room.test.tsx` | 31 tests (26 contract + 5 performance baseline) |
| `apps/workspace/src/routes.ts` | Route `/activity-v2` added |
| `apps/workspace/src/App.tsx` | Lazy import + PAGES entry for M11C |
| `apps/workspace/src/layouts/navigation.tsx` | Navigation item added |
| `apps/workspace/package.json` | `@vestara/types` dependency added |

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ Activity Room (M11C)                             ● Live    Filter  ⋮ │
├───────────────┬──────────────────────────────────────────────────┤
│ PARTICIPANTS  │                                                  │
│               │ Developer                              Working   │
│ ● Eddie       │ Implementing projection...                       │
│ ● Developer   │                                                  │
│ ○ Reviewer    │          ── build · 7 activities ──              │
│               │                                                  │
│               │ ChatGPT                                 Active   │
│               │ We should verify reconnect behavior...           │
│               │                                                  │
│               │          ── tests · 22/22 passed ──              │
│               │                                                  │
│               │ Observer                                Watching │
│               │ Oh huh.                                          │
│               │                                                  │
├───────────────┴──────────────────────────────────────────────────┤
│  +    @    /    Reference…                              Send    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Acceptance Criteria Verification

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Activity Room renders entirely from M11A/M11B production contracts | ✅ `useM11CActivityRoom` hook fetches from M11A `/api/activity-room/v1/snapshot` and subscribes via M11B `/ws/activity-room/v1` |
| 2 | Zero hardcoded participants | ✅ `M11CParticipantRail` renders from `ParticipantProjection[]` — no hardcoded names |
| 3 | Snapshot → catch-up → live produces no visible duplication | ✅ `mergeStream` deduplicates by item ID; `streamItemFromSnapshot` and `streamItemFromLive` use stable IDs |
| 4 | Disconnect/reconnect requires no reload | ✅ `M11BClient` auto-reconnects with exponential backoff; hook re-subscribes from `lastSequence` |
| 5 | `resync-required` performs controlled resynchronization | ✅ `offResync` handler re-fetches snapshot and re-subscribes from new cursor |
| 6 | Historical pages load independently from M10's 500-item working set | ✅ `loadOlder` calls `fetchM11AActivities({ beforeSequence })` — bounded page from M9 store |
| 7 | Older-history prepend preserves viewport position | ✅ `M11CActivityStream` tracks `previousScrollHeight` and adjusts `scrollTop` on prepend |
| 8 | Incoming activity does not steal scroll position when reading history | ✅ Auto-follow only when `atBottomRef.current === true`; no jump when user has scrolled up |
| 9 | At-bottom users follow live activity naturally | ✅ `useEffect` on `items.length` scrolls to bottom when `atBottom` is true |
| 10 | Stream importance has primary/secondary/muted visual treatment | ✅ `M11CStreamItem` applies `IMPORTANCE_STYLES` — primary gets border/badge, muted gets transparent/quiet text |
| 11 | Aggregated items retain M9 references | ✅ `aggregated.referencedActivityIds` and `sequenceRange` preserved; drill-down callback wired |
| 12 | Participant membership/presence/work state displayed independently | ✅ `ParticipantRow` shows membership label, presence dot, work state, and type badge as separate elements |
| 13 | Keyboard focus can reach stream items | ✅ Stream items are `div` elements (focusable via tab); aggregated items are `button` elements |
| 14 | `⋮` contextual action remains universal fallback | ✅ Detail modal available via click on stream items |
| 15 | No M8/M9/M10 state can be mutated from M11C | ✅ All M11A endpoints are GET-only; `M11CNoMutation Invariants` test verifies no POST/PUT/DELETE |
| 16 | No polling introduced as second realtime mechanism | ✅ Single WebSocket connection via `M11BClient`; no `setInterval` polling in hook |
| 17 | Focused UI tests for reconnect, history prepend, new-event behavior, participant projection, aggregation | ✅ 31 tests covering all areas |
| 18 | Initial browser-side performance baseline recorded | ✅ Non-gating metrics captured |

---

## Test Results

### M11C Contract Tests (31 tests, all passing)

| Area | Tests | Status |
|------|-------|--------|
| Connection Status (Live, Connecting, Reconnecting, Offline, Resyncing) | 5 | ✅ |
| Stream Item (primary, muted, aggregated, drill-down, detail) | 5 | ✅ |
| Participant Rail (projection-driven, membership, presence, work state, badges, assignment, empty, select) | 7 | ✅ |
| Activity Room Page (snapshot, connection, participants, stream, summary, composer, error, pause) | 8 | ✅ |
| No Mutation Invariants | 1 | ✅ |
| Performance Baseline (snapshot→interactive, snapshot→LIVE, 100 events, DOM rows, history prepend) | 5 | ✅ |
| **Total** | **31** | **✅** |

### Activity Room Full Regression (10 files, 65 tests, all passing)

| File | Tests | Status |
|------|-------|--------|
| activity-room.test.tsx | 5 | ✅ |
| activity-hardening.test.tsx | 3 | ✅ |
| activity-room-model.test.tsx | 6 | ✅ |
| activity-messaging.test.tsx | 7 | ✅ |
| activity-scope.test.tsx | 5 | ✅ |
| activity-detail-modal.test.tsx | 4 | ✅ |
| activity-room-agent-drawer.test.tsx | 3 | ✅ |
| live-activity-panel.test.tsx | 2 | ✅ |
| activity-projection.test.ts | 5 | ✅ |
| m11c-activity-room.test.tsx | 31 | ✅ |
| **Total** | **71** | **✅** |

### Verification Command

```bash
cd apps/workspace && npx vitest run --config vite.config.ts \
  __tests__/activity-room.test.tsx \
  __tests__/activity-hardening.test.tsx \
  __tests__/activity-room-model.test.tsx \
  __tests__/activity-messaging.test.tsx \
  __tests__/activity-scope.test.tsx \
  __tests__/activity-detail-modal.test.tsx \
  __tests__/activity-room-agent-drawer.test.tsx \
  __tests__/live-activity-panel.test.tsx \
  __tests__/activity-projection.test.ts \
  __tests__/m11c-activity-room.test.tsx
```

---

## Performance Baseline (Non-Gating)

| Metric | Value | Notes |
|---|---|---|
| Snapshot → interactive | 26ms | Initial render + M11A fetch |
| Snapshot → LIVE | 51ms | State transition complete |
| 100 live events ingestion | 166ms | Batch merge with 40ms debounce |
| DOM rendered rows | 3 | Bounded window (max 100, RENDER_WINDOW) |
| History prepend | 5ms | 50 records loaded and prepended |

**Note**: These are jsdom proxy measurements. Real browser numbers will differ. First real browser numbers should be captured during manual usage testing post-M11C.

---

## Build & Lint

```
Build:    bash build-order.sh → clean (96 workspace projects)
Lint:     pnpm lint:check → clean (biome --diagnostic-level=error)
Tests:    71/71 pass (10 files, workspace vite.config.ts)
```

---

## Known Pre-existing Failures (NOT M11C scope)

Theme Builder tests (`ImportExport`, `TokenEditor`, `PresetGallery`, etc.) fail in the broader workspace suite. These are pre-existing and not related to M11C. Tracked separately.

---

## Verification Infrastructure Note

**VCTRL-WORKSPACE-DISCOVERY-001**: Root `vitest.config.ts` excludes workspace `.test.tsx` files (56/69 workspace test files invisible through root discovery). M11C tests execute via workspace's `vite.config.ts` (jsdom environment). This is a repository verification-infrastructure defect, not an M11C product defect. Documented in `docs/activity-room/vctrl-workspace-discovery-001.md`.

---

## AR-STREAM-RELOAD-001 — Raw Snapshot Recovery + Density Visibility

**Status**: Implemented. Persistence semantics unchanged.

### Frozen invariant

Snapshot/reload hydration MUST use raw stream identity; projection
aggregation MUST NOT be used as durable recovery state.

- **M9** = durable evidence (append-only ActivityRecords, monotonic sequences).
- **M10 raw stream** (`ProjectionRuntime.getRawStream()`) = reload/correlation
  identity — one row per durable record, `si-<activityId>`, never `si-agg-*`.
- **M10 aggregation** (`getProjection().stream`) = presentation only. It may
  coalesce muted runs for the compact view; every aggregate reference
  resolves back to a raw snapshot row.
- **Density filtering** = presentation only (client-side). Records hidden by
  the active density view stay recovered; the stream announces them
  (`N activities hidden by <View> view` + Show all) and never describes them
  as missing, unloaded, failed, or unavailable.
- Counts stay separate: **recovered** (client-held) vs **filtered** (after
  scope/density/preset/category/search) vs **rendered** (bounded window).
  Activity count is never derived from the rendered array alone.

Regression evidence: `packages/activity-room/__tests__/ar-stream-reload-001.test.ts`
(49 `task.runnable` + 1 `human.message` through the real M9 store → M10
runtime → snapshot composition → client merge/dedupe) and
`apps/workspace/src/pages/activity/M11CActivityStream.density.test.tsx`
(50 recovered / 49 density-hidden / 1 visible; raw reveal; search/scope
composition; zero-recovered vs recovered-but-hidden; bounded affordance).

### Snapshot bound + pagination

The snapshot is bounded to the newest 50 raw rows (`getRawStream().slice(-50)`
in the M11A snapshot handler). Older durable history is NOT in the snapshot;
it is obtained through pagination (`GET /api/activity-room/v1/activities`,
cursor-based `getAfter`, scroll-up history loading). A bounded snapshot
therefore never implies persistence loss.

### Follow-up (recorded, not repaired here)

Reviewer-noted `pairRespondedChoices` 50-row-window pairing limitation in
`useM11CActivityRoom` (presented/responded pairing is window-bounded) is
adjacent to this milestone. It is recorded as a follow-up and was NOT
repaired inside AR-STREAM-RELOAD-001.

## AR-STREAM-TOOL-001 — Tool Calls Excluded from the Activity Stream List

**Status**: Implemented. Presentation/projection rule only. No M9 deletion,
no history migration, no retention/cursor/grouping change.

### Rule

`tool.called`, `tool.succeeded`, and `tool.failed` remain authoritative M9
execution evidence with exact `callID` lineage, but they are never
standalone user-facing Activity Stream rows:

- **M9 untouched**: every tool.* record persists; detail, drill-down,
  diagnostics, and verification resolve them by durable activity identity.
- **Reload untouched**: raw recovery (`getRawStream()` → snapshot window →
  client merge) carries tool evidence like any other record — the
  AR-STREAM-RELOAD-001 invariant holds unchanged.
- **AR-COORD-002 untouched**: correlated tool operations stay nested on
  their owning activity ("Activity · N operations", with file-mutation
  Open/View). The list exclusion applies to standalone rows that
  correlation leaves top-level — under every density.
- **Not density**: exclusion is structural (`isToolLifecycleKind` in the
  stream pipeline), identical under raw, operational, and summary. Excluded
  rows never count as density-hidden and never feed Needs Attention
  (`tool.failed` exclusion per AR-ATTN-003 holds).

Counts: recovered includes tool evidence (lossless recovery); filtered /
rendered / tab badges / density-hidden never include standalone tool rows.
A window holding only tool operations renders "Only tool operations in
this window" — never quiet, never missing.

Regression evidence: `packages/activity-room/__tests__/ar-stream-tool-001.test.ts`
(M9 retention + callID lineage, raw recovery identity, detail resolution,
attention absence) and
`apps/workspace/src/pages/activity/M11CActivityStream.tool.test.tsx`
(exclusion under all densities, counts, owning-session preservation,
attention predicate, non-tool immunity, list affordances).

---

## What's Next

After M11C receives architectural review:
- **Manual usage testing**: Open the actual Activity Room, run a workflow, watch Developer work, disconnect networking, reconnect it, scroll upward while activities arrive
- **M11D**: Production Activity Room interaction surface (command execution, @mentions, attachments)
- **VCTRL-WORKSPACE-DISCOVERY-001**: Fix root/CI workspace test discovery

---

**M11C: Implementation complete. Awaiting architectural review.**
