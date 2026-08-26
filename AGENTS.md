# Vestara AI Core — Agent Instructions

## Setup & Build (run from this directory)

```bash
pnpm install
bash build-order.sh            # alias: pnpm build → pnpm build:references → generate refs + tsc -b
pnpm vestara doctor            # compiled CLI (requires build first)
```

- Node 22+ and pnpm required (CI pins Node 22).
- Build **before** `pnpm test` or any `pnpm vestara` / `pnpm dev:api` command — tests resolve `@vestara/*` from `dist/` via aliases in `vitest.config.ts:8-23` and CLI/API run from `dist/`. Stale `dist/` causes misleading failures.
- `pnpm build` regenerates `tsconfig.reference.json` per project + `tsconfig.references.json` root. Never hand-edit them; run `pnpm dependencies:check` to validate.
- `pnpm clean` / `tsc -b --clean` to wipe build. `pnpm watch` for `tsc -b -w`.

## Monorepo Boundaries

- `apps/api` (`@vestara/api`) — HTTP+WS gateway, `src/index.ts` + `src/routes/`. `apps/cli` — CLI/REPL entrypoint. `apps/workspace` (`@vestara/workspace-ui`, React 19 + Vite) **≠** `packages/workspace` (`@vestara/workspace`, integration hub) — different packages sharing the name.
- `apps/console` is an empty stub; the Console is `pnpm console` → `node apps/cli/dist/index.js console`.
- `apps/onboarding-lab` is a dev test rig, not a runtime entrypoint.
- `packages/*` + `packages/providers/*` + `packages/tools/*` are runtime libraries. `packages/kernel` coordinates lifecycle/providers.
- Import only `@vestara/<pkg>` (no deep imports like `@vestara/foo/bar`) and declare every internal dep in `package.json` — enforced by `scripts/workspace-architecture.mjs`.

## Key Commands

| Task | Command |
|------|---------|
| Lint (read-only) | `pnpm lint:check` (`biome check --diagnostic-level=error`) |
| Lint fix | `pnpm lint` (`biome check --write`, mutates files) |
| All tests | `pnpm test` (`vitest run`) |
| Single package | `pnpm --filter @vestara/<pkg> test` |
| Single file | `pnpm test -- packages/foo/__tests__/thing.test.ts` |
| Dependency boundaries | `pnpm dependencies:check` |
| Source artifacts | `pnpm check:source-artifacts` |
| Agent sync/check | `pnpm agents:sync` / `pnpm agents:check` |
| Dev (API+UI) | `pnpm dev` (API in background on 3001, UI on 5173; kills API when UI exits) |
| API only | `pnpm dev:api` (`node apps/api/dist/index.js`) |
| UI only | `pnpm --filter @vestara/workspace-ui dev` |
| Visual regression | `pnpm screenshots:ci` (check) / `pnpm screenshots:update` (approve baselines) |
| OpenCode contracts | `pnpm --filter @vestara/opencode-runtime opencode:spec:generate` |

Verification order recommended: `pnpm lint:check && pnpm build && pnpm test` (no `typecheck` script).

## Testing Quirks

- `vitest.config.ts:30-35` discovers `packages/*/__tests__/**`, `packages/{providers,tools}/*/__tests__/**`, `apps/*/__tests__/**`, `apps/workspace/tests/visual/__tests__/**`. Playwright owns `apps/workspace/tests/visual/**/*.spec.*` — vitest excludes them.
- Aliases resolve `@vestara/*` → `packages/*/dist` — rebuild after source changes.
- `pnpm test:e2e:workflow` is a vitest suite (`packages/workflow-orchestrator/__tests__/e2e`). `pnpm test:e2e:workflow:real-agent` (`scripts/wfo-e2e-002b-live.ts`) hits real LLMs via `.env` — not part of `pnpm test`, don't run casually.
- DB tests use in-memory `sql.js`; shim is `types/sql-js.d.ts`.
- Biome ignores `apps/workspace`, `packages/evaluation/fixtures`, `packages/opencode-runtime/{openapi,src/generated}` (`biome.json:8-14`).

## Guardrails to Not Break

- **Boundaries** (`scripts/workspace-architecture.mjs`): packages must not depend on `apps/*`; packages must not depend on `@vestara/workspace` (except `@vestara/evaluation`); no deep internal imports; no undeclared internal deps; no dependency cycles.
- **Source artifacts** (`.gitignore:7-8`, `scripts/check-source-artifacts.mjs`): `*.js`/`*.d.ts`/`*.js.map` are ignored but a stale `src/index.js` shadows `src/index.ts` in vitest — run `pnpm check:source-artifacts` and delete strays.
- **Agents** (`packages/workspace/src/agents.registry.ts` is single source of truth): canonical agents are `vestara-context|planner|developer|reviewer|verifier`. Rendered to `.opencode/agents/*.md` via `scripts/agents-sync.mjs`. Never hand-edit `.opencode/agents/*.md` or add an `agent` block to `opencode.json` — use `pnpm agents:sync` / `pnpm agents:check`.
- **Docs governance**: `pnpm docs:validate` / `pnpm docs:govern` (strict), `pnpm documentation:check` (CI). Don't add instruction files better stored via `opencode.json` `instructions`.

## CI (`/.github/workflows/ci.yml`)

`install --frozen-lockfile` → `dependencies:check` → OpenCode contract guard (`opencode:spec:generate` + diff-check) → `bash build-order.sh` → `lint:check` → `test` → `documentation:check` → `benchmark`. `visual-regression.yml` is separate (Chromium + `pnpm screenshots:ci`).

## Runtime Env

- API: `http://127.0.0.1:3001`, UI: `http://127.0.0.1:5173` (Vite proxies `/api`+`/ws` → API, `apps/workspace/vite.config.ts:10-20`).
- `VESTARA_API_PORT` (API listen), `VESTARA_REPO` (workspace path; otherwise walks up for `.vestara/workspace.json`), `VITE_API_URL` (desktop/remote UI base URL, no trailing `/api`).
- Parent `../vite.config.ts` is stale (probes 3000) — ignore. `.env` is gitignored and holds credentials for live agent trials; never commit it.
- Never edit `.vestara/` runtime state. Pre-commit hook (`.githooks/pre-commit` → `scripts/pre-commit.sh` → `biome --staged` + `pnpm test`) is not enabled via `core.hooksPath` in this checkout.

## Style

Biome: single quotes, trailing commas, semicolons, 2-space indent, 120 width. Local imports need `.js` extension (nodenext). Parameterized SQL only.
