---
title: VES-UI-002 U0 — Tauri v2 Capability Audit (deep-link, bundle targets, CSP)
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-21
next-review: 2026-11-21
---

# VES-UI-002 U0 — Tauri v2 Capability Audit (deep-link, bundle targets, CSP)

> **Gate: no code changes, decision record only.** This file is the U0 deliverable.
> No file under `apps/workspace/src-tauri/`, `packages/*/src/`, or `apps/*/src/` was
> mutated. All findings are audit + verified official-docs references. Implementation
> belongs to U1 (bundle config), U3 (`teal://vestara-shell` deep-link), and the
> CSP-hardening follow-up.

## 1. Scope and method

Audit Tauri v2 capabilities for three questions:

1. **Deep-link plugin** — what the official v2 plugin requires (config, Rust/JS wiring,
   permissions, platform caveats).
2. **Bundle targets** — what `bundle.targets: "all"` means and what Vestara ships today.
3. **CSP model** — what `app.security.csp: null` means and what hardening requires.

Method: read on-disk shell source (`apps/workspace/src-tauri/`, `apps/workspace/docs/DESKTOP.md`,
`apps/workspace/__tests__/tauri-bundle-config.test.ts`, VES-UI-001 plan §T8/U5, CSP-016 note);
verify against live official docs at `v2.tauri.app` (never fabricated — URLs + last-updated
dates recorded in §5). `rg` scans confirm absence claims.

## 2. Current on-disk state (observed, not inferred)

| Area | Observed state | Evidence |
|------|----------------|----------|
| `tauri.conf.json` | `productName: Vestara Workspace`, `version: 0.1.0`, `identifier: ai.vestara.workspace`; `build.devUrl: http://localhost:5173`, `build.frontendDist: ../dist`; single `main` window 1280×800 (min 960×600, center, resizable); `bundle.active: true`, `targets: "all"`, 5 icons; `app.security.csp: null`; no `plugins` key, no `app.security.capabilities` key | `apps/workspace/src-tauri/tauri.conf.json` |
| `Cargo.toml` | `tauri = { version = "2" }`, `tauri-plugin-clipboard-manager = "2"`, `tauri-plugin-notification = "2"`; `rust-version = "1.77"`; `tauri-build = "2"` | `apps/workspace/src-tauri/Cargo.toml` |
| `src/lib.rs` | Registers `clipboard-manager` + `notification` only; **no** `tauri_plugin_deep_link::init()`, **no** `single-instance` plugin | `apps/workspace/src-tauri/src/lib.rs` (8 lines) |
| Deep-link scheme | **Absent.** `rg "teal://"` in `packages/*/src` + `apps/*/src` empty; `rg -i "deep.link\|url.scheme\|custom.protocol\|onDeepLink"` in `src-tauri` + `boot-runtime` + `os-controller` empty | VES-UI-001 plan U5 record (2026-10-21); re-confirmed by plan's cited scans |
| JS deps | `@tauri-apps/api ^2.11.1`, `@tauri-apps/cli ^2.11.4`, `@tauri-apps/plugin-clipboard-manager ^2.3.3`, `@tauri-apps/plugin-notification ^2.4.0`; **no** `@tauri-apps/plugin-deep-link`, **no** `@tauri-apps/plugin-single-instance` in any workspace manifest | `apps/workspace/package.json` |
| Capabilities dir | **Does not exist.** `apps/workspace/src-tauri/capabilities/**/*` → no files. Only `gen/schemas/{capabilities,desktop,linux,mobile,...}.json` (build-generated). No `default.json` granting `core:*` or plugin permissions | `glob` 2026-10-21; `gen/schemas/capabilities.json` is `{}` |
| CSP test guard | U1 vitest pins `csp` to `null` with rationale (local-only webview; inline-style window positioning; loopback API/WS + Vite HMR); hardening explicitly deferred | `apps/workspace/__tests__/tauri-bundle-config.test.ts:116-118` + header comment |
| Bundle output (observed) | `src-tauri/target/release/bundle/deb/Vestara Workspace_0.1.0_amd64.deb` + unpacked control/data tree present in working tree (build artifact, not source) | `src-tauri/target/release/bundle/deb/` listing |
| CI desktop job | `ubuntu-22.04`, installs `libwebkit2gtk-4.1-dev … patchelf`, runs `pnpm build && pnpm --filter @vestara/workspace-ui desktop` (`tauri build`) | `.github/workflows/ci.yml:102-130` |
| Desktop docs | Shell does **not** start/bundle the API; API on `:3001` (or `VITE_API_URL`); Settings → API Endpoint stored client-side | `apps/workspace/docs/DESKTOP.md` |

