# AR-REC-R3 Implementation Preflight

> **Date**: 2026-08-30  
> **Status**: PREFLIGHT COMPLETE — NOT AUTHORIZATION  
> **Authorized by**: Director  
> **Executed by**: vestara-developer  
> **Reconciliation baseline**: `11794e5`  
> **Implementation baseline**: `6c7356f`  
> **Mutation scope**: Documentation/evidence only. No production code changes.  
> **Objective**: Bounded shared-UI inventory and implementation preflight for R3 — Shared UI Foundation.

---

## A. Authoritative R3 Acceptance Criteria

From `docs/activity-room/arx-015-recommendation-governed-decisions-milestone.md` lines 245–256:

| Criterion | ID | Requirement |
|-----------|-----|-------------|
| Shared UI Inventory | REC-030 | Classify primitives as EXISTING, EXTENDABLE, MISSING, DOMAIN-SPECIFIC |
| RecommendationCard | REC-031 | Generic container with RecommendationContent, ContextSummary, DecisionGroup, DecisionState |
| DecisionGroup | REC-032 | Reusable container for options |
| DecisionOption | REC-033 | Accessible primitive that emits `optionId selected` |
| DecisionState | REC-034 | Resolved/pending/unavailable presentation |
| Async Feedback | REC-035 | Submitting, accepted, failure, retry, unavailable, stale |
| Theme Compliance | REC-036 | Existing Vestara theme primitives/tokens |
| Accessibility | REC-037 | Keyboard, focus, screen-reader, non-color-dependent state |

**Exit gate:** Generic decision UI exists independently of Marketplace, Workflow, Agents or Activity Room-specific styling.

---

## B. Existing Shared UI Inventory

### B1. Design System Tokens (`packages/design-system/`)

| Token System | File | Relevance |
|-------------|------|-----------|
| `ACCENT_PALETTES` | `packages/design-system/src/index.ts` | 9 color themes with hex/light/dark/bg/border variants |
| `ENTITY_PRESENTATION` | `packages/design-system/src/index.ts` | 8 entity kinds (agent, task, workflow, session, plan, file, approval, verification) with icons, labels, colors |
| `STATUS_TONES` | `packages/design-system/src/index.ts` | 17 status → tone mappings (idle, active, success, warning, error, info) |
| `presentationFor()` | `packages/design-system/src/index.ts` | Lookup entity presentation by kind, fallback to generic |

### B2. CSS Custom Properties (`apps/workspace/src/styles/index.css`)

| Category | Tokens |
|----------|--------|
| Brand colors | `--vestara-gold`, `--vestara-green`, `--vestara-red`, `--vestara-blue`, `--vestara-purple`, `--vestara-amber` |
| Dynamic accent | `--vestara-accent`, `--vestara-accent-light`, `--vestara-accent-dark`, `--vestara-accent-bg`, `--vestara-accent-border`, `--vestara-accent-border-hover`, `--vestara-accent-border-active`, `--vestara-accent-text` |
| Text hierarchy | `--vestara-text`, `--vestara-text-2`, `--vestara-text-muted`, `--vestara-text-dim` |
| Typography | `--vestara-font-family`, `--vestara-font-size-base/sm/xs/lg`, `--vestara-font-weight-normal/medium/semibold` |
| Layout | `--vestara-spacing-*`, `--vestara-radius`, `--vestara-radius-lg`, `--vestara-radius-full` |

### B3. Reusable UI Primitives by Category

