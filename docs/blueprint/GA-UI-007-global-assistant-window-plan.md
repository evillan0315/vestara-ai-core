# GA-UI-007 — Global Vestara Assistant Full-Window Surface (Plan)

**Status:** PLAN (not yet implemented)
**Objective:** Rebuild the Global Vestara Assistant as a full-window surface that matches the attached reference image, reusing the accepted assistant primitives (ConversationPanel, AssistantCodeEdit, AssistantTodoChecklist, AssistantResponseActions, ConversationHistory).
**Baselines preserved:** GA-SSE-003 (SSE), GA-UX-M5A (todo checklist), GA-CONTEXT-002 (surface context), M4A (code edit), GA-CONTEXT-003 (continuity audit).

---

## 1. Target screen anatomy (mapped to the reference)

The reference is the Floating Assistant **expanded to a full window** (not the small floating bubble). It has three regions:

```
┌──────────────────────────────┬───────────────────────────────────────────────────────┐
│  SIDEBAR (conversation list) │  MAIN PANEL (active conversation)                      │
│  ── Vestara Assistant ──     │  ┌─ header: You · 10:24 AM ────────── [max][min][x] ─┐ │
│  ┌ Search conversations… ┐   │  │  (window controls)                                │ │
│  │ [+ New]                │   │  └──────────────────────────────────────────────────┘ │
│  ── Today ──               │   │  human bubble (right)                                │
│  ▸ Implement header/… 10:24│   │  assistant bubble (left)                              │
│  ── Yesterday ──            │   │    header: Vestara Assistant · Muse Spark 1.3        │
│    Vestara architecture     │   │    narrative text                                    │
│    Provider configuration   │   │    [AssistantCodeEdit: Editing /path + diff + Open]  │
│    Repository status        │   │    [AssistantTodoChecklist: 4 of 4 tasks]            │
│  ── Previous 7 days ──      │   │    follow-up text                                    │
│  ── Older ──                │   │    [Files modified · ConversationHistory.tsx +5 -4]  │
│                             │   │    [Copy · Share]                                   │
│                             │   └──────────────────────────────────────────────────┘ │
│                             │  ┌─ composer: "Ask anything about this workspace…" ────┐ │
│                             │  │  (Enter to send · Shift+Enter for newline) [send]   │ │
│                             │  └──────────────────────────────────────────────────────┘ │
└──────────────────────────────┴───────────────────────────────────────────────────────┘
```

## 2. Region → component mapping

| Reference region | Existing primitive | Status |
|---|---|---|
| Sidebar brand header ("Vestara Assistant", model subtitle) | `ConversationHistory` header | EXTEND |
| Sidebar search box | `ConversationHistory` search | EXISTS (verify) |
| Sidebar `+ New` button | `ConversationPanel`/history "new conversation" | EXISTS (verify focus/threading) |
| Sidebar time-grouped list + active highlight | `ConversationHistory` (GA-UI-006) | EXISTS — promote to persistent rail |
| Main panel window controls (max/min/close) | `FloatingPanel` controls | REUSE (FloatingPanel already has these) |
| Main panel header ("You · 10:24 AM") | `MessageBubble` human header | EXISTS |
| Assistant header ("Vestara Assistant · Muse Spark 1.3 · time") | `AssistantLabel`/message header | EXISTS |
| Assistant narrative text | `MarkdownRenderer` | EXISTS |
| **Edit card** (file header + diff + "Open in editor") | `AssistantCodeEdit` (M4A) | **EXISTS — add "Open in editor" affordance** |
| **Task checklist** (4 of 4, collapsible) | `AssistantTodoChecklist` (M5A) | EXISTS |
| **Files modified** footer card | NEW — small summary primitive | ADD |
| Copy / Share actions | `AssistantResponseActions` (GA-UI-003) | EXISTS |
| Composer (placeholder, hint, send) | `ConversationPanel` composer | EXISTS (verify full-width variant) |
| Assistant avatar | `AssistantLabel` | EXISTS |

## 3. Mode model

The Global Assistant should support two geometries from one codebase:

- **Floating mode (current):** small draggable/resizable panel; history hidden behind a popover; geometry persisted per workspace.
- **Expanded mode (this plan):** full-window surface; left history rail always visible; wider composer; the same `ConversationPanel` internals.

The screenshot IS the expanded mode. The plan adds an expanded geometry to the existing `FloatingPanel`/`GlobalAssistant` rather than a separate app.

## 4. Visual system (from reference + Vestara tokens)

- **Surface:** near-black (`--color-zinc-950`) canvas; panels `zinc-900/60`; borders `zinc-800`.
- **Accent:** vestara purple/blue for the human bubble and send button; `--vestara-gold` reserved for status/emphasis.
- **Assistant narrative:** borderless prose; structured evidence (edit card, checklist, files card) gets containment (rounded card + `zinc-800` border + `zinc-900/60` bg).
- **Sidebar list:** quiet `zinc-400` titles, `zinc-600` timestamps; active row highlighted (`zinc-800` bg / accent left rule).
- **Diff:** restrained (M4A grammar) — subtle bg, `+/-` gutter, mono, internal scroll.
- **Type scale:** 11–13px UI; mono for code/diff; tabular-nums for counts.

