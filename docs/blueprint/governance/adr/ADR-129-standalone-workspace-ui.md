---
id: "adr-129"
adr: "ADR-129"
title: "Workspace UI as a Standalone Desktop Application"
category: "applications"
version: 1.0
date: "2026-08-12"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@platform-engineer", "@devops-engineer", "@frontend-engineer"]
informed: ["@team"]
tags: ["workspace-ui", "desktop", "tauri", "tui", "standalone"]
depends_on: []
referenced_by:
  - type: "blueprint"
    target: "07-operating-system/README.md"
  - type: "runtime"
    target: "apps/workspace"
influences:
  - "Frontend Engineer"
  - "DevOps Engineer"
---

## Context

`@vestara/workspace-ui` is a React 19 + MUI 6 + Vite 6 **browser** SPA. Its
transport layer is hard-wired to the same origin it is served from: the HTTP
client uses a relative base (`lib/api.ts`, `lib/notifications.ts`) and every
WebSocket connection derives its URL from `window.location`
(`lib/ws.ts`, `lib/activity.ts`, `components/terminal/TerminalWorkspace.tsx`).

This prevents the UI from running as a standalone desktop application that
connects to an API on another origin (for example, a Vestara API running as a
systemd service on the portable drive). A non-browser standalone client already
exists — `@vestara/tui` (Bun) connects via
`process.env.VESTARA_API_URL ?? 'http://127.0.0.1:3001'` — but the browser UI
has no equivalent.

## Decision

The Workspace UI SHALL become a standalone desktop application by wrapping the
existing React/MUI build in a **Tauri** window (Rust + OS system WebView). The
same components render unchanged; there is no UI rewrite. The existing browser
SPA deployment remains a first-class target — one source, two deploy modes.

Electron was considered and rejected: its bundled Chromium contradicts the
project's minimal, portable, and private ethos and the portable-drive vision,
where a lightweight native binary is preferred.

As the prerequisite, the transport layer SHALL be decoupled from
`window.location` behind a single config module
(`apps/workspace/src/lib/clientConfig.ts`) that resolves the HTTP and WebSocket
base from, in order: a runtime override (`setApiBase`, e.g. a Settings "API
endpoint" field), `import.meta.env.VITE_API_URL`, or same-origin (empty base).

The terminal standalone (`@vestara/tui`) and the GUI standalone (Tauri desktop
app) are complementary: both consume the same Workspace Runtime API and the
same `/api` and `/ws` contracts.

## Consequences

### Positive
- Workspace UI runs natively without a browser, meeting the standalone goal.
- Transport decoupling also enables the browser SPA to target a remote API.
- Reuses the existing component tree; no presentation rewrite.
- Tauri binary is small and portable, consistent with the OS strategy.

### Negative
- Adds a Rust/Tauri toolchain and CI packaging step.
- Duplicate endpoint configuration surfaces (Settings field + `VITE_API_URL` +
  TUI's `VESTARA_API_URL`); must stay consistent.

### Risks
- Browser-only APIs in the SPA (localStorage, WebSocket, xterm, clipboard,
  notifications) need Tauri plugins or WebView equivalents
  (mitigation: all are available in the WebView; clipboard/notify use Tauri
  plugins).
- Scope creep bundling the API into the desktop binary (mitigation: out of
  scope for v1; the API runs separately, e.g. as a systemd service).

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Electron | Mature, large ecosystem | Bundled Chromium, heavy, contradicts minimal/portable ethos | Rejected |
| Rewrite UI on TUI/OpenTUI | Already standalone | Loses the rich MUI GUI; not the requested UI | Rejected |
| Keep browser-only | Simplest | Does not meet the standalone requirement | Rejected |

## Implementation Notes

- Transport decoupling completed: `apps/workspace/src/lib/clientConfig.ts` added;
  `lib/api.ts`, `lib/notifications.ts`, `lib/ws.ts`, `lib/activity.ts`, and
  `components/terminal/TerminalWorkspace.tsx` refactored to resolve endpoints
  through it; unit test `apps/workspace/__tests__/clientConfig.test.ts` (7
  cases) locks in resolution and persistence behavior. Build and type-check pass.
- Endpoint configuration completed: `clientConfig.ts` gained `localStorage`-
  backed `loadApiBaseFromStorage` / `getStoredApiBase` / `persistApiBase`;
  `main.tsx` applies the stored endpoint at startup; a client-local "API
  Endpoint" field (`pages/Settings/ApiEndpointField.tsx`) is wired into
  Settings (a `connection` section and route) and into the disconnected panel
  so standalone clients can set the endpoint even before the API is reachable.
- Tauri shell completed: `apps/workspace/src-tauri/` added (`Cargo.toml`,
  `tauri.conf.json`, `build.rs`, `src/main.rs`, `src/lib.rs`, generated
  `icons/`). `@tauri-apps/cli` (dev) and `@tauri-apps/api` (dep) added to the
  workspace package; `desktop` / `desktop:dev` scripts added. `cargo check`
  compiles the full Tauri/webkit2gtk dependency tree.
- Tauri plugins wired: `tauri-plugin-clipboard-manager` and
  `tauri-plugin-notification` registered in the Rust builder; their JS packages
  added. `lib/platform.ts` routes clipboard writes through the Tauri plugin
  when `window.__TAURI_INTERNALS__` is present and falls back to
  `navigator.clipboard` in the browser. `DocActions` uses this abstraction;
  other `navigator.clipboard` call sites can migrate to it later.
- Default endpoint injection: the `desktop` script sets
  `VITE_API_URL` to `http://127.0.0.1:3001` unless overridden, so a desktop
  build for the portable-drive case connects to the local API on first launch.
- CI packaging: `.github/workflows/ci.yml` gained a `desktop-build` job
  (Rust + Tauri system deps + `pnpm --filter @vestara/workspace-ui desktop`).
- Breaking changes: N (transport behavior unchanged in browser mode).
- Timeline: transport + endpoint configuration + Tauri shell done; plugin
  wiring and CI packaging remain.

## Related
- ADR-114 (Linux Host Integration Foundation)
- ADR-115 (Marketplace Foundation and Workspace Experience)
- Blueprint volume: 07-operating-system/README.md
- Runtime: apps/workspace
