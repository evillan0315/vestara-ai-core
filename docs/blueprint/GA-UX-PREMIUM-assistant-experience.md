# GA-UX-PREMIUM — Vestara Assistant Premium Experience

**Date**: 2026-09-04  
**Status**: AUDIT COMPLETE — milestone decomposition proposed  
**Prerequisite**: GA-CAP-001 (accepted)

---

## Audit Summary

### Existing Components (What We Have)

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| ConversationPanel | `apps/workspace/src/components/assistant/ConversationPanel.tsx` | 803 | ✅ Borderless responses, identity heading, execution timeline, composer, degraded mode |
| AssistantToolCard | `apps/workspace/src/components/assistant/AssistantToolCard.tsx` | 216 | ✅ Categories, icons, states, collapsible timeline |
| AssistantResponseActions | `apps/workspace/src/components/assistant/AssistantResponseActions.tsx` | 171 | ✅ Copy/Share actions |
| ConversationHistory | `apps/workspace/src/components/assistant/ConversationHistory.tsx` | 210 | ✅ History popover with search |
| GlobalAssistant | `apps/workspace/src/components/assistant/GlobalAssistant.tsx` | 112 | ✅ Shell mounting |
| FloatingPanel | `apps/workspace/src/components/assistant/FloatingPanel.tsx` | 444 | ✅ Drag/resize/minimize/restore |
| useAssistantConversation | `apps/workspace/src/hooks/useAssistantConversation.ts` | 746 | ✅ Stream state, tool ops, optimistic turns |
| Theme System | `apps/workspace/src/lib/theme.tsx` | 1315 | ✅ Semantic tokens, profiles, accent palettes |
| Execution Projection | `packages/shared/src/assistant-execution.ts` | 361 | ✅ Rich structured data for tool/edit/terminal/task/permission |
| Execution Builders | `apps/api/src/assistant-execution-projection.ts` | 402 | ✅ Projection builders with sanitization |

### What Already Matches GA-UX-PREMIUM

1. **Borderless assistant responses** — `MessageBubble` renders assistant content directly on canvas, no rounded wrapper
2. **Identity heading** — `AssistantLabel` shows "Vestara Assistant · {model}"
3. **Tool card primitives** — `AssistantToolCard` with categories (read/search/edit/bash/task/generic), icons, states
4. **Execution timeline** — `AssistantExecutionTimeline` with collapse/expand, operation count
5. **Response actions** — Copy/Share with feedback states
6. **History** — Search, temporal groups, active state indicators
7. **Composer** — Send/stop, focus discipline, duplicate-submit guard
8. **Dark-mode first** — Zinc/amber palette, semantic tokens

### What's Missing (Phases 1–15)

| Phase | Gap | Structured Data Available |
|-------|-----|--------------------------|
| M1 Design System | Minor refinements to spacing/tokens | N/A |
| M2 Tool Cards | Already exist; need variant refinement | `assistant.execution.v1` tool kind |
| **M3 Code Edit/Diff** | **No dedicated diff presentation** | `AssistantEditExecution` has `path`, `oldText`, `newText`, `additions`, `deletions` |
| **M4 Task List** | **No task progress UI** | `AssistantTaskSnapshotExecution` has `tasks[]`, `completedCount`, `totalCount` |
| M5 Execution Timeline | Already exists; needs collapse-after-response | `AssistantToolOperation[]` |
| **M6 Terminal** | **No dedicated terminal presentation** | `AssistantTerminalExecution` has `command`, `workdir`, `exitCode`, `outputPreview`, `durationMs` |
| **M7 Verification** | **No verification presentation** | Derived from bash/test results |
| **M8 Artifacts** | **No file change listing** | Edit operations provide paths |
| M9 Composer | Needs provider/model metadata, +/@ controls | N/A |
| M10 Header | Basic title bar; needs history/new/maximize controls | N/A |
| M11 Motion | Minimal; needs restrained state transitions | N/A |
| M12 Responsive | Single floating mode; needs expanded mode | N/A |
| M13 Accessibility | Partial; needs audit | N/A |
| M14 Performance | Not audited; needs profiling | N/A |
| M15 Visual Acceptance | Not run | N/A |

