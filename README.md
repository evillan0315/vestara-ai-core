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
pnpm vestara screenshots check
pnpm vestara screenshots run --viewport desktop --theme dark
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

## Workspace

| Directory | Role |
|-----------|------|
| `apps/api/` | HTTP+WS gateway for Workspace UI |
| `apps/cli/` | CLI and REPL entry point |
| `apps/console/` | Ink-based engineering Console over the shared API/runtime |
| `apps/workspace/` | React 19 + Vite UI shell |
| `packages/*` | Runtime libraries (pnpm workspaces) |
| `docs/` | PCS, UX, ATS, milestones, decisions |
