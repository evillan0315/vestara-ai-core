# Vestara AI Core

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-native engineering platform — runtime kernel and product services.

## Quick start

```bash
pnpm install
bash build-order.sh
pnpm vestara doctor
```

For browser development with hot reload, start the API and Workspace UI
together:

```bash
pnpm dev
pnpm console
```

The API listens on `http://127.0.0.1:3001` and the Vite UI on
`http://127.0.0.1:5173`. The UI proxies `/api` and `/ws` to the API.

For a standalone desktop client, start the API separately and run the Tauri
shell:

```bash
pnpm build
pnpm dev:api
pnpm --filter @vestara/workspace-ui desktop:dev
```

See the [Workspace desktop guide](apps/workspace/docs/DESKTOP.md) for platform
dependencies, remote API endpoints, and production bundles.

To serve the built Workspace UI from the API for a browser deployment:

```bash
pnpm build
pnpm dev:api
```

Open `http://127.0.0.1:3001/`. The API serves the UI build for browser routes
and keeps `/api` and `/ws` available for runtime requests. This requires the
Workspace build to exist; use `pnpm dev` for hot reload during development.

Inspect effective engineering routing without entering the Console:

```bash
pnpm vestara routing show
pnpm vestara routing catalog
pnpm vestara routing preview developer developer-01
```

Run governed Workspace UI visual regression checks through the compiled CLI:

```bash
pnpm --filter @vestara/workspace-ui screenshots:check
pnpm --filter @vestara/workspace-ui screenshots:desktop
```

Screenshot comparison is the default. Updating approved baselines requires the
explicit `screenshots update` action. See the [CLI reference](apps/cli/CLI.md) and
[visual automation setup guide](apps/workspace/tests/visual/docs/SETUP.md).

See the [getting started guide](docs/GETTING_STARTED.md) for setup and common
workflows, then the [documentation index](docs/README.md) for capability
specifications, UX specs, architecture docs, and milestone tracking.

For API ports, repository selection, browser deployment, and remote desktop
connections, see the [configuration guide](docs/CONFIGURATION.md).

For deployment choices, endpoint configuration, and troubleshooting, see the
[getting started guide](docs/GETTING_STARTED.md).

Generate the package API reference and dependency catalog with
`pnpm generate-docs`; the generated site is written to `docs/api/`.

## Testing

```bash
pnpm test                    # run all vitest suites
pnpm --filter @vestara/<pkg> test   # single package
pnpm test -- packages/foo/__tests__/thing.test.ts  # single file
pnpm lint:check              # Biome lint (read-only)
pnpm benchmark               # pipeline timing benchmarks
```

Tests resolve `@vestara/*` from `dist/` — always run `pnpm build` before
`pnpm test` after source changes. See [AGENTS.md](AGENTS.md) for testing
quirks and guardrails.

## Environment variables

| Variable | Default | Used by |
|----------|---------|---------|
| `VESTARA_API_PORT` | `3001` | API listener port |
| `VESTARA_REPO` | Current repository | API workspace selection |
| `VITE_API_URL` | Same origin | Workspace build and desktop development |

`pnpm dev:api` loads `.env` automatically; `pnpm dev` does not. The `.env`
file is gitignored and holds credentials for live agent trials — never commit
it.

See the [configuration guide](docs/CONFIGURATION.md) for the full reference.

## Workspace

| Directory | Role |
|-----------|------|
| `apps/api/` | HTTP+WS gateway for Workspace UI |
| `apps/cli/` | CLI and REPL entry point |
| `apps/console/` | Ink-based engineering Console over the shared API/runtime |
| `apps/workspace/` | React 19 + Vite UI shell |
| `packages/*` | Runtime libraries (pnpm workspaces) |
| `packages/providers/*` | Provider integrations (e.g. OpenCode) |
| `packages/tools/*` | Built-in tools (browser, filesystem, git, shell, etc.) |
| `os/` | OS-0 host integration (systemd, Plymouth, image builder) |
| `docs/` | PCS, UX, ATS, milestones, decisions |

## Current work — Global Assistant runtime (GA-RUNTIME-001 + GA-UI-008)

In-progress Global Assistant hardening around server-authoritative execution
and premium workspace UX.

### Provider/model configuration convergence (GA-PROVIDER-001)

