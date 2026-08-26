# Getting Started With Vestara

Vestara is an engineering workspace with a CLI, an HTTP and WebSocket API, and
a browser or desktop Workspace UI. This guide covers the shortest path from a
fresh checkout to an indexed repository.

## Prerequisites

- Node.js 22 or newer
- pnpm
- Git

The desktop shell additionally requires Rust, Cargo, and the Tauri system
dependencies for your operating system. See the [desktop guide](../apps/workspace/docs/DESKTOP.md).

## Install And Build

From the repository root:

```bash
pnpm install
bash build-order.sh
pnpm vestara doctor
```

Run the build before using compiled CLI commands. The CLI and API execute from
their generated `dist/` directories.

## Start The Workspace

Start the API and Workspace UI together:

```bash
pnpm dev
```

The API listens on `http://127.0.0.1:3001` by default and the Vite UI is
available at `http://127.0.0.1:5173`. The UI proxies API and WebSocket requests
to the API during development.

To use the keyboard-first Console in a second terminal:

```bash
pnpm console
```

### Serve The Built UI

To run the built Workspace UI from the API instead of the Vite development
server:

```bash
pnpm build
pnpm dev:api
```

Open `http://127.0.0.1:3001/`. This mode requires a completed Workspace build;
use `pnpm dev` when you need hot reload. The API keeps `/api` and `/ws`
available alongside browser routes.

Check the process and runtime separately when diagnosing startup problems:

```bash
curl http://127.0.0.1:3001/api/health/live
curl http://127.0.0.1:3001/api/health/ready
```

The live check should return `200` once the process accepts requests. The ready
check returns `200` when the workspace is ready and `503` while it is starting
or degraded.

## Open A Repository

Index the current repository with the CLI:

```bash
pnpm vestara open .
```

To open another repository, pass its path:

```bash
pnpm vestara open /path/to/repository
```

Vestara creates `.vestara/` in the selected workspace. The directory contains
the workspace manifest, indexed knowledge, preferences, plans, sessions, and
memory. Keep it out of version control unless you intentionally share that
workspace state.

## Common CLI Workflows

Inspect the workspace and its health:

```bash
pnpm vestara status
pnpm vestara doctor all
pnpm vestara context
```

Understand and plan a change:

```bash
pnpm vestara open .
pnpm vestara plan create "add a repository health report"
pnpm vestara plan list
```

Inspect provider routing without opening the UI:

```bash
pnpm vestara routing show
pnpm vestara routing catalog
pnpm vestara routing preview developer developer-01
```

Use `pnpm vestara --help` or the [CLI reference](CLI.md) for the complete
command list.

## Configure The API Endpoint

The browser UI uses the local API by default. Set `VESTARA_API_PORT` to change
the API port. Set `VESTARA_REPO` when the API should open a repository other
than the current working directory.

For the desktop client or a separately hosted UI, configure the API base URL in
**Settings > API Endpoint**, or provide `VITE_API_URL` at startup/build time:

```bash
VITE_API_URL=http://127.0.0.1:3001 \
  pnpm --filter @vestara/workspace-ui desktop:dev
```

Enter the API base URL without `/api`; the client adds that path to HTTP
requests and derives the WebSocket URL from the scheme.

Selecting **Apply endpoint** stores the value locally in the current client and
applies it to new requests. Reload the Workspace after applying it so existing
connections are recreated. Select **Clear** to remove the override and return
to same-origin browser behavior.

## Troubleshooting

- **The UI says disconnected:** confirm that the API is running on port 3001
  and that the UI is using the same endpoint.
- **The API opens the wrong repository:** set `VESTARA_REPO` explicitly or run
  the API from a directory containing `.vestara/workspace.json`.
- **Live updates do not arrive:** verify that WebSocket traffic is allowed and
  that `https` endpoints use a reachable `wss` connection.
- **CLI commands fail after source changes:** run `pnpm build` and retry; the
  compiled CLI resolves workspace packages from `dist/`.
- **Desktop builds fail:** install Rust and the platform-specific Tauri
  dependencies described in the [desktop guide](../apps/workspace/docs/DESKTOP.md).

## Next Steps

- [Configuration guide](CONFIGURATION.md)
- [CLI reference](CLI.md)
- [Workspace desktop guide](../apps/workspace/docs/DESKTOP.md)
- [Visual regression setup](../apps/workspace/tests/visual/docs/SETUP.md)
- [Documentation automation](DOCUMENTATION-AUTOMATION.md)
- [Capability specifications](capabilities/)
