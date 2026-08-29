---
title: Vestara TUI Visual Specification
version: 1
status: proposed
owner: vestara
last-reviewed: 2026-08-04
next-review: 2026-09-04
---

# Vestara TUI Visual Specification

## Purpose

This specification translates `docs/TUI-UX-SPECIFICATION.md` into a visual
system for the Vestara TUI. It is implementation-neutral and does not define
renderer APIs, component code, or terminal drawing techniques.

The TUI is the terminal counterpart of the Vestara Workspace. It must feel like
another Vestara application, not like a traditional shell, dashboard, or
terminal multiplexer. The visual system therefore uses the existing semantic
tokens from `@vestara/design-system` and the same visual principles used by the
Workspace and Marketplace:

- dark neutral surfaces;
- restrained metallic-gold identity;
- clear semantic status colors;
- quiet borders and strong hierarchy;
- readable information density;
- focus and state communicated through more than color alone.

The governing visual principle is:

> **Make the current engineering state easy to understand without making the
> interface visually loud.**

## Token Authority

The visual specification uses these semantic token groups only:

| Semantic group | Source of truth | Use |
|---|---|---|
| `background` | `TUI_SEMANTIC_PALETTES` | Full application canvas |
| `backgroundPanel` | `TUI_SEMANTIC_PALETTES` | Sidebar, modal, elevated region |
| `backgroundElement` | `TUI_SEMANTIC_PALETTES` | Composer, selected rows, compact controls |
| `text` | `TUI_SEMANTIC_PALETTES` | Primary readable content |
| `textMuted` | `TUI_SEMANTIC_PALETTES` | Secondary labels and metadata |
| `textDim` | `TUI_SEMANTIC_PALETTES` | Hints, timestamps, low-priority context |
| `accent` | `TUI_SEMANTIC_PALETTES` | Vestara Gold identity and primary emphasis |
| `accentBright` | `TUI_SEMANTIC_PALETTES` | Focused or high-emphasis gold text |
| `accentDim` | `TUI_SEMANTIC_PALETTES` | Quiet gold context |
| `border` | `TUI_SEMANTIC_PALETTES` | Structural separation |
| `borderActive` | `TUI_SEMANTIC_PALETTES` | Focused/active boundaries |
| `success` | `TUI_SEMANTIC_PALETTES` | Verified, healthy, completed |
| `warning` | `TUI_SEMANTIC_PALETTES` | Attention, degraded, approval required |
| `error` | `TUI_SEMANTIC_PALETTES` | Failed, denied, unavailable |
| `info` | `TUI_SEMANTIC_PALETTES` | Connecting, syncing, informational |
| `focus` | `TUI_SEMANTIC_PALETTES` | Keyboard focus indication |

The default theme is the existing `gold` palette. Alternate themes may be
selected through the design system, but they must preserve the same semantic
roles and hierarchy.

## Gold Usage Rule

Metallic gold is the Vestara identity, not the default color for every
interactive element.

### Use gold for

- Vestara wordmark or application identity.
- The current primary navigation item.
- Modal titles and modal boundaries when the modal is active.
- Keyboard focus when focus is not better communicated by a stronger semantic state.
- The selected command-palette item.
- The active provider/model route.
- Primary action emphasis such as Save or Submit when enabled.
- A small number of important progress or attention markers.

### Do not use gold for

- Every label, border, card, or row.
- All status states.
- Long bodies of text.
- Complete execution timelines.
- Background fills across large areas.
- Errors, warnings, or success states when their semantic token is available.
- Decorative gradients, glow, shimmer, or large gold blocks.

Gold should guide attention, not consume it. Most of the interface should be
neutral text on neutral surfaces.

## 1. Overall Application Frame

### Visual treatment

- Use `background` for the entire terminal canvas.
- Use `backgroundPanel` for the contextual sidebar and modal surfaces.
- Use `backgroundElement` only for contained interactive or elevated regions.
- Do not use a full-screen border or decorative frame around the application.
- Use one quiet structural divider between the main workspace and sidebar.
- Keep the frame visually stable while content scrolls.

### Hierarchy

The frame should be understood in this order:

1. Current main task or conversation.
2. Current execution state.
3. Context needed to interpret the task.
4. Available next actions.
5. Navigation and low-priority metadata.

The frame must not make the sidebar or status bar compete with the main result.

## 2. Header

### Content hierarchy

From highest to lowest emphasis:

1. Vestara identity and workspace name.
2. Session title or session status.
3. Active execution indicator.
4. Branch, connection, and low-priority metadata.

