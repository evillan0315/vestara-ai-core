# Vestara AI Core

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AI-native engineering platform — runtime kernel and product services.

## Quick start

```bash
pnpm install
bash build-order.sh
pnpm vestara doctor
```

See [docs/](docs/) for capability specifications, UX specs, architecture docs,
and milestone tracking.

## Workspace

| Directory | Role |
|-----------|------|
| `apps/api/` | HTTP+WS gateway for Workspace UI |
| `apps/cli/` | CLI and REPL entry point |
| `apps/workspace/` | React 19 + Vite UI shell |
| `packages/*` | Runtime libraries (pnpm workspaces) |
| `docs/` | PCS, UX, ATS, milestones, decisions |