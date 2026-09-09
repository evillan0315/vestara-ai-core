---
title: "VES-OVERVIEW-001 — Vestara Overview"
version: 1.0.0
status: proposed
owner: vestara
created: 2026-09-09
last-reviewed: 2026-09-09
next-review: 2026-10-09
program: VES-OVERVIEW
---

# VES-OVERVIEW-001 — Vestara Overview

> **Overview owns composition. Shared UI owns presentation. Domain/application services own authoritative data.**

---

## Terminology

```text
"Overview"       = product/workspace summary screen (stable default entry point)
"Dashboard"      = reusable configurable dashboard capability (future, user-defined)
"Activity Room"  = operational activity projection
"Global Assistant" = human-facing Vestara interaction surface
```

Overview is **not** called Dashboard because Vestara already has a broader configurable Dashboard concept. Overview is the stable default entry point into a workspace; future dashboards can be configurable user/module-defined surfaces.

---

## Problem

The current Home screen is a landing page. Architecturally, the screen is a projection of the current Vestara workspace/system state — current work, activity, agents, projects, system resources, marketplace items, and focus items. "Overview" is a better name because it describes what the screen does: summarize workspace state for the user.

## Solution

Build a premium, responsive Vestara **Overview** that provides the user's primary summary of the active workspace. The route becomes `/overview` with `/` resolving or redirecting to `/overview` at the application layer.

---

## Information Architecture

```text
                 ShellLayout
                     │
     ┌───────────────┼────────────────┐
     ▼               ▼                ▼
 Overview       Activity Room    Global Assistant
     │               │                │
 summary         operations       interaction
     │               │                │
     └───────────────┼────────────────┘
                     │
             Vestara domain state
```

Overview sits alongside Activity Room and Global Assistant as one of three primary surfaces. Each owns a distinct role:

| Surface | Role | Content |
|---------|------|---------|
| **Overview** | Summary | Workspace state, continue working, agents, projects, resources |
| **Activity Room** | Operations | Live activity stream, execution monitoring, team presence |
| **Global Assistant** | Interaction | Conversation, task delegation, contextual help |

---

## Navigation

Updated navigation order:

```text
Overview
Global Assistant
Activity Room
Executions
Agents
Workflows
Projects
Files
Terminal
Marketplace

Tools
Settings
```

---

## Projection Contract

The Overview owns a **projection** — a read-only view model assembled from multiple domain services. None of these types claim domain authority:

```text
Agent ────────────┐
Project ──────────┤
Activity ─────────┤
Execution ────────┤
Marketplace ──────┼──► Overview Projection
System ───────────┤          │
Tasks ────────────┘          ▼
                      OverviewViewModel
                             │
                             ▼
                       OverviewScreen
```

### OverviewViewModel

```ts
interface OverviewViewModel {
  workspace: OverviewWorkspaceSummary;
  continueWorking: OverviewRecentWorkItem[];
  recentActivity: OverviewActivityItem[];
  agents: OverviewAgentSummary[];
  projects: OverviewProjectSummary[];
  resources: OverviewResourceSummary;
  marketplace: OverviewMarketplaceItem[];
  focus: OverviewFocusItem[];
}
```

### Supporting types

