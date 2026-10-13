# Navigation Restructure Plan — Vestara AI Core

**Version:** 1.0  
**Status:** Proposed  
**Owner:** vestara-assistant  
**Date:** 2026-10-13  

---

## 1. Executive Summary

Restructure the workspace navigation from a flat, group-based registry into a **two-tier category-driven navigation** with dynamic route/page generation:

| Tier | Category | Purpose |
|------|----------|---------|
| **Top-Level** | **Marketplace** | Unified surface for enabling/disabling/installing packages, apps, workspace components, modules, plugins |
| **Top-Level** | **Workspace** | Daily engineering workspace — Overview + Engineering + Operations |

**Key Principle:** Navigation entries are **generated from route definitions** (single source of truth). Adding a route = adding a nav item = creating a page/tab automatically.

---

## 2. Current State Analysis

### 2.1 Existing Architecture
- **Registry:** `apps/workspace/src/layouts/workspace-navigation.tsx` — `WORKSPACE_NAVIGATION` array (216 entries)
- **Routes:** `apps/workspace/src/routes.ts` — `APP_ROUTES` array (68 routes)
- **Store:** `apps/workspace/src/lib/navigation-store.ts` — CRUD + visibility + parked capabilities
- **Projection:** `buildWorkspaceNavigation()` → `ProjectedNavSection[]` (single flat section)
- **Rendering:** `SidebarNavigation` + `SidebarSection` + `SidebarNavigationItem`

### 2.2 Pain Points
1. **Registry ≠ Routes drift** — manual sync required; test enforces match but doesn't generate
2. **Flat structure** — all items in one section; groups (`workspace`, `build`, `automation`, etc.) only used for search/CRUD
3. **No dynamic generation** — adding a page requires editing 2–3 files
4. **Marketplace buried** — at order 100 (secondary tier), not a top-level category
5. **Engineering scattered** — graph, routing, projects, files, terminals spread across groups

---

## 3. Target Architecture

### 3.1 New Navigation Hierarchy

```
├── Marketplace (top-level category)
│   ├── Discover          → /marketplace/discover
│   ├── Installed         → /marketplace/installed
│   ├── Updates           → /marketplace/updates
│   ├── Categories        → /marketplace/categories
│   ├── Registries        → /marketplace/registries
│   ├── Capabilities      → /marketplace/capabilities
│   ├── Operation Center  → /marketplace/operations
│   └── Publish           → /marketplace/publish
│
└── Workspace (top-level category)
    ├── Overview          → /overview
    ├── Engineering       → /engineering (category landing)
    │   ├── Projects      → /projects
    │   ├── Files         → /files
    │   ├── Terminal      → /terminal
    │   ├── Graph         → /graph
    │   ├── Routing       → /routing
    │   ├── Workflows     → /orchestration
    │   ├── Agents        → /agents
    │   ├── Workers       → /workers
    │   └── Diagnostics   → /diagnostics
    │
    ├── Operations        → /operations (category landing)
    │   ├── Executions    → /execution
    │   ├── Sessions      → /sessions
    │   ├── Artifacts     → /artifacts
    │   ├── Activities    → /activities
    │   ├── Ops Center    → /ops
    │   └── Evidence      → /evidence
    │
    ├── Activity Room     → /activity
    ├── Global Assistant  → (action: open-assistant)
    ├── Settings          → /settings
    └── Tools             → /api-builder
```

### 3.2 Route-Driven Navigation (Single Source of Truth)

**New contract:** `apps/workspace/src/routes.ts` is **the only source**. Navigation is derived at build/runtime.

```typescript
// Extended AppRoute with navigation metadata
export interface AppRoute {
  id: string;
  path: string;
  title: string;
  requiresAuth: boolean;
  enabled: boolean;
  layout: 'public' | 'shell';
  hideFromNav?: boolean;
  redirect?: string;
  catchAll?: boolean;
  sampleParams?: Record<string, string>;

  // NEW: Navigation metadata
  navCategory?: 'marketplace' | 'workspace';
  navGroup?: string;           // e.g., 'engineering', 'operations'
  navOrder?: number;           // order within group
  navIcon?: WorkspaceNavIcon;  // from workspace-navigation icon map
  navDescription?: string;
  navKeywords?: string[];
  navHero?: { eyebrow: string; subtitle: string };
  navAction?: WorkspaceNavAction; // for route-less entries (Global Assistant)
  navDividerBefore?: boolean;
  navTier?: 'primary' | 'secondary' | 'discovery';
  capabilityId?: string;       // parked capability gating
}
```

