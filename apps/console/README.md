# @vestara/console

Ink-based terminal interface for the Vestara engineering runtime.

The Console is a presentation adapter. Conversation, routing policy, provider
catalogs, assignments, revisions, permissions, and evidence remain owned by the
shared Workspace Runtime and API.

## Run

Build compiled JavaScript and start the API first:

```bash
bash build-order.sh
pnpm dev:api
```

In a second interactive terminal:

```bash
pnpm console
```

`VESTARA_API_URL` overrides the default `http://127.0.0.1:3001` endpoint.

## Interaction

| Key | Action |
|-----|--------|
| Enter | Submit |
| Shift+Enter | Insert newline |
| Up / Down | Navigate history |
| Page Up / Page Down | Scroll transcript |
| Ctrl+P | Open command palette |
| `?` | Open keyboard help |
| Escape | Close an overlay or cancel confirmation |
| Ctrl+C | Cancel active work; exit when idle |

Plain input streams through `/api/chat/stream`. Routing operations are also
available inside the Console; use `help` for the current command list.

## Verify

```bash
pnpm --filter @vestara/console build
pnpm --filter @vestara/console test
```