| Category | Components | Count | R3 Relevance |
|----------|-----------|-------|-------------|
| **Modal / Overlay** | `VestaraModal`, `Drawer` | 2 | LOW — R3 components render inline in stream, not modals |
| **Alert / Banner** | `Alert` (4 variants: error, warning, info, success) | 1 | MEDIUM — async feedback states could reuse Alert pattern |
| **Badge / Status Chip** | `OpenCodeSessionStatusBadge`, `OpenCodePermissionRiskBadge`, `ArtifactStatusChip` | 3 | HIGH — `ArtifactStatusChip` has 14 status variants, directly reusable for DecisionState |
| **Card / Surface** | `StatCard`, `DashboardListCard`, `DashboardListItem`, `WorkspaceContinuityCard` | 5 | MEDIUM — `DashboardListCard` has title/subtitle/icon/action/footer pattern |
| **Empty State** | `EmptyState` (2 versions) | 2 | LOW — not needed for R3 |
| **Error State** | `ErrorBoundary`, `ChatError` | 2 | LOW — R3 async feedback handles errors differently |
| **Toast** | `ToastProvider`/`useToasts` + `toast-queue` | 2 | MEDIUM — async feedback could use toast for transient states |
| **Loading** | `ThinkingIndicator`, loading states in cards | 2 | MEDIUM — DecisionState pending could reuse spinner pattern |
| **Pagination** | `Pagination` | 1 | LOW — not needed for R3 |
| **Layout** | `PageContainer`, `PageHeader`, `PageBreadcrumb` | 3 | LOW — R3 components are inline stream items |
| **Markdown** | `MarkdownRenderer`, `CodeBlock` | 2 | HIGH — interaction `content` may contain markdown |
| **Timeline** | `SessionTimeline`, `ActivityFeed`, `WorkflowPipeline` | 3 | LOW — R3 components are individual items, not timelines |
| **Chat** | `ChatComposer`, `MessageActions`, `ToolCallDisplay` | 3 | LOW — different domain |

### B4. Activity Room Existing Components

| Component | File | R3 Relevance |
|-----------|------|-------------|
| `M11CStreamItemComponent` | `apps/workspace/src/pages/activity/M11CStreamItem.tsx` | **CRITICAL** — this is where interaction records will render. Must add `interaction.presented`/`interaction.responded` kind handling |
| `M11CActivityStream` | `apps/workspace/src/pages/activity/M11CActivityStream.tsx` | HIGH — stream container that renders M11CStreamItem components |
| `ActivityItem` | `apps/workspace/src/pages/activity/ActivityItem.tsx` | MEDIUM — original pipeline renderer, may need parallel changes |
| `M11CActivityRoomPage` | `apps/workspace/src/pages/activity/M11CActivityRoomPage.tsx` | MEDIUM — page shell, may need interaction detail modal |
| `ActivityComposer` | `apps/workspace/src/pages/activity/ActivityComposer.tsx` | LOW — read-only stub in M11C, not relevant for R3 |
| `activity-formatters.ts` | `apps/workspace/src/pages/activity/activity-formatters.ts` | HIGH — may need interaction-specific categorization |

### B5. Closest Existing Choice Pattern

**`OpenCodePermissionRespondDialog`** (`apps/workspace/src/components/opencode/OpenCodePermissionRespondDialog.tsx`)

- 2-option radio choice (Approve/Reject)
- Domain-specific: `request.action`, `request.risk`, `permissionResourceSummary()`
- Uses `accent-(--vestara-accent)` for radio inputs
- Button styles: emerald for approve, red for reject
- **NOT reusable for R3** — too domain-specific, wrong pattern (dialog vs inline stream item)

**`ArtifactStatusChip`** (`apps/workspace/src/components/artifacts/ArtifactStatusChip.tsx`)

- 14 status variants with color-coded dots
- **REUSABLE for DecisionState** — pattern of status-to-color mapping

---

## C. REUSE / EXTEND / COMPOSE / NEW Matrix

