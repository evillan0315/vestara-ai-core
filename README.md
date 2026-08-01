# Vestara AI Core

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-native engineering platform — runtime kernel and product services.

## Quick start

```bash
pnpm install
bash build-order.sh
pnpm vestara doctor
```

Start the API and Workspace UI, then open the keyboard-first engineering
Console in another terminal:

```bash
pnpm dev
pnpm console
```

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

See [docs/](docs/) for capability specifications, UX specs, architecture docs,
and milestone tracking.

## Workspace

| Directory | Role |
|-----------|------|
| `apps/api/` | HTTP+WS gateway for Workspace UI |
| `apps/cli/` | CLI and REPL entry point |
| `apps/console/` | Ink-based engineering Console over the shared API/runtime |
| `apps/workspace/` | React 19 + Vite UI shell |
| `packages/*` | Runtime libraries (pnpm workspaces) |
| `docs/` | PCS, UX, ATS, milestones, decisions |
