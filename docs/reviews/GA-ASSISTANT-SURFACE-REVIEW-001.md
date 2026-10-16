---
title: GA Assistant Surface Review 001
version: 1.0.0
status: complete
owner: vestara
last-reviewed: 2026-10-16
next-review: 2026-11-16
---

# GA-ASSISTANT-SURFACE-REVIEW-001 — Global / Floating Assistant Surface Review

**Status:** REVIEW COMPLETE — findings recorded. No source, test, evidence,
database, service, or runtime state was modified. No staging, commit, or push.

**Scope:** independent inspection and review of the Global Assistant and its
floating presentation — `apps/workspace/src/components/assistant/`, the shared
conversation hook `apps/workspace/src/hooks/useAssistantConversation.ts`, the
floating-window primitive `packages/ui/src/components/FloatingWindow.tsx`, the
mount site `apps/workspace/src/layouts/ShellLayout.tsx`, the assistant styles,
and the assistant test surface.

**Method:** static, read-only inspection. Findings are evidence-backed with
`file:line` references; no runtime dogfood was performed.

**Baselines preserved:** `docs/architecture/GA-006-ASSISTANT-CONVERGENCE-AUDIT.md`
(the frozen "one assistant system, two presentation modes" conclusion) is not
contradicted by this review.

---

## 1. Executive verdict

The core architecture is **correct and consistent with the frozen GA-006
contract**: one assistant system, one hook instance, two chrome modes over a
shared substrate. The issues found are localized presentation and quality
defects, not architectural divergence.

| # | Severity | Finding | Class |
|---|----------|---------|-------|
| F-01 | HIGH | Invalid Tailwind class drops a text token | ADJACENT (defect) |
| F-02 | HIGH | Hardcoded visual literals (UI/UX governance violation) | BLOCKER (governance) |
| F-03 | MEDIUM | Side effects inside React state updaters | ADJACENT (defect) |
| F-04 | MEDIUM | Focus contract broken in full-window mode | ADJACENT (defect) |
| F-05 | LOW | `aria-expanded` / icon state mismatch when expanded | OBSERVATION |
| F-06 | LOW | Inline z-index; full-window not manager-registered | OBSERVATION |
| F-07 | OBS | Render-phase ref mutation | OBSERVATION |

The largest single gap is **test coverage**: the entire front-end assistant
surface has one test file, while GA-006 records these components as
"production quality". Defects F-01 and F-04 are exactly what a smoke test
would catch (**claim ≠ evidence**).

---

## 2. Architecture verdict (verified in code)

- `GlobalAssistant` is mounted exactly once (`apps/workspace/src/layouts/ShellLayout.tsx:112`) and owns the single `useAssistantConversation()` instance (`apps/workspace/src/components/assistant/GlobalAssistant.tsx:201`).
- Both presentation modes delegate to the same `ConversationPanel` and receive the same `assistant` object: `FloatingPanel` (bubble) and `FullWindowSurface` (full window). No second hook, no second conversation store, no duplicated execution path.
- Window mechanics (drag, resize, geometry persistence, keyboard, escape, z-index) are genuinely delegated to `@vestara/ui` `FloatingWindow` (`apps/workspace/src/components/assistant/FloatingPanel.tsx:59`).
- `LauncherDock` and the navigation/provenance module (`apps/workspace/src/lib/assistant-navigation.ts`) are presentation-only and never select/create/infer conversation origin from prose.

This matches GA-006 sections 2 and 20. No convergence regression was found.

---

## 3. Findings

### F-01 — HIGH — Malformed Tailwind class drops a text token

`apps/workspace/src/components/assistant/LauncherDock.tsx:181` renders:

    rounded bg-(--vestara-surface-interactive) text-(--vestara-text)0

The trailing `0` turns the valid token utility `text-(--vestara-text)` into the
invalid class `text-(--vestara-text)0`, so the runtime-session resume icon
receives no token color (it inherits). Likely intended: `text-(--vestara-text-muted)`.

**Impact:** user-visible on the OpenCode runtime-session resume row.

### F-02 — HIGH — Hardcoded visual literals (governance violation)

`docs/governance/UI-UX-GOVERNANCE.md` section 3 ("NO HARDCODE — Zero
Tolerance") forbids literal visual values that are not sourced from
`var(--vestara-*)`. The assistant surfaces contain raw hex-derived values:

- `apps/workspace/src/components/assistant/GlobalAssistant.tsx:141` — `rgba(0,0,0,0.6)`; `:157` — `rgba(0,0,0,0.35)`; `:172` — `rgba(52,211,153,0.9)`
- `apps/workspace/src/components/assistant/FullWindowSurface.tsx:127` — `from-amber-300 via-amber-500 to-orange-600` + `rgba(245,158,11,0.4)`
- `apps/workspace/src/components/assistant/LauncherDock.tsx:104` — `rgba(0,0,0,0.8)`
- `apps/workspace/src/components/assistant/FloatingPanel.tsx:161` — `text-zinc-500`
- `apps/workspace/src/components/assistant/ConversationPanel.tsx` — many (`:159`, `:208`, `:265`, `:499`, `:890`, `:969`, `:981`, `:991`) with zinc/amber/emerald, `white`/`black`, and `rgba` shadows
- `apps/workspace/src/components/assistant/AssistantToolCard.tsx` and `apps/workspace/src/components/assistant/ToolObservationRenderer.tsx` — same pattern

**Aggravating factor (governance gap):** `apps/workspace` is excluded from
Biome, so `pnpm lint:check` cannot detect these; the documented CI gates do not
catch `bg-amber-500`, `text-zinc-500`, or `rgba(...)` shadows in this
directory. The policy states violations are BLOCKER-class, but the automated
gate cannot currently enforce it for this surface.

### F-03 — MEDIUM — Side effects inside state updaters

React state updaters must be pure; React may invoke them more than once.

- `apps/workspace/src/components/assistant/GlobalAssistant.tsx:410-419` — `togglePanel` calls `returnFocusToLauncher()` (a `setTimeout` plus ref write) inside the `setPanelOpen` updater.
- `apps/workspace/src/components/assistant/GlobalAssistant.tsx:368-393` — `handleLauncherKeyDown` calls `event.preventDefault()` and `persistLauncherPosition()` (a localStorage write) inside the `setLauncherPos` updater.

**Impact:** duplicated focus timers and double storage writes under
StrictMode/concurrent rendering; `preventDefault` may not run reliably.

### F-04 — MEDIUM — Focus contract broken in full-window mode

`apps/workspace/src/components/assistant/FullWindowSurface.tsx:183` passes
`focusOnMountRef={{ current: null }}` — a new object on every render.

- `ComposeInput`'s effect keyed on `[focusRef]` (`apps/workspace/src/components/assistant/ConversationPanel.tsx:600-603`) re-runs on every render and reassigns the ref.
- The expanded composer never receives `GlobalAssistant`'s real `focusOnMountRef` (used by the floating path at `GlobalAssistant.tsx:580`), so "open → focus composer" does not occur when expanded and the shared ref stays empty.

**Impact:** the documented open-focus contract fails in full-window mode.

### F-05 — LOW — `aria-expanded` / icon mismatch when expanded

`apps/workspace/src/components/assistant/GlobalAssistant.tsx:545` passes
`panelOpen={panelOpen && !panelExpanded}`. With the full window open, the
launcher announces `aria-expanded=false` and renders the "Open assistant"
icon/label although the assistant is visibly open.

### F-06 — LOW — Inline z-index; full-window not manager-registered

`GlobalAssistant.tsx:536-540`, `LauncherDock.tsx:105`, and
`FullWindowSurface.tsx:118-120` use inline `style={{ zIndex }}`.
`FullWindowSurface` renders inside `FloatingWindowManager` without a window
`id`, so it never uses `getZIndex()` / `bringToFront()` and is pinned at
`Z_INDEX.overlay`. UI/UX governance section 4 also forbids inline visual styles.

### F-07 — OBSERVATION — Render-phase ref mutation

`GlobalAssistant.tsx:440-443` assigns `selectConversationRef.current` and
`selectedIdRef.current` during render. Intentional (to avoid stale closures in
the window listener) but still a render-phase side effect; a layout effect or
event-handler pattern would be safer.

---

## 4. Execution Governance classification

| Finding | Classification | Basis |
|---------|----------------|-------|
| F-02 | BLOCKER (governance) | UI/UX governance declares hardcode a blocker; remediation is required before the surface can be called clean |
| F-01, F-03, F-04 | ADJACENT | Real defects discovered during a read-only review; not required to complete this review, recorded with evidence |
| F-05, F-06, F-07 | OBSERVATION | Correctness/consistency signals with low blast radius |

No mutation authority is conferred by these findings. Remediation requires
explicit authorization.

---

## 5. Test coverage gap

The front-end assistant surface has exactly one test file:
`apps/workspace/src/components/assistant/LauncherDock.test.tsx` (three
anchor-placement assertions). There are no tests for `GlobalAssistant`,
`FloatingPanel`, `FullWindowSurface`, `useAssistantConversation`, the
dock-selection/resume flow, the focus contract, or `ConversationPanel`.
Backend assistant logic is tested (`packages/conversation`,
`packages/conversation-runtime`, `packages/activity-room`,
`packages/execution-types`); the gap is specifically the Workspace UI.

---

## 6. Verification and gates

- Not run by this review: `pnpm build`, `pnpm test`, `pnpm lint:check` (read-only review; no code changed).
- Documentation governance for this record: `pnpm docs:govern` and `pnpm documentation:check`.
- Evidence manifests: none added — this is a static review, not a runtime dogfood. No runtime verification is claimed.

---

## 7. Milestone linkage

Recorded in `docs/MILESTONES.md` as `GA-ASSISTANT-SURFACE-REVIEW-001`.
Remediation is a separate, gated decision (see the milestone entry for the
suggested order and the required authorization boundary).

---

## 8. Explicit non-actions / out of scope

- No production code, tests, tokens, styles, or configuration changed.
- No token migration performed (F-02 is recorded, not remediated).
- No test additions performed (Section 5 is recorded, not remediated).
- No claim that the assistant is or is not production-ready; GA-006's
  readiness statements are not re-litigated here.