| R3 Primitive | Classification | Existing Component | Rationale |
|-------------|---------------|-------------------|-----------|
| **InteractionCard** (REC-031) | **NEW** | None — closest is `DashboardListCard` but wrong context | Must be a stream-native inline card, not a dashboard card. Follows M11C stream item surface pattern. |
| **DecisionGroup** (REC-032) | **NEW** | None — closest is radio group in `OpenCodePermissionRespondDialog` but domain-specific | Generic N-option container. Must support 1..N choices, not just 2. |
| **DecisionOption** (REC-033) | **NEW** | None — closest is radio buttons in `OpenCodePermissionRespondDialog` but hardcoded | Accessible button primitive. Must emit `choiceId` on select, not hardcoded values. |
| **DecisionState** (REC-034) | **COMPOSE** | `ArtifactStatusChip` (status-to-color mapping) + `ThinkingIndicator` (spinner pattern) | Compose existing status chip pattern with interaction lifecycle states. |
| **Async Feedback** (REC-035) | **COMPOSE** | `Alert` (variant pattern) + `toast-queue` (transient notification) | Compose existing alert/toast patterns for submitting/accepted/failure/retry/unavailable/stale. |
| **Markdown rendering** | **REUSE** | `MarkdownRenderer` | Interaction `content` may contain markdown — reuse existing renderer. |
| **Timestamp formatting** | **REUSE** | `formatTimestamp()` in `M11CStreamItem.tsx` | Reuse existing relative time formatting. |
| **Theme tokens** | **REUSE** | CSS custom properties | Use `--vestara-accent-*`, `--vestara-text-*`, `--vestara-radius-*` tokens. |
| **Surface styling** | **REUSE** | M11C stream item surface pattern | Reuse `rounded-lg border` + importance-based styles. |

---

## D. Proposed Component Tree

```
apps/workspace/src/components/interaction/
  ├── InteractionCard.tsx          (REC-031: generic container)
  ├── DecisionGroup.tsx            (REC-032: options container)
  ├── DecisionOption.tsx           (REC-033: accessible choice button)
  ├── DecisionState.tsx            (REC-034: lifecycle presentation)
  ├── InteractionAsyncFeedback.tsx (REC-035: submitting/accepted/failure/retry/unavailable/stale)
  └── __tests__/
      ├── InteractionCard.test.tsx
      ├── DecisionGroup.test.tsx
      ├── DecisionOption.test.tsx
      ├── DecisionState.test.tsx
      └── InteractionAsyncFeedback.test.tsx
```

**Plus modifications to existing files:**

```
apps/workspace/src/pages/activity/
  ├── M11CStreamItem.tsx           (add interaction.presented/responded kind handling)
  └── activity-formatters.ts       (add interaction categorization)

apps/workspace/src/hooks/
  └── useM11CActivityRoom.ts       (add interaction.presented/responded to kindMap)
```

---

## E. Data/Prop Boundaries

### InteractionCard (REC-031)

```typescript
interface InteractionCardProps {
  /** The structured interaction to render. Domain-neutral. */
  readonly interaction: StructuredInteraction;
  
  /** Optional response if already responded. null = pending. */
  readonly response?: InteractionResponse;
  
  /** Callback when user selects a choice. */
  readonly onSelect: (choiceId: ChoiceId) => void;
  
  /** Current async feedback state. */
  readonly feedback?: InteractionFeedbackState;
  
  /** Whether the card is in a historical/resolved state. */
  readonly resolved?: boolean;
  
  /** Whether choices are disabled (e.g., already responded, loading). */
  readonly disabled?: boolean;
  
  /** Visual importance override (defaults to 'primary'). */
  readonly importance?: 'primary' | 'secondary' | 'muted';
  
  /** Whether this is a fresh item (for animation). */
  readonly fresh?: boolean;
}
```

### DecisionGroup (REC-032)

```typescript
interface DecisionGroupProps {
  /** The choices to render. From StructuredInteraction.choices. */
  readonly choices: readonly InteractionChoice[];
  
  /** Callback when a choice is selected. */
  readonly onSelect: (choiceId: ChoiceId) => void;
  
  /** Currently selected choice (for controlled state). */
  readonly selectedChoiceId?: ChoiceId;
  
  /** Whether all choices are disabled. */
  readonly disabled?: boolean;
  
  /** Layout variant. */
  readonly layout?: 'vertical' | 'horizontal';
}
```