### Visual treatment

- Vestara identity uses `accent` with restrained emphasis.
- Workspace and session names use `text`.
- Branch and secondary metadata use `textMuted` or `textDim`.
- Connection status uses its semantic token and a text label or accessible marker.
- Header background remains `background`; a subtle bottom divider may use `border`.
- The header is one terminal row where possible; it should not become a banner.

### Do not use

- Large ASCII logos.
- Gold backgrounds.
- Multiple competing status badges.
- Animated connection indicators that draw attention continuously.

## 3. Navigation

### Structure

Primary navigation contains:

- Sessions
- Plans
- Graph
- Execution
- Workflow
- Logs
- Artifacts
- Settings

Chat is the default main workspace, even if it is represented separately from
the supporting navigation list.

### Visual treatment

- Navigation surface uses `backgroundPanel` only when the sidebar is visible.
- Inactive labels use `textMuted`.
- Inactive icons use `textDim` or the corresponding neutral entity presentation color.
- The active item uses `accent` or `accentBright` and a low-contrast `backgroundElement` fill.
- The active item may use a short left marker or border using `borderActive`.
- Attention indicators use `warning` or `error`, with text or symbol support.

### Density

- Prefer one row per destination.
- Avoid descriptions in the persistent navigation.
- Avoid showing counts unless the count changes a decision.
- Use the command palette for rarely used destinations and actions.

## 4. Main Workspace

The main workspace is the visual center of gravity. It receives the strongest
readability and the least decoration.

### Visual treatment

- Surface uses `background`.
- Primary text uses `text`.
- Secondary metadata uses `textMuted`.
- Timestamps, shortcuts, and low-priority details use `textDim`.
- Headings use `text` or `accent` only when they identify a major active region.
- Content blocks use spacing and indentation before borders.
- Borders are reserved for meaningful grouping, not every message.

### Conversation content

- User messages may use a quiet `backgroundPanel` or left alignment marker.
- Assistant conclusions use primary text and clear heading hierarchy.
- Progress and observations use structured rows or compact activity blocks.
- Tool outcomes use semantic status tokens and meaningful labels.
- Evidence references use `info` or `accentDim` only when they are actionable.
- Raw DSML, internal envelopes, and protocol syntax are never styled as user content.

### Result hierarchy

An interpreted completion should visually read as:

```text
Conclusion
  What happened and whether the request succeeded.

Observations
  Important findings from commands, tests, files, or agents.

Evidence
  Selectable paths, artifacts, screenshots, or logs.

Unresolved
  Remaining risks or missing verification.

Next
  The safest useful action.
```

The result should be visually stronger than the activity that produced it.

## 5. Context Sidebar

### Surface and width

- Surface uses `backgroundPanel`.
- Sidebar width should be approximately 22–30% of the terminal on wide layouts.
- Maintain a readable minimum width before collapsing the sidebar.
- Use `border` for the main/sidebar divider.

### Section treatment

- Section headings use `textMuted`, not gold by default.
- Section values use `text`.
- Section metadata uses `textDim`.
- The active agent, provider, and model may use `accentDim` or `accent` sparingly.
- Health and attention states use semantic status colors.
- Sections are separated by vertical spacing first, a divider second.

### Information density

The sidebar should answer “what context explains this workspace?” It should not
become a second dashboard.

- Show one primary value per row.
- Collapse secondary metadata when space is limited.
- Omit empty sections or show one quiet empty row.
- Show token/context usage as a compact value plus a semantic progress indicator.
- Show tools as a summarized list or grouped count, not a large catalog.
- Show quick actions only when they are relevant to the current state.

## 6. Bottom Composer

### Surface

- Composer uses `backgroundElement` against the `background` canvas.
- Its boundary uses `border` by default and `borderActive` when focused.
- The input cursor uses `focus` or `accent`.
- Placeholder text uses `textDim`.
- User-entered text uses `text`.

### States

- Idle: quiet border, visible placeholder, no gold fill.
- Focused: `borderActive`, clear cursor, concise submit hint.
- Streaming: preserve input visibility and show a small busy/cancel affordance.
- Disabled: `textDim`, subdued border, explicit reason nearby.
- Offline: use `warning` or `error` label; never imply the message was sent.

### Visual restraint

- Do not use a large filled gold input.
- Do not show multiple redundant keyboard hints.
- Keep the composer height stable while the main workspace changes.

## 7. Command Palette Modal

### Modal frame

