---
title: Vestara TUI UX Specification
version: 1
status: proposed
owner: vestara
last-reviewed: 2026-08-04
next-review: 2026-09-04
---

# Vestara TUI UX Specification

## Purpose

This specification defines the interaction model for the Vestara TUI as the
terminal counterpart of the Vestara Workspace. It is implementation-neutral:
it describes responsibilities, information hierarchy, state transitions, and
interaction behavior without prescribing component APIs or renderer details.

The TUI is a calm, keyboard-first engineering workspace. It should help a user
understand the current engineering state, intervene safely, and know what to
do next without requiring knowledge of model protocols, transport events, or
internal tool syntax.

The TUI must preserve the existing product capabilities:

- Sessions
- Plans
- Graph
- Execution
- Workflow
- Logs
- Artifacts
- Settings
- Chat and streamed agent execution
- Provider, model, and API-key configuration

## 1. User Goals

Users should be able to:

- Start or resume an engineering conversation quickly.
- Understand the active workspace, session, agent, provider, and model at a glance.
- See whether work is idle, running, waiting for approval, degraded, failed, or complete.
- Move between engineering views without losing the current conversation context.
- Inspect execution evidence without being exposed to raw transport or model protocol.
- Change provider, model, or API key without leaving the active task.
- Cancel, retry, approve, deny, or continue work intentionally.
- Recover from offline, degraded, or failed runtime states without guessing.
- Keep the amount of visible information appropriate to the current task.

## 2. Primary User Journeys

### 2.1 Start or resume work

1. User launches `vestara`.
2. The TUI opens the current workspace and restores the last active session when available.
3. The main workspace displays the conversation or an intentional empty state.
4. The contextual sidebar identifies the active session, agent, model, provider, and connection state.
5. The composer is focused or clearly available at the bottom.
6. User types a request and submits it.
7. The conversation shows interpreted progress and results, not raw DSML or anonymous tool events.

### 2.2 Inspect active execution

1. User submits a request or opens an existing execution.
2. The main workspace shows the current activity, meaningful progress, and resulting observations.
3. The sidebar shows execution metadata, active agent, context usage, tools, and attention items.
4. User can open Execution or Workflow for deeper inspection without losing the conversation.
5. Completion includes a conclusion, evidence references, unresolved items, and the next available action.

### 2.3 Change provider, model, or API key

1. User presses `Ctrl+R` from any non-modal state.
2. The runtime configuration modal opens over the current workspace.
3. Focus starts on Provider.
4. Selecting a provider updates the available models.
5. Selecting a model exposes credential state and the API-key field when needed.
6. The API key is masked by default and may be revealed temporarily.
7. Save is enabled only when the selection and required credential state are valid.
8. Saving persists the selection, closes the modal, and confirms the active route in the sidebar/status area.
9. Cancelling restores the previous runtime selection without side effects.

### 2.4 Search and navigate

1. User presses `Ctrl+P`.
2. The command palette opens with recent and suggested actions.
3. User types to filter sessions, plans, files, commands, and settings.
4. User selects an item with `Enter`.
5. The palette closes and the destination receives focus.
6. `Esc` closes the palette without changing the current view.

### 2.5 Recover from failure

1. The connection, execution, or provider enters a degraded or failed state.
2. The status region identifies the state and provides a concise explanation.
3. The sidebar marks the affected context with an attention indicator.
4. The main workspace preserves completed observations and evidence.
5. The user can reconnect, retry, change provider, inspect logs, cancel, or return to the session.
6. A recovery action reports its result explicitly.

## 3. Information Architecture

### 3.1 Application shell

The shell has four persistent regions:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Header: workspace, session, connection, active execution              │
├───────────────────────────────────────────────┬──────────────────────┤
│                                               │                      │
│ Main workspace                                │ Contextual sidebar   │
│ Chat, session, plan, graph, execution,        │ Session and runtime  │
│ workflow, logs, artifacts, settings content   │ context              │
│                                               │                      │
├───────────────────────────────────────────────┴──────────────────────┤
│ Composer / message input                                             │
├──────────────────────────────────────────────────────────────────────┤
│ Runtime status and keyboard hints                                     │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 Primary navigation