---

## Structured Data Audit

The `assistant.execution.v1` contract provides rich structured data that the Director explicitly requires for M3/M4/M6:

### Edit Operations (`AssistantEditExecution`)
```typescript
{
  kind: 'edit',
  state: 'started' | 'completed' | 'failed',
  path: string,           // repo-relative file path
  oldText?: string,       // bounded before text (≤4000 chars)
  newText?: string,       // bounded after text (≤4000 chars)
  additions?: number,     // Vestara-derived line count
  deletions?: number,     // Vestara-derived line count
  provenance: 'runtime-provided' | 'vestara-derived',
}
```

### Terminal Operations (`AssistantTerminalExecution`)
```typescript
{
  kind: 'terminal',
  state: 'started' | 'completed' | 'failed',
  command?: string,       // bounded, scrubbed (≤500 chars)
  workdir?: string,       // repo-relative
  exitCode?: number,      // proven only, absent = unknown
  outputPreview?: string, // bounded, scrubbed (≤2000 chars)
  durationMs?: number,    // proven duration
}
```

### Task Snapshots (`AssistantTaskSnapshotExecution`)
```typescript
{
  kind: 'task-snapshot',
  state: 'completed',
  source: 'opencode' | 'vestara-workflow',
  tasks: { label: string, state: 'pending'|'in_progress'|'completed'|'failed'|'blocked' }[],
  completedCount: number,
  totalCount: number,
}
```

### Permission Requests (`AssistantPermissionExecution`)
```typescript
{
  kind: 'permission',
  state: 'requested' | 'resolved',
  permission: { id, action, resources[], risk },
}
```

**Key finding**: The structured data for M3 (diff), M4 (tasks), M6 (terminal) already flows through the SSE contract and is normalized in the hook. The presentation layer just needs to consume it.

---

## Authority Boundaries

```
Conversation Runtime       → conversation authority
AgentDefinition            → agent configuration
Vestara permission layer   → capability authority
OpenCode                   → execution backend
RepositoryBinding          → repository authority
Assistant SSE adapter      → runtime event translation
Floating Assistant         → presentation/control surface
```

React is NEVER authoritative for:
- Tool execution (OpenCode owns this)
- Permission decisions (backend owns this)
- Task status (runtime owns this)
- Verification verdicts (VCTRL owns this)

---

## Milestone Decomposition

### M1: Design System Refinements
**Scope**: Spacing/token rules for assistant-specific composition
**Files**: `ConversationPanel.tsx`, `AssistantToolCard.tsx`, `FloatingPanel.tsx`
**Changes**:
- Standardize spacing rhythm: `space-y-5` for conversation, `py-1` for tool cards
- Typography scale: 11px identity, 12px tool labels, 13px body, 10px metadata
- Separator rules: `border-zinc-800/50` for sections, no separators within messages
- Hover/focus states: `hover:bg-zinc-800/60`, `focus-visible:outline-amber-500/60`
**Tests**: Visual diff only
**Commit**: `feat(assistant): M1 design system refinements`

### M2: Tool Card Variants
**Scope**: Refine existing tool cards with restrained status indicators
**Files**: `AssistantToolCard.tsx`
**Changes**:
- Add `waiting_permission` state indicator (amber pulse, not a card)
- Refine completed rows: quieter preview text, collapse long previews
- Running state: single subtle indicator per card, no double indicators
**Tests**: Existing + new unit tests for new state
**Commit**: `feat(assistant): M2 tool card variant refinements`