### 2.1 Key audit finding: plugins registered without capability grants

Per the official Capabilities page (verified §5): *"If a webview or its window is not
matching any capability then it has no access to the IPC layer at all."* Default-deny
applies to plugin commands. Vestara registers `clipboard-manager` + `notification` in
Rust but ships **zero** capability files, so their frontend commands are currently
ungranted (blocked by default). This is consistent with a shell that renders local UI
but has not yet wired privileged IPC. **U1/U3 must add `src-tauri/capabilities/` grants**
(e.g. `core:event:default` + plugin `default` sets); this audit does not add them (gate).

## 3. Official-docs verification (Tauri v2)

All URLs below were fetched 2026-10-21. Quotes are paraphrases with section pointers,
not invented API.

### 3.1 Deep-link plugin — `https://v2.tauri.app/plugin/deep-linking/` (last updated Jun 15, 2026)

- **Crate / npm:** `tauri-plugin-deep-link@2.0.0` (Rust) + `@tauri-apps/plugin-deep-link` (JS).
  Install via `pnpm tauri add deep-link` (wires `Cargo.toml` + `lib.rs` + JS bindings) or
  manual `cargo add tauri-plugin-deep-link@2.0.0` + `.plugin(tauri_plugin_deep_link::init())`.
  Rust version floor stated on the plugin index: **1.90** (see §3.4 observation re `rust-version = "1.77"`).
- **Config shape** (`tauri.conf.json > plugins > deep-link`):
  - Mobile: `{ "mobile": [{ "scheme": ["ovi"], "appLink": false }] }` for custom scheme
    (no server); `{ "scheme": ["https"], "host": "…", "pathPrefix": ["/open"], "appLink": true }`
    for App Link / Universal Link (requires `.well-known/assetlinks.json` on Android,
    `.well-known/apple-app-site-association` served as `application/json` over HTTPS on iOS).
  - Desktop: `{ "desktop": { "schemes": ["something", "my-tauri-app"] } }` — static schemes.
- **Desktop delivery:** on Linux/Windows deep links arrive as a **new-process CLI argument**;
  official guidance pairs with `tauri-plugin-single-instance` (with `deep-link` cargo feature,
  registered **first** in `lib.rs`) so one instance receives events. macOS static-registration only.
- **Runtime registration (Linux/Windows only, not macOS):** `app.deep_link().register("my-app")`
  and `register_all()` (registers all statically configured schemes; recommended for dev and
  for AppImage, which otherwise needs an external launcher and breaks on move due to absolute
  executable path). Static schemes are matched against `argv` to mitigate forged invocations —
  but the app **must still validate URL shape** itself.
- **Listening:** JS `import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'`
  (`getCurrent()` for cold-start-via-link, `onOpenUrl(cb)` for running-app events; event carries
  a **list** of URLs, usually one). Rust: `app.deep_link().get_current()` + `on_open_url` in
  `.setup()`, via `tauri_plugin_deep_link::DeepLinkExt`.
- **Testing:** desktop links fire only for **installed** apps (except via `register_all` dev
  workaround); macOS requires the bundle in `/Applications`. Windows trigger: `start <scheme>://url`;
  Linux: `xdg-open <scheme>://url`; iOS sim: `xcrun simctl openurl booted …`; Android emu: `adb shell am start …`.
- **Permissions (capability file):** example grants `core:event:default` (to receive the event)
  + `deep-link:default` (covers `allow-get-current`). Full permission table:
  `allow/deny-get-current`, `allow/deny-is-registered`, `allow/deny-register`, `allow/deny-unregister`.
- **Implication for `teal://vestara-shell` (U3):** desktop static scheme + single-instance
  integration + `getCurrent`/`onOpenUrl` handling + `deep-link:default` capability + URL-shape
  validation + `register_all` dev path. Mobile `appLink` flow is out of scope (no mobile target).

### 3.2 Bundle targets — `https://v2.tauri.app/reference/config/` (`BundleTarget`, `BundleConfig`) + `https://v2.tauri.app/distribute/` (last updated Jul 22, 2026)