Primary navigation retains the existing product views:

- Chat
- Sessions
- Plans
- Graph
- Execution
- Workflow
- Logs
- Artifacts
- Settings

Navigation is a wayfinding aid, not a second information dump. It should show
the current view, attention indicators, and only concise labels at normal
widths. The command palette remains the universal access path for less frequent
destinations and actions.

### 3.3 Contextual navigation

The right sidebar is contextual to the selected view and current session. It
must not repeat the entire primary navigation. It should prioritize information
that explains the main workspace or enables the next safe action.

## 4. Layout Regions

### 4.1 Header

The header identifies:

- Vestara and the current workspace name.
- Repository branch or workspace identity when available.
- Current session title or session status.
- Connection state.
- Active execution state when work is running.

The header must remain visually quiet. It should not compete with the current
conversation or execution result.

### 4.2 Main workspace

The main workspace is the primary reading and interaction surface. It contains
the active view and owns the largest share of terminal width.

Chat should display:

- User messages.
- Assistant conclusions and useful progress.
- Structured execution events.
- Tool outcomes with operation status and meaningful summaries.
- Evidence references.
- Approvals and required user decisions.
- Errors with recovery actions.

Raw DSML, transport envelopes, internal function names, and anonymous
`Tool requested` / `Tool completed` labels must not appear in normal mode.

### 4.3 Contextual sidebar

The sidebar displays the most relevant current context in stable sections:

1. **Session**
   - Session title and identifier.
   - Created/updated time.
   - Session status.
   - Current execution identifier when active.

2. **Context**
   - Context or token usage.
   - Buffered message or event count where useful.
   - Truncation or compaction state.

3. **Files in context**
   - Files currently supplied to the agent.
   - Count and status indicators.
   - Action to inspect or remove context where supported.

4. **Agent**
   - Active agent name.
   - Agent role.
   - Current activity or stage.

5. **Runtime**
   - Provider.
   - Model.
   - Credential state without exposing secrets.
   - Connection and runtime health.

6. **Tools**
   - Enabled tools or tool groups.
   - Approval mode.
   - Attention indicator for blocked or approval-required operations.

7. **Quick actions**
   - Change Provider / Model.
   - Open command palette.
   - Cancel execution.
   - Open execution details.
   - Open logs or artifacts when available.

Sections with no data should be omitted or shown as a single quiet empty row.
The sidebar must not become a dashboard of every available metric.

### 4.4 Composer

The message input is fixed at the bottom of the shell. It remains visible while
the main workspace scrolls.

The composer displays:

- Input affordance.
- Current input text.
- Streaming/busy state.
- A concise submit or cancel hint.
- Optional attachment/context indicator.

The composer must never be pushed below the viewport by conversation content.
Long input scrolls or wraps within the composer without changing the shell
geometry.

### 4.5 Runtime status bar

The status bar is fixed below the composer. It displays only high-value state:

- Connection: connected, connecting, offline, degraded, or error.
- Active agent.
- Active provider/model.
- Context/token usage summary.
- Session or execution status.
- A small set of relevant keyboard hints.

Status text must distinguish lifecycle state from outcome. For example:

```text
Lifecycle: completed   Outcome: failed   Exit code: 1
```

`completed` alone is insufficient.

## 5. Responsive Terminal Behavior

The layout must adapt without changing the information hierarchy.

### Wide terminal

- Two-column layout.
- Main workspace receives approximately 70–78% of available width.
- Sidebar receives approximately 22–30% with a stable minimum width.
- Sidebar sections may show labels and secondary metadata.

### Medium terminal

- Two-column layout remains active if both regions can preserve readable content.
- Sidebar reduces secondary metadata before reducing essential labels.
- Long paths, model names, and session titles truncate predictably.

### Narrow terminal

- Collapse the sidebar into a contextual drawer or modal opened by a stable action.
- Keep the main workspace, composer, and status bar visible.
- Primary navigation becomes a compact list or command-palette destination.
- Never render two dense columns whose text is unreadable.