- Center over the current frame.
- Use `backgroundPanel` for the modal surface.
- Use `borderActive` for the outer boundary because the modal owns focus.
- Use a restrained shadow or contrast difference only if supported by the renderer.
- Dim the background without making it unreadable.
- Modal width is approximately 70–80% of the terminal with a safe maximum.

### Header and search field

- Title uses `text` or `accent` with the shortcut `Ctrl+P` in a subdued key hint.
- Search field uses `backgroundElement`.
- Search field focus uses `borderActive` and `focus` cursor.
- Placeholder uses `textDim`.
- Query text uses `text`.

### Results

- Unselected result: `text` title, `textMuted` category, `textDim` shortcut.
- Selected result: low-contrast `backgroundElement`, `accentBright` title, `borderActive` marker.
- Status indicators retain semantic colors; selection must not recolor every field gold.
- Group headings use `textMuted` with clear spacing.
- Recent items may use neutral entity icons from the design system.

### Footer

- Footer hints use `textDim`.
- `Enter` may use `accent` only as the primary action hint.
- `Esc` remains neutral and visible.

## 8. Runtime Configuration Modal

### Modal frame

- Same modal surface, border, radius, dimming, and spacing as the command palette.
- Title: `Provider / Model / API Key`.
- Shortcut `Ctrl+R` appears as a subdued key hint, not a gold banner.
- Modal width should support long provider and model names without aggressive truncation.

### Field hierarchy

1. Field label: `textMuted`.
2. Field control: `backgroundElement` with `text` value.
3. Helper or credential state: `textDim`.
4. Validation message: `error` or `warning` with explicit text.

### Selection states

- Unfocused field: `border`.
- Focused field: `borderActive` and `focus` cursor/marker.
- Selected option: low-contrast `backgroundElement` plus `accent` marker.
- Unavailable model: `textDim` and a textual reason.
- Configured credential: semantic success label such as `Configured`.
- Missing credential: warning label such as `Not configured`.

### API key field

- Masked value uses `text` bullets or a renderer-safe mask.
- Reveal action uses `textMuted`; focused reveal action uses `accent`.
- Helper text uses `textDim`.
- Never use gold for the secret itself.
- Error text must identify the problem without echoing the key.

### Actions

- Save is the primary action and uses `accent` only when enabled.
- Cancel uses neutral text and border treatment.
- Disabled Save uses `textDim` and `border`, not an error color.

## 9. Cards

Cards are for meaningful grouping: session metadata, execution summaries,
evidence, approvals, or modal content. They are not the default wrapper for
every row.

- Surface: `backgroundPanel` or `backgroundElement` depending on elevation.
- Border: `border`.
- Active/focused border: `borderActive`.
- Title: `text`.
- Metadata: `textMuted` or `textDim`.
- Status indicator: semantic token.
- Gold is reserved for active identity or a primary action.

Cards should have one visual purpose. Avoid nested cards unless the inner card
represents a distinct decision or evidence object.

## 10. Forms

- Labels align consistently within a modal or section.
- Labels use `textMuted`; values use `text`.
- Help text uses `textDim`.
- Inputs use `backgroundElement` and `border`.
- Focus uses `borderActive` and a visible cursor/marker.
- Validation uses semantic status colors and plain-language text.
- Required fields are identified by text or a consistent marker, not color alone.
- Form spacing separates label, control, help, and error states without excessive borders.

## 11. Buttons

Buttons are compact terminal actions, not web-style filled controls.

### Primary

- Enabled: `accent` label or border, with restrained emphasis.
- Focused: `accentBright` label and `borderActive`.
- Disabled: `textDim` and `border`.
- Do not use a large gold background across the button width.

### Secondary

- Uses `textMuted` and `border`.
- Focus adds `borderActive` without changing the entire surface.

### Destructive

- Uses `error` only when the action is destructive and the user must notice it.
- Confirmation state must not rely on red alone.

## 12. Badges

Badges are compact labels for stable metadata such as `Agent`, `Local`,
`Configured`, or `Read-only`.

- Use `backgroundElement` or a low-contrast semantic background.
- Use `textMuted` for neutral badges.
- Use semantic status colors for state badges.
- Use gold only for active route or Vestara identity.
- Keep badge text short and explicit.
- Do not place more than a few badges in one row; move overflow to context details.

## 13. Status Chips

Status chips communicate state at a glance but must include readable text or an
accessible equivalent.