## 5. New surface-specific gaps (to implement)

1. **Sidebar as persistent rail** — refactor `ConversationHistory` from a popover into a `min-w-[300px]` left rail with its own scroll; keep the popover variant for floating mode (or unify via a `variant` prop).
2. **"Files modified" summary card** — a small `AssistantFilesSummary` primitive (file path + `+N -N` counts) driven by the edit operations; presentation-only, no fabrication.
3. **"Open in editor" affordance** — an action on the `AssistantCodeEdit` header that opens the repository-relative path (a bounded `window.open`/route or copy-path fallback; NOT an execution authority).
4. **Expanded geometry** — extend `FloatingPanel` with an "expanded" state that docks to full width (or a dedicated `GlobalAssistantWindow` shell) while preserving drag/resize/minimize in floating mode.
5. **Wide composer** — the existing composer constrained to `max-w`; in expanded mode allow full width.
6. **Header model subtitle** ("Muse Spark 1.3 · opencode-go") — resolve from the agent-assistant model binding (GA-CONTEXT-002) rather than hardcoding.

## 6. Data flow (unchanged from frozen baselines)

- Conversation list: `useAssistantConversation` → `GET /api/conversations`.
- Active conversation SSE: `POST /api/conversations/:id/stream` → `text/event-stream` → `delta`/`tool`/`tool_result`/`status`/`done`.
- Turn-time SurfaceContext (GA-CONTEXT-002) forwarded on each send.
- Structured projections: M3 `assistant.execution.v1` (edit → `AssistantCodeEdit`, task-snapshot → `AssistantTodoChecklist`).
- **No transport change:** SSE stays; no WebSocket; no opencode.ai; browser→Vestara only.

## 7. Accessibility

- Sidebar list = `aria-current` on active item; group headings as `role="presentation"`/`aria-label`.
- Composer `label` + placeholder; send button `aria-label`; `Enter`/`Shift+Enter` semantics preserved.
- Checklist / edit card already expose textual state (M5A/M4A) — keep.
- Window controls `aria-label` (maximize/minimize/close).

## 8. Acceptance criteria

- [ ] Expanded full-window surface renders the three regions matching the reference layout.
- [ ] Sidebar lists conversations grouped by Today/Yesterday/Previous 7 days/Older with active highlight.
- [ ] Selecting a sidebar conversation loads it in the main panel (no new conversation required on nav).
- [ ] Human bubble right; assistant bubble left with avatar + model subtitle.
- [ ] `AssistantCodeEdit` renders the runtime diff; "Open in editor" action present and bounded.
- [ ] `AssistantTodoChecklist` renders "N of M tasks completed" from the runtime snapshot.
- [ ] "Files modified" card lists the edited file(s) with `+/-` counts.
- [ ] Copy/Share actions work (GA-UI-003 semantics); no Apply/Accept/Revert.
- [ ] Composer sends; `Enter` sends, `Shift+Enter` newline; busy guard holds.
- [ ] Geometry: expanded mode persists; floating mode drag/resize/minimize still works.
- [ ] No regression: SSE streaming, prompt_async, M4A edits, M5A checklist, GA-CONTEXT-002 surface, conversation persistence, local OpenCode only.
- [ ] Accessibility: keyboard nav, focus, aria semantics pass.

## 9. Scope boundaries

- **In scope:** the expanded full-window shell + sidebar rail + files-summary card + "Open in editor" affordance + wide composer + model subtitle from the binding.
- **Out of scope / frozen:** GA-SSE-003 transport, M4A/M5A presentation semantics, GA-CAP-002 (permission/question UI — HOLD), M7 session continuity (HOLD), GA-CONTEXT-004 continuity fix (separate), Activity Room, evidence.
- **Recorded adjacent:** "Open in editor" must not become a filesystem-execution authority; it is a navigation affordance.

## 10. Milestone sizing

1. **M1 — shell:** expanded geometry + sidebar rail (reuse ConversationHistory) + window controls. (No content changes.)
2. **M2 — content assembly:** bind the sidebar selection to the main panel; wire the composer; confirm human/assistant bubbles.
3. **M3 — structured evidence:** ensure AssistantCodeEdit + AssistantTodoChecklist + Files-summary card render in the full-width panel; add "Open in editor".
4. **M4 — polish/verify:** model subtitle from binding, a11y, acceptance run, regression lane, visual evidence.

---

**Note:** This is a plan only. The reference's edit card, task checklist, Copy/Share, and conversation list already exist as accepted primitives (M4A/M5A/GA-UI-003/GA-UI-006) — the plan is primarily about composing them into a persistent full-window surface and adding the files-summary + open-in-editor affordances, without touching the frozen transport/projection baselines.