---
title: GA-UI-009 — Global Assistant Restructure (Plan)
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-16
next-review: 2026-11-16
---

# GA-UI-009 — Global Assistant Restructure (Plan)

**Status:** PLAN (not yet implemented)
**Objective:** Restructure the Global Assistant toward the `global-assistant.html` reference template — a three-region "assistant console" (conversation rail · thread · workspace status) with a cyan-on-near-black appearance — reusing the accepted assistant primitives and preserving the existing execution/streaming boundaries.
**Template (source of truth):** [`assets/templates/html/global-assistant.html`](../../assets/templates/html/global-assistant.html)
**Baselines preserved:** [AR-005](./AR-005-global-assistant-architecture.md), [AR-007](./AR-007-floating-assistant-shell.md), [GA-CAP-001](./GA-CAP-001-global-assistant-capabilities.md), [GA-SSE-001](./GA-SSE-001-opencode-event-stream.md), [GA-SSE-002](./GA-SSE-002-true-continuous-streaming.md), [GA-UI-006](./GA-UI-006-conversation-navigation.md).
**Supersedes/extends:** [GA-UI-007](./GA-UI-007-global-assistant-window-plan.md) (full-window surface) — this plan keeps GA-UI-007's mode model and adds the template's workspace-status region and appearance.

---

## 1. Why this doc exists

`global-assistant.html` is a compiled, client-rendered reference artifact (single `#root`, react-dom bundle). It is **not shippable source** — it is a visual + behavioural target. This plan defines how to restructure the live Global Assistant (`apps/workspace/src/components/assistant/`) to match it without violating the assistant's architectural boundaries or the UI/UX governance.

---

## 2. Template anatomy (extracted)

The template renders three regions beneath a 56px header, inside a mobile-collapsible drawer shell.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER 56px  VESTARA · [provider selector: OpenCode (default)]                 │
│              nav: Marketplace · Global · Workspace        [+K commands]        │
├───────────────┬───────────────────────────────────────┬──────────────────────┤
│ CONVERSATION  │  THREAD                                │ WORKSPACE STATUS      │
│ RAIL (drawer) │  ┌───────────────────────────────────┐ │ ┌─ OS UNITS ────────┐ │
│ ┌───────────┐ │  │ human / assistant turns            │ │ │ API Gateway :8081 │ │
│ │ + New     │ │  │ (narrative + tool/edit/task cards) │ │ │ AI Router         │ │
│ │  workspace│ │  └───────────────────────────────────┘ │ │ DB Wrapper sqlite │ │
│ └───────────┘ │  ┌─ composer ─────────────────────────┐ │ │ Extensions 4 iso  │ │
│ Search conv.  │  │ "Ask anything about this workspace…"│ │ └───────────────────┘ │
│ ── TODAY ──   │  │ Enter · Shift+Enter · [send]        │ │ ┌─ CAPABILITIES ────┐ │
│ ── PREVIOUS   │  └────────────────────────────────────┘ │ │ Aligns across all │ │
│    7 DAYS ──  │                                        │ │ Remembers decis.  │ │
│               │                                        │ │ Enforces Constitu.│ │
│               │                                        │ │ Preserves knowl.  │ │
└───────────────┴───────────────────────────────────────┴──────────────────────┘
```

### 2.1 Template palette (sampled)

| Template var | Hex | Note |
|---|---|---|
| `--bg` | `#0A0F14` | page canvas |
| `--bg-elev` | `#101820` | panels / inputs |
| `--bg-elev-2` | `#151F29` | raised rows |
| `--border` | `#1E2E3A` | hairline |
| `--border-light` | `#243443` | stronger edge |
| `--text-mid` | `#C8D6DE` | primary ink |
| `--text-dim` | `#8AA0B0` | secondary ink |
| `#5A7586` (literal) | `#5A7586` | faint / meta ink |
| `--cyan` | `#00E5FF` | accent (actions, active) |
| `--cyan-dim` | `#00c2d6` | accent hover |

Fonts: **Instrument Sans** (UI) + **Fragment Mono** (code/meta).

### 2.2 Template regions → live primitives

| Template region | Existing primitive / package | Status |
|---|---|---|
| Drawer shell + brand header | `GlobalAssistant` + `FloatingPanel` (expanded) | EXTEND |
| `+ New workspace query` (cyan CTA) | `ConversationPanel` new-conversation | EXISTS (restyle) |
| `Search conversations` input | `ConversationHistory` search | EXISTS |
| Time-grouped rail (TODAY / PREVIOUS 7 DAYS) | `ConversationHistory` (GA-UI-006) | EXISTS — promote to persistent rail |
| Thread turns | `ConversationPanel` `MessageBubble` | EXISTS |
| Tool / edit / task / terminal cards | `AssistantToolCard`, `AssistantCodeEdit`, `AssistantTodoChecklist`, `AssistantTerminal` | EXISTS |
| Composer ("Ask anything about this workspace…") | `ConversationPanel` composer | EXISTS (verify copy + full-width variant) |
| Header provider/model selector | `ModelSelector`/provider config (GA-PROVIDER-001) | EXISTS — surface in header |
| `OS UNITS` status card | NEW — workspace status rail | ADD |
| `CAPABILITIES` grid | NEW (feed from capability catalog) | ADD |
| Layered architecture card + `active` | NEW (optional, static projection) | ADD |
| `+K commands` command palette | `LauncherDock` / command palette | EXISTS (align affordance) |
| Marketplace · Global · Workspace nav | Workspace navigation | EXISTS |

---

