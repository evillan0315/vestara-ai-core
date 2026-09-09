---
title: "VES-UI-001 — Vestara Shared UI Platform"
version: 1.0.0
status: proposed
owner: vestara
created: 2026-09-09
last-reviewed: 2026-09-09
next-review: 2026-10-09
program: VES-UI
---

# VES-UI-001 — Vestara Shared UI Platform

> **Apps compose screens. Shared UI owns presentation primitives and layout. Domain packages own behavior and data.**

---

## Problem

The generated Home, Global Assistant, Activity Room, Executions, Agents, Create Agent, Workflows, Projects, Files, Terminal, Marketplace, Tools, and Settings screens reveal a consistent visual grammar. Today that grammar is implicitly duplicated across `workspace-ui` pages — no shared token system, no shared shell, no shared primitives. Every new screen or refactor must reconstruct the same surface hierarchy, spacing, typography, and responsive behavior independently. This compounds into drift, inconsistency, and wasted effort.

## Solution

Build a standalone Vestara UI Platform — a family of domain-agnostic packages that encode the visual contract once so every app consumes the same shell, primitives, responsive behavior, and design tokens. The platform is not a component library inside `workspace-ui`; it is a reusable SDK capable of powering the web workspace, standalone desktop shell, admin surfaces, Marketplace, Global Assistant, Activity Room, and future modules.

## Architectural Rule

> No package in the shared UI platform should know what an `Agent`, `Workflow`, `Execution`, or `Conversation` is.

Domain compositions belong in feature packages or applications. Shared UI provides the visual and interaction contracts that domain packages compose into domain-specific screens.

---

## Target Package Architecture

Six packages with explicit dependency boundaries:

```text
packages/
├── ui-tokens/       @vestara/ui-tokens       Design tokens (no React, no MUI)
├── ui-theme/        @vestara/ui-theme        MUI theme integration layer
├── ui/              @vestara/ui              Core presentation primitives
├── ui-layout/       @vestara/ui-layout       Shell, panes, responsive layout
├── ui-charts/       @vestara/ui-charts       Chart abstractions
└── ui-testing/      @vestara/ui-testing      Visual regression + test utilities
```

### Dependency Direction

```text
                 @vestara/ui-tokens
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
     @vestara/ui-theme      @vestara/ui
             │                   │
             └─────────┬─────────┘
                       ▼
              @vestara/ui-layout
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
     @vestara/ui-charts      Applications / Feature Packages
```

### Forbidden Dependencies

```text
ui → execution, agent, workflow, activity-room, opencode-runtime
ui-layout → execution, agent, workflow, router, application state
ui-theme → any domain package
ui-tokens → any React or MUI dependency
```

---

## VES-UI Package Manifests

The shared UI platform should remain independently consumable by any Vestara app, workspace, module, or package. Package boundaries, peer dependencies, exports, and build contracts are part of the architecture — not implementation details.

### Package file structure

```text
packages/
├── ui-tokens/
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
│
├── ui-theme/
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
│
├── ui/
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
│
├── ui-layout/
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
│
├── ui-charts/
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
│
└── ui-testing/
    ├── src/
    ├── package.json
    └── tsconfig.json

apps/
└── ui-lab/
    ├── src/
    ├── package.json
    ├── vite.config.ts
    └── tsconfig.json
```

### 1. `@vestara/ui-tokens/package.json`

Lowest-level package. **Zero runtime dependencies.**

```json
{
  "name": "@vestara/ui-tokens",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "files": ["dist"],
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check src"
  },
  "devDependencies": {
    "typescript": "workspace:*",
    "vitest": "workspace:*"
  }
}
```

Responsibility: colors, spacing, typography, radius, elevation, breakpoints, motion, z-index, density, sizing. No React. No MUI. No Framer Motion. No domain packages.

### 2. `@vestara/ui-theme/package.json`

MUI-specific interpretation of Vestara's tokens:

```json
{
  "name": "@vestara/ui-theme",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "files": ["dist"],
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check src"
  },
  "dependencies": {
    "@vestara/ui-tokens": "workspace:*"
  },
  "peerDependencies": {
    "@emotion/react": "^11",
    "@emotion/styled": "^11",
    "@mui/material": "^7",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@emotion/react": "^11",
    "@emotion/styled": "^11",
    "@mui/material": "^7",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "react": "^19",
    "react-dom": "^19",
    "typescript": "workspace:*",
    "vitest": "workspace:*"
  }
}
```

React/MUI are **peer dependencies**, preventing every Vestara package from carrying its own instance.

### 3. `@vestara/ui/package.json`

Reusable component library with explicit subpath exports:

```json
{
  "name": "@vestara/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "files": ["dist"],
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./actions": {
      "types": "./dist/actions/index.d.ts",
      "import": "./dist/actions/index.js"
    },
    "./data-display": {
      "types": "./dist/data-display/index.d.ts",
      "import": "./dist/data-display/index.js"
    },
    "./feedback": {
      "types": "./dist/feedback/index.d.ts",
      "import": "./dist/feedback/index.js"
    },
    "./forms": {
      "types": "./dist/forms/index.d.ts",
      "import": "./dist/forms/index.js"
    },
    "./icons": {
      "types": "./dist/icons/index.d.ts",
      "import": "./dist/icons/index.js"
    },
    "./motion": {
      "types": "./dist/motion/index.d.ts",
      "import": "./dist/motion/index.js"
    },
    "./navigation": {
      "types": "./dist/navigation/index.d.ts",
      "import": "./dist/navigation/index.js"
    },
    "./surfaces": {
      "types": "./dist/surfaces/index.d.ts",
      "import": "./dist/surfaces/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check src"
  },
  "dependencies": {
    "@vestara/ui-theme": "workspace:*",
    "@vestara/ui-tokens": "workspace:*"
  },
  "peerDependencies": {
    "@emotion/react": "^11",
    "@emotion/styled": "^11",
    "@mui/icons-material": "^7",
    "@mui/material": "^7",
    "framer-motion": "^12",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@emotion/react": "^11",
    "@emotion/styled": "^11",
    "@mui/icons-material": "^7",
    "@mui/material": "^7",
    "@testing-library/jest-dom": "^6",
    "@testing-library/react": "^16",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "framer-motion": "^12",
    "jsdom": "^26",
    "react": "^19",
    "react-dom": "^19",
    "typescript": "workspace:*",
    "vitest": "workspace:*"
  }
}
```