| State | Token | Visual treatment |
|---|---|---|
| Idle / pending | `textMuted` / `textDim` | Neutral text, no strong fill |
| Active / running | `accent` | Gold marker or label, restrained surface |
| Success / verified | `success` | Green semantic label and optional check marker |
| Warning / degraded | `warning` | Amber semantic label and attention marker |
| Error / failed | `error` | Red semantic label and explicit recovery text |
| Connecting / syncing | `info` | Blue semantic label, restrained activity marker |

State chips must never use gold for success, warning, and error simultaneously.
Gold means active Vestara focus; semantic colors mean operational state.

## 14. Progress Indicators

Progress should help the user understand work, not create animation noise.

- Use a thin, low-contrast track with a semantic or gold fill.
- Use `accent` for active execution progress when no stronger semantic state applies.
- Use `success` when a stage is verified or complete.
- Use `warning` when blocked or waiting for approval.
- Use `error` when the operation failed.
- Pair percentages with readable labels or counts when available.
- Prefer `Stage 3 of 7` or `6/11` over an unexplained bar.
- Reduced-motion mode uses static progress updates.

## 15. Empty States

Empty states use the same surface as their parent region and minimal emphasis.

- Heading: `text`.
- Explanation: `textMuted`.
- Next action: `accent` label or shortcut.
- No decorative illustration or large gold treatment.
- Empty sidebar sections should usually be omitted rather than expanded.

Example:

```text
No active session
Start a conversation below, or press Ctrl+P to open an existing session.
```

## 16. Loading States

- Preserve existing content whenever possible.
- Use a small spinner or stable `Loading…` label in `textMuted`.
- Use `info` for a connection or synchronization state.
- Use `accent` only for active primary execution when a stronger semantic token is not available.
- Avoid animated full-screen placeholders.
- Do not shift layout when a loading indicator appears.

## 17. Offline States

Offline state is a product state, not a decoration.

- Use `backgroundPanel` or the existing region surface.
- Use `warning` for recoverable offline state and `error` only when action cannot proceed.
- Include a text label: `Offline`.
- Keep known session and evidence content readable.
- Disable or clearly mark the composer.
- Show a neutral or `info` recovery action such as `Retry connection`.

## 18. Error States

- Use `error` for the error label, marker, and concise key phrase.
- Keep the surrounding surface neutral so the error remains legible without flooding the screen.
- Show lifecycle and outcome separately:

```text
Lifecycle: completed
Outcome: failed
Exit code: 1
```

- Recovery actions use normal button hierarchy; not every action becomes red.
- Error details and stack traces are secondary, expandable, and use `textDim`.
- Evidence paths use the normal evidence treatment, not an all-red block.

## 19. Focus States

Focus is a primary accessibility state and must be visible without relying only
on color.

- Focused field/control: `borderActive` plus cursor, marker, or attribute.
- Focused navigation row: active marker plus `accent` label.
- Focused modal action: `accentBright` label and clear boundary.
- Focused list item: `backgroundElement` fill and a left marker.
- Focus must not use a heavy glow, blinking border, or full-width gold fill.

## 20. Selected States

Selected is different from focused:

- Selected navigation item: persistent active route, `accent` marker.
- Selected list item: low-contrast `backgroundElement`, `text` label.
- Selected provider/model: selected marker plus `accentDim` or `accent` route label.
- Selected command result: stronger focus treatment while the palette is open.

Selected content should remain readable when focus moves elsewhere.

## 21. Hover States

Mouse support is optional and secondary to keyboard use.

- Hover may use `borderHover` or a subtle `backgroundElement` change.
- Hover must not override keyboard focus.
- Hover must not introduce gold into every row.
- A mouse hover cannot perform an action that keyboard focus cannot reach.
- In terminals without mouse support, the keyboard focus treatment is the complete equivalent.

## 22. Typography Hierarchy

The terminal font is the system monospace font. Do not introduce a separate
font family or emulate browser typography.

| Level | Token/treatment | Use |
|---|---|---|
| Application identity | `accent`, bold attribute | Vestara name |
| View title | `text`, bold attribute | Main view heading |
| Section title | `textMuted`, bold or attribute | Sidebar/card section |
| Primary content | `text` | Conversation, values, conclusions |
| Secondary content | `textMuted` | Metadata, categories, labels |
| Tertiary content | `textDim` | Hints, timestamps, shortcuts |
| Status | Semantic token + text label | Operational states |
| Evidence/action | `info`, `accentDim`, or normal action treatment | Selectable references |

Typography hierarchy should come from weight, placement, spacing, and token
contrast before color changes.

## 23. Spacing System