- `bundle.targets` accepts `"all"`, a single `BundleType`, or a list. `BundleType` values:
  `deb`, `rpm`, `appimage`, `nsis`, `msi`, `app`, `dmg`. **Default is `"all"`** — Vestara's
  explicit `"all"` matches the default.
- `"all"` means *every bundler the host toolchain can produce*, not a fixed artifact set:
  on Linux → `deb`/`rpm`/`appimage`; on macOS → `app`/`dmg`; on Windows → `nsis`/`msi`.
  The observed `deb` artifact on this Linux host is the expected subset. CI (`ubuntu-22.04`)
  therefore covers the Linux family; macOS/Windows installers require their respective runners
  (not configured).
- Versioning: `tauri.conf.json > version` preferred; falls back to `Cargo.toml > package > version`.
  U1 pins the two equal (independent literal, deliberately not synced from `@vestara/workspace-ui`).
- Signing is **required on most platforms** (per-platform pages under `/distribute/sign/*`); no
  signing config ships in `tauri.conf.json` today — expected for unsigned dev/CI builds, must be
  addressed before any public distribution (adjacent, not U1/U3 scope).

### 3.3 CSP model — `https://v2.tauri.app/security/csp/` (last updated Apr 7, 2025)

- CSP protection is **only active when set** in `tauri.conf.json > app.security.csp`. Vestara's
  `csp: null` therefore means **no bundle CSP** — the webview relies on server headers/dev defaults.
- When set, Tauri appends nonces/hashes for bundled code at compile time; the app author declares
  only app-specific sources. Example shape:
  `default-src 'self' customprotocol: asset:`, `connect-src ipc: http://ipc.localhost`,
  `img-src 'self' asset: http://asset.localhost blob: data:`, `style-src 'unsafe-inline' 'self' …`.
- U1's `null` rationale (inline-style window geometry, loopback `127.0.0.1:3001` API/WS, Vite HMR)
  is consistent with the docs: a restrictive `style-src`/`connect-src` would break exactly those
  flows. Hardening requires either refactoring inline styles to token classes and pinning
  `connect-src` to loopback + dev host, or scoping CSP to production builds — **deferred follow-up
  with boot-gated verification** (U1 test already records this).
- Deep-link relevance: a future `teal://`/`vestara://` scheme is a **new scheme-handler attack
  surface**; when U3 lands, the CSP/scheme review must cover `default-src customprotocol:`-style
  allowances and URL validation (frontend) alongside Rust-side `argv` matching.

### 3.4 Capabilities model — `https://v2.tauri.app/security/capabilities/` (last updated Sep 3, 2026)

- Capability files live in `src-tauri/capabilities/` (JSON/TOML), auto-enabled by default; explicit
  `app.security.capabilities` in `tauri.conf.json` switches to allow-list mode. Schemas generate to
  `gen/schemas/{desktop,mobile,…}-schema.json` via `tauri-build`.
- Each capability binds `identifier` + `windows`/`webviews` glob + `permissions` (`<plugin>:<perm>`)
  + optional `platforms` + optional `remote.urls`. Overlapping capabilities merge.
- Vestara gap (§2.1): no capability files at all → default-deny IPC. U1/U3 work must introduce at
  minimum a `main`-window capability with `core:event:default` (+ window/app as needed) and per-plugin
  defaults for `clipboard-manager`, `notification`, later `deep-link` + `single-instance`.
- **Observation (toolchain):** plugin index states each official plugin *"requires Rust ≥ 1.90"*;
  `src-tauri/Cargo.toml` declares `rust-version = "1.77"`. Whether current stable CI toolchain
  satisfies 1.90 is **UNKNOWN from this audit** (no `rustc --version` taken; process-restricted).
  U1 must confirm toolchain before adding `deep-link`/`single-instance` deps. Recorded as observation,
  not blocker to this record.

## 4. Decisions and recommendations (no implementation)