OpenCode `/config` and `/config/providers` provide the authoritative
configured/effective provider-model projection. Vestara exposes these through
`/api/opencode/config` and `/api/opencode/config/providers` (API keys stripped
before reaching the browser).

- OpenCode config endpoints wired in `apps/api/src/routes/opencode.ts`.
- Typed client methods in `packages/opencode-runtime/src/client/opencode-http-client.ts`.
- Type definitions in `packages/opencode-runtime/src/client/opencode-types.ts`.
- `/api/providers` remains backward-compatible (213 providers / 7,602 models).
- Configured providers: 3, configured models: 145 (observed runtime counts).

### Execution lifecycle semantics (GA-DETACH-001)

SSE disconnect no longer cancels execution. The OpenCode session continues
server-side for later reattachment. Only explicit Stop/Cancel terminates.

- `TurnTermination` type tracks how a turn ended: completed, failed, timeout,
  cancelled, detached.
- `requiresAbort()` determines whether the OpenCode session should be aborted.
- Deadline-aware event wait prevents indefinite blocking when the stream is
  open but idle.
- Catalog and marketplace route handlers claim only their own paths to prevent
  swallowing unrelated requests.

### Conversation persistence fix (2026-09-11)

Fixed userId mismatch between conversation creation and listing. Conversations
were created with `userId = 'local'` but listed with `userId = 'workspace-ui'`,
causing the conversation list to appear empty after API restart.

- **Root cause**: `POST /api/conversations` defaulted `userId` to `'local'`;
  `GET /api/conversations` defaulted to `ACTOR = 'workspace-ui'`. SQL query
  filters `WHERE user_id = ?`, so conversations created with 'local' were
  invisible when listing with 'workspace-ui'.
- **Fix**: Changed `apps/api/src/routes/conversations.ts` to default creation
  userId to `ACTOR` instead of `'local'`.

### Server-authoritative execution (GA-RUNTIME-001)

- Server-authoritative provider/model binding (`assistant-binding-resolver`) —
  browser selections validate against OpenCode runtime discovery, fail-closed
  with deterministic `400`, never silently fall back.
- Conversation → OpenCode session continuity registry with single-flight
  mapping; `runtimeSessionId` persisted on the conversation store.
- Interactive permission/question broker (`assistant-interaction-broker`) —
  `POST /api/conversations/:id/permissions/:permissionId` and
  `POST /api/conversations/:id/questions/:requestId`, preserving OpenCode
  native response semantics. Routes matched before the messages/stream guard
  to avoid 404 on browser Allow buttons.
- Vestara-owned capability boundary (`assistant-capability-policy`, GA-CAP-003);
  assistant grant tightened to `edit: ask`, `bash: ask`.
- Execution projection for `question.v2.asked/replied`.

### Workspace UI (GA-UI-008)

- **LauncherDock** — recent-conversations dock anchored to the floating launcher
  orb; revealed on hover while the panel is closed; selecting a conversation
  opens the assistant on it.
- **Premium launcher** — gradient orb with halo glow, online presence dot,
  hover tooltip showing `Ctrl+J` shortcut.
- **Keyboard shortcut** — `Ctrl+J` / `⌘+J` toggles the assistant from
  anywhere (ignored while typing in inputs); `Escape` closes the dock first.
- **Premium motion** — message entry, thinking dots, and dock reveal animations
  with `prefers-reduced-motion` support.
- **UI components**: `ProviderModelSelector`, `ConversationPanel`
  permission/question cards, `FloatingPanel`, `ConversationHistory`,
  `AssistantToolCard`, `AssistantTodoChecklist`, `AssistantCodeEdit`,
  `AssistantFilesSummary`, `AssistantResponseActions`.
- **Activity Room** — M11C activity stream, participant rail, context panel,
  with premium dark-luxury design language.
- **Coverage**: `assistant-capability-policy`, `ga-runtime-001`,
  `ga-ui-008`, `surface-context-transport`.

### Next known work

- **GA-UX-001**: Explicit conversation message loading state —
  empty/loading/loaded/error distinction, contextual suggestion/recommendation
  contract, presentation must not own recommendation intelligence.
- **PERF-001B+**: Bounded message loading/windowing — separate future work
  from UX state management.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, coding conventions, and
pull request guidelines.
