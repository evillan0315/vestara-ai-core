---
title: GA-UI-008 — Global Assistant Launcher Dock
version: 1.0.0
status: accepted
owner: vestara
last-reviewed: 2026-10-16
next-review: 2026-11-16
---

# GA-UI-008 — Global Assistant Launcher Dock

**Status:** implemented (presentation) — backfilled; the identifier was referenced from code before this document existed.
**Scope:** the recent-conversations dock anchored to the floating assistant launcher.
**Related:** [GA-UI-006](./GA-UI-006-conversation-navigation.md), [GA-UI-007](./GA-UI-007-global-assistant-window-plan.md), [GA-UI-009](./GA-UI-009-global-assistant-restructure-plan.md), [AR-007](./AR-007-floating-assistant-shell.md).

---

## 1. Purpose

`LauncherDock` surfaces recent conversations on hover of the floating assistant launcher, so a user can reopen a session without first opening the panel. It is **presentation only** — it never owns conversation selection, creation, or execution.

## 2. Location

| Artifact | Path |
|---|---|
| Component | `apps/workspace/src/components/assistant/LauncherDock.tsx` |
| Host / timers | `apps/workspace/src/components/assistant/GlobalAssistant.tsx` |
| Test | `apps/workspace/src/components/assistant/LauncherDock.test.tsx` |

## 3. Behaviour

| Concern | Rule |
|---|---|
| Reveal | Shown on launcher hover **only while the assistant panel is closed**. |
| Open delay | `DOCK_OPEN_DELAY_MS = 250` — avoids flicker on incidental pointer passes. |
| Close grace | `DOCK_CLOSE_GRACE_MS = 150` — a hover bridge (`onMouseEnter`/`onMouseLeave`) cancels the pending close when the pointer enters the dock. |
| Timers | Both timers are cleared on unmount to avoid stray `setState`. |
| Selection | Selecting an item opens the assistant on that conversation. Selection authority stays with the GA-2 hook (GET-only canonical selection; no POST, no new turn). |
| Keyboard | A keyboard focus bridge exposes the dock without hover; focus returns programmatically to the launcher after the panel closes. |
| Placement | Anchored to the launcher (viewport px) and flips above/below + left/right to stay on screen; omitting the anchor falls back to the legacy docked bottom-right placement. |

## 4. Runtime sessions (GA-SESSION-003)

The dock also surfaces **compatible runtime sessions** for resume. Child sessions preserve `parentID` lineage — they are indented beneath their parent and never flattened into independent roots.

## 5. Boundaries

- No execution authority: the dock does not send, route, or persist. It delegates to the existing selection/resume handlers.
- No ownership transfer: rendering the dock does not grant ownership of a conversation or its execution (AR-007).
- SSE lifecycle unaffected: opening/closing the dock is a UI concern only.