| ID | Decision / recommendation | Rationale |
|----|---------------------------|-----------|
| U0-D1 | **Do not add `deep-link` / `single-instance` in U0.** U3 remains the greenfield scheme owner (`teal://vestara-shell` or Director-confirmed name). | Gate is audit-only; premature `Cargo.toml`/`lib.rs`/`tauri.conf.json` edits would pre-empt U3's scheme + validation design. |
| U0-D2 | **Keep `bundle.targets: "all"` and `csp: null` in U0.** U1 owns bundle-config verification; CSP hardening stays a boot-gated follow-up. | Matches official default (`"all"`) and U1's pinned rationale; changing either without verification repeats the T8 (unverified port) failure mode. |
| U0-D3 | **U1 must create `src-tauri/capabilities/` grants** for `main` (`core:event:default` + needed `core:window/app`) and existing plugins (`clipboard-manager`, `notification`), then extend for `deep-link`/`single-instance` in U3. | Closes the §2.1 default-deny gap; required before any IPC-dependent shell feature can function in the bundle. |
| U0-D4 | **U3 design must include:** static `desktop.schemes` entry, `single-instance` (with `deep-link` feature, registered first), `getCurrent` cold-start + `onOpenUrl` runtime handling, `deep-link:default` permission, URL-shape validation (frontend + Rust `argv` awareness), `register_all` dev path, and the CSP/scheme review (U5-gated). | Direct transcription of §3.1 official requirements; VES-UI-001 U5 already flags scheme review due on U3. |
| U0-D5 | **Bundle verification stays web-proxy + host-native spot-check.** Playwright cannot target the bundle (WebView, no CDP; no `tauri-driver` wired); `frontendDist: ../dist` guarantees the same Vite build ships. | Recorded in VES-UI-001 U5; re-affirmed — no new harness introduced here. |
| U0-D6 | **Confirm Rust toolchain ≥ 1.90 and signing story before distribution.** | Plugin floor + per-platform signing requirement (§3.2/§3.4); dev/CI builds unaffected. |

## 5. Sources

| Source | Last-updated (as rendered) | Fetched |
|--------|----------------------------|---------|
| `https://v2.tauri.app/plugin/` (plugin index; Rust floor 1.90; deep-link support notes) | Jul 22, 2026 | 2026-10-21 |
| `https://v2.tauri.app/plugin/deep-linking/` (setup, config, usage, runtime registration, testing, permissions) | Jun 15, 2026 | 2026-10-21 |
| `https://v2.tauri.app/security/csp/` (opt-in model, nonce/hash behavior, example directives) | Apr 7, 2025 | 2026-10-21 |
| `https://v2.tauri.app/security/capabilities/` (default-deny, file location, schema generation, remote/merge semantics) | Sep 3, 2026 | 2026-10-21 |
| `https://v2.tauri.app/distribute/` (per-platform formats, signing requirement) | Jul 22, 2026 | 2026-10-21 |
| `https://v2.tauri.app/reference/config/` (`BundleConfig` default `targets: "all"`; `BundleType` enum; version fallback) | (reference, undated) | 2026-10-21 |

On-disk evidence: `apps/workspace/src-tauri/tauri.conf.json`, `Cargo.toml`, `src/lib.rs`,
`src/main.rs`, `src/build.rs`, `gen/schemas/capabilities.json`, `apps/workspace/package.json`,
`apps/workspace/__tests__/tauri-bundle-config.test.ts`, `apps/workspace/docs/DESKTOP.md`,
`docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md` (§T8/U5),
`docs/capabilities/CSP-016-os-integration/README.md`, `.github/workflows/ci.yml` (`desktop-build`).

## 6. Confidence and unknowns

- **High confidence:** deep-link absent on disk (cited `rg` scans); `csp: null`; `targets: "all"`;
  plugin config/usage/permission shapes (fetched official pages, quoted sections).
- **Medium confidence:** default-deny IPC impact on clipboard/notification today (docs are explicit;
  runtime behavior not exercised in this audit — no process execution per policy).
- **UNKNOWN (honest):** exact installed Rust/Cargo versions vs 1.90 floor; `tauri --version` /
  `cargo --version` not run (process-restricted). U1 to confirm. No/second-instance or
  scheme-handler behavior tested (would require code + install — explicitly out of gate).
- **Adjacent (not acted on):** unsigned bundles (signing unconfigured); macOS/Windows installer
  coverage absent from CI; `target/` build artifacts present in working tree (ignored build output,
  not source drift).

---

*Handoff: U1 (bundle config) proceeds on `tauri.conf.json` + capabilities; U3 (deep-link scheme)
proceeds per U0-D4. This record satisfies U0 with zero source mutations.*