**Generation rule:** Any route with `navCategory` + `navGroup` (or `navCategory` only for top-level) appears in navigation. No separate registry.

---

## 4. Implementation Plan

### 4.1 Files to Modify

| File | Change |
|------|--------|
| `apps/workspace/src/routes.ts` | Extend `AppRoute` with nav metadata; annotate all 68 routes |
| `apps/workspace/src/layouts/workspace-navigation.tsx` | **Replace** `WORKSPACE_NAVIGATION` registry with `buildNavigationFromRoutes()` generator |
| `apps/workspace/src/lib/navigation-store.ts` | Adapt CRUD to work with route-derived base + user custom entries |
| `apps/workspace/src/components/layout/AppSidebar/SidebarNavigation.tsx` | Render category headers + grouped sections (not single flat section) |
| `apps/workspace/src/components/layout/AppSidebar/SidebarSection.tsx` | Support category headers + grouped items |
| `apps/workspace/src/App.tsx` | No change (route registration unchanged) |

### 4.2 New Files Needed

| File | Purpose |
|------|---------|
| `apps/workspace/src/lib/navigation-generator.ts` | Pure function: `APP_ROUTES` → `ProjectedNavSection[]` with category/group hierarchy |
| `apps/workspace/src/lib/navigation-types.ts` | Shared types for generated navigation (category, group, tier) |
| `apps/workspace/src/pages/Engineering/EngineeringLanding.tsx` | Category landing page for `/engineering` |
| `apps/workspace/src/pages/Operations/OperationsLanding.tsx` | Category landing page for `/operations` |
| `apps/workspace/src/pages/Marketplace/MarketplaceLanding.tsx` | Category landing page for `/marketplace` (or redirect to `/marketplace/discover`) |

### 4.3 Route Annotations (Complete Mapping)

#### Marketplace Category
| Route ID | Path | Group | Order | Icon | Tier |
|----------|------|-------|-------|------|------|
| `marketplace-discover` | `/marketplace/discover` | (top) | 10 | marketplace | primary |
| `marketplace-installed` | `/marketplace/installed` | (top) | 20 | marketplace | primary |
| `marketplace-updates` | `/marketplace/updates` | (top) | 30 | marketplace | primary |
| `marketplace-categories` | `/marketplace/categories` | (top) | 40 | marketplace | primary |
| `marketplace-registries` | `/marketplace/registries` | (top) | 50 | marketplace | primary |
| `marketplace-capabilities` | `/marketplace/capabilities` | (top) | 60 | marketplace | primary |
| `marketplace-operations` | `/marketplace/operations` | (top) | 70 | marketplace | primary |
| `marketplace-publish` | `/marketplace/publish` | (top) | 80 | marketplace | secondary |

> **Note:** Current `marketplace` route is `/marketplace/*` (catch-all). Split into explicit child routes for each tab.

#### Workspace Category

**Overview (standalone, no group)**
| Route ID | Path | Order | Icon | Tier |
|----------|------|-------|------|------|
| `overview` | `/overview` | 10 | home | primary |

**Engineering Group**
| Route ID | Path | Order | Icon | Tier |
|----------|------|-------|------|------|
| `engineering` | `/engineering` | 20 | graph | primary (landing) |
| `projects` | `/projects` | 30 | projects | primary |
| `files` | `/files` | 40 | files | primary |
| `terminal` | `/terminal` | 50 | terminal | primary |
| `graph` | `/graph` | 60 | graph | primary |
| `routing` | `/routing` | 70 | routing | primary |
| `orchestration` | `/orchestration` | 80 | workflows | primary |
| `agents` | `/agents` | 90 | agents | primary |
| `workers` | `/workers` | 100 | generic | secondary |
| `diagnostics` | `/diagnostics` | 110 | diagnostics | primary |

