---
title: AR-DATE-001-01 — Stream Filter Pipeline and History Audit
version: 1.0.0
status: complete
owner: vestara
last-reviewed: 2026-09-27
next-review: 2026-10-27
---

# AR-DATE-001-01 — Stream Filter Pipeline and History Audit

Milestone: `AR-DATE-001` — Activity Room Date-Range Filter.
Scope: audit only. No implementation, no UI change, no mutation.

## 1. Filter pipeline (authoritative)

Source: `apps/workspace/src/pages/activity/M11CActivityStream.tsx`

`StreamFilterOptions` (`M11CActivityStream.tsx:198-210`):

- `selectedParticipantId?: string`
- `workflowFilter?: string | null`
- `density: StreamDensity` (`summary | operational | raw`)
- `activeFilter: StreamFilter` (`all | attention | operational`)
- `typeFilter: TypeFilter` (`all | conversations | work | evidence`)
- `searchQuery: string`

Pipeline order (`filterStreamItems`, `M11CActivityStream.tsx:254-305`):

1. Eligibility — drop standalone `tool-call` / `tool-result` rows (`AR-STREAM-TOOL-001`)
2. Density — `matchesDensityKind` (`M11CActivityStream.tsx:157-162`)
3. Participant scope — `item.actor.id`
4. Workflow scope — `item.workflowRunId`
5. Preset — `operational` narrows to operational kinds; `attention` keeps `isAttentionItem`
6. Category — `conversations` = `kind === 'conversation'`; `work` = `activity | progress`; `evidence` = `evidence`
7. Search — `content` + `actor.displayName`, case-insensitive substring

Counts (`computeStreamCounts`, `M11CActivityStream.tsx:327-346`): `recovered / excludedToolRows / scopeEligible / densityHidden / filtered / rendered`. Never derive activity count from the rendered array alone.

## 2. Gap: no date range

- No `startDate` / `endDate` / preset (`today`, `yesterday`, custom) anywhere in `StreamFilterOptions`, `StreamScopeOptions`, `FILTER_TABS`, or `TYPE_OPTIONS` (`M11CActivityStream.tsx:358-369`).
- `M11CStreamItem.timestamp` is ISO string (`useM11CActivityRoom.ts:81`) but is display-only: `formatTimestamp` shows relative (`just now`, `Nm ago`, `Nh ago`) then `MMM d` (`M11CStreamItem.tsx:328-345`); absolute tooltip adds month/day/hour/minute (`M11CStreamItem.tsx:348-359`); detail modal uses locale string (`M11CActivityDetailModal.tsx:66-68`).
- Result: the motivating query — Marionette Evangelista, 2026-09-26 (23 events) vs 2026-09-27 (2 events) in `m9-activity.db` — cannot be isolated by date in the UI today. Only participant + `conversations` + search `Marionette` + manual scroll.

## 3. History loading limits

Source: `apps/workspace/src/hooks/useM11CActivityRoom.ts:42-49`

- `SNAPSHOT_LIMIT = 50` — initial M11A snapshot size
- `HISTORY_PAGE_SIZE = 50` — per scroll-up page via `onLoadOlder`
- `MAX_WORKING_SET = 500` — bounded client working set
- `RENDER_WINDOW = 100` (`M11CActivityStream.tsx:46`) — bounded DOM window; `rendered = min(filtered, renderWindow + olderLoaded)`
- `hasMoreHistory` / `olderLoaded` / `snapshotComplete` govern whether older durable activity (e.g. 2026-09-26 11:40–11:56 UTC) is reachable at all

Implication for date filter design: date windowing must compose with — not replace — paged history. A date query over unloaded history must either trigger `onLoadOlder` until the window is covered or state coverage explicitly (`snapshotComplete`, `olderLoaded`).

## 4. Adjacent findings (not in scope)

- `payload_json` for the sampled Marionette `human.message` events carries only `message` + `messageId` — no channel field, so Telegram-vs-web provenance cannot be established from the event alone. Recorded, not acted on.
- `telegram_identity_bindings` shows `Marionette Evangelista`, `created_at 2026-09-25T22:45:19.292Z`, `active 1`. `telegram_conversation_bindings` for that principal returned zero rows at audit time. Recorded, not acted on.

## 5. Handoff to 02–05

- `02` designs the token-governed From/To control per `docs/governance/UI-UX-GOVERNANCE.md`.
- `03` extends `StreamFilterOptions` with an optional date window and covers boundaries, timezones, and AND-composition in vitest.
- `04` wires the control into the filter bar with clear/reset and history interplay.
- `05` runs `vds:validate`, `lint:check`, and records UI evidence for the 2026-09-26 to 2026-09-27 window without opening message content.