Consumers write:

```ts
import { TextInput, Select } from '@vestara/ui/forms';
import { StatusBadge } from '@vestara/ui/data-display';
import { Panel } from '@vestara/ui/surfaces';
```

Never:

```ts
import { TextInput } from '@vestara/ui/src/forms/TextInput';
```

### 4. `@vestara/ui-layout/package.json`

ShellLayout, panes, responsive layouts, floating windows:

```json
{
  "name": "@vestara/ui-layout",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "files": ["dist"],
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./shell": {
      "types": "./dist/shell/index.d.ts",
      "import": "./dist/shell/index.js"
    },
    "./panes": {
      "types": "./dist/panes/index.d.ts",
      "import": "./dist/panes/index.js"
    },
    "./floating": {
      "types": "./dist/floating/index.d.ts",
      "import": "./dist/floating/index.js"
    },
    "./responsive": {
      "types": "./dist/responsive/index.d.ts",
      "import": "./dist/responsive/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check src"
  },
  "dependencies": {
    "@vestara/ui": "workspace:*",
    "@vestara/ui-theme": "workspace:*",
    "@vestara/ui-tokens": "workspace:*"
  },
  "peerDependencies": {
    "@emotion/react": "^11",
    "@emotion/styled": "^11",
    "@mui/material": "^7",
    "framer-motion": "^12",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@emotion/react": "^11",
    "@emotion/styled": "^11",
    "@mui/material": "^7",
    "@testing-library/jest-dom": "^6",
    "@testing-library/react": "^16",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "framer-motion": "^12",
    "jsdom": "^26",
    "react": "^19",
    "react-dom": "^19",
    "typescript": "workspace:*",
    "vitest": "workspace:*"
  }
}
```

Critically, there is **no** `react-router`, `execution-types`, `agent-types`, `workflow`, `activity-room`, `opencode-runtime`, or `conversation-runtime` dependency. ShellLayout stays genuinely portable.

### 5. `@vestara/ui-charts/package.json`

Chart implementation isolated behind abstractions:

```json
{
  "name": "@vestara/ui-charts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "files": ["dist"],
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check src"
  },
  "dependencies": {
    "@vestara/ui": "workspace:*",
    "@vestara/ui-theme": "workspace:*",
    "@vestara/ui-tokens": "workspace:*"
  },
  "peerDependencies": {
    "@mui/material": "^7",
    "react": "^19",
    "react-dom": "^19",
    "recharts": "^3"
  },
  "devDependencies": {
    "@mui/material": "^7",
    "@testing-library/react": "^16",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "jsdom": "^26",
    "react": "^19",
    "react-dom": "^19",
    "recharts": "^3",
    "typescript": "workspace:*",
    "vitest": "workspace:*"
  }
}
```

Applications consume abstractions, never Recharts directly:

```tsx
import { AreaChart, BarChart, DonutChart, ResourceGauge, Sparkline } from '@vestara/ui-charts';
```

### 6. `@vestara/ui-testing/package.json`

Testing infrastructure, not production components:

```json
{
  "name": "@vestara/ui-testing",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "files": ["dist"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@vestara/ui-theme": "workspace:*"
  },
  "peerDependencies": {
    "@testing-library/react": "^16",
    "react": "^19",
    "react-dom": "^19"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6",
    "@testing-library/react": "^16",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "jsdom": "^26",
    "react": "^19",
    "react-dom": "^19",
    "typescript": "workspace:*",
    "vitest": "workspace:*"
  }
}
```

Eventually provides:

```ts
renderWithVestaraTheme()
renderAtViewport()
createMatchMediaMock()
createResizeObserverMock()
createShellTestHarness()
```

### 7. `apps/ui-lab/package.json`

Actual Vite React application — owns concrete runtime dependencies:

```json
{
  "name": "@vestara/ui-lab",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check src"
  },
  "dependencies": {
    "@emotion/react": "^11",
    "@emotion/styled": "^11",
    "@mui/icons-material": "^7",
    "@mui/material": "^7",
    "@vestara/ui": "workspace:*",
    "@vestara/ui-charts": "workspace:*",
    "@vestara/ui-layout": "workspace:*",
    "@vestara/ui-theme": "workspace:*",
    "@vestara/ui-tokens": "workspace:*",
    "framer-motion": "^12",
    "react": "^19",
    "react-dom": "^19",
    "recharts": "^3"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6",
    "@testing-library/react": "^16",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^5",
    "jsdom": "^26",
    "typescript": "workspace:*",
    "vite": "^7",
    "vitest": "workspace:*"
  }
}
```

Generated screens become **reference compositions** in UI Lab, not immediately production pages:

```text
ui-lab
├── /foundations
├── /components
├── /layouts
├── /responsive
│
└── /examples
    ├── home
    ├── global-assistant
    ├── activity-room
    ├── executions
    ├── agents
    ├── create-agent
    ├── workflows
    ├── projects
    ├── files
    ├── terminal
    ├── marketplace
    ├── tools
    └── settings
```

### Version reconciliation note

The exact version ranges above are illustrative. Before implementation, reconcile against versions already installed in the Vestara monorepo. The **package topology and dependency ownership are the contract; exact versions follow the repository's canonical dependency policy.**

---

## Program Milestones

23 milestones across 6 batches:

| Batch | Milestones | Theme | Gate |
|-------|-----------|-------|------|
| **VES-UI-A** | VES-UI-001 through 003 | Audit + Package Contracts + Tokens | Packages bootstrapped, tokens defined, build passes |
| **VES-UI-B** | VES-UI-004 through 008 | Theme + Primitives + Forms + Nav + Shell | ShellLayout renders, forms work, nav renders |
| **VES-UI-C** | VES-UI-009 through 011 | Responsive + Panes + Floating | Three breakpoints proven, panes resize, floating works |
| **VES-UI-D** | VES-UI-012 through 015 | Data + Developer + Charts + Motion | DataTable virtualizes, charts render, motion respects reduced-motion |
| **VES-UI-E** | VES-UI-016 through 020 | UI Lab + Reference Screens | UI Lab runs, reference screens compose from shared primitives |
| **VES-UI-F** | VES-UI-021 through 023 | A11y/Perf + API Freeze + Migration | WCAG 2.2 AA, public API frozen, migration guide shipped |

---

## VES-UI-001 — Existing UI & Generated Screen Audit

**Objective**: Audit the current `workspace-ui` implementation and all generated screens to extract the implicit visual contract. Document every surface hierarchy, color value, spacing pattern, typography choice, border radius, elevation level, and responsive breakpoint currently in use. This audit becomes the raw material for VES-UI-003 token definitions.

**Key artifacts**:

- `docs/blueprint/ves-ui-audit.md` — screen-by-screen visual contract extraction
- Surface hierarchy map: Canvas → Shell → Navigation → Workspace → Header → Toolbar → Primary Surface → Inspector
- Color inventory: all hardcoded hex values mapped to semantic intent
- Spacing inventory: all padding/margin/gap values mapped to layout role
- Typography inventory: all font sizes, weights, line-heights mapped to content hierarchy
- Responsive breakpoint inventory: current behavior at mobile/tablet/desktop

**Exit criteria**:

- [ ] All 12+ generated screens audited
- [ ] Every hardcoded color value cataloged with proposed semantic name
- [ ] Every spacing value cataloged with proposed token name
- [ ] Surface hierarchy documented as reusable pattern
- [ ] Responsive behavior documented per screen per breakpoint
- [ ] Audit document reviewed and approved

**Verification**: Audit → Contract → Evidence → Freeze

---

## VES-UI-002 — Package & Dependency Contracts (Hard Gate)

**Objective**: Establish every `package.json`, package export map, peer dependency, dependency direction, and prohibited dependency **before anyone builds a single component**. This is a hard gate — no code is written in `@vestara/ui`, `@vestara/ui-layout`, or `@vestara/ui-charts` until this milestone passes.

**Key artifacts**:

- 6 `package.json` files for library packages (see VES-UI Package Manifests section)
- 1 `package.json` for `apps/ui-lab/`
- 7 `tsconfig.json` files (one per package)
- `pnpm-workspace.yaml` updated with new package paths
- `build-order.sh` updated with correct build sequence
- `scripts/workspace-architecture.mjs` updated with boundary rules

**Package topology** (the contract):

```text
ui-tokens    → (zero runtime deps)
ui-theme     → ui-tokens (deps), react/mui (peers)
ui           → ui-tokens + ui-theme (deps), react/mui/framer (peers)
ui-layout    → ui + ui-tokens + ui-theme (deps), react/mui/framer (peers)
ui-charts    → ui + ui-tokens + ui-theme (deps), recharts (peer)
ui-testing   → ui-theme (dep), react/testing-library (peers)
ui-lab       → all of the above (deps), vite + react + mui + recharts (deps)
```

**Forbidden dependencies** (enforced by boundary check):

```text
ui-tokens   → react, mui, framer-motion, any domain package
ui-theme    → any domain package
ui          → execution, agent, workflow, activity-room, opencode-runtime
ui-layout   → execution, agent, workflow, router, application state
ui-charts   → any domain package
```

**Subpath exports** (the public API surface):

```text
@vestara/ui                  → all primitives
@vestara/ui/actions          → Button, IconButton, SplitButton, ...
@vestara/ui/data-display     → Badge, StatusBadge, DataTable, ...
@vestara/ui/feedback         → Alert, Toast, Dialog, ...
@vestara/ui/forms            → TextInput, Select, FormField, ...
@vestara/ui/icons            → VestaraIcon registry
@vestara/ui/motion           → Fade, Slide, Collapse, ...
@vestara/ui/navigation       → Tabs, Breadcrumbs, NavItem, ...
@vestara/ui/surfaces         → Surface, Panel, Card, ...

@vestara/ui-layout           → all layout components
@vestara/ui-layout/shell     → ShellLayout, ShellHeader, ...
@vestara/ui-layout/panes     → SplitPane, ThreePaneLayout, ...
@vestara/ui-layout/floating  → FloatingWindow, FloatingWindowManager
@vestara/ui-layout/responsive → useResponsiveLayout, useBreakpoint

@vestara/ui-charts           → all chart abstractions
```

