# Monorepo Build Matrix

Installable Marketplace asset that builds **every app and package** in the
`vestara-ai-core` monorepo in dependency order.

- **Targets:** 5 apps (`apps/`) + 118 packages, providers, and tools
  (`packages/`, `packages/providers/*`, `packages/tools/*`) — 123 total.
- **Target matrix:** `monorepo-build-matrix.workflow.json` (`.targets[]`)
- **Runner:** `monorepo-build-matrix.sh`
- **Orchestration template:** `monorepo-build-matrix` (served by
  `GET /api/orchestration/templates`, backed by
  `workflows/monorepo-build-matrix.workflow.json` in the repo checkout)

## Use

From a repo checkout:

```bash
bash packages/monorepo-build-matrix/monorepo-build-matrix.sh --list
bash packages/monorepo-build-matrix/monorepo-build-matrix.sh --dry-run
bash packages/monorepo-build-matrix/monorepo-build-matrix.sh --build
bash packages/monorepo-build-matrix/monorepo-build-matrix.sh --verify
```

From an installed copy (any path), point back at the checkout:

```bash
VESTARA_REPO=/path/to/vestara-ai-core bash monorepo-build-matrix.sh --build
```

Or start the governed project template (`monorepo-build-matrix`) from the
Orchestration surface — it plans the same matrix as reviewable task waves.

## Stages

1. `pnpm install --frozen-lockfile`
2. `pnpm build:references` (regenerate TypeScript project references)
3. Topological `pnpm -r run build`, plus `@vestara/workspace-ui` separately
   (excluded from the monorepo build by `scripts/workspace-architecture.mjs`)
4. `pnpm dependencies:check` + `pnpm check:source-artifacts`
5. `pnpm lint:check`