## 3. Token strategy (governance-critical)

The template carries raw hex. Per [UI/UX Governance §3](../governance/UI-UX-GOVERNANCE.md), every value must resolve through a `--vestara-*` token. The restructure introduces an **Assistant Surface appearance** as a new token group in `@vestara/ui-tokens` (VES-DESIGN-007), sampled from the template.

| Template value | New canonical token | Category |
|---|---|---|
| `#0A0F14` | `--vestara-surface-assistant-canvas` | surface |
| `#101820` | `--vestara-surface-assistant-panel` | surface |
| `#151F29` | `--vestara-surface-assistant-raised` | surface |
| `#1E2E3A` | `--vestara-border-assistant-subtle` | border |
| `#243443` | `--vestara-border-assistant-strong` | border |
| `#C8D6DE` | `--vestara-text-assistant-primary` | text |
| `#8AA0B0` | `--vestara-text-assistant-secondary` | text |
| `#5A7586` | `--vestara-text-assistant-muted` | text |
| `#00E5FF` | `--vestara-accent-assistant` | accent |
| `#00c2d6` | `--vestara-accent-assistant-dim` | accent |

Rules:
- Add the group to `packages/ui-tokens/src/tokens.ts` + emit in `css.ts`; regenerate `generated-tokens.css`. **No component may carry the template hex directly.**
- The appearance is opt-in (scoped to the assistant surface), not a replacement of the workspace amber identity. The assistant already reads semantic tokens; the restructure re-points its surface vocabulary to the assistant tokens behind a scope (e.g. `[data-assistant-surface]`).
- Reuse of the newly-established `--vestara-*-os-*` group is allowed where values coincide; introduce assistant-specific tokens only where the template differs.

---

## 4. Milestones

| # | Milestone | Deliverable | Acceptance |
|---|---|---|---|
| **M1** | Assistant token group | `UI_COMPONENT`-style `ASSISTANT` tokens + CSS vars + `vds:validate` | `pnpm vds:validate` passes; zero hex in assistant components |
| **M2** | Appearance scope | Assistant surface bound to assistant tokens behind a scope; amber workspace unaffected | Visual diff on non-assistant pages unchanged |
| **M3** | Persistent conversation rail | `ConversationHistory` promoted from popover to rail (GA-UI-006 grouping) | Rail shows TODAY/PREVIOUS 7 DAYS; active highlight; keyboard nav |
| **M4** | Header restructure | Provider/model selector + Marketplace·Global·Workspace nav + `+K` affordance | Selector reflects configured provider (GA-PROVIDER-001) |
| **M5** | Workspace status rail | New read-only status card fed by existing projections (gateway, provider router, DB, extensions) | Values are projections, never fabricated; "unavailable" when absent |
| **M6** | Capabilities grid | NEW 4-card grid fed by capability catalog | Cards map to catalog entries; no inline arrays in JSX |
| **M7** | Composer + thread polish | Copy/placeholder/spacing aligned to template; send/stop preserved | SSE streaming unchanged (GA-SSE-002) |
| **M8** | Motion + a11y | Restrained transitions; focus order; reduced-motion | `screenshots:ci` + a11y checks pass |

Sequencing: M1 → M2 are prerequisites; M3–M7 may proceed in parallel; M8 closes.

---

## 5. Boundaries (must not regress)

- **Composition shell, not execution authority** (AR-007): the restructure changes presentation only. No new execution, routing, or persistence paths.
- **SSE ownership unchanged** (GA-SSE-001/002): the thread still streams via the existing event stream; UI lifecycle ≠ execution lifecycle.
- **Surface context is display-only** (AR-008): the workspace status rail reflects projections; it must show explicit *unavailable* rather than infer.
- **Conversation selection ≠ ownership** (GA-UI-006): rail selection behaviour is preserved.
- **Mode model** (GA-UI-007): floating and expanded geometries share one `ConversationPanel`; the template is the **expanded** geometry.

---

## 6. Risks & open questions

1. **Appearance vs identity** — cyan assistant surface diverges from the workspace amber. Decide: assistant-scoped only (recommended) vs global re-theme.
2. **Status rail data sourcing** — which projections back `OS UNITS` (API gateway, router, DB wrapper, extensions)? Requires a bounded loader (VES-PERF-001).
3. **Rail persistence** — floating mode has no room for a rail; define collapse behaviour (< 1024px).
4. **Template fidelity vs governance** — the template's exact radii/spacing (e.g. `rounded-[10px]`) must map to `RADIUS`/`MARKETPLACE_LAYOUT`-style tokens, not arbitrary values.

---

## 7. Verification plan

- `pnpm vds:validate` — assistant tokens present; Workspace/TUI/CLI aligned.
- `pnpm lint:check` + `pnpm build` + `pnpm test` — no regressions.
- `pnpm screenshots:ci` — assistant surface baselines (expanded + floating + collapsed rail).
- Manual: provider selector reflects configured provider; rail grouping; composer send/stop; reduced-motion.

---

## 8. Adjacent findings

- **GA-UI-008 is referenced in code but has no document.** `apps/workspace/src/components/assistant/GlobalAssistant.tsx` carries a `GA-UI-008: dock timers` comment, but `docs/blueprint/` has no `GA-UI-008` file. Either backfill the doc or renumber the comment. This plan deliberately uses **GA-UI-009** to avoid the collision.
- **`global-assistant.html` and `extractor-ui.html` are minified build artifacts** committed under `assets/templates/html/`; they are excluded from Biome (`biome.json` `files.includes`) as of this plan's authoring.
