---
title: VES-UI-001 Follow-up — Tauri CSP Hardening (from csp null)
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-21
next-review: 2026-11-21
---

# VES-UI-001 Follow-up — Tauri CSP Hardening

> Follow-up to `VES-UI-002 U0 — Tauri v2 Capability Audit` and U1 bundle-config guard.
> Landed 2026-10-21: `tauri.conf.json` carries the hardened CSP below and
> `tauri-bundle-config.test.ts` pins it via `EXPECTED_CSP` (40/40 guard +
> deep-link tests green, docs validation passed).

## Current state

- `apps/workspace/src-tauri/tauri.conf.json:14` — `app.security.csp: null`.
- Guard: `apps/workspace/__tests__/tauri-bundle-config.test.ts:116-118` pins `csp` to `null` with rationale: local-only webview (`frontendDist: ../dist`, dev `http://localhost:5173`, API/WS on loopback `127.0.0.1:3001`); `VestaraWindow` positions via inline `style` attributes; restrictive `style-src` breaks boot placement; restrictive `connect-src` breaks the API/WS bridge and Vite HMR.
- `apps/workspace/src-tauri/src/lib.rs` deep-link comment now cites `DEEP_LINK_SCHEME`/`DEEP_LINK_HOST` constants (`src/features/desktop-shell/deep-link.ts`) — scheme `teal://vestara-shell` is unaffected by this ticket.

## Exit gate (must all pass before landing)

1. Update `tauri-bundle-config.test.ts` — replace the `csp is null` assertion with an assertion on the exact hardened CSP string.
2. Boot verification — `VestaraWindow` placement (inline-style path or nonce/hash migration), API/WS bridge on loopback (`clientConfig.ts` resolution), Vite HMR in `desktop:dev`, and prod `desktop` bundle load with no CSP violations.
3. `pnpm lint:check && pnpm build && pnpm test` green, including the updated guard.

## Suggested start point (to validate, not to land blind)

```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: asset:; font-src 'self' data:; connect-src 'self' http://127.0.0.1:3001 ws://127.0.0.1:3001 http://localhost:5173 ws://localhost:5173; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
```

Tune `connect-src` for `VITE_API_URL` overrides and drop `unsafe-inline` only with a style-migration + boot-gated proof.
