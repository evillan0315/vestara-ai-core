# Vestara AI Core

> Engineering workspace runtime — CLI, HTTP + WebSocket API, and Workspace UI for repository comprehension, planning, implementation, verification, and multi-agent orchestration. Telegram is a first-class participation surface.

[![CI](https://github.com/evillan0315/vestara-ai-core/actions/workflows/ci.yml/badge.svg)](https://github.com/evillan0315/vestara-ai-core/actions/workflows/ci.yml)
[![Visual Regression](https://github.com/evillan0315/vestara-ai-core/actions/workflows/visual-regression.yml/badge.svg)](https://github.com/evillan0315/vestara-ai-core/actions/workflows/visual-regression.yml)
[![Node](https://img.shields.io/badge/node-22%2B-brightgreen)](https://nodejs.org)
[![pnpm](https://img.shields.io/badge/pnpm-12-orange)](https://pnpm.io)
[![TypeScript](https://img.shields.io/badge/typescript-5.9-blue)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/react-19-61dafb)](https://react.dev)
[![License](https://img.shields.io/badge/license-proprietary-red)](#license)

---

## Table of Contents

- [What Is Vestara?](#what-is-vestara)
- [Telegram — First-Class Participation Surface](#telegram--first-class-participation-surface)
- [Features](#features)
- [Quickstart](#quickstart)
- [Usage](#usage)
- [Configuration](#configuration)
- [Architecture & Monorepo Map](#architecture--monorepo-map)
- [API Reference](#api-reference)
- [Testing & Quality](#testing--quality)
- [UI/UX Governance](#uiux-governance)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [Code of Conduct](#code-of-conduct)
- [License](#license)

---

## What Is Vestara?

Vestara AI Core is a monorepo runtime for engineering workspaces. It indexes repositories, explains code, plans and implements changes, verifies outcomes, and orchestrates multi-agent workflows — exposed through three entry points:

| Entry point | Package | Description |
|-------------|---------|-------------|
| **CLI / Console** | `apps/cli` | `vestara` commands, `doctor` diagnostics, keyboard-first `console` (TUI) |
| **API gateway** | `apps/api` (`@vestara/api`) | HTTP + WebSocket gateway on `:3001` — routes in `src/routes/` |
| **Workspace UI** | `apps/workspace` (`@vestara/workspace-ui`, React 19 + Vite) | Browser/desktop UI on `:5173`, proxies `/api` + `/ws` to the API |

> [!NOTE]
> `apps/workspace` (the UI) and `packages/workspace` (the integration hub) share a name but are different packages. See [Architecture](#architecture--monorepo-map).

**Design principle:** Telegram, the browser, and the TUI are *participation surfaces* — they never own identity, permissions, or execution. All authority lives in the API + workspace services.

---

## Telegram — First-Class Participation Surface

Telegram is not a side integration. It is a governed interaction channel (`VES-TG-001`) with pairing, conversation/workspace binding, command routing, assistant question bridging, and Activity Room forwarding.

```
Telegram Bot API  →  POST /api/telegram/webhook  →  TelegramAdapter / WebhookHandler
                                                        →  Global Assistant text router
                                                        →  Workspace services (authority)
```

### What you can do from Telegram

- **Pair and bind** — `/pair` links your Telegram account; approve from the Workspace UI (restart-safe — pending requests survive API restarts via the persistent store).
- **Drive conversations** — `/new`, `/ask`, natural-language messages routed through the Global Assistant; assistant questions come back to Telegram with tap/text answers.
- **Inspect workspace** — `/status`, `/workspace list|info`, `/conversations`, `/help`.
- **Receive projections** — execution status, guard decisions, and Activity Room messages forwarded to the bound chat.
- **Approve pairing** — operator approve/reject flow via the pairing-interaction bridge.

### Telegram setup (5 minutes)

1. Talk to [@BotFather](https://t.me/BotFather), create a bot, copy the token.
2. Add to your `.env` (never commit it):

```bash
TELEGRAM_BOT_TOKEN=<bot-token-from-BotFather>
TELEGRAM_WEBHOOK_SECRET=<output-of-openssl-rand-hex-32>
# Optional tunnel (default ON, cloudflared): set to 0 to disable autostart
VESTARA_TELEGRAM_TUNNEL_AUTOSTART=1
# VESTARA_TELEGRAM_TUNNEL_PROVIDER=cloudflared  # or ngrok
```

3. Start the API and register the webhook:

```bash
pnpm build
pnpm dev:api
# Pair from Telegram: /pair → approve in Workspace UI → /status
```

4. Test without Telegram first:

```bash
curl -X POST http://127.0.0.1:3001/api/telegram/simulate \
  -H 'Content-Type: application/json' \
  -d '{"text": "/status"}'
```

### Telegram endpoints

| Method & Path | Purpose |
|---------------|---------|
| `POST /api/telegram/webhook` | Receive real bot updates (secret-verified) |
| `POST /api/telegram/simulate` | Simulate a message (testing, no bot needed) |
| `POST /api/telegram/pairing` | Create a pairing request |
| `POST /api/telegram/pairing/approve` | Approve pairing with token |
| `POST /api/telegram/enroll` | Bind an existing pairing |
| `GET /api/telegram/bindings` | List bindings (diagnostic) |
| `GET /api/telegram/chats` | Linked chats for the forward picker |
| `POST /api/telegram/forward` | Forward an Activity Room message to Telegram |
| `GET /api/telegram/status` | Integration status |

Implementation: `packages/telegram-integration/src/` (adapter, pairing, commands, bindings, question-projection, webhook, tunnel) + `apps/api/src/routes/telegram.ts` + `apps/api/src/bridges/telegram-pairing-interaction-bridge.ts` + `apps/api/src/telegram-question-bridge.ts`. Spec: `docs/blueprint/VES-TG-001-telegram-integration.md`.

---

## Features

- **Repository comprehension** — indexing, knowledge graph, explain, health scoring (v0.3.x)
- **Plan → Implement → Verify** — governed pipeline with benchmarks (v0.4–v0.6)
- **Multi-agent orchestration** — `WorkflowOrchestrator` as single writer of project/plan/task state, durable harness, Cytoscape workflow graph in the UI (v5.4, PCS-025 Phases 1–3)
- **Activity Room** — operational projection surface with timeline, date-range reports (`AR-REPORT`), forwarding, and streaming
- **Telegram participation** — pairing, commands, question bridging, projections ([details](#telegram--first-class-participation-surface))
- **Marketplace** — catalog, local/remote registries, publishing, signatures, operation center (v2.5–v2.8)
- **Conversational onboarding** — guided first-run experience (v4.0)
- **Provider platform** — 200+ provider catalog with OpenCode adapter (`/api/opencode/*` boundary, `/api/providers` compat)
- **OS integration** — Plymouth/GRUB boot theme, systemd units, image builder (`os/`, `VOS-BOOT-001`)
- **Quality infrastructure** — benchmarks, visual regression (Playwright), docs governance gates

Full version history: [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) · [`docs/CHANGELOG.md`](docs/CHANGELOG.md) · [`docs/MILESTONES.md`](docs/MILESTONES.md)

---

## Quickstart

### Prerequisites

- **Node.js 22+** (CI pins Node 22)
- **pnpm** (v12)
- **Git**
- Desktop shell only: Rust, Cargo, Tauri system dependencies ([desktop guide](apps/workspace/docs/DESKTOP.md))

### Install, build, verify

```bash
git clone https://github.com/evillan0315/vestara-ai-core.git
cd vestara-ai-core
pnpm install
bash build-order.sh            # alias: pnpm build — generates refs + tsc -b
pnpm vestara doctor            # compiled CLI health check (requires build first)
```

> [!IMPORTANT]
> Always **build before** `pnpm test` or any `pnpm vestara` / `pnpm dev:api` command. Tests resolve `@vestara/*` from `dist/` via `vitest.config.ts` aliases; stale `dist/` causes misleading failures.

### Run it

```bash
pnpm dev                       # API on :3001 + UI on :5173 (Vite proxies /api + /ws)
```

| Service | URL | Notes |
|---------|-----|-------|
| API | `http://127.0.0.1:3001` | `GET /api/health/live` → 200 when accepting; `/api/health/ready` → 200 ready / 503 starting |
| UI | `http://127.0.0.1:5173` | Dev hot reload |
| Built UI via API | `http://127.0.0.1:3001/` | Requires Workspace build; use `pnpm dev` for hot reload |

```bash
pnpm console                   # keyboard-first Console (second terminal)
pnpm dev:api                   # API only (loads .env)
pnpm --filter @vestara/workspace-ui dev   # UI only
```

---

## Usage

### CLI

```bash
pnpm vestara doctor            # environment + workspace diagnostics
pnpm vestara --help            # all commands
pnpm console                   # interactive TUI console
node apps/cli/dist/index.js docs baseline --output docs/documentation-baseline.json --json
```

### Common workflows

```bash
# Contribute: lint → build → test (verification order)
pnpm lint:check && pnpm build && pnpm test

# Single package / single file
pnpm --filter @vestara/<pkg> test
pnpm test -- packages/foo/__tests__/thing.test.ts

# Fast pre-pass (excludes docs, e2e, repo-intelligence suites)
pnpm test:fast

# Visual regression (Playwright, Chromium)
pnpm screenshots:ci            # check
pnpm screenshots:update        # approve new baselines

# Benchmarks
pnpm benchmark
```

### Services (systemd)

```bash
pnpm services:start            # start opencode + vestara-api
pnpm services:status
pnpm services:stop              # stop before full test runs (live API mutates repo state)
```

---

## Configuration

`.env` is gitignored and holds credentials for live trials — **never commit it**. Both `pnpm dev` and `pnpm dev:api` load it via `--env-file=.env`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token (required for Telegram) |
| `TELEGRAM_WEBHOOK_SECRET` | — | Webhook verification secret |
| `VESTARA_TELEGRAM_TUNNEL_AUTOSTART` | on | `0`/`false` to disable tunnel autostart |
| `VESTARA_TELEGRAM_TUNNEL_PROVIDER` | `cloudflared` | `cloudflared` or `ngrok` |
| `VESTARA_TELEGRAM_TUNNEL_COMMAND` / `VESTARA_TELEGRAM_TUNNEL_ARGS` | — | Custom tunnel override |
| `VESTARA_API_PORT` | `3001` | API listen port |
| `VESTARA_REPO` | auto-detect | Workspace path (else walks up for `.vestara/workspace.json`) |
| `VITE_API_URL` | — | Build-time UI base URL (code appends `/api`) |
| `VESTARA_BROWSER_DRIVER` | `playwright` | `playwright` or `agent-browser` |
| `VESTARA_AGENT_BROWSER_EXECUTABLE_PATH` | — | Chromium executable for agent-browser driver |

See [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) and [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md).

---

## Architecture & Monorepo Map

```
vestara-ai-core/
├── apps/
│   ├── api/            @vestara/api — HTTP+WS gateway (src/index.ts, src/routes/)
│   ├── cli/            CLI + REPL + Console (console/ = TUI, not a separate app)
│   ├── workspace/      @vestara/workspace-ui — React 19 + Vite UI (≠ packages/workspace)
│   └── onboarding-lab/ dev test rig (not a runtime entrypoint)
├── packages/
│   ├── kernel/         lifecycle + provider coordination
│   ├── workspace/      integration hub (NOT the UI)
│   ├── telegram-integration/  VES-TG-001 — adapter, pairing, commands, webhook, tunnel
│   ├── activity-room/  activity projection + range-query store
│   ├── workflow-orchestrator/  durable multi-agent execution
│   ├── conversation-runtime/   conversations, questions, audit
│   ├── providers/* tools/*     provider adapters + tool packages
│   └── ui/, ui-tokens/, design-system/    Vestara design tokens + components
├── os/                 OS-0 host integration (systemd, Plymouth, image builder — not a workspace package)
└── docs/               contracts, specs, milestones, governance
```

**Boundaries** (enforced by `scripts/workspace-architecture.mjs`):

- Packages must not depend on `apps/*`; only `@vestara/evaluation` may depend on `@vestara/workspace`
- Import only `@vestara/<pkg>` (no deep imports), every internal dep declared in `package.json`, no cycles

**Integration boundaries:**

```
OpenCode :4096 → Vestara OpenCode adapter → /api/opencode/*   (OpenCode boundary)
/api/providers                                                (provider-platform boundary)
```

Catalog ≠ Configured ≠ Enabled ≠ Selected. Settings configures. Assistant selects. Runtime executes.

Agent instructions for contributors and AI agents live in [`AGENTS.md`](AGENTS.md) (setup, guardrails, CI, governance). UI work additionally follows [`docs/governance/UI-UX-GOVERNANCE.md`](docs/governance/UI-UX-GOVERNANCE.md).

---

## API Reference

Selected routes (full catalog in `apps/api/src/routes/`):

| Area | Examples |
|------|----------|
| Health | `GET /api/health/live`, `GET /api/health/ready` |
| Telegram | See [Telegram endpoints](#telegram-endpoints) |
| Conversations | `POST /api/conversations/:id/questions/:requestId`, permissions routes |
| Workflow | `orchestration`, `workflow`, `workers`, `agents` routes |
| Activity Room | `activity-room*.ts` routes + WebSocket `/ws` |
| Providers | `/api/providers` (compat), `/api/opencode/*` (OpenCode boundary) |
| Docs | `node apps/cli/dist/index.js docs check --baseline docs/documentation-baseline.json` |

OpenCode contract sources are generated (`packages/opencode-runtime/src/generated/`, gitignored) — refresh with `pnpm --filter @vestara/opencode-runtime opencode:spec:update`, never hand-edit.

---

## Testing & Quality

```bash
pnpm lint:check                # Biome, read-only (1478 files)
pnpm lint                      # Biome, write (mutates files)
pnpm build                     # regenerates tsconfig refs (gitignored — never hand-edit)
pnpm dependencies:check        # monorepo boundary enforcement
pnpm check:source-artifacts    # no stray .js/.d.ts under src/ or __tests__/
pnpm agents:sync / pnpm agents:check   # agent registry (single source: packages/workspace/src/agents.registry.ts)
pnpm test                      # full suite (vitest; pretest rebuilds dist/)
pnpm test:fast                 # CI pre-pass
```

Testing notes:

- Test timeout is 15s; slow tests need investigation, not timeout bumps
- Constrained boxes (≤4 cores / <8GB): `pnpm test -- --maxWorkers=2`
- Stop dev services before full runs — a live API mutates the repo (docs frontmatter, activity DBs) and perturbs baseline tests
- DB tests use in-memory `sql.js`; Playwright owns `apps/workspace/tests/visual/**/*.spec.*` (vitest excludes them)

CI ([`ci.yml`](.github/workflows/ci.yml)): `install --frozen-lockfile` → `dependencies:check` → OpenCode contract guard → build → `lint:check` → `test:fast` → `test` → `documentation:check` → `docs:govern` (strict) → benchmarks. Desktop shell builds in a separate job; visual regression in its own workflow.

---

## UI/UX Governance

Strict for any UI change — violation is a **BLOCKER**:

1. Every visual value from `packages/ui-tokens/src/tokens.ts` → `var(--vestara-*)`; validate with `pnpm vds:validate`
2. Tailwind v4 is the renderer, tokens are the authority — no `#hex`, no `bg-[#...]`, no inline-style literals; create a `--vestara-{category}-{name}` token first if missing
3. MUI v9 optional for complicated UI only (verify current API via official migration docs — `slots`/`slotProps`, not `components`)
4. Data: API first → mock server `:3002` → local `*.fixtures.ts` — never hardcode arrays in JSX

Contract: [`docs/governance/UI-UX-GOVERNANCE.md`](docs/governance/UI-UX-GOVERNANCE.md).

---

## Documentation

- Start: [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md)
- Status: [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) · [`docs/MILESTONES.md`](docs/MILESTONES.md) · [`docs/CHANGELOG.md`](docs/CHANGELOG.md)
- CLI: [`docs/CLI.md`](docs/CLI.md) · Config: [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md)
- Telegram spec: [`docs/blueprint/VES-TG-001-telegram-integration.md`](docs/blueprint/VES-TG-001-telegram-integration.md)
- Governance: [`docs/governance/`](docs/governance/)

```bash
pnpm docs:validate / pnpm docs:govern   # strict frontmatter + links + evidence
pnpm documentation:check                # CI baseline drift gate
```

> [!NOTE]
> After editing this README, refresh the docs baseline (`docs check --baseline …`) if `documentation:check` drifts — the baseline pins README route references.

---

## Roadmap

- `AR-REPORT` — Activity date-range reports (in progress; verification phase remains)
- `VOS-BOOT-001` — Unified boot experience (in progress; readiness projection + QEMU validation remain)
- `VOS-STARTUP-001` — Post-onboarding / login-success startup screen (planned)
- Workflow graph projection hardening + verification
- Marketplace remote registries expansion

See [`docs/MILESTONES.md`](docs/MILESTONES.md) for the full milestone ledger.

---

## Contributing

We welcome issues and pull requests. Start here:

1. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`AGENTS.md`](AGENTS.md)
2. `pnpm install && bash build-order.sh`
3. Keep mutations narrow — investigate broadly, change only what the task authorizes
4. Verify: `pnpm lint:check && pnpm build && pnpm test`
5. Respect UI/UX governance on any pixel-rendering change

Pre-commit hook is opt-in (`git config core.hooksPath .githooks`) — note it runs the full suite and is slow.

---

## Security

See [`SECURITY.md`](SECURITY.md). Do **not** open public issues for vulnerabilities — email the maintainers directly. Only the latest release receives security patches.

---

## Code of Conduct

Participation follows our [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — be respectful and inclusive. Violations can be reported to the maintainers.

---

## License

Proprietary — see repository licensing terms. If a `LICENSE` file is added, its terms supersede this notice.