**Exit criteria**:

- [ ] All 7 `package.json` files created with correct dependency topology
- [ ] All subpath exports defined and importable from `dist/`
- [ ] `pnpm-workspace.yaml` includes new package paths
- [ ] `build-order.sh` builds all packages in correct order
- [ ] `pnpm dependencies:check` passes with zero violations
- [ ] Boundary check script rejects forbidden dependencies
- [ ] `pnpm install` resolves without duplicate React/MUI instances
- [ ] Empty stub `index.ts` files compile in all packages

**Verification**: Contract → Build → Boundary Check → Evidence → Freeze

> **This is the most important milestone in the program.** It prevents exactly the kind of architectural debt we are trying to remove: building a useful component first and discovering later that it depends on an app, router, domain model, runtime, or workspace package and therefore is not actually reusable.

---

## VES-UI-003 — Design Tokens

**Objective**: Establish the canonical design token vocabulary. Using the VES-UI-001 audit, encode every extracted value as a semantic token in `@vestara/ui-tokens`.

**Key artifacts**:

- `packages/ui-tokens/src/` — token definitions (TypeScript, no React)
- Token categories: Color, Typography, Spacing, Radius, Elevation, Borders, Opacity, Motion, Breakpoints, Z-index, Sizing, Density

**Token vocabulary**:

```text
surface.canvas, surface.shell, surface.panel, surface.panelRaised, surface.overlay, surface.interactive
border.subtle, border.default, border.strong, border.focus
text.primary, text.secondary, text.muted, text.disabled
accent.primary, accent.secondary
status.success, status.warning, status.error, status.info, status.running, status.idle
```

**Typography scale**:

```text
display, pageTitle, sectionTitle, panelTitle, body, bodySmall, label, caption, code
```

**Monospace surfaces**: terminal, code, IDs, paths, logs, hashes, metrics.

**Exit criteria**:

- [ ] All 12 token categories defined with semantic names
- [ ] Zero hardcoded color values (`#0b1424`, `#1e88ff`) in token definitions
- [ ] Token package compiles with zero dependencies on React or MUI
- [ ] Token audit document covering every generated screen's visual contract
- [ ] `pnpm build` passes with new package in build order

**Verification**: Audit → Contract → Implement → Verify → Evidence → Freeze

---

## VES-UI-004 — MUI Theme Platform

**Objective**: Build `@vestara/ui-theme` as the MUI integration layer. Expose `VestaraThemeProvider`, `createVestaraTheme()`, `createVestaraDarkTheme()`, `createVestaraLightTheme()`. Define MUI component overrides centrally for 18+ components.

**Key artifacts**:

- `packages/ui-theme/src/` — theme provider, theme creators, component overrides

**Theme API**:

```tsx
<VestaraThemeProvider>
  <App />
</VestaraThemeProvider>
```

```ts
createVestaraTheme()        // defaults to dark
createVestaraDarkTheme()
createVestaraLightTheme()
```

**Centrally overridden MUI components**:

```text
Button, IconButton, Input, Select, Menu, Popover, Tooltip, Dialog, Drawer,
Tabs, Chip, Card, Paper, Table, Switch, Checkbox, Radio, Skeleton,
LinearProgress, CircularProgress, Snackbar
```

**Rule**: `sx` is for local composition — not for rebuilding the Vestara design system.

**Exit criteria**:

- [ ] `VestaraThemeProvider` wraps any MUI app and applies Vestara tokens
- [ ] Dark and light themes both functional
- [ ] All 18+ component overrides verified visually
- [ ] No `sx`-driven design system drift in theme overrides
- [ ] UI Lab page renders with Vestara theme applied

---

## VES-UI-005 — Core UI Primitives

**Objective**: Build `@vestara/ui` with domain-independent presentation components. Start with boring components — they become the highest-value package.

**Component categories**:

**Forms**: TextInput, TextArea, Select, MultiSelect, SearchInput, Checkbox, Radio, Switch, Slider, FormField, FormSection, FormError, FormHint

**Actions**: Button, IconButton, SplitButton, ButtonGroup, ActionMenu, OverflowMenu, ContextMenu

**Display**: Badge, StatusBadge, Tag, Chip, Avatar, Icon, Metric, Progress, Divider, Code, Timestamp, RelativeTime, EmptyState, ErrorState, LoadingState, Skeleton

**Containers**: Surface, Panel, Card (Card/CardHeader/CardContent/CardActions), Section, Stack, Cluster, Grid, ScrollArea, ResizablePanel, Collapsible

**Feedback**: Alert, Toast, Tooltip, Popover, Dialog, ConfirmDialog, ProgressIndicator, Spinner

**Navigation**: Tabs, SegmentedControl, Breadcrumbs, Pagination, CommandItem, NavItem

**Forbidden in v1**: AgentCard, WorkflowCard, MarketplaceCard, ExecutionCard, or any domain-specific card/composition.

**Exit criteria**:

- [ ] All listed primitives compile and export from `@vestara/ui`
- [ ] Each primitive is domain-independent (no domain imports)
- [ ] Keyboard navigation works for interactive primitives
- [ ] ARIA attributes correct for all primitives
- [ ] Unit tests pass for all primitives (Vitest + RTL)

---

## VES-UI-006 — Forms

**Objective**: Build comprehensive form primitives with validation, error display, and accessible patterns. Forms are the highest-friction surface in Settings, Create Agent, and configuration screens.