### M3: Code Edit + Diff Presentation
**Scope**: Dedicated `AssistantCodeEdit` component for file modifications
**Files**: New `AssistantCodeEdit.tsx`, update `AssistantToolCard.tsx` to render it
**Changes**:
- `AssistantCodeEdit` component consuming `AssistantEditExecution`
- Filename + repo-relative path + language detection
- Diff hunks from `oldText`/`newText` (Vestara-derived line counts)
- Semantic diff: `+` addition, `-` deletion, context lines
- Collapsed/expanded state, Copy button
- Syntax highlighting (lightweight, no heavy lib)
**Data source**: `AssistantEditExecution.oldText/newText/additions/deletions`
**Tests**: Unit tests for diff generation, rendering
**Commit**: `feat(assistant): M3 code edit + diff presentation`

### M4: Task Progress Surface
**Scope**: Structured task-progress UI
**Files**: New `AssistantTaskList.tsx`, update `AssistantToolCard.tsx` to render it
**Changes**:
- `AssistantTaskList` consuming `AssistantTaskSnapshotExecution`
- States: `pending` (○), `in_progress` (●), `completed` (✓), `failed` (✕), `blocked` (⊘)
- Progress: "3 / 5 completed"
- Incremental updates as runtime events arrive
- Never a second Workflow/Task authority
**Data source**: `AssistantTaskSnapshotExecution.tasks/completedCount/totalCount`
**Tests**: Unit tests for state rendering, progress calculation
**Commit**: `feat(assistant): M4 task progress surface`

### M5: Execution Timeline Refinements
**Scope**: Replace repetitive statuses with compact timeline
**Files**: `AssistantExecutionTimeline` in `AssistantToolCard.tsx`
**Changes**:
- Active: expanded with running indicator
- After response starts: collapse to `▸ N operations`
- Click to expand details
- Never expose private chain-of-thought
**Tests**: Existing coverage
**Commit**: `feat(assistant): M5 execution timeline refinements`

### M6: Terminal Presentation
**Scope**: Dedicated shell execution presentation
**Files**: New `AssistantTerminal.tsx`, update `AssistantToolCard.tsx` to render it
**Changes**:
- `AssistantTerminal` consuming `AssistantTerminalExecution`
- Command display with `$` prefix
- Running state with spinner
- Bounded output preview
- Exit code display (when proven)
- Duration display (when available)
- Collapsed/expanded state
- Sensitive output redaction
**Data source**: `AssistantTerminalExecution.command/outputPreview/exitCode/durationMs`
**Tests**: Unit tests for terminal rendering
**Commit**: `feat(assistant): M6 terminal presentation`

### M7: Verification Presentation
**Scope**: Compact verification results
**Files**: New `AssistantVerification.tsx`
**Changes**:
- Derived from bash/test results (not manufactured)
- Checkmarks for pass/fail
- Count summary
- Clearly distinguishes: command result → test result → verification evidence → verdict
- `execution completion ≠ verification verdict` invariant preserved
**Data source**: Derived from terminal operations with test-like output
**Tests**: Unit tests
**Commit**: `feat(assistant): M7 verification presentation`

### M8: Artifact Presentation
**Scope**: File change listing
**Files**: New `AssistantArtifacts.tsx`
**Changes**:
- Files changed count
- M/A/D status per file
- Future: Open, Diff, Copy path actions
- Only expose "Open in Workspace" if canonical navigation exists
**Data source**: Derived from edit operations' `path` fields
**Tests**: Unit tests
**Commit**: `feat(assistant): M8 artifact presentation`

### M9: Premium Composer
**Scope**: Refine composer into compact control surface
**Files**: `ComposeInput` in `ConversationPanel.tsx`
**Changes**:
- Provider/model display as subtle metadata
- `+` attachment entry point (placeholder, hidden if unavailable)
- `@` contextual reference entry (placeholder, hidden if unavailable)
- Preserve Enter/Shift+Enter, stop, focus, duplicate prevention
**Tests**: Existing coverage
**Commit**: `feat(assistant): M9 premium composer`

### M10: Conversation Header
**Scope**: Integrate navigation into premium header
**Files**: `FloatingPanel.tsx`, new header section
**Changes**:
- "Vestara Assistant" title
- Current conversation subtitle
- New conversation, history, minimize, maximize, close controls
- Overflow menu for less frequent actions
- Avoid toolbar clutter
**Tests**: Existing coverage
**Commit**: `feat(assistant): M10 conversation header`