### Very short terminal

- Preserve composer and one-line status bar.
- Reduce header height and optional sidebar content.
- Scroll the main workspace rather than clipping the composer.
- Modal height becomes viewport-aware and remains escapable.

### Resize behavior

- Recalculate column widths and modal bounds on every resize.
- Preserve scroll position where possible.
- Preserve focused item and input text.
- Never leave a modal, cursor, or focus target outside the new viewport.

## 6. Focus and Keyboard-Navigation Model

The TUI is keyboard-first. Every interactive element has a deterministic focus
order and a visible focus state.

### Global focus rules

- `Tab` moves to the next focusable element in the current region.
- `Shift+Tab` moves to the previous focusable element.
- `Enter` activates the focused action or submits the focused form.
- `Esc` closes the current modal or cancels the current transient interaction.
- Arrow keys move within lists and selectors.
- Focus never disappears after a modal closes; it returns to the element that opened it.
- A modal traps focus until it closes.
- Background controls cannot activate while a modal is open.

### Global shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Open Search / Command Palette |
| `Ctrl+R` | Open Provider / Model / API Key configuration |
| `Tab` | Move to next primary view or focus region when no modal is open |
| `Esc` | Close modal, cancel transient interaction, or clear current focus state |
| `Ctrl+C` | Cancel active execution; exit only when no execution is active and the product permits it |
| `1`–`9` | Navigate to the corresponding visible primary view when the composer is not editing |

Shortcuts must not trigger while the user is typing ordinary text in the
composer or a modal input, except for explicitly reserved escape sequences.

## 7. Ctrl+P Command-Palette Behavior

### Purpose

The command palette is the universal keyboard entry point for navigation,
search, and infrequent actions. It reduces the need to remember every shortcut
without replacing direct navigation.

### Modal

- Opens centered over the current workspace.
- Dims the background without hiding the current context completely.
- Uses the existing Vestara dark/gold modal treatment.
- Width is approximately 70–80% of the terminal with a safe maximum.
- Height is capped so the modal always leaves visible context around it.
- Focus starts in the search field.

### Search scope

Search results may include:

- Recent sessions.
- Sessions.
- Plans.
- Files and artifacts.
- Primary views.
- Settings and configuration actions.
- Commands and quick actions.

Results are grouped by type. Recent or suggested actions may appear before
filtered results when the query is empty.

### Interaction

- Printable input filters results immediately.
- `↑` / `↓` move the selection.
- `Enter` executes or navigates to the selected result.
- `Esc` closes without side effects.
- `Ctrl+P` toggles the palette closed.
- Empty results provide a clear `No matching commands or resources` state.
- Selecting a destination closes the palette before changing the main view.
- The destination receives focus after navigation.

### Result content

Each result should communicate:

- Title.
- Type or category.
- Optional short description.
- Optional shortcut hint.
- Relevant status indicator only when it changes the decision.

## 8. Ctrl+R Runtime-Configuration Behavior

### Purpose

The runtime configuration modal changes the active provider, model, and API
key without forcing the user to leave the current session.

### Modal structure

Header:

```text
Provider / Model / API Key                         Ctrl+R
```

Fields, in order:

1. Provider selector.
2. Model selector filtered by provider.
3. API-key input, masked by default, with a reveal/hide action.

Footer:

```text
Esc Cancel                         Enter Save
```

### Interaction rules

- Focus starts on Provider.
- Provider changes reset or validate the Model field.
- Model options show availability and credential requirements.
- API-key entry is only required when the selected provider needs a key that is not configured.
- Existing keys are never displayed in plaintext by default.
- Save is disabled until required fields are valid.
- Saving uses the existing routing/provider credential flow.
- Save confirmation states the resulting provider/model, never the secret.
- `Esc` cancels the entire edit and restores the prior selection.
- Errors stay in the modal until acknowledged or corrected.
- A successful save returns focus to the control that opened the modal.

### Sensitive data

- API keys must not appear in command output, logs, event summaries, evidence text, or process arguments.
- Clipboard copy of an API key requires an explicit action and should be avoided by default.
- Masked fields must remain masked after save.