### DecisionOption (REC-033)

```typescript
interface DecisionOptionProps {
  /** The choice to render. Domain-neutral. */
  readonly choice: InteractionChoice;
  
  /** Callback when this option is selected. */
  readonly onSelect: (choiceId: ChoiceId) => void;
  
  /** Whether this option is currently selected. */
  readonly selected?: boolean;
  
  /** Whether this option is disabled. */
  readonly disabled?: boolean;
  
  /** Visual variant. */
  readonly variant?: 'primary' | 'secondary' | 'destructive';
}
```

### DecisionState (REC-034)

```typescript
interface DecisionStateProps {
  /** The lifecycle state to present. */
  readonly state: InteractionLifecycle;
  
  /** Optional response details for 'responded' state. */
  readonly response?: InteractionResponse;
  
  /** The original choices (for showing which was selected). */
  readonly choices?: readonly InteractionChoice[];
}
```

### InteractionAsyncFeedback (REC-035)

```typescript
type InteractionFeedbackState = 
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'accepted'; response: InteractionResponse }
  | { status: 'failure'; error: string; retryable: boolean }
  | { status: 'retrying'; attempt: number }
  | { status: 'unavailable' }
  | { status: 'stale' };

interface InteractionAsyncFeedbackProps {
  readonly state: InteractionFeedbackState;
  readonly onRetry?: () => void;
}
```

---

## F. State Ownership

| Component | State | Owner | Notes |
|-----------|-------|-------|-------|
| `InteractionCard` | None (pure presentation) | Props | Receives interaction, response, feedback from parent |
| `DecisionGroup` | `selectedChoiceId` (internal) | Component | Local state for uncontrolled mode; controlled via prop |
| `DecisionOption` | `hovered`, `focused` | Component | Native browser state for accessibility |
| `DecisionState` | None (pure presentation) | Props | Derived from lifecycle state |
| `InteractionAsyncFeedback` | None (pure presentation) | Props | Derived from feedback state |

**Key invariant:** R3 components are **presentation-only**. They do not own interaction business rules, do not make API calls, do not store interaction state. State is owned by the parent (which will be the Activity Room page or a future R4 integration component).

---

## G. Accessibility Behavior

| Requirement | Implementation |
|-------------|---------------|
| Keyboard navigation | `DecisionOption` renders as `<button>` with native focus management. `DecisionGroup` supports arrow-key navigation between options. |
| Focus management | First `DecisionOption` receives focus when `DecisionGroup` mounts. Tab moves to next interactive element after the group. |
| Screen reader | `DecisionGroup` uses `role="radiogroup"` with `aria-label`. Each `DecisionOption` uses `role="radio"` with `aria-checked`. |
| Non-color-dependent state | Selected state indicated by border style (solid vs dashed) + check icon, not color alone. Disabled state indicated by opacity + `aria-disabled`. |
| Live region | `InteractionAsyncFeedback` uses `aria-live="polite"` for status changes (submitting → accepted → failure). |

---

## H. Theme/Token Usage

| Element | Token | Usage |
|---------|-------|-------|
| Card surface | `--vestara-accent-bg`, `--vestara-accent-border` | Matches M11C stream item primary pattern |
| Card text | `--vestara-text`, `--vestara-text-2`, `--vestara-text-muted` | Text hierarchy |
| Option border | `--vestara-accent-border` | Default state |
| Option selected border | `--vestara-accent-border-active` | Selected state |
| Option hover | `--vestara-accent-border-hover` | Hover state |
| Option selected bg | `--vestara-accent-bg` | Selected background |
| Option text | `--vestara-text-2` | Default text |
| Option selected text | `--vestara-accent-text` | Selected text |
| Option disabled | `--vestara-text-dim` | Disabled text |
| Radius | `--vestara-radius` | Small radius for options |
| Radius | `--vestara-radius-lg` | Card radius |
| Font size | `--vestara-font-size-xs` | Labels, metadata |
| Font size | `--vestara-font-size-sm` | Content, option labels |
| Font weight | `--vestara-font-weight-medium` | Selected option emphasis |
| Feedback success | `--vestara-green` | Accepted state |
| Feedback error | `--vestara-red` | Failure state |
| Feedback pending | `--vestara-amber` | Submitting/retrying state |
| Timestamp | `--vestara-text-dim` | Relative time display |