Spacing follows a small terminal-cell rhythm rather than arbitrary pixel values.

| Name | Relative size | Use |
|---|---:|---|
| Hairline | 0 cells | Inline status or icon separation |
| Tight | 1 cell | Label/value, icon/label, status rows |
| Element | 1–2 cells | Input padding, result rows |
| Section | 1–2 blank rows | Sidebar/card sections |
| Region | 2–3 blank rows | Modal groups and major content blocks |
| Frame | 1 cell | Main shell and modal edge padding |

Use spacing before borders. Borders should not be the only way to separate
content.

## 24. Border Hierarchy

Borders should communicate structure and focus, not decorate every element.

1. **Canvas boundary**: usually none.
2. **Main/sidebar divider**: `border`.
3. **Panel/card**: `border` only for meaningful grouping.
4. **Input/control**: `border`; `borderActive` when focused.
5. **Modal**: `borderActive` because it owns focus.
6. **Error boundary**: `error` only for the affected edge or label, not the entire screen.

Rounded treatment may follow Workspace/Marketplace conventions where terminal
capabilities support it. ASCII fallback must use simple line borders without
changing hierarchy.

## 25. Terminal Sizing

The sizing rules preserve the approved UX hierarchy.

### Wide

- Maintain the two-column shell.
- Main workspace: approximately 70–78%.
- Sidebar: approximately 22–30%.
- Modal: approximately 70–80% width with a safe maximum.

### Medium

- Retain both columns while text remains readable.
- Remove tertiary metadata before reducing core values.
- Keep modal fields wide enough for provider/model names.

### Narrow

- Collapse the sidebar into a drawer or contextual modal.
- Keep composer and status fixed.
- Move primary navigation into compact rows or `Ctrl+P`.

### Height

- Reserve rows for header, composer, and status before sizing the main viewport.
- Never allow conversation content to consume the composer/status rows.
- Modal height must remain below the terminal height with visible dismissal controls.

## 26. ANSI Fallback Behavior

ANSI fallback is a degradation of decoration, not information.

- Preserve text hierarchy through spacing, ordering, capitalization, and labels.
- Remove color before removing state labels.
- Replace semantic color differences with explicit text such as `FAILED`, `DEGRADED`, or `CONNECTED`.
- Replace inverse/bold treatments with simple markers if unsupported.
- Avoid relying on background colors for selection.
- Keep `Ctrl+P`, `Ctrl+R`, `Esc`, and action hints visible as text.

## 27. Unicode Fallback Behavior

Unicode should improve density and recognition without becoming a requirement.

Preferred semantic markers may include the existing design-system icons, but
every marker needs a text or layout equivalent:

| Unicode treatment | ASCII fallback |
|---|---|
| `●` connected/active dot | `*` or `[connected]` |
| `✓` verified | `[ok]` |
| `✗` failed | `[failed]` |
| `⚠` attention | `[!]` |
| `◈` agent/identity marker | `@` or `[agent]` |
| `◎` session marker | `[session]` |
| `▸` task/action marker | `>` |
| `↻` workflow marker | `[workflow]` |
| `▦` plan marker | `[plan]` |

Fallback selection should be consistent for the entire session. Do not mix
Unicode and ASCII randomly across neighboring controls.

## Information-Density Balance

The visual system balances density through three rules:

1. **Primary content is readable before it is complete.** The main workspace shows the task, result, and next action first.
2. **Context is persistent but quiet.** The sidebar exposes important metadata without repeating every event or metric.
3. **Detail is available on demand.** Logs, raw output, stack traces, evidence payloads, and protocol diagnostics belong behind a deliberate inspection action.

The intended visual rhythm is:

```text
quiet shell
  → clear active task
    → restrained contextual metadata
      → explicit semantic status
        → focused next action
```

The TUI should look composed even when the system is busy. Activity should be
visible through concise progress and state, not through constant motion, color,
or repeated tool rows.

## Review Standard

Product Design, UX, Frontend Engineering, and Accessibility should be able to
review any visual decision by asking:

- Which semantic token does this use?
- What hierarchy does this treatment communicate?
- Why is gold used here instead of neutral or semantic status color?
- What remains understandable without color, Unicode, mouse, or animation?
- Does this reduce or increase cognitive maintenance?
- Does it remain visually consistent with the Vestara Workspace, Marketplace,
  and future IDE and AI applications?

If the answer requires a new color, a new visual language, or a decorative
exception, the decision should be treated as a design-system review rather than
an individual TUI embellishment.
