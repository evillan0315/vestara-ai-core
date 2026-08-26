# @vestara/api

HTTP and WebSocket gateway for the Workspace UI.

## Usage

Import via workspace reference:

```
pnpm --filter @vestara/api build
```

## Run The Hosted Workspace

After building the repository, start the compiled API to serve the built
Workspace UI and its API/WebSocket endpoints from one origin:

```bash
pnpm build
pnpm dev:api
```

Open `http://127.0.0.1:3001/` in a browser. The API port defaults to `3001`
and can be changed with `VESTARA_API_PORT`. Client-side Workspace routes fall
back to the UI entry point, while files in the UI build are served directly.

The API also exposes lightweight process checks at `GET /api/health/live` and
`GET /api/health/ready`. The live check confirms that the process is responding;
the ready check returns `200` only when the workspace runtime is ready and
`503` while it is starting or degraded.

For local UI development with hot reload, use `pnpm dev` from the repository
root instead. The Vite server runs on port `5173` and proxies `/api` and `/ws`
to the API.

## Health Checks

Each registered service and custom health check has a five-second timeout. A
check that does not respond in time is reported as unhealthy instead of
blocking the complete health response. If diagnostics report a timeout,
inspect the affected service and its upstream dependencies before retrying.

## Dependencies

`@vestara/events @vestara/kernel @vestara/workspace @vestara/provider-runtime @vestara/provider-opencode @vestara/event-bus `

See the [documentation index](../../docs/README.md) for getting started,
capability specifications, and architecture references.