## 9. Empty, Loading, Offline, Degraded, and Error States

Every state must explain what is happening and what action is available next.

### Empty

Use a short explanation plus one next action:

```text
No active session

Start a conversation below, or press Ctrl+P to open an existing session.
```

Avoid empty panels with no explanation.

### Loading

- Show the object or region being loaded.
- Use a restrained indicator rather than full-screen animation.
- Preserve known data while newer data loads.
- Do not replace useful existing content with a blank spinner.

### Offline

```text
Offline
The Vestara API is unavailable. Existing session data remains visible.
Next: Retry connection · Open Logs · Exit
```

The composer may be disabled or explicitly marked as queued offline input; it
must never imply that a request was sent when it was not.

### Degraded

Identify the affected capability:

```text
Degraded: provider credentials unavailable
Chat remains readable. Change provider with Ctrl+R or inspect Settings.
```

### Error

Every error should provide:

- Plain-language summary.
- Lifecycle state and outcome where relevant.
- Safe recovery action.
- Evidence or log reference when available.
- A way to dismiss without losing the current task.

### Cancelled or superseded

Cancellation must be explicit:

```text
Execution cancelled
Reason: superseded by a newer request
```

Late output from a cancelled execution must not appear in the active response.

### Completed

Completion is not just a green status. It includes an interpreted result:

- What was done.
- What was discovered.
- Whether the requested task succeeded.
- Files, tests, or evidence found.
- What remains unresolved.
- What action is available next.

## 10. Accessibility Requirements

- Every state must communicate meaning through text, not color alone.
- Focused controls must use a visible border, marker, attribute, or contrast change.
- Status tones must have text labels such as `Connected`, `Degraded`, or `Failed`.
- Avoid decorative animation for essential state; support reduced-motion configuration.
- Support ASCII-safe borders and indicators when Unicode is unavailable or configured off.
- Do not rely on icons alone to distinguish agents, tools, approvals, or errors.
- Masked API-key fields must announce their state through text such as `hidden` or `shown`.
- Modal focus must be keyboard reachable and escapable.
- Long labels and paths must truncate without hiding their identifying suffix or provide an inspection action.
- Color choices must preserve readable contrast against the Vestara background and panel colors.
- Error and success messages must remain available long enough to read and be inspectable in Logs when transient.

## 11. Interaction Rules

- The active view, active session, active agent, active model, and active provider must have one authoritative display location each.
- The sidebar provides context; the main workspace provides the current task; the bottom composer provides the next input.
- A new modal never silently changes runtime state before Save.
- A command must report whether it succeeded, failed, was cancelled, or timed out.
- `Lifecycle: completed` must not be rendered as success without an outcome.
- Every streamed event must be associated with the current conversation, request, and execution.
- Late events from stale or cancelled executions are discarded or visibly labeled as stale; they never append to the active response.
- Tool operations are rendered as structured activities with intent, status, summary, and evidence, not raw protocol fragments.
- User-facing summaries are generated from command output before rendering.
- Evidence references must be selectable or navigable when the terminal supports it.
- Long-running work must show an active stage and an available cancellation action.
- Modal opening and closing preserve background scroll and focus.
- The interface must never move the composer below the visible viewport.
- Notifications are for concise state changes; substantive findings belong in the main workspace.

## 12. Cognitive-Load Reduction Principles

### Show the decision, not the transport

The user needs to know what happened and what it means, not how the model
serialized a tool call. DSML, internal envelopes, and implementation-specific
tokens belong in developer diagnostics only.

### Show one level of detail by default

The default view should show intent, progress, outcome, and next action. Raw
stdout, stderr, command text, stack traces, and event payloads are expandable.

### Keep context stable

Do not replace the user's conversation with a dashboard during execution. Put
secondary metadata in the sidebar and detailed evidence in dedicated views.

### Make attention explicit

Use attention indicators for approvals, failures, stale executions, offline
state, and unresolved findings. Do not make the user scan every panel to find
what needs action.

### Prefer calm persistence over animation

Stable labels, status text, and progressive summaries are more useful than
continuous spinners or decorative motion.