```ts
interface OverviewWorkspaceSummary {
  name: string;
  description: string;
  lastActivity: string;       // ISO timestamp
  health: 'healthy' | 'degraded' | 'error';
}

interface OverviewRecentWorkItem {
  id: string;
  title: string;
  type: 'execution' | 'workflow' | 'conversation' | 'file';
  status: 'running' | 'completed' | 'paused' | 'failed';
  updatedAt: string;
  progress?: number;          // 0–100
}

interface OverviewActivityItem {
  id: string;
  actor: string;              // agent or human name
  action: string;             // verb phrase
  target?: string;
  timestamp: string;
  kind: 'execution' | 'message' | 'file-change' | 'agent-action';
}

interface OverviewAgentSummary {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'offline';
  currentTask?: string;
  model: string;
}

interface OverviewProjectSummary {
  id: string;
  name: string;
  language?: string;
  health: 'healthy' | 'degraded' | 'error';
  lastActivity: string;
  fileCount?: number;
}

interface OverviewResourceSummary {
  cpu: number;                // 0–100 percentage
  memory: number;             // 0–100 percentage
  disk?: number;
  uptime: string;
  activeSessions: number;
}

interface OverviewMarketplaceItem {
  id: string;
  name: string;
  category: string;
  installed: boolean;
  rating?: number;
}

interface OverviewFocusItem {
  id: string;
  title: string;
  reason: string;             // why this is a focus item
  priority: 'high' | 'medium' | 'low';
  action?: {
    label: string;
    href: string;
  };
}
```

---

## Screen Sections

```text
OVERVIEW
│
├── Workspace Hero
│   └── Welcome statement, workspace name, health indicator
│
├── Quick Actions
│   ├── New Project
│   ├── Create Workflow
│   ├── Open Files
│   ├── Launch Terminal
│   └── Explore Marketplace
│
├── Continue Working
│   └── Recent work items with status and progress
│
├── Recent Activity
│   └── Activity stream from agents, executions, files
│
├── Agent Status
│   └── Agent cards with role, status, current task
│
├── Projects
│   └── Project cards with language, health, activity
│
├── System Resources
│   └── CPU, memory, disk, uptime, sessions
│
├── Marketplace Preview
│   └── Featured/recommended items
│
└── Today's Focus
    └── Priority items with action links
```

### Hero treatment

The hero retains the premium statement while the navigation and accessibility heading establish page identity:

```text
WELCOME TO VESTARA

Build Without Limits
Agents. Workflows. Tools. A more capable you.
```

The visible `Overview` title is omitted from the hero to keep it uncluttered. A screen-reader `<h1>` still establishes the page context.

---

## Implementation Structure

```text
apps/<workspace-app>/src/
└── features/
    └── overview/
        ├── OverviewPage.tsx
        ├── OverviewScreen.tsx
        ├── overview.types.ts
        ├── overview.fixtures.ts
        ├── overview.query.ts
        │
        ├── components/
        │   ├── OverviewHero.tsx
        │   ├── QuickActions.tsx
        │   ├── ContinueWorking.tsx
        │   ├── RecentActivity.tsx
        │   ├── AgentStatus.tsx
        │   ├── ProjectSummary.tsx
        │   ├── SystemResources.tsx
        │   ├── MarketplacePreview.tsx
        │   ├── TodayFocus.tsx
        │   └── InspirationCard.tsx
        │
        ├── hooks/
        │   ├── useOverview.ts
        │   └── useOverviewSections.ts
        │
        └── __tests__/
            ├── OverviewScreen.test.tsx
            ├── overview.query.test.ts
            └── components/
```

### UI Lab reference

```text
/apps/ui-lab/examples/overview
```

---

## Dependency Rule

```text
Overview components
    ↓ may import
@vestara/ui (primitives)
@vestara/ui-layout (shell, panes)
@vestara/ui-charts (charts)
    ↓ may read from
Overview query (domain projection)
    ↓ must NOT import
@vestara/agent-types (direct)
@vestara/execution-types (direct)
@vestara/workflow (direct)
@vestara/activity-room (direct)
```

Overview components consume the `OverviewViewModel` projection. They do not call domain services directly. The query layer (`overview.query.ts`) is the only module that touches domain services.

---

## Milestones

23 milestones:

| # | Milestone | Theme | Gate |
|---|-----------|-------|------|
| 001 | Existing Overview/UI Audit | Audit current Home screen and generated Overview designs | Audit document complete |
| 002 | Overview Projection Contract | Types, query interface, domain boundaries | Types compile, query stub works |
| 003 | Fixture Dataset | Realistic mock data for all sections | Fixtures render all sections |
| 004 | Shell Composition | Overview composed inside ShellLayout | Shell renders, nav highlights Overview |
| 005 | Workspace Hero | Hero section with welcome statement | Hero renders, responsive, accessible |
| 006 | Quick Actions | Action buttons with navigation | Actions navigate correctly |
| 007 | Continue Working | Recent work items with status | Items render, status colors correct |
| 008 | Recent Activity | Activity stream | Activity items render, relative time works |
| 009 | Agent Status | Agent cards with role/status | Agent cards render, status indicators work |
| 010 | Projects Summary | Project cards with health | Project cards render, health indicators work |
| 011 | System Resources | Resource gauges | Gauges render, values display correctly |
| 012 | Marketplace Preview | Marketplace items | Items render, installed state shown |
| 013 | Today's Focus | Focus items with priority | Items render, priority colors correct |
| 014 | Responsive Composition | All sections at desktop/tablet/mobile | Three breakpoints proven |
| 015 | Loading / Empty / Error / Stale | State handling for all sections | All states render correctly |
| 016 | Accessibility | WCAG 2.2 AA for Overview | Keyboard nav, ARIA, screen reader |
| 017 | Motion Polish | Transitions and micro-interactions | Motion respects prefers-reduced-motion |
| 018 | Performance | Render budgets, lazy loading | No jank at 60fps |
| 019 | UI Lab Visual Proof | Overview in UI Lab | Renders with fixtures at all breakpoints |
| 020 | Production Projection Integration | Real domain data | Overview renders live workspace data |
| 021 | Verification | End-to-end verification | All exit criteria verified |
| 022 | Evidence | Completion evidence gathered | All artifacts documented |
| 023 | FREEZE | Milestone frozen | No further changes without new proposal |

### Batch grouping

| Batch | Milestones | Theme |
|-------|-----------|-------|
| **VES-OVERVIEW-A** | 001–003 | Audit + Contract + Fixtures |
| **VES-OVERVIEW-B** | 004–006 | Shell + Hero + Quick Actions |
| **VES-OVERVIEW-C** | 007–010 | Content Sections |
| **VES-OVERVIEW-D** | 011–013 | Resources + Marketplace + Focus |
| **VES-OVERVIEW-E** | 014–016 | Responsive + State + Accessibility |
| **VES-OVERVIEW-F** | 017–023 | Motion + Performance + Integration + Freeze |

---

## Exit Criteria

### Per-section

Each section must satisfy:

- [ ] Renders from `OverviewViewModel` projection data
- [ ] Uses `@vestara/ui` primitives only (no domain imports in components)
- [ ] Responsive at desktop (≥1200px), tablet (768–1199px), mobile (<768px)
- [ ] Loading state renders skeleton
- [ ] Empty state renders with helpful message
- [ ] Error state renders with recovery action
- [ ] Keyboard navigable
- [ ] ARIA labels correct
- [ ] Screen reader announces section purpose

### Overall

- [ ] `/overview` route works
- [ ] `/` redirects to `/overview`
- [ ] ShellLayout renders with Overview nav highlighted
- [ ] All 9 sections compose correctly
- [ ] Hero retains premium statement
- [ ] No domain imports in Overview components (only projection types)
- [ ] Fixture dataset renders all sections without errors
- [ ] UI Lab renders Overview at all breakpoints
- [ ] Production projection renders live data
- [ ] `pnpm build` passes
- [ ] `pnpm test` passes
- [ ] `pnpm lint:check` passes

---

## Verification

Each milestone follows:

```text
Audit → Contract → Implement → Verify → Visual Proof → Responsive Proof → Evidence → Freeze
```

---

## Design Principle

> Overview is a projection, not an authority. It summarizes what other Vestara capabilities know and do. When Overview disagrees with the authoritative source, the authoritative source wins. Missing data appears as empty states, not fabricated values.
