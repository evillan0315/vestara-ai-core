# Developer Guide

## Adding a page

Add the route to `src/routes.ts` (single source of truth). The framework
automatically discovers it:

```ts
{ id: 'billing', path: '/billing', title: 'Billing', requiresAuth: true, enabled: true, layout: 'shell' },
```

Register the lazy page in `src/App.tsx` `PAGES` map. Done — the page is now
covered by every viewport × theme combination.

Dynamic routes use `sampleParams`:

```ts
{
  id: 'user-detail',
  path: '/users/:id',
  title: 'User Detail',
  requiresAuth: true,
  enabled: true,
  layout: 'shell',
  sampleParams: { id: 'user-sample' },
},
```

## Route policy

- `enabled: false` — excluded from captures (redirects, catch-alls).
- Hidden/admin/dev exclusions live in `routes/discovery.ts`
  (`HIDDEN_ROUTES`, `ADMIN_ROUTES`, `DEV_ROUTES`).

## Masking dynamic content

Add route-specific masks in `helpers/masks.ts` `ROUTE_MASKS`:

```ts
ROUTE_MASKS = {
  dashboard: [{ selector: '.recharts-wrapper' }, { selector: '[data-live]' }],
};
```

Global defaults in `DEFAULT_MASKS` apply everywhere.

## Viewports & themes

Edit `config.ts` `VIEWPORT_GROUPS` and `THEMES`. New themes are picked up
automatically by `ThemeRunner`.

## Roles / authentication

`auth/roles.ts` defines roles; each gets a storage-state file with the actor
identity in `localStorage`. Authenticated routes render with that identity
with no per-run login.

## Extending the pipeline

Modules are composable and dependency-injected:

- Add a runner (e.g. cross-browser) implementing `open(capability)`.
- Add a post-capture stage (OCR, PDF) by wrapping `PageScreenshotRunner.capture`.
- Add a comparison backend by implementing the `compare()` contract.

## Running checks

```bash
pnpm --filter @vestara/workspace-ui screenshots:check   # typecheck framework
pnpm --filter @vestara/workspace-ui test                # UI + visual-framework unit tests
pnpm --filter @vestara/workspace-ui screenshots         # Playwright visual specification
```

From a built repository, the equivalent governed CLI entry points are:

```bash
pnpm vestara screenshots check
pnpm vestara screenshots run --routes dashboard --theme dark
pnpm vestara screenshots update --routes dashboard
```

When adding CLI controls, extend the allowlist and validation in
`apps/cli/src/commands/screenshots.ts`; do not pass arbitrary arguments through
to a shell. Keep deterministic capture behavior in this visual package so both
pnpm and CLI consumers execute the same implementation.

Vitest excludes only `tests/visual/visual.spec.ts`, because that file invokes
the Playwright test API. Tests under `tests/visual/__tests__/` remain owned by
Vitest.