**No arbitrary colors.** All colors derive from CSS custom properties. The `--vestara-accent-*` tokens automatically adapt to the user's selected theme (gold, amber, emerald, etc.).

---

## I. Genericity Proof

### Example A: Harness Approval

```
StructuredInteraction {
  content: "Approve git.add on src/index.ts"
  choices: [
    { choiceId: 'approve', label: 'Approve' },
    { choiceId: 'reject', label: 'Reject' }
  ]
}
```

R3 renders: card with prompt "Approve git.add on src/index.ts", two option buttons labeled "Approve" and "Reject". No executable semantics. ChoiceId is opaque.

### Example B: Marketplace Recommendation

```
StructuredInteraction {
  content: "I found existing dashboard components that may fit what you're asking for."
  choices: [
    { choiceId: 'check-existing', label: 'Check existing options' },
    { choiceId: 'continue-building', label: 'Continue building' },
    { choiceId: 'tell-me-more', label: 'Tell me more' }
  ]
}
```

R3 renders: card with prompt, three option buttons. No Marketplace code, no install logic. Labels are text.

### Example C: Banana Department Interaction

```
StructuredInteraction {
  content: "How should Banana Department proceed?"
  choices: [
    { choiceId: 'yellow', label: 'Use yellow workflow' },
    { choiceId: 'green', label: 'Use green workflow' },
    { choiceId: 'later', label: 'Ask me later' }
  ]
}
```

R3 renders: card with prompt, three option buttons. No Banana Department logic. The UI does not know what "yellow workflow" means.

### Example D: Already Responded (Historical)

```
StructuredInteraction {
  content: "Approve git.commit?"
  choices: [
    { choiceId: 'approve', label: 'Approve' },
    { choiceId: 'reject', label: 'Reject' }
  ]
}
InteractionResponse {
  selectedChoiceId: 'approve'
  respondedAt: '2026-08-30T12:00:00Z'
}
```

R3 renders: card with prompt, choices shown as resolved (selected "Approve" with checkmark), no interactive buttons. DecisionState shows "Responded". No executable semantics from historical replay.

**All four examples render identically through the same components.** No source changes needed for new domains.

---

## J. Files Expected to Change/Create

### New Files

| File | Purpose | Est. LOC |
|------|---------|----------|
| `apps/workspace/src/components/interaction/InteractionCard.tsx` | REC-031: generic container | ~80 |
| `apps/workspace/src/components/interaction/DecisionGroup.tsx` | REC-032: options container | ~60 |
| `apps/workspace/src/components/interaction/DecisionOption.tsx` | REC-033: accessible choice button | ~70 |
| `apps/workspace/src/components/interaction/DecisionState.tsx` | REC-034: lifecycle presentation | ~40 |
| `apps/workspace/src/components/interaction/InteractionAsyncFeedback.tsx` | REC-035: async feedback states | ~60 |
| `apps/workspace/src/components/interaction/__tests__/InteractionCard.test.tsx` | Tests | ~80 |
| `apps/workspace/src/components/interaction/__tests__/DecisionGroup.test.tsx` | Tests | ~60 |
| `apps/workspace/src/components/interaction/__tests__/DecisionOption.test.tsx` | Tests | ~50 |
| `apps/workspace/src/components/interaction/__tests__/DecisionState.test.tsx` | Tests | ~40 |
| `apps/workspace/src/components/interaction/__tests__/InteractionAsyncFeedback.test.tsx` | Tests | ~50 |