**Operations Group**
| Route ID | Path | Order | Icon | Tier |
|----------|------|-------|------|------|
| `operations` | `/operations` | 20 | tools | primary (landing) |
| `execution` | `/execution` | 30 | executions | primary |
| `sessions` | `/sessions` | 40 | sessions | primary |
| `artifacts` | `/artifacts` | 50 | artifacts | primary |
| `activities` | `/activities` | 60 | activity | secondary |
| `ops` | `/ops` | 70 | tools | primary |
| `evidence` | `/evidence` | 80 | files | secondary |
| `verifier` | `/verifier` | 90 | generic | discovery |
| `qualification` | `/qualification` | 100 | generic | discovery |

**Workspace Root Items (no group)**
| Route ID | Path | Order | Icon | Tier | Action |
|----------|------|-------|------|------|--------|
| `activity` | `/activity` | 200 | activity | primary | — |
| `global-assistant` | (none) | 210 | assistant | primary | `open-assistant` |
| `settings` | `/settings/*` | 220 | settings | primary | — |
| `api-builder` | `/api-builder` | 230 | tools | secondary | — |

**Discovery Tier (search/command only)**
| Route ID | Path | Tier |
|----------|------|------|
| `live-browser` | `/live-browser` | discovery |
| `chat` | `/chat` | discovery |
| `meet` | `/meet` | discovery |
| `docs` | `/docs` | discovery |
| `memory` | `/memory` | discovery |
| `intelligence-*` | `/intelligence/*` | discovery |
| `external-runtimes` | `/external-runtimes` | discovery |
| `opencode-*` | `/opencode/*` | discovery |
| `workforce` | `/workforce` | discovery |
| `requests` | `/requests` | discovery |

---

## 5. Dynamic Route/Page Generation

### 5.1 Philosophy
- **Routes define pages.** If a route exists with `navCategory`, it gets a nav entry.
- **Landing pages auto-generated** for category/group roots (`/engineering`, `/operations`, `/marketplace`).
- **Custom entries** (user CRUD) remain supported via `navigation-store.ts` — they append to generated structure.

### 5.2 Landing Page Strategy
| Landing Route | Component | Behavior |
|---------------|-----------|----------|
| `/marketplace` | `MarketplaceLanding` | Redirect to `/marketplace/discover` or render tabbed marketplace |
| `/engineering` | `EngineeringLanding` | Grid of cards linking to engineering sub-pages |
| `/operations` | `OperationsLanding` | Grid of cards linking to operations sub-pages |

**Auto-generation option:** If landing component doesn't exist, render a generic `CategoryLanding` that lists child routes in that group.

### 5.3 Route Registration (No Code Changes per Page)
```typescript
// routes.ts — adding a new engineering page:
{
  id: 'engineering-new-tool',
  path: '/engineering/new-tool',
  title: 'New Tool',
  requiresAuth: true,
  enabled: true,
  layout: 'shell',
  navCategory: 'workspace',
  navGroup: 'engineering',
  navOrder: 55,
  navIcon: 'generic',
  navDescription: 'New engineering tool',
}
// → Automatically appears in sidebar under Engineering group
// → Page component at pages/Engineering/NewTool.tsx (lazy-loaded by convention)
// → Visual regression test picks it up via APP_ROUTES
```

---

## 6. Engineering Navigation Recommendations

Based on the current route map and engineering workflow patterns:

### 6.1 Core Engineering (Daily Use)
1. **Projects** — Repository browsing, multi-repo workspace
2. **Files** — Filesystem operations, capability-driven
3. **Terminal** — Integrated shell
4. **Graph** — Entity/relationship map (architecture navigation)

### 6.2 Automation & Orchestration
5. **Workflows** (`/orchestration`) — Flow definitions, runs, templates
6. **Agents** — Agent control, deployment, teams
7. **Routing** — Provider/model routing assignments

