---
title: Marketplace v0.2 — Workspace API and Marketplace Experience
version: 1
status: proposed
owner: vestara
last-reviewed: 2026-08-02
next-review: 2026-09-02
---

# Vestara Marketplace v0.2 — Workspace API and Marketplace Experience

Exposes the verified v0.1 foundation (`packages/marketplace`) through the Workspace without
expanding into remote publishing. The API is a thin adapter over `MarketplaceService`; the
UI renders service data and observes `marketplace.*` lifecycle events through the Workspace
WebSocket. Neither layer reimplements search, resolution, compatibility, or lifecycle logic.

## Grounding

- `packages/marketplace` ships `MarketplaceService`, `LocalMarketplaceRegistry`,
  `MarketplaceCatalog`, `resolveInstall` (dry-run plan + permissions), `projectInstalled`,
  `detectUpdates`, and typed errors. Nothing here is reimplemented.
- `apps/api/src/server.ts` delegates route handlers returning `boolean`; mutations use
  `readBody` + `json` from `apps/api/src/routes/types.ts` / `index.ts`.
- `apps/workspace` pages are Tailwind + MUI under `pages/`, typed API clients in `lib/`
  (`api.ts`, `routing.ts`), WS events via `lib/ws.ts` (`workspaceSocket.onEvent`), routes in
  `routes.ts` + `App.tsx`, nav in `layouts/navigation.tsx`.
- `extension-runtime` emits `marketplace.*` lifecycle events through `ExtensionEventSink`;
  the marketplace emits catalog events through the same sink convention.

## Phase map

| Phase | Work |
| --- | --- |
| A API | `apps/api/src/routes/marketplace.ts` + `MarketplaceService` wiring in `workspace-context.ts` + `server.ts` registration + WS event bridge |
| B UI client | `lib/marketplace.ts` types/client, `lib/useMarketplaceOperations.ts` event-driven operation tracking |
| C Views | Discover, Categories, Installed, Updates + MarketplaceLayout tabs |
| D Detail/review | Asset detail page + install review flow driven by the dry-run plan |
| E Operation center | Drawer/panel listing active + recent operations from `marketplace.*` events |
| F Graph follow-through | Documented for a later increment (Inspector + contribution relationships) |

## API contract (Phase A)

```text
GET  /api/marketplace/search?q=&type=&publisher=&tag=&limit=&offset=   → { results }
GET  /api/marketplace/assets                                          → { assets }
GET  /api/marketplace/assets/:publisher/:name                          → { asset }
GET  /api/marketplace/assets/:publisher/:name/versions                 → { versions }
GET  /api/marketplace/categories                                       → { categories }
GET  /api/marketplace/registries                                       → { registries }
GET  /api/marketplace/installed                                        → { installed }
GET  /api/marketplace/updates                                          → { updates }
POST /api/marketplace/rescan                                           → { operation }
POST /api/marketplace/install        { reference, version?, dryRun?, approved? } → { operation }
POST /api/marketplace/update         { packageName, version?, dryRun?, approved? } → { operation }
POST /api/marketplace/uninstall      { packageName, dryRun? }         → { operation }
POST /api/marketplace/verify         { reference }                     → { operation }
```

Mutations return operation records (not bare booleans) so the UI and future WebSocket
progress share one model:

```ts
interface MarketplaceOperationDto {
  id: string;
  type: 'install' | 'update' | 'uninstall' | 'verify' | 'rescan';
  status: 'requested' | 'planning' | 'awaiting-permission' | 'running' | 'completed' | 'failed' | 'cancelled';
  asset?: { publisherId?: string; packageName: string };
  plan?: {
    installOrder: Array<{ packageName: string; version: string; source: 'catalog' | 'installed' }>;
    satisfiedByInstalled: Array<{ packageName: string; version: string }>;
    permissions: Array<{ capability: string; scope: string }>;
    warnings: string[];
  };
  installed?: InstalledMarketplaceAsset;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
}
```

Install/update flow: always dry-run first. With `dryRun` → `planning`. With a non-empty
permission list and no `approved` → `awaiting-permission` (the review contract). Otherwise
delegate to `MarketplaceService` → `completed`/`failed`.

The API's extension manager uses an always-grant approver; the permission gate is enforced
by the route from the dry-run plan, so `awaiting-permission` is never bypassed.

## WS event contract

`MarketplaceService` and the extension manager publish `marketplace.*` events through a
bridge that converts them to Workspace WebSocket events (`category: 'marketplace'`). The
operation center subscribes to `marketplace.*` and derives state:

| Event | Derived operation state |
| --- | --- |
| `marketplace.install-requested` | running |
| `marketplace.permission-requested` | awaiting-permission |
| `marketplace.package-verified` | verifying |
| `marketplace.package-installed` | installing |
| `marketplace.package-activated` / `-deactivated` | activating / rolling back |
| `marketplace.install-failed` / `-uninstalled` / `rollback-completed` | failed / completed |

Secret-bearing configuration is never included in event payloads.

## UI structure (Phases B–E)

```text
apps/workspace/src/
  lib/marketplace.ts                 # types + typed client
  lib/useMarketplaceOperations.ts    # event-driven operation tracking
  pages/Marketplace/
    MarketplaceLayout.tsx            # tabs: Discover / Categories / Installed / Updates
    Discover.tsx
    Categories.tsx
    Installed.tsx
    Updates.tsx
    AssetDetail.tsx
    InstallReview.tsx
    OperationCenter.tsx              # drawer of active/recent operations
routes.ts + App.tsx + layouts/navigation.tsx  # /marketplace, /marketplace/*, /marketplace/assets/:publisher/:name
```

- Discover answers: what is available, is it compatible, what permissions, is it verified,
  is it installed, is an update available.
- Installed shows version/state/location/entrypoint/permissions/contributions/update/verify
  with capability-gated actions (inspect, verify, activate, deactivate, update, rollback,
  uninstall).
- Updates groups Compatible / Breaking / Incompatible / Blocked / Pinned / Unknown and
  surfaces a manifest/permission/dependency/contribution diff for the target version.
- Asset detail renders Overview, Versions, Compatibility, Dependencies, Permissions,
  Contributions (as engineering impact: agents, skills, commands, workflows, MCP servers,
  providers, themes, plugins), Verification, Installation.
- Install review: Select version → resolve (dry-run) → compatibility → permissions →
  contributions → confirm → install → activate when applicable.

New routes are registered with `enabled: false` until visual baselines are reviewed
(avoiding screenshot drift); the pages themselves are functional and build-checked.

## Acceptance mapping

| v0.2 criterion | Delivered by |
| --- | --- |
| Search + details via API | Phase A routes |
| Discover/Categories/Installed/Updates from service data | Phases B–C |
| Dry-run before confirmation | Phase D (API `planning` + InstallReview) |
| Deps/permissions/compatibility/contributions shown | Phases C–D |
| Install/update/verify/rollback/uninstall reflected live | Phases A + E (WS bridge + ops center) |
| Failed registries do not block healthy ones | `MarketplaceService` isolation (v0.1) |
| Marketplace events update UI without polling | `useMarketplaceOperations` (Phase E) |
| Installed packages deep-link into Inspector/Graph | Phase F (later increment) |
| No secrets in API/WS payloads | Event bridge + DTO shape (Phase A) |
| Tests pass in touched scope | Phase verification |

## Out of scope for v0.2

Remote registries, publishing, reviews/ratings, collections, commercial services, and the
Inspector/Engineering-Graph contribution materialization (Phase F) are later milestones.

## Verification

- `pnpm --filter @vestara/marketplace test`, `pnpm --filter @vestara/api build`,
  `pnpm --filter @vestara/workspace-ui build` (tsc -b + vite build).
- API smoke: curl search/assets/categories/registries/installed/updates + install dry-run →
  awaiting-permission → approved install → updates → verify → uninstall → rescan.

## MK-1 — catalog seed and live verification (2026-08-05)

The local registry is seeded with approved fixture assets via
`scripts/marketplace-fixtures/seed.ts` (`pnpm marketplace:fixtures:seed`), which writes
valid `vestara-package.json` manifests with computed sha256 digests and runtime stubs that
export a real `VestaraExtension`. Three fixtures cover the category spread and the
permission gate:

| Fixture | Type | Permissions | Exercises |
| --- | --- | --- | --- |
| `vestara.analysis@1.2.0` | module | filesystem:read (automatic) | safe install |
| `vestara.git-helper@0.4.1` | plugin | process:execute (explicit) + filesystem:write (policy) | awaiting-permission gate |
| `vestara.review-standards@2.0.0` | standards-pack | none | metadata-only install |

Verified live against the running API:

- rescan → registry healthy, 3 assets, 3 categories; search finds `git-helper`.
- install dry-run → `planning` with the 2-permission plan.
- install without approval → `awaiting-permission` (never bypassed).
- approved install → `completed`, installed state `active`/`current`; updates empty.
- verify → `completed`; uninstall → `completed`; installed count back to 0.

Note: install must run against a freshly started API or after clearing
`.vestara/extensions/extensions.json`; a stale in-memory registry/install state from before
the fixtures existed surfaces a misleading `Runtime entrypoint did not export a
VestaraExtension` failure even though the package is valid.
- Biome on touched files; full `pnpm build` state documented (pre-existing failures
  unchanged and outside Marketplace scope).