### Modified Files

| File | Change | Est. LOC delta |
|------|--------|---------------|
| `apps/workspace/src/hooks/useM11CActivityRoom.ts` | Add `interaction.presented`/`interaction.responded` to `kindMap` | ~6 |
| `apps/workspace/src/pages/activity/M11CStreamItem.tsx` | Add interaction kind rendering branch | ~30 |
| `apps/workspace/src/pages/activity/activity-formatters.ts` | Add interaction categorization | ~10 |

---

## K. Test Strategy

| Test Category | Approach |
|---------------|----------|
| **Unit: InteractionCard** | Renders content, choices, response state, feedback state, disabled state, importance, fresh animation |
| **Unit: DecisionGroup** | Renders N choices, handles selection callback, arrow-key navigation, disabled state, layout variants |
| **Unit: DecisionOption** | Renders label, handles click, selected state, disabled state, keyboard Enter/Space, aria attributes |
| **Unit: DecisionState** | Renders presented/responded/expired states, shows selected choice for responded, correct icons |
| **Unit: InteractionAsyncFeedback** | Renders all 6 feedback states, retry callback, aria-live region |
| **Integration: M11CStreamItem** | Interaction records render with correct kind, importance, and component composition |
| **Genericity** | Same components render Harness, Marketplace, and Banana Department interactions without changes |

---

## L. Estimated Production LOC

| Category | LOC |
|----------|-----|
| New components | ~310 |
| Modified existing files | ~46 |
| Tests | ~280 |
| **Total** | **~636** |

---

## M. Conflict with Existing Activity Room Components

**No conflicts identified.**

- R3 components are new files in `apps/workspace/src/components/interaction/`
- M11CStreamItem.tsx gains a new rendering branch for `interaction.presented`/`interaction.responded` kinds — additive, no existing branches modified
- `useM11CActivityRoom.ts` kindMap gains 2 new entries — additive
- `activity-formatters.ts` gains interaction categorization — additive
- No existing components are modified or replaced

---

## N. Blockers

| Blocker | Severity | Resolution |
|---------|----------|------------|
| None | — | All dependencies satisfied. Frozen contracts exist. M9 adapters exist. HTTP route exists. |

---

## O. Recommended Implementation Scope

### In Scope (R3 only)

1. Create `apps/workspace/src/components/interaction/` directory
2. Implement 5 components: `InteractionCard`, `DecisionGroup`, `DecisionOption`, `DecisionState`, `InteractionAsyncFeedback`
3. Write unit tests for all 5 components
4. Modify `useM11CActivityRoom.ts` kindMap to handle `interaction.presented`/`interaction.responded`
5. Modify `M11CStreamItem.tsx` to render interaction records using R3 components
6. Modify `activity-formatters.ts` for interaction categorization

### NOT in Scope (deferred to R4+)

- R4: Activity Stream Integration (historical decision rendering, result separation, activity correlation)
- R6: Contextual Recommendation Presentation (domain-specific presentation patterns)
- R7: Marketplace Discovery Use Case
- R8: Cross-Domain Generality Verification
- R9: Recommendation Lifecycle & Concurrency
- R10: Attention & Notification Integration
- R11: Security & Governance Verification
- R12: Performance & Resilience
- R13: Production Acceptance

### Explicit Prohibitions

- Do NOT wire HTTP response submission (R5 already complete)
- Do NOT modify `InteractionService` (frozen)
- Do NOT modify Harness (frozen)
- Do NOT modify M9/M10 (frozen)
- Do NOT modify Marketplace
- Do NOT add executable semantics to Activity Room
- Do NOT create domain-specific components

---

> **Preflight complete. Awaiting implementation authorization.**