### Explain every interruption

If work stops because of cancellation, a newer request, provider failure, or
approval, say why. Silent stopping creates doubt and encourages duplicate work.

### Keep the next action visible

Every empty, degraded, failed, or completed state should answer: what can the
user do next?

## 13. Risks and Edge Cases

- A previous execution continues streaming after a newer request begins.
- Tool output arrives after cancellation and is appended to the wrong response.
- Multiple concurrent sessions write into one shared sidebar or status region.
- A provider changes while an execution is still using the prior provider.
- API-key validation succeeds locally but provider authentication fails remotely.
- A terminal resize leaves a modal or composer clipped.
- A narrow terminal makes sidebar content unreadable.
- A command exits with code `1` but is displayed only as `completed`.
- Very large stdout overwhelms the main workspace or transport.
- DSML or other model-protocol markup reaches the normal renderer.
- A reconnect replays events that were already rendered.
- A stale notification overwrites a newer connection or execution state.
- The selected session disappears while the user is viewing it.
- The active agent, provider, or model changes from another client.
- API-key text is exposed through logs, clipboard, error messages, or process arguments.
- A modal is opened while an approval or cancellation decision is pending.
- Existing views such as Artifacts or Settings are reachable only through hidden commands.
- Offline input is accepted without clearly communicating whether it is queued or discarded.

## 14. Acceptance Criteria

### Shell and layout

- [ ] The TUI uses a two-column layout with the main workspace left and contextual sidebar right at supported widths.
- [ ] The header, composer, and runtime status remain fixed while the main workspace scrolls.
- [ ] The sidebar collapses or becomes a contextual drawer on narrow terminals without making content unreadable.
- [ ] Terminal resize recalculates layout and preserves focus, input, and useful scroll position.

### Navigation and focus

- [ ] Sessions, Plans, Graph, Execution, Workflow, Logs, Artifacts, and Settings remain accessible.
- [ ] Focus order is deterministic in the shell and each modal.
- [ ] `Tab`, `Shift+Tab`, arrows, `Enter`, and `Esc` behave consistently.
- [ ] Closing a modal restores focus to its opening control.

### Command palette

- [ ] `Ctrl+P` opens a centered, focused command palette from every non-modal state.
- [ ] The palette searches commands, sessions, plans, files, artifacts, and settings actions.
- [ ] Results are grouped, filterable, keyboard selectable, and have clear empty results.
- [ ] `Esc` closes without side effects; `Enter` executes or navigates.

### Runtime configuration

- [ ] `Ctrl+R` opens the Provider / Model / API Key modal.
- [ ] Provider selection filters model selection.
- [ ] API keys are masked by default and never appear in user-facing output.
- [ ] Save is disabled until required fields are valid.
- [ ] Cancel leaves the existing provider/model selection unchanged.
- [ ] Save confirms the active provider/model and returns focus to the workspace.

### Execution communication

- [ ] Every execution displays intent, lifecycle state, outcome, and next action.
- [ ] Tool events display interpreted summaries instead of raw DSML or anonymous completion labels.
- [ ] Command success, failure, cancellation, and timeout are distinct.
- [ ] Active agent, provider, model, and execution identifier are visible.
- [ ] Stale or superseded stream events cannot append to the active response.
- [ ] Evidence references are visible and navigable where supported.

### Resilience and accessibility

- [ ] Empty, loading, offline, degraded, error, cancelled, superseded, and completed states are intentional and actionable.
- [ ] The interface remains understandable without color or animation.
- [ ] ASCII fallback and reduced-motion behavior are supported.
- [ ] Sensitive credentials are not exposed through rendering or diagnostics.
- [ ] The normal interface never requires knowledge of DSML, SSE, WebSocket, or internal tool schemas.

### Product consistency

- [ ] Colors, spacing, typography, status tones, and terminology use the shared Vestara design system.
- [ ] The TUI feels like the terminal counterpart of the Workspace, not a separate product language.
- [ ] The interface communicates calm engineering: clarity over decoration, evidence over noise, and deliberate action over surprise.