**Key artifacts**:

- Form validation hooks (`useForm`, `useFormField`)
- Controlled/uncontrolled patterns for all inputs
- Form layout components (FormSection, FormField, FormError, FormHint)

**Exit criteria**:

- [ ] All form primitives support controlled and uncontrolled modes
- [ ] Validation error display works with FormError
- [ ] Keyboard navigation complete (Tab order, Enter to submit)
- [ ] Screen reader announcements for validation errors
- [ ] Form section collapsing/expanding works

---

## VES-UI-007 — Navigation

**Objective**: Build reusable navigation model rather than hardcoded JSX. Navigation items are data; rendering is the component's responsibility.

**Key artifacts**:

- Navigation data model
- `AppNavigation` component with `renderLink` adapter slot
- Breadcrumbs, Pagination, SegmentedControl

**Navigation data model**:

```ts
const navigation = [
  { id: 'home', label: 'Home', icon: 'home', href: '/' },
  { id: 'assistant', label: 'Global Assistant', icon: 'assistant', href: '/assistant' },
  ...
];
```

**Renderer**:

```tsx
<AppNavigation items={navigation} renderLink={renderRouterLink} />
```

**Rule**: `@vestara/ui-layout` must NOT depend on React Router. Expose adapters/slots instead.

**Exit criteria**:

- [ ] Navigation renders from data model
- [ ] `renderLink` adapter works with React Router, plain `<a>`, and custom handlers
- [ ] Active state highlighting works
- [ ] Collapsible navigation groups work
- [ ] Mobile navigation pattern works (drawer or bottom nav)

---

## VES-UI-008 — ShellLayout

**Objective**: Build the centerpiece — a slot-based shell that any Vestara screen can compose. Same shell, different slots.

**Shell geometry**:

```text
┌─────────────────────────────────────────────────────────────┐
│                     Global Header                           │
├──────────┬───────────────────────────────┬──────────────────┤
│          │                               │                  │
│ Primary  │                               │                  │
│ Sidebar  │         Main Content          │    Inspector     │
│          │                               │                  │
│          │                               │                  │
├──────────┴───────────────────────────────┴──────────────────┤
│                    Optional Bottom Panel                    │
└─────────────────────────────────────────────────────────────┘
                         ╲
                          ╲ Floating Layer
```

**ShellLayout API**:

```tsx
<ShellLayout>
  <ShellLayout.Navigation>...</ShellLayout.Navigation>
  <ShellLayout.Header>...</ShellLayout.Header>
  <ShellLayout.Content>...</ShellLayout.Content>
  <ShellLayout.Inspector>...</ShellLayout.Inspector>
</ShellLayout>
```

**Supported zones**: Global header, Primary sidebar, Secondary sidebar, Main content, Inspector, Bottom panel, Floating layer, Overlay layer, Mobile navigation.

**Screen compositions from same shell**:

| Screen | Sidebar | Primary | Secondary | Inspector |
|--------|---------|---------|-----------|-----------|
| Files | Repository | Files | Editor | Details |
| Activity Room | Navigation | Activity Stream | — | Execution Inspector |
| Global Assistant | Navigation | Conversations | Conversation | Context |
| Agents | Navigation | Agent Catalog | — | Agent Inspector |
| Workflows | Navigation | Workflow List | Canvas | Run Inspector |
| Terminal | Navigation | Terminal Workspace | — | Sessions |

**Exit criteria**:

- [ ] ShellLayout renders with all slot zones
- [ ] Zones show/hide based on slot presence
- [ ] Shell persists across route changes (no remount)
- [ ] Shell responds to breakpoint changes
- [ ] Shell renders in UI Lab with mock content

---

## VES-UI-009 — Responsive Layout Engine

**Objective**: Define three interaction models — Desktop (≥1200px), Tablet (~768–1199px), Mobile (<768px) — and encode responsive behavior into the shell and layout primitives.

**Interaction models**:

**Desktop (≥1200px)**: Full workspace — Navigation, Secondary navigation/list, Main content, Inspector. Panels may be resizable.

**Tablet (~768–1199px)**: Main content persistent. Navigation → collapsible. Inspector → overlay drawer. Secondary panel → collapsible.

**Mobile (<768px)**: One primary surface at a time. Navigation → temporary drawer or bottom navigation. Inspector → full-screen sheet. Dialogs → full-screen. Tables → cards/list views. Code/terminal → horizontally scrollable.

**Hooks**: `useResponsiveLayout()`, `useShell()`, `useBreakpoint()`

**Preference**: CSS/container queries where possible. Container queries are valuable because a reusable component should not care whether it runs in a desktop browser, floating Assistant, narrow inspector, or embedded workspace.

**Exit criteria**:

- [ ] ShellLayout adapts correctly at 360px, 768px, 1200px, 1920px
- [ ] Inspector becomes overlay drawer on tablet
- [ ] Navigation becomes drawer on mobile
- [ ] Touch targets ≥ 44px on mobile
- [ ] Container queries work for embedded components

---

## VES-UI-010 — Pane & Inspector System

**Objective**: Build reusable structural components above ShellLayout: Page, Workspace, MasterDetailLayout, ThreePaneLayout, SplitPane, ResizablePane, Inspector, ListPane, ContentPane, BottomPanel, FloatingPanel.

**Key layouts**:

- `Page` + `PageHeader` + `PageTitle` + `PageActions`
- `Workspace` + `WorkspaceHeader` + `WorkspaceToolbar` + `WorkspaceContent`
- `MasterDetailLayout` — list + detail
- `ThreePaneLayout` — three-column with resizable dividers
- `SplitPane` + `ResizablePane` — arbitrary split
- `Inspector` + `InspectorHeader` + `InspectorSection`
- `ListPane` + `ContentPane`
- `BottomPanel` + `FloatingPanel`

**Files example**:

```tsx
<ShellLayout>
  <AppNavigation />
  <Page>
    <PageHeader title="Files" />
    <ThreePaneLayout>
      <RepositoryExplorer />
      <FileWorkspace />
      <FileInspector />
    </ThreePaneLayout>
  </Page>
</ShellLayout>
```

**Exit criteria**:

- [ ] All layout components compile and render
- [ ] ResizablePane supports drag-to-resize with min/max constraints
- [ ] ThreePaneLayout works at all breakpoints
- [ ] Inspector collapses to overlay on tablet/mobile
- [ ] BottomPanel shows/hides without layout shift

---

## VES-UI-011 — Floating Window System

**Objective**: Build a reusable floating window primitive for the Global Assistant design. Desktop: draggable/resizable window. Mobile: full-screen sheet.

**Capabilities**: drag, resize, minimize, maximize, restore, close, snap, viewport constraints, keyboard movement, focus management, z-index management, persist dimensions, persist position, responsive fallback.

**Components**: FloatingWindow, FloatingWindowHeader, FloatingWindowContent, FloatingWindowActions, FloatingWindowManager.

**Rule**: Do not put Assistant behavior into FloatingWindow. The shell only manages the window.

**Exit criteria**:

- [ ] FloatingWindow draggable and resizable on desktop
- [ ] FloatingWindow becomes full-screen sheet on mobile
- [ ] Z-index management prevents overlap conflicts
- [ ] Focus trap works within floating window
- [ ] Escape closes floating window
- [ ] Position and dimensions persist across sessions

---

## VES-UI-012 — Data Display Platform

**Objective**: Build reusable higher-order presentation components for data-heavy screens.

**Components**: DataTable, VirtualList, DataGrid, PropertyList, DefinitionList, MetricCard, StatCard, Timeline, ActivityList, Tree, TreeItem, FileTree, ProgressSteps, Stepper, StatusTimeline, KeyValue.

**Virtualization**: Required from the beginning for Activity Room, Files, Execution datasets. Use windowed rendering for large lists.

**Exit criteria**:

- [ ] DataTable supports sorting, filtering, pagination
- [ ] VirtualList handles 10,000+ items without jank
- [ ] Tree/FileTree supports expand/collapse with keyboard
- [ ] MetricCard/StatCard render with consistent token-driven styling
- [ ] All components are domain-independent

---

## VES-UI-013 — Developer Surfaces

**Objective**: Build engineering-specific visual primitives for code, diffs, logs, terminals, and artifacts.

**Components**: CodeBlock, CodeViewer, DiffViewer, LogViewer, TerminalSurface, CommandBlock, FilePath, SourceLocation, Diagnostic, DiagnosticList, ArtifactViewer, JsonViewer.

**Rule**: `TerminalSurface` is UI. `TerminalRuntime` is not. `DiffViewer` is UI. Git diff acquisition belongs elsewhere.

**Exit criteria**:

- [ ] CodeBlock renders syntax-highlighted code
- [ ] DiffViewer shows unified/split diffs
- [ ] LogViewer virtualizes large log streams
- [ ] TerminalSurface renders terminal output with scrollback
- [ ] JsonViewer expands/collapses JSON trees
- [ ] All surfaces are domain-independent

---

## VES-UI-014 — Charts

**Objective**: Isolate chart integration behind `@vestara/ui-charts`. Applications never directly depend on the chart library.

**Abstractions**: LineChart, AreaChart, BarChart, DonutChart, Sparkline, MetricChart, ResourceGauge, TimelineChart.

**Responsibilities of ui-charts**: Typography, tooltip appearance, axis styling, grid styling, responsiveness, loading, empty state, animation, accessibility.

**Exit criteria**:

- [ ] All chart types render with Vestara tokens
- [ ] Charts are responsive (container queries or ResizeObserver)
- [ ] Charts respect `prefers-reduced-motion`
- [ ] Charts show loading skeleton and empty state
- [ ] No direct chart library imports in application code

---

## VES-UI-015 — Motion System

**Objective**: Govern Framer Motion usage with semantic tokens and reusable motion components.

**Motion tokens**: instant, fast, normal, slow; easeStandard, easeEnter, easeExit; fade, slide, scale, collapse, panel, drawer, window, list.

**Motion components**: Fade, Slide, Collapse, Presence, Stagger, AnimatedNumber, AnimatedProgress.

**Rule**: Respect `prefers-reduced-motion`. Motion communicates state transition, hierarchy, continuity, execution progress, focus — not decoration.

**Exit criteria**:

- [ ] All motion tokens defined
- [ ] Motion components respect `prefers-reduced-motion`
- [ ] Stagger animation works for lists
- [ ] AnimatedNumber animates value changes
- [ ] No janky animations at 60fps

---

## VES-UI-016 — UI Lab

**Objective**: Create a standalone Vite app (`apps/ui-lab/`) as the visual development environment for the entire Vestara UI platform. This lets the UI platform be developed without booting the entire Vestara backend.

**Routes**:

```text
/foundations       — tokens, typography, color, spacing
/components       — all primitives
/forms            — form components and validation
/navigation       — nav, breadcrumbs, tabs
/layouts          — shell, panes, responsive
/shell            — ShellLayout at all breakpoints
/charts           — chart abstractions
/motion           — animation system
/developer        — code, diff, terminal, log surfaces
/responsive       — breakpoint testing
/examples/home    — Home screen composition
/examples/agents  — Agents screen composition
/examples/files   — Files screen composition
/examples/activity-room — Activity Room composition
/examples/global-assistant — Global Assistant composition
```

**Fixtures only** — no backend dependency.

**Exit criteria**:

- [ ] `apps/ui-lab/` boots with Vite
- [ ] All routes render with mock data
- [ ] Responsive testing works at all breakpoints
- [ ] UI Lab is independent of Vestara API
- [ ] UI Lab is excluded from production builds

---

## VES-UI-017 through VES-UI-020 — Reference Screens

Reconstruct generated screens using shared primitives. Each screen validates specific primitives exist and work correctly.

| Milestone | Screen | Validates |
|-----------|--------|-----------|
| VES-UI-017 | Overview | Dashboard, grid, cards, charts (see VES-OVERVIEW for full Overview program) |
| VES-UI-018 | Settings | Forms, responsive sections |
| VES-UI-019 | Agents / Create Agent | Catalog, master-detail, complex forms, stepper |
| VES-UI-020 | Files | Dense multi-pane layout |

Note: Additional reference screens (Executions/Activity Room, Global Assistant) may be added as subsequent milestones if the initial 4 validate all required primitives. Each additional reference screen follows the same composition rule. The Overview screen has its own dedicated program (VES-OVERVIEW) — VES-UI-017 validates that shared primitives can compose the Overview layout.

**Composition rule**: Each page uses ShellLayout + shared primitives. No page-specific CSS for layout or styling that should come from the token/theme system.

**Screen composition examples**:

```tsx
// Overview (simplified — full implementation in VES-OVERVIEW)
<ShellLayout>
  <AppNavigation />
  <Page>
    <PageHeader title="Overview" />
    <Grid cols={3}>
      <MetricCard /><MetricCard /><MetricCard />
      <AreaChart /><BarChart /><DonutChart />
    </Grid>
  </Page>
</ShellLayout>

// Agents
<ShellLayout>
  <AppNavigation />
  <Page>
    <PageHeader title="Agents" />
    <MasterDetailLayout>
      <AgentCatalog />
      <AgentInspector />
    </MasterDetailLayout>
  </Page>
</ShellLayout>

// Files
<ShellLayout>
  <AppNavigation />
  <Page>
    <PageHeader title="Files" />
    <ThreePaneLayout>
      <FileTree />
      <CodeViewer />
      <FileInspector />
    </ThreePaneLayout>
  </Page>
</ShellLayout>
```

**Exit criteria per screen**:

- [ ] Screen composes from shared primitives only
- [ ] Screen works at all three breakpoints
- [ ] Screen renders in UI Lab
- [ ] No screen-specific layout CSS (only composition)
- [ ] Visual proof captured at desktop, tablet, mobile

---

## VES-UI-021 — Domain Adapters

**Objective**: Define how shared UI meets Vestara domain types. Domain adapter pattern:

```text
@vestara/ui → StatusBadge
execution-ui → ExecutionStatusBadge → maps ExecutionStatus → StatusBadge
```

**Adapters**:

| Domain Type | Adapter | Shared Primitive |
|-------------|---------|-----------------|
| ExecutionStatus | ExecutionStatusBadge | StatusBadge |
| AgentRole | AgentRoleBadge | Badge/Tag |
| WorkflowStatus | WorkflowStatusBadge | StatusBadge |
| PermissionStatus | PermissionBadge | Badge |
| ArtifactKind | ArtifactIcon | Icon |
| ExecutionActivity | ActivityItem | ActivityList item |

**Dependency rule**: Shared UI never imports from `@vestara/agent-types`, `@vestara/execution-types`, `@vestara/workflow`, `@vestara/activity-room`. Enforced automatically by boundary checks.

**Exit criteria**:

- [ ] Domain adapter pattern documented
- [ ] At least 3 domain adapters implemented
- [ ] Boundary check enforces no domain imports in ui/ui-layout
- [ ] Adapters compose shared primitives correctly

---

## VES-UI-022 — Accessibility & Performance Hardening

**Objective**: Target WCAG 2.2 AA. Set performance budgets. Harden for Activity Room and Global Assistant high-frequency scenarios.

**Accessibility requirements**:

- Keyboard navigation for all interactive elements
- Visible focus indicators
- Semantic headings (h1–h6 hierarchy)
- ARIA labeling for all interactive components
- Screen-reader status announcements
- Dialog focus traps
- Escape handling for overlays
- Contrast ratios meeting WCAG AA
- `prefers-reduced-motion` support
- Touch targets ≥ 44px
- Non-color status indicators (icons + text, not just colored dots)

**Status indicator pattern**:

```text
✓ Completed
● Running
! Failed
○ Pending
```

**Performance budgets**:

- ShellLayout rerenders: 0 during live execution events
- Context segmentation: ThemeContext, ShellContext, NavigationContext, FloatingWindowContext (not one giant context)
- Virtualization: activity streams, logs, large file trees, conversation history, execution history, tables
- Lazy loading: Charts, DiffViewer, CodeEditor, Terminal, WorkflowCanvas

**Exit criteria**:

- [ ] WCAG 2.2 AA audit passes for all primitives
- [ ] Keyboard navigation complete for all interactive components
- [ ] Focus indicators visible on all interactive elements
- [ ] Screen reader tested for key workflows
- [ ] ShellLayout does not rerender during live events
- [ ] Virtualization handles 10,000+ item lists
- [ ] Heavy surfaces lazy-load correctly
- [ ] Context segmentation prevents unnecessary rerenders