### 6.3 Infrastructure & Observability
8. **Workers** — Worker cluster management
9. **Diagnostics** — System health, processes, signals

### 6.4 Future Extensions (when implemented)
- **API Contracts** — OpenAPI/GraphQL schema registry
- **Database** — Schema, migrations, query console
- **CI/CD** — Pipeline definitions, runs
- **Secrets** — Vault integration
- **Environments** — Dev/staging/prod promotion

---

## 7. Migration Strategy

### Phase 1: Route Annotation (Non-breaking)
1. Extend `AppRoute` interface with nav metadata (optional fields)
2. Annotate all 68 existing routes with `navCategory`, `navGroup`, `navOrder`, `navIcon`
3. Keep `WORKSPACE_NAVIGATION` registry as fallback

### Phase 2: Generator Implementation
1. Create `navigation-generator.ts` with `buildNavigationFromRoutes(routes, custom, visibility, parked)`
2. Update `navigation-store.ts` to use generator + merge custom entries
3. Add `useWorkspaceNavigation` hook migration (same API, new implementation)

### Phase 3: Sidebar Rendering
1. Update `SidebarNavigation.tsx` to render category headers + grouped sections
2. Update `SidebarSection.tsx` to support category-level sections
3. Add category header component (icon + label, collapsible)

### Phase 4: Landing Pages
1. Create `/engineering`, `/operations`, `/marketplace` landing pages
2. Add routes for landing pages in `routes.ts`
3. Update marketplace route from catch-all to explicit children

### Phase 5: Cleanup
1. Remove `WORKSPACE_NAVIGATION` registry
2. Remove `buildWorkspaceNavigation()` legacy function
3. Update tests (`workspace-navigation.test.ts`) to test generator

---

## 8. Testing Strategy

| Test | Scope |
|------|-------|
| `navigation-generator.test.ts` | Unit: routes → nav structure (categories, groups, order, icons) |
| `navigation-store.test.ts` | Integration: generator + custom entries + visibility + parked |
| `SidebarNavigation.test.tsx` | Render: category headers, groups, items, collapsed state |
| `routes.test.ts` | Validate: every `enabled: true` shell route has nav metadata or `hideFromNav` |
| Visual regression | All landing pages + category-expanded states |

---

## 9. Acceptance Criteria

1. ✅ **Marketplace** is a top-level navigation category with 8 sub-items
2. ✅ **Workspace** is a top-level category with Overview, Engineering, Operations, Activity Room, Global Assistant, Settings, Tools
3. ✅ **Engineering** group contains 10 recommended sub-items (Projects, Files, Terminal, Graph, Routing, Workflows, Agents, Workers, Diagnostics, plus landing)
4. ✅ **Operations** group contains 10 sub-items (Executions, Sessions, Artifacts, Activities, Ops Center, Evidence, Verifier, Qualification, plus landing)
5. ✅ Adding a route with `navCategory`/`navGroup` automatically creates nav entry (no registry edit)
6. ✅ Landing pages at `/engineering`, `/operations`, `/marketplace` render correctly
7. ✅ Custom navigation entries (user CRUD) still work and merge with generated
8. ✅ Parked capabilities still gate navigation visibility
9. ✅ All existing routes remain accessible (no broken links)
10. ✅ Visual regression tests pass for new sidebar structure

---

## 10. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Route/nav drift during migration | Phase 1 keeps dual system; tests validate parity |
| Breaking custom entries | Store merges custom after generation; same `CustomNavEntry` shape |
| Sidebar layout regression | Visual regression tests on expanded/collapsed states |
| Landing page 404s | Generator creates virtual landing entries; fallback component renders child links |
| Performance (route scan on every render) | Generator is pure + memoized; runs only on route/visibility/parked change |

---

## 11. Next Steps

1. **Review this plan** with stakeholders
2. **Approve** Phase 1 scope (route annotation)
3. **Implement** `navigation-generator.ts` + route annotations
4. **Validate** with `pnpm lint:check && pnpm build && pnpm test`
5. **Iterate** through phases

---

*End of Plan*