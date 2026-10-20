---
title: AR-SUGGESTED-PAGE-001 — Assistant "Suggested for this page" Feature Backlog
version: 0.1.0
status: planned-future
owner: vestara
last-reviewed: 2026-10-20
next-review: 2026-11-20
---

# AR-SUGGESTED-PAGE-001 — Assistant "Suggested for this page" Feature Backlog

> **STATUS: PLANNED / FUTURE — NOT IMPLEMENTATION-AUTHORIZED.**
> Read-only investigation and feature-backlog capture only. No code change, UI
> change, or runtime change is authorized by this record. Each item below
> requires its own authorization (and, where noted, roadmap-governance
> PCS → UX → ATS progression) before implementation.

## A. Milestone identity and status

- **ID:** AR-SUGGESTED-PAGE-001
- **Title:** Assistant "Suggested for this page" Feature Backlog
- **Status:** PLANNED / FUTURE (roadmap-governance stage: Proposed)
- **Type:** Assistant / Activity Room capability backlog (design-lineage capture)
- **Priority:** MEDIUM — recorded backlog, not a current-roadmap item
- **Purpose:** Preserve the findings of the 2026-10-20 investigation into the
  Global and Floating Assistant "Suggested for this page" (launch-surface)
  system, and the candidate features derived from it, so future development
  extends the existing suggestion machinery rather than recreating it.
- **Sequencing invariant:** This record MUST NOT replace the existing
  `GA-UX-002` suggestion resolver. All items extend it.

## B. Investigation evidence (as-observed 2026-10-20)

### B1. Architecture

- Global Assistant (`apps/workspace/src/components/assistant/GlobalAssistant.tsx`)
  and the Floating Panel (`FloatingPanel.tsx`) both render the **same**
  `ConversationPanel.tsx` — suggestion content is identical in both modes;
  only layout differs (single column in floating mode).
- Resolution chain: Workspace/Page registry → `SurfaceContext` →
  `assistantSuggestionResolver.ts` → `SuggestionModel[]` → `ConversationPanel`
  renders. The resolver owns suggestion policy; the panel owns presentation
  only (`ConversationPanel.tsx:1190-1193`).
- Resolver hierarchy: **selected entity → route/section → workspace →
  generic fallback**. Selection flips the section label to
  "Suggested for selection" (`ConversationPanel.tsx:1285`).
- Sections rendered by `SuggestionEmptyState`:
  1. Identity + Current Context card (`resolveContextCard`; Settings resolves
     inner tabs/sections at sub-page fidelity).
  2. **Suggested for this page** — route-keyed static table
     (`ROUTE_SUGGESTIONS` in `assistantSuggestionResolver.ts`).
  3. **May need attention** — live, progressive, from
     `GET /api/suggestions` (`apps/api/src/routes/misc.ts:159-163`,
     `SuggestionService.generate`), top-2 filtered by priority,
     non-blocking (`ConversationPanel.tsx:1211-1235`).
  4. **UI/UX recommendations** — static fixtures
     (`assistantUxSuggestions.fixtures.ts`), route-keyed + selection set.
  5. Quick Actions — static 4 (`QUICK_ACTIONS`).
- **Visibility rule:** launch surface shows only on a new/untouched
  conversation (`showSuggestions` requires no messages, no optimistic turns,
  not streaming, not loading, not errored; `ConversationPanel.tsx:1758-1759`).
  Once a conversation has a turn, suggestions never reappear.
- **Click behavior:** `handleSuggest` sends immediately through the normal
  conversation path — `void handleSend(prompt)` (`ConversationPanel.tsx:1763-1771`).
  It does **not** fill the composer.

### B2. Observations (classified per Execution Governance)

| # | Finding | Class |
|---|---------|-------|
| 1 | No tests exist for `assistantSuggestionResolver` — a high-fan-out policy module is untested. | ADJACENT |
| 2 | `getSuggestions()` effect has an empty dependency array — attention data is fetched once per mount, never refreshed on route change or conversation switch (`ConversationPanel.tsx:1214-1235`). | ADJACENT |
| 3 | `AssistantSuggestion.icon` is defined but no renderer consumes it — sections use inline SVGs. | ADJACENT |
| 4 | Contextual suggestions are state-blind literals (e.g. "Find blocked work" renders even when nothing is blocked), contradicting the resolver's own no-fabricated-state-assertions comment. | OBSERVATION |
| 5 | Auto-send on click vs. AR-COMPOSER-SUGGEST-001 §N ("no sending on behalf of the human; selection updates the composer only") — current behavior conflicts with the *not-yet-activated* planned authority boundary. | OBSERVATION |
| 6 | No dismissal/feedback/telemetry for contextual or UX suggestions; dismiss exists only for backend attention suggestions (`POST /api/suggestions/:id/dismiss`). | ADJACENT |
| 7 | Mixed Tailwind token syntax within `ConversationPanel.tsx` (`text-(--vestara-…)` vs `text-[length:var(--vestara-…)]`) — both token-governed, inconsistent style. | ADJACENT |

## C. Feature backlog

### Tier 1 — extends existing machinery, no new intelligence system

