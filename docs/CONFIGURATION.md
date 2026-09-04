---
title: Configuration Guide
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Configuration Guide

Vestara has two connections to configure: the API process and the client that
connects to it. Use environment variables for the API process, and use the
Workspace client's API endpoint setting when a browser or desktop client must
connect to a different host.

## API Process

The API listens on `127.0.0.1:3001` by default:

```bash
pnpm dev:api
```

Set `VESTARA_API_PORT` to use another port:

```bash
VESTARA_API_PORT=4100 pnpm dev:api
```

Set `VESTARA_REPO` when the API should use a repository other than its current
working directory:

```bash
VESTARA_REPO=/path/to/repository pnpm dev:api
```

If `VESTARA_REPO` is not set, the API searches the current directory and its
parents for `.vestara/workspace.json` before falling back to the current
directory.

## Workspace Clients

### Browser development

Run `pnpm dev` from the repository root. The Vite server serves the UI at
`http://127.0.0.1:5173` and proxies `/api` and `/ws` to the API at port 3001.

### Browser deployment

Build the UI and let the API serve it from the same origin:

```bash
pnpm build
pnpm dev:api
```

Open `http://127.0.0.1:3001/`. The API serves static assets, falls back to the
Workspace entry point for client-side routes, and keeps `/api` and `/ws`
available for runtime requests.

### Desktop or remote API

For a desktop client, set `VITE_API_URL` to the API base URL without `/api`:

```bash
VITE_API_URL=https://vestara-api.example.test \
  pnpm --filter @vestara/workspace-ui desktop:dev
```

You can also change the endpoint after launch under **Settings > API Endpoint**.
The value is stored locally on that client. `https` endpoints use `wss` for
WebSocket traffic; `http` endpoints use `ws`.

Do not append `/api` to the configured endpoint. The client adds that path to
HTTP requests and derives the WebSocket path automatically. The API host must
allow both HTTP and WebSocket connections from the desktop machine.

## Quick Reference

| Setting | Default | Used by |
|---------|---------|---------|
| `VESTARA_API_PORT` | `3001` | API listener |
| `VESTARA_REPO` | Current repository | API workspace selection |
| `VITE_API_URL` | Same origin | Workspace build and desktop development |

For the complete startup flow, see [Getting started](GETTING_STARTED.md). For
Tauri prerequisites and packaging, see the [Workspace desktop guide](../apps/workspace/docs/DESKTOP.md).