---

## VES-UI-023 — Package API Freeze & Migration Guide

**Objective**: Freeze public API surface. Enforce package exports. Write migration guide for existing `workspace-ui` consumers.

**Public API**:

```ts
@vestara/ui
@vestara/ui/forms
@vestara/ui/navigation
@vestara/ui/data-display
@vestara/ui/feedback

@vestara/ui-layout
@vestara/ui-layout/shell
@vestara/ui-layout/panes
@vestara/ui-layout/floating

@vestara/ui-charts
```

**Forbidden imports** (enforced):

```ts
@vestara/ui/src/components/...    // ❌
@vestara/ui-layout/src/shell/...  // ❌
```

**Migration guide covers**:

- How to replace inline `sx` styling with token-driven primitives
- How to replace page-specific layouts with ShellLayout composition
- How to replace hardcoded colors with semantic tokens
- How to replace MUI imports with `@vestara/ui` equivalents
- How to add domain adapters for domain-specific status/role displays

**Exit criteria**:

- [ ] All package exports defined in `package.json` `exports` field
- [ ] Boundary check enforces public API imports only
- [ ] Migration guide covers all 12 generated screens
- [ ] `workspace-ui` pages can incrementally adopt shared primitives
- [ ] No breaking changes to existing application code during adoption

---

## Promotion Rule

> **A component cannot be promoted into `@vestara/ui` merely because two screens use it. It must represent a domain-independent visual or interaction contract.**

This prevents `@vestara/ui` from slowly becoming another monolithic application package.

---

## Implementation Discipline

Each milestone follows:

```text
Audit → Contract → Implement → Verify → Visual Proof → Responsive Proof → Evidence → Freeze
```

---

## Source Structure

```text
packages/ui-tokens/
├── src/
│   ├── color.ts
│   ├── typography.ts
│   ├── spacing.ts
│   ├── radius.ts
│   ├── elevation.ts
│   ├── borders.ts
│   ├── opacity.ts
│   ├── motion.ts
│   ├── breakpoints.ts
│   ├── z-index.ts
│   ├── sizing.ts
│   ├── density.ts
│   └── index.ts
└── package.json

packages/ui-theme/
├── src/
│   ├── VestaraThemeProvider.tsx
│   ├── createTheme.ts
│   ├── overrides/
│   └── index.ts
└── package.json

packages/ui/
├── src/
│   ├── actions/
│   ├── data-display/
│   ├── feedback/
│   ├── forms/
│   ├── navigation/
│   ├── surfaces/
│   ├── typography/
│   ├── motion/
│   ├── icons/
│   ├── hooks/
│   └── index.ts
└── package.json

packages/ui-layout/
├── src/
│   ├── shell/
│   │   ├── ShellLayout.tsx
│   │   ├── ShellHeader.tsx
│   │   ├── ShellNavigation.tsx
│   │   ├── ShellContent.tsx
│   │   └── ShellInspector.tsx
│   ├── panes/
│   │   ├── SplitPane.tsx
│   │   ├── ThreePaneLayout.tsx
│   │   ├── ResizablePane.tsx
│   │   └── BottomPanel.tsx
│   ├── floating/
│   │   ├── FloatingWindow.tsx
│   │   └── FloatingWindowManager.tsx
│   ├── responsive/
│   └── index.ts
└── package.json

packages/ui-charts/
├── src/
│   ├── LineChart.tsx
│   ├── AreaChart.tsx
│   ├── BarChart.tsx
│   ├── DonutChart.tsx
│   ├── Sparkline.tsx
│   ├── MetricChart.tsx
│   ├── ResourceGauge.tsx
│   ├── TimelineChart.tsx
│   └── index.ts
└── package.json

packages/ui-testing/
├── src/
│   ├── visual-regression.ts
│   ├── viewport-matrix.ts
│   ├── a11y-helpers.ts
│   └── index.ts
└── package.json

apps/ui-lab/
├── src/
│   ├── routes/
│   │   ├── foundations/
│   │   ├── components/
│   │   ├── forms/
│   │   ├── navigation/
│   │   ├── layouts/
│   │   ├── shell/
│   │   ├── charts/
│   │   ├── motion/
│   │   ├── developer/
│   │   ├── responsive/
│   │   └── examples/
│   ├── App.tsx
│   └── main.tsx
├── vite.config.ts
└── package.json
```

---

## Dependency Policy (Hard Rules)

```text
ui-tokens → (no React, no MUI)
ui-theme → ui-tokens, @mui/material
ui → ui-tokens, ui-theme
ui-layout → ui-tokens, ui, ui-theme
ui-charts → ui-tokens, ui
ui-testing → ui, ui-layout
feature/domain UI → ui, ui-layout, ui-charts
screens/apps → feature/domain UI
```

**Explicitly forbidden**:

```text
ui → execution, agent, workflow, activity-room, opencode-runtime
ui-layout → execution, agent, workflow, router, application state
ui-theme → any domain package
```

---

## Final State

Not merely a prettier `workspace-ui`. A reusable **Vestara UI SDK** capable of powering:

- Web workspace (`apps/workspace`)
- Standalone desktop shell (Tauri)
- Admin surfaces
- Marketplace
- Global Assistant
- Activity Room
- Future modules
- Installable workspace applications

One visual language. One responsive system. One token vocabulary. Domain-agnostic. Composable. Governed.
