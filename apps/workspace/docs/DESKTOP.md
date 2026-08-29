# Vestara Workspace Desktop

Vestara Workspace is available as a Tauri desktop application. The desktop
client is a shell around the Workspace UI; the Vestara API still runs as a
separate process.

## Prerequisites

- Node.js 22 or newer
- pnpm
- Rust and Cargo with the stable toolchain
- Tauri system dependencies for your operating system

On Ubuntu or Debian, install the dependencies used by CI:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev pkg-config patchelf
```

## Development

Build the API and workspace packages first, then start the API:

```bash
pnpm install
pnpm build
pnpm dev:api
```

In a second terminal, start the desktop shell:

```bash
pnpm --filter @vestara/workspace-ui desktop:dev
```

The development shell connects to `http://127.0.0.1:3001` by default. The API
port can be changed with `VESTARA_API_PORT`; set `VITE_API_URL` when starting
the desktop command if the API is on another host:

```bash
VITE_API_URL=https://vestara-api.example.test \
  pnpm --filter @vestara/workspace-ui desktop:dev
```

The API must be reachable from the desktop machine, and its HTTP and WebSocket
connections must be allowed by the network and server configuration.

The desktop shell does not start or bundle the API. Keep the API process running
while using the shell, and make sure the API's `/api/health/ready` endpoint is
healthy before troubleshooting the client connection.

## Production Build

Build the installable desktop bundle with:

```bash
pnpm build
pnpm --filter @vestara/workspace-ui desktop
```

Tauri writes platform-specific bundles below
`apps/workspace/src-tauri/target/release/bundle/`. The exact installer format
depends on the host operating system and the configured Tauri targets.

## Configure an Existing Installation

Open **Settings > API Endpoint** in the Workspace client and enter the base URL
of the API, for example `http://127.0.0.1:3001`. Select **Apply endpoint**, then
reload the client to recreate existing connections. The endpoint is stored
locally in the client; it is not a server-side setting. Select **Clear** to
return to same-origin browser behavior.

The WebSocket URL is derived from the API URL: `https` uses `wss`, and `http`
uses `ws`. Do not append `/api` to the endpoint; the client adds that path to
HTTP requests automatically.

## Browser Deployment

The same built Workspace UI can be opened in a browser without Tauri. Build the
repository and start the API:

```bash
pnpm build
pnpm dev:api
```

Open `http://127.0.0.1:3001/`. The API serves static UI assets and falls back to
the UI entry point for client-side routes. Use `pnpm dev` when developing the
UI with Vite hot reload instead.

## Troubleshooting

- If the client shows disconnected, confirm the API is running and reachable at
  the configured endpoint.
- If the browser shows an API response instead of the Workspace UI, run
  `pnpm build` first so `apps/workspace/dist/index.html` exists.
- If HTTP requests work but live updates do not, check that the API host allows
  WebSocket connections and that the endpoint uses the expected `http` or
  `https` scheme.
- If `desktop` fails before compiling the UI, install the Rust toolchain and
  the platform-specific Tauri system dependencies.
