# Next Implementation — Track Plan

State: Track 3 (migration) complete and verified live — all production-opened
DB files versioned (`plans.db` `uv: 8`, five single-owner files `uv: 1`,
`prefs.db` `uv: 1`), drift-guard allowlist at 8 justified entries, repo lint
fully green. Track 4C (Activity Room) complete — AAR-001D–H all done with
E2E/visual evidence and an organizational-provenance observation recorded.

## Open tracks

### Track 3C — Finish the migration work (DONE)
Migration incident #0001 closed end-to-end. Remaining allowlisted DDL is
in-memory / no-write-back / test-only; the 13 feature scaffolds are dormant and
await deliberate wiring (manifests ready in `scaffold-migrations.ts`).

### Track 1C — Close Phase 1 (Agent Control slot/catalog) — DECISION-GATED
The Reviewer directed: separate **Agent Catalog** (all agents) from **Role
Assignment** (canonical slots), Identity ≠ Role. Needs the product decision
first; then a small implementation + re-verify in the default seeded state.
- Small; closes the open incident.

### Track 2C — Phase 2 (`opencode-runtime` generation boundary) — DECISION-GATED
Requires the P0 tool-governance decision. Largest slice.

### Track 4C — Activity Room AAR-001D–H (in progress)
- **AAR-001D DONE** — Activity detail modal (`ActivityDetailModal.tsx`):
  structured fields per kind, verification checks, evidence references, raw
  payload toggle, Escape/backdrop close; "Inspect" action on every card; wired
  through `ActivityStream`/`ActivityRoomPage`; 4 new tests (root suite green).
- **AAR-001E DONE** — Human Messaging:
  - Contract: `MessageTarget`, `AgentMessageActivity.referencedActivityIds`.
  - `ActivityProjectionService.appendActivity()` (sequence → redact → persist →
    broadcast pipeline for pre-built human records).
  - API: `POST /api/messages` (all-agents) and
    `POST /api/agents/:agentId/messages` (direct) with content/target/
    reference validation and secret redaction — verified live.
  - UI: fixed composer (`ActivityComposer.tsx`) — target indicator, mentions
    (`@` menu retargets), Enter sends / Shift+Enter newline, sending/failed
    states, reference attachment ("Reference" action on cards), optimistic
    human messages reconciled with the server record, failed-send retry.
  - Also rebuilt the broken WIP `verifier.ts` (evidence pipeline) that was
    blocking the build (duplicated block + invalid type + unclosed stub).
- **AAR-001F DONE** — Workflow/session scoping:
  - `ActivityScope` state in `useActivityStream` read from the URL
    (`workflowId`/`sessionId`) on mount; `applyScope` updates the URL
    (`history.replaceState`) and refetches scoped history (merge).
  - `ActivityScopeSelector` UI (All activity / Workflow select / Session select,
    options derived from records); stream + footer filter by scope; initial
    history load is scope-aware.
  - 5 new tests (URL round-trip, scoped refetch, global reset, initial URL
    scope); live-verified (POST with `workflowId` → scoped GET returns exactly
    that record).
- **AAR-001G DONE** — Real-time hardening:
  - Already present: reconnect backoff (1s→30s), missed-message replay
    (`afterSequence` resubscribe + `resync-required` recovery), per-id
    deduplication, pause buffering, offline/reconnecting state.
  - Added: unread tracking (records arriving while scrolled up or paused count;
    cleared on return-to-bottom, resume, or jump-to-latest); unread badge on the
    jump button; list virtualization (300-record render window with a "Show N
    older records" control so high event volume never floods the DOM).
  - 3 new tests (unread on scroll-away/return, unread on pause/resume,
    virtualization).
- **AAR-001H DONE** — E2E + visual verification (Track 4C complete):
  - New Playwright spec `tests/visual/activity-room.spec.ts` (render + a11y
    semantics, API→WS→UI liveness with a workflow-scoped record, optimistic
    message round-trip, detail modal, scoping, reload persistence) with four
    screenshot-evidence captures; passing against the live Workspace.
  - Visual baseline: `/activity` captured across desktop viewports × themes
    (16 cases), compare run 16/16 passing.
  - Fixed the pre-existing `vite.config.ts` exclude so the stale compiled
    Playwright `.spec.js` artifacts are no longer executed by vitest.
  - Observation recorded (see ORGANIZATIONAL-FINDINGS.md): the room preserves
    chronology/actor attribution but does not represent organizational effect
    or authority provenance.

## Recommended next

1. **Decisions to surface (parallel):** (a) Agent Control catalog vs role
   assignment; (b) Phase 2 P0 tool-governance. Once made, Track 1C / Track 2C
   proceed. (Track 3 migration and Track 4C Activity Room are both complete.)

## Morning-query prototype

`vestara brief` (CLI) — the "what happened while I was offline?" query,
prototyped from the manual overnight audit. Read-only; reconstructs the brief
from durable evidence (event store, plans DB, evidence bundles, git) and
reports provenance gaps honestly (e.g., git identity ≠ executing participant).
Text and `--json` modes; `--hours=N` window.

## Activity Room production-readiness foundations (done)

- **Foundation 2 — durable continuity:** `SqliteActivityStore` +
  `ACTIVITY_MANIFEST` (migrations) persists every record to `activity.db`; the
  API boots the room via `initActivityRoom` (migrate → hydrate → resume
  sequence). **Live-verified:** a message survived a full API restart and
  reconstructed from the durable store.
- **Foundation 1 — activity meaning/provenance:** `effect`
  (`message|finding|recommendation|decision|authorization|intervention|handoff|closure|recognition|hold`)
  and `relatesTo` added to the activity contract; the composer carries an
  effect selector + the local actor identity; the API records them; cards show
  an effect badge and the detail modal shows effect + related records.
- **Direction 1 — corrections & readable relationships:** `correctionOf` on the
  contract; the API validates the target and defaults the effect to
  `intervention`; a "Correct" action opens an append-only correction dialog
  (original never mutated); originals render a "Corrected by" marker; the
  detail modal resolves `correctionOf`/`relatesTo` ids to readable titles.
  **Live-verified:** original + correction survived a full API restart with the
  link, effect, and actor intact.
- **Direction 2 — effective state (done, smallest proof):** a pure, recomputable
  projection (`projectEffectiveState`) over the durable history — history
  authoritative, effective state derived and never persisted. It derives
  effective attribution after corrections, open holds/findings/recommendations
  (resolved by later closure/decision/authorization/intervention in the same
  unit or by reference), per-unit latest disposition, and `needsAttention`.
  Exposed as `GET /api/activity-room/state` and a compact "Effective state"
  panel in the room (clearly labeled derived). 6 projection tests + API test +
  live verification (the real correction derived from durable history).
- **Presentation pass (done):** the panel communicates meaning, not database
  structure — readable corrections ("Corrected: Developer reports
  implementation complete — by Director"), a positive "Nothing needs your
  attention" state, workstream labels, no raw IDs. Panel is now collapsible
  (compact summary row by default).
- **Layout pass (done):** the room fits the viewport — `PageContainer` gained
  `h-full` so the `h-full → min-h-0 → overflow-y-auto → shrink-0` chain holds;
  the composer stays permanently visible (`shrink-0`), only the activity stream
  scrolls internally, no page-level scrollbar. Verified by E2E (composer in
  viewport, outer container overflow 0).
- **UI/UX pass (done):** conversational stream density — cards are lighter
  (smaller padding/borders, hover-bg), first line answers "who/what/when"
  (relative time), content dominates. Organizational effects (what happened)
  are always-visible colored labels; UI actions (Inspect/Reference/Correct) are
  quiet and hover-revealed — the two are visually distinct. Inspect modal uses
  progressive disclosure: human-readable summary first (actor, content, effect,
  context, related activity), with "Technical details" (IDs, sequences, ISO
  timestamps, checks, evidence) and "Raw payload" collapsed by default.
- **Visual-system polish pass (done):** conversation-first Vestara surface.
  Both dialogs (detail + correction) now reuse the canonical `VestaraModal`
  (primary-gradient panel, gold accent bar, dimmed blur backdrop) — consistent
  with the Register Agent dialog. The stream dropped its persistent card boxes
  entirely — spacing, avatars, typography, hover, and effect accents define
  messages. The composer is one object: gradient surface + accent bar, To/Effect
  integrated along the top edge, transparent writing surface, gold Send attached
  at the bottom. Semantics and behavior unchanged.
- **Conversation grammar pass (done):** Activity records now present as three
  structurally distinct visual modes without changing semantics: plain agent
  messages are left chat bubbles, plain human/Director messages are right chat
  bubbles, and non-message organizational activity is centered as quiet,
  inspectable timeline text. Material icon actions use 19px icons in 32px hit
  targets with tooltips; semantic effects remain readable words. The composer
  is a compact single surface with integrated recipient/effect controls, icon
  hints, and an icon-only Send action. A deterministic same-viewport visual
  fixture proves all three modes simultaneously.
- Still follow-on: Observer autonomy, full memory architecture, advanced
  governance.

## Resource-aware scheduling (8 GB / 4-core investigation)

- **Measured resident topology (no optimization at measure time):** Vestara-owned
  resident ≈ 1.17 GB — opencode serve (526 MB), API (269 MB), Vite (163 MB),
  keepalive watchers (89 MB), pnpm wrappers (124 MB); desktop Chromium ~2.28 GB
  (mostly the human's browser, not optimized first); non-Vestara openclaw 222 MB.
- **Step 1 done — stopped unnecessary autonomous work:** the continuous-tester
  auto-trigger (`WorkspaceUiWatcher` → `agent-workspace-ui-tester`) was gated
  behind `VESTARA_UI_TESTER_AUTOTRIGGER=1` (off by default). It was running
  failing harness runs every 1–2 min (`provider-failed`). **Live-verified:** 20
  min with zero new tester executions after restart (was 1–2 min cadence); no
  new keepalive processes.
- **Step 2 (next):** on-demand OpenCode (526 MB — largest Vestara-owned
  resident; operationally important, so second).
- Principle: **durable organization, disposable compute** — participants stay
  durable; compute is granted when needed and released after.

## Decisions requested

- Make the Agent Control catalog decision and go Track 1C, or
- Surface the Phase 2 tool-governance decision and go Track 2C, or
- Start a new track.