### M11: Motion and Micro-Interactions
**Scope**: Restrained motion for state communication
**Files**: Various assistant components
**Changes**:
- Thinking pulse (already exists)
- Tool running indicator (already exists)
- Smooth task completion transition
- Diff expansion animation
- History opening animation
- Copy → Copied transition
- Permission transition
- Respect `prefers-reduced-motion`
- No decorative constant animation
**Tests**: Visual only
**Commit**: `feat(assistant): M11 motion and micro-interactions`

### M12: Responsive Floating/Expanded Modes
**Scope**: Two presentations of same data
**Files**: `FloatingPanel.tsx`, `ConversationPanel.tsx`
**Changes**:
- Floating: ~420–700px, compact tools, collapsed diffs, concise tasks
- Expanded: richer diffs, wider code, task sidebar, artifact inspection
- Same runtime/conversation implementation
- Same data, different presentation density
**Tests**: Visual only
**Commit**: `feat(assistant): M12 responsive floating/expanded modes`

### M13: Accessibility Audit
**Scope**: Full accessibility pass
**Files**: All assistant components
**Changes**:
- Keyboard navigation audit
- Visible focus indicators
- Semantic buttons everywhere
- ARIA labels on all interactive elements
- Status announcements (bounded, not per-token)
- Contrast compliance
- Reduced motion support
- Keyboard-accessible diff/task expansion
**Tests**: Accessibility tests
**Commit**: `feat(assistant): M13 accessibility audit`

### M14: Performance Audit
**Scope**: Tool-rich conversation performance
**Files**: Various
**Changes**:
- Profile markdown re-render cost
- Profile syntax highlighting cost
- Profile diff rendering cost
- Profile task update cost
- Profile streaming delta cost
- Profile conversation history cost
- DOM size audit
- Scroll behavior audit
- Memoize only where profiling justifies
- Consider virtualization only after evidence
**Tests**: Performance benchmarks
**Commit**: `feat(assistant): M14 performance audit`

### M15: Visual Acceptance
**Scope**: Real engineering request test
**Files**: N/A (testing only)
**Changes**:
- Run: "Inspect ConversationPanel.tsx, create a small improvement to its empty-state copy, run the relevant tests, and summarize what changed"
- Verify: borderless responses, tool cards, diff presentation, task list, terminal, verification
- Verify: no rounded enclosing bubble/background
- Verify: human messages visually identifiable
- Verify: tool/diff/task surfaces provide structure where useful
**Tests**: Visual acceptance
**Commit**: `docs(assistant): M15 visual acceptance evidence`

---

## Dependency Graph

```
M1 (design system)
 ├─→ M2 (tool card variants)
 │    ├─→ M3 (code edit/diff) ──→ M8 (artifacts)
 │    ├─→ M4 (task list)
 │    ├─→ M5 (timeline refinements)
 │    └─→ M6 (terminal) ──→ M7 (verification)
 ├─→ M9 (composer)
 ├─→ M10 (header)
 ├─→ M11 (motion)
 └─→ M12 (responsive)
      └─→ M13 (accessibility)
           └─→ M14 (performance)
                └─→ M15 (visual acceptance)
```

**Parallel tracks**: M3/M4/M5/M6 can be developed in parallel after M2. M9/M10/M11 can be developed in parallel after M1. M12 depends on M1–M11 being stable.

---

## Glossary

- **AssistantCodeEdit**: Dedicated presentation for file modifications (M3)
- **AssistantTaskList**: Structured task-progress surface (M4)
- **AssistantTerminal**: Shell execution presentation (M6)
- **AssistantVerification**: Compact verification results (M7)
- **AssistantArtifacts**: File change listing (M8)
- **Execution Timeline**: Compact tool activity observability (M5)

---

## READY FOR DIRECTOR REVIEW

Proposed milestone decomposition: 15 phases, bounded commits, dependency graph above.

Awaiting authorization to begin M1 (design system refinements).