1. **State-gated suggestions** — before rendering a route suggestion, validate
   against an authority the page already has (API / mock server return). Example:
   show "Find blocked work" only if workflow/activity data reports blocked
   items. Uses the UI/UX Governance §6 data ladder; no model calls needed.
2. **Per-suggestion dismiss ("Not useful")** — local persistence keyed by
   route; mirrors the existing attention-dismiss contract.
3. **Usage-ranked ordering** — record suggestion clicks locally (last-used
   counter per id) and re-sort within category. Static tables remain the
   fallback; ranking is presentation-only.
4. **Suggestions reappear after a completed turn** — offer a collapsed
   "Suggestions for this page" chip under response actions after a turn
   finishes, restoring one-shot-surface value without cluttering streaming.
5. **Tab-level fidelity for main routes** — generalize the settings pattern
   (`resolveSettingsContextCard`) to query-dependent pages (e.g. Workflows
   detail with `?id=` producing "Explain this workflow · <name>").
6. **Floating ≠ Global density split** — same resolver output; Floating shows
   top-2 contextual + top-1 attention, Global shows the full launch surface.
   Pure presentation split, zero new policy.

### Tier 2 — larger, governance-gated

7. **Bounded page-context envelope for prompts** — attach a compact
   `ComposerSuggestionContext` (route, selection, surface refs) to
   suggestion-sent messages so the model sees why a suggestion was made.
   The shared `ComposerSuggestionContext` / `ComposerContextRef` contract
   questions sit in AR-COMPOSER-SUGGEST-001 §Q — coordinate there, do not
   fork the contract.
8. **Composer-fill option ("Edit prompt before send")** — secondary action
   that fills the composer instead of sending; aligns with
   AR-COMPOSER-SUGGEST-001 §N (suggest ≠ send) when that record activates.
9. **Attention dedup** — suppress attention items already seen this session
   using the existing dismissed-suggestion mechanism
   (`POST /api/suggestions/:id/dismiss` + `excludeDismissed=true`), instead of
   the current 32-character label truncation as the only recognition signal.

### Tier 3 — hygiene (independent of tiers 1–2)

10. **Resolver unit tests** — `assistantSuggestionResolver.ts` currently
    uncovered; add tests covering route normalization, selection/suggestion
    hierarchy, Settings tab/sub-section resolution, and fallback behavior.
    These tests would also lock down observation #2 (stale attention fetch)
    as a regression once fixed.
11. **Icon field decision** — either consume `AssistantSuggestion.icon` or
    remove it (dead field as of 2026-10-20).
12. **Token style normalization in `ConversationPanel.tsx`** — reconcile the
    two token syntaxes to the house style; still `var(--vestara-*)`-governed,
    presentation-only change.

## D. Explicit non-goals of this record

- No implementation of any backlog item in this slice.
- No replacement of the `GA-UX-002` resolver; no parallel intelligence system.
- No re-ranking by model inference, no repository-wide retrieval, no telemetry
  beyond local usage counters (Tier 1 item 3).
- No change to the current proposer/authority model of the launch surface
  until Tier 2 items are individually authorized.

## E. Dependencies / sequencing

- **Related records:** AR-COMPOSER-SUGGEST-001 (Tier 2 items 7–8 hand off to
  its bounded-context-envelope and suggest-≠-send work); UI/UX Governance
  contract `docs/governance/UI-UX-GOVERNANCE.md` (applies to any Tier 1/2 UI
  change; token syntax normalization in Tier 3 item 12 is its §1/§4 domain).
- **Consumes (read-only):** existing resolver, fixtures, attention API,
  SurfaceContext provider as observed in §B.
- **Priority note:** backlog recorded at Director request 2026-10-20; remains
  PLANNED / FUTURE until items are individually activated.

## F. Acceptance criteria for activating individual items

- The specific item is explicitly re-authorized.
- For Tier 1 UI items: PCS → UX → ATS documents exist per
  `docs/ROADMAP-GOVERNANCE.md` before implementation.
- For Tier 2 items: §B observations #4–#5 are re-verified against current
  code first; AR-COMPOSER-SUGGEST-001 activation status is checked.
- Tier 3 item 10 (resolver tests) may proceed independently at any time with
  standard verification (`pnpm lint:check && pnpm build && pnpm test`).

## G. Open questions / UNKNOWNs

- Whether suggestion click counters (Tier 1 item 3) should live in
  local storage or the settings-framework analytics engine
  (packages/settings-framework — `analytics-engine.ts` already offers
  `getSuggestions` scoring patterns).
- Whether "attention" items should be route-scoped at all (today they are
  workspace-global regardless of the open page).
- Whether the Floating/Global density split (Tier 1 item 6) interacts with
  the FloatingPanel drag/resize contract in `@vestara/ui FloatingWindow`.
- Actual product decision on auto-send vs. composer-fill remains with the
  Director; this record takes no position.

---

*Captured 2026-10-20 from an Assistant read-only investigation (resolver,
ConversationPanel, FloatingPanel, API routes) at the Director's request.
Current engineering priority unchanged. No implementation authorized.*
