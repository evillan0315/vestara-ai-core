---
title: TUI & Chat Endpoints — Redesign and Restructure Plan
version: 1
status: proposed
owner: vestara
last-reviewed: 2026-08-03
next-review: 2026-09-03
---

# TUI & Chat Endpoints — Redesign and Restructure Plan

## Status: PROPOSED — Pending approval

> **OpenTUI-based TUI rebuild (2026-08-03):** The TUI rendering layer
> (`packages/tui`) was rebuilt from Ink/React onto **React + OpenTUI**, running
> as an **isolated Bun executable** that the Node CLI spawns (OpenTUI's native
> Zig renderer only loads under Bun — it throws under Node). New packages:
> `@vestara/design-system` (renderer-neutral metallic-gold semantic tokens,
> status/entity presentation, navigation definitions), `@vestara/tui-renderer`
> (the `TuiRenderer`/`TuiHost` contract + `OpenTuiRenderer` adapter + React
> hooks + JSX runtime shims — the ONLY package that imports OpenTUI). A `tui`
> `RuntimeType` was added to `@vestara/types`/`@vestara/registry` and a
> `TuiRuntime` (server-side client-process manager) to `@vestara/runtime`.
> The shell renders a three-pane layout (header, sidebar nav, main view, status
> bar) with chat/sessions/plans/graph/execution/workflow/logs views, a command
> palette (Ctrl+P), keyboard navigation, live WS telemetry from the shared API
> (verified against the running API), and clean SIGINT/SIGTERM teardown.
> `apps/cli` now spawns `bun run packages/tui/dist/index.js` instead of
> importing `@vestara/tui` in-process. Verified: full `pnpm build` (87 projects),
> 1442 Vitest tests + 2 Bun smoke tests, Biome clean on touched files, live
> render against the API. Marketplace packaging (manifest + platform resolver +
> standalone binary) is the next milestone (PCS-TUI-001).
>
> **PCS-TUI-002 — Marketplace distribution & executable lifecycle (2026-08-04):**
> The TUI is now a Marketplace-managed, platform-resolved application, still
> isolated from the Node runtime:
> - **Standalone executables**: `scripts/compile-tui.sh` compiles
>   `packages/tui/src/index.tsx` via `bun build --compile` into platform
>   artifacts (`dist/bin/vestara-tui-<target>`) with a `checksums.json`
>   manifest. Noninteractive modes `--health-check`, `--version`,
>   `--print-capabilities` never enter raw mode, never connect, never render
>   (health check still verifies native OpenTUI loading).
> - **Platform artifact resolver**: `@vestara/marketplace` gained
>   `executable-resolver.ts` (`resolvePackageExecutable`, `platformTarget`,
>   `SUPPORTED_TUI_TARGETS` linux-x64/arm64, darwin-x64/arm64, win32-x64) with
>   precise `ExecutableResolutionError`s and path-traversal containment.
> - **Formalized `TuiRuntime`**: authoritative process manager in
>   `@vestara/runtime` with `TuiRuntimeState` (created→resolving→starting→
>   running→stopping→stopped/failed/unavailable), lifecycle events
>   (`tui.runtime.*`), process snapshot, graceful SIGTERM → bounded wait →
>   SIGKILL, forced termination, restart policy, and health state.
> - **CLI interface resolver**: `apps/cli/src/lib/interface-resolver.ts` —
>   root `vestara` resolves the active TUI package from
>   `~/.local/share/vestara/packages`, spawns the platform executable directly
>   (no Bun), degrades to standard CLI when noninteractive/disabled/unavailable/
>   unhealthy, respects `--no-tui` and `CI`, and supports `vestara tui`
>   (requires the package) plus `VESTARA_TUI_DEV=1`/`vestara tui --dev` for the
>   in-repo Bun fallback.
> - **Marketplace lifecycle**: new `marketplace enable|disable|configure|status`
>   subcommands; `--purge` on uninstall; `tui` package type in
>   `@vestara/extension-contracts`; canonical `vestara.tui` identity in
>   `packages/tui/vestara-package.json` with executable targets.
> - **Bootstrap + configuration**: versioned `TuiBootstrapConfigV1` (apiUrl,
>   websocket, session source) passed via `--bootstrap` file so credentials never
>   appear on the command line; strict `TuiConfiguration` schema with precedence
>   (CLI > workspace > user > defaults) validated before launch.
> Verified end-to-end: `vestara tui` spawns the compiled linux-x64 binary when a
> package is installed (no Bun in the CLI path), falls back to in-repo Bun dev
> launch otherwise, and degrades to plain CLI when disabled or `--no-tui`.
> `pnpm build` (87 projects), 1471 Vitest tests + 2 Bun smoke tests pass, Biome
> clean on touched files, `docs:validate` clean.
>
> **PCS-TUI-003 / PCS-PLATFORM-001 — Transactional native application lifecycle
> (2026-08-04):**
> New package `@vestara/native-installer` makes native app install, update,
> rollback, and removal transactional and evidence-backed. The package is
> platform-agnostic (package / version / executable / install / rollback /
> recover) — the TUI is simply its first consumer. It implements the Vestara
> Engineering Cycle, documented in `docs/philosophy/`:
> - **Canonical model**: immutable side-by-side versions under
>   `<root>/<packageId>/versions/<version>/`, an atomic `installation.json`
>   record (`NativePackageInstallationRecord`, `InstalledPackageVersion`), and a
>   per-transaction journal (`PackageInstallJournal`). Active version changes by
>   rewriting the record — never by overwriting binaries.
> - **Phase machine**: created → resolving → acquiring → verifying → staging →
>   health-checking → registering → committing → completed, with
>   rolling-back/rolled-back/failed and `marketplace.install.*` events.
> - **Transactional install**: resolve platform artifact → stage immutable copy →
>   verify manifest-bound checksum → set 0755 → health-check the STAGED binary
>   (`--health-check --json`, asserting manifest↔binary identity AND version
>   match) → register → commit. Any failure rolls back: remove staged files,
>   restore prior active version, clear journal.
> - **Security**: `assertChecksum`, `assertContained` (path + symlink traversal),
>   `assertNoSymlinksInTree`, `assertExpectedExecutableName`,
>   `assertExecutableSize`, `assertIdentityMatch`.
> - **Recovery**: `recoverAll()` scans non-terminal journals on startup and rolls
>   back interrupted transactions.
> - **CLI**: `marketplace install <local-dir>` routes tui packages through the
>   native installer; new `marketplace rollback [--to <version>]`; `uninstall`
>   removes owned artifacts while retaining `configuration/` unless `--purge`.
> - **Interface resolver** now consumes the committed `installation.json` record
>   as the canonical authority (legacy `extensions.json` kept as a fallback).
> Verified end-to-end: install → side-by-side 0.1.0/0.2.0 → rollback → bad
> checksum rejected with no trace → bad identity/version rejected → uninstall
> retains config → purge removes all → interrupted journal recovered → `vestara
> tui` spawns the installed binary. `pnpm build` (88 projects), 1487 Vitest
> tests, Biome clean on touched files, `docs:validate` clean.
>
> **Implementation note (2026-08-03):** Phases 0–4 are implemented and verified
> in working tree: `SqliteConversationStore`, async conversation service, the
> `/api/conversations` REST + SSE resource, the shared `ConversationChunk`
> envelope, and the decomposed `packages/tui/src/components|hooks`. The
> `/api/chat/send|stream` aliases were removed and the dead `apps/console/`
> shim deleted. `pnpm build && pnpm test` (1430 tests) and `docs:validate`
> pass; live round-trip (create → stream with tool loop → history) verified
> against the running API. Frontmatter `status` is left `proposed` until the
> work is committed.
>
> **Routing-backed chat model selection (2026-08-03):** The conversation
> provider executor (`apps/api/src/workspace-context.ts`) now resolves the
> provider + model from the current routing selection (`/api/routing/selection`,
> defaulting to the `developer` role, falling back to the first provider with
> models) instead of hardcoding `opencode`/`deepseek-v4-flash-free`. The
> conversation service records the executor's actual provider/model on each
> stored assistant message (`packages/conversation/src/index.ts`), so both
> `/api/conversations` (TUI/Workspace chat) follow the routing picker. The TUI
> Ctrl+R routing overlay gained a fourth "API Key" step: after selecting a
> model for a provider without a configured credential, a text field POSTs
> `/api/providers/:id/credentials` before completing `/routing select`. The
> `RoutingSelection` now carries per-provider credential status fetched from
> `/api/providers`. `vestara open [path] [--force]` also lands in the TUI (repo
> resolved from explicit path → `VESTARA_REPO` → `process.cwd()`).
> Verified live: routing developer → `north-mini-code-free` was used by chat
> (stored message records it, and the assembler default no longer overrides).

This plan restructures the console TUI (`packages/tui/`) and the chat API
(`apps/api/src/routes/chat.ts`) so that both clients (TUI and Workspace) talk
to **one** conversation API backed by real persistence, and the TUI stops being
a single monolithic file. It complements, but does not replace, the existing
`docs/CLI-TUI-REDESIGN-PLAN.md` (which covers CLI command dispatch and TUI
component decomposition).

## Current state (verified)

### Chat endpoints

- `apps/api/src/routes/chat.ts` (~280 lines) exposes `POST /api/chat/send` and
  `POST /api/chat/stream`.
- Both routes are **stateless**: they build a fresh system prompt, run a tool
  loop against `ctx.agentTools`, and discard everything afterward. No
  `conversationId`, no history, no persistence.
- The tool loop (`runToolLoop`) executes model→tool→model up to 8 iterations
  and streams `tool_result` + `text` + `done` SSE frames.
- Model defaulting is fixed to `provider.models[0]` (was a nonexistent
  `nemotron-3-ultra-free`). Provider key loading was fixed to read
  `OPENCODE_API_KEY` from env.
- `ctx.conversationSessions` (`SqliteConversationSessionStore` from
  `@vestara/conversation-runtime`) is **initialized but never used** by the
  chat route.
- `@vestara/conversation` ships `DefaultConversationService` with
  `createConversation` / `sendMessage` / `sendMessageStream` /
  `listConversations` — a full, persisted conversation engine — but it is
  **not wired into the API** and its persistence is an in-memory `Map`.
- There is **no** `GET /api/conversations`, `GET /api/conversations/:id`,
  or history endpoint anywhere in `apps/api/src/routes/`.

### TUI

- `packages/tui/src/app.tsx` is **1,092 lines** with ~15 sub-components
  defined inline (`Conversation`, `MarkdownText`, `ToolExecution`, `MainView`,
  `Navigation`, `Header`, overlays, etc.).
- `packages/tui/src/controller.ts` (457 lines) is the API bridge: WebSocket
  event normalization + `streamConversation` (fetch `/api/chat/stream` and
  parse `data:` frames into `conversation-delta` events).
- Chat state lives as raw `ConversationEntry[]` in `app.tsx`; there is no
  conversation history, no re-open, no persistence.
- `normalize.ts` already scrubs DSML markup on the TUI side (added this cycle).

### Workspace UI chat (the other client)

- `apps/workspace/src/components/chat/useChat.ts` (484 lines) has its **own**
  SSE parser for `/api/chat/stream`, its **own** `<tool_call>` regex stripper,
  its **own** localStorage/IndexedDB persistence with "branches", and its own
  tool-call card model.
- This duplicates the TUI's client logic instead of sharing it.

### Root causes

1. **No conversation resource.** Chat has no server-side identity, history, or
   persistence. `conversation-runtime` and `@vestara/conversation` exist but
   are bypassed.
2. **Two divergent clients.** TUI and Workspace each parse the SSE stream,
   scrub markup, and persist — three copies of the same logic.
3. **No shared protocol package.** `tui-protocol` defines harness/task
   envelopes but no conversation envelope that both clients consume.
4. **Monolithic TUI.** `app.tsx` mixes rendering, state, keyboard handling,
   and view routing.

---

## Goals

- **One conversation API** with server-side persistence: create, send, stream,
  list, resume.
- **One shared chat protocol** (`@vestara/tui-protocol` conversation envelope)
  consumed by both TUI and Workspace.
- **TUI decomposed** into focused components/hooks (per the existing
  `CLI-TUI-REDESIGN-PLAN.md` Phase 3) with chat as a first-class module.
- **Conversation persistence** wired into the API (SQLite-backed via
  `conversation-runtime`; persistence contract from `@vestara/conversation`).
- No behavior regression for `/api/chat/stream` consumers during migration.

---

## Phase 0 — Conversation persistence contract

Wire the existing conversation engine into the API so chat has identity and
history before the endpoints are reshaped.

- **Extend `@vestara/conversation` persistence**: replace the in-memory
  `Map` in `DefaultConversationService` with the SQLite store
  (`SqliteConversationSessionStore`) so `createConversation`, `sendMessage`,
  `listConversations`, and `getConversation` survive restart.
- **Add persistence hooks** so a user message and assistant reply are written
  through the service (single writer), matching how `harness.*` events flow
  through the event store.
- **Files**: `packages/conversation/src/index.ts`,
  `packages/conversation-runtime/src/session-store.ts`.
- **Verify**: `pnpm --filter @vestara/conversation test`,
  `pnpm --filter @vestara/conversation-runtime test`.

## Phase 1 — Conversation REST API

Add a first-class `/api/conversations` resource in `apps/api/src/routes/`.

```text
POST   /api/conversations                     → create (returns id)
GET    /api/conversations                     → list summaries
GET    /api/conversations/:id                 → full history (messages)
POST   /api/conversations/:id/messages        → send (non-stream) → { response }
POST   /api/conversations/:id/stream          → SSE send (text/tool_result/done)
DELETE /api/conversations/:id                 → close
```

- Handler lives in a new `apps/api/src/routes/conversations.ts`; register in
  `apps/api/src/server.ts` and `routes/index.ts`.
- Keep `/api/chat/send` + `/api/chat/stream` as thin aliases that create a
  throwaway conversation and delegate, so existing TUI/Workspace calls keep
  working during migration.
- **Files**: `apps/api/src/routes/conversations.ts` (new), `server.ts`,
  `routes/index.ts`, `routes/misc.ts` (route list).
- **Verify**: curl create → send → get history; restart → history persists.

## Phase 2 — Shared conversation protocol

Add a conversation envelope to `@vestara/tui-protocol` so both clients parse
the same stream instead of re-implementing SSE.

```text
ConversationEnvelope
  { schemaVersion, conversationId, messageId, sequence,
    event: { type: 'delta'|'tool'|'tool_result'|'status'|'done'|'error', content?, ... } }
```

- Add types + `isConversationEnvelope()` guard alongside the existing
  `StreamEnvelope`.
- Migrate the TUI controller's `streamConversation` to emit envelopes.
- Migrate the Workspace `useChat.ts` parser to consume the same envelope
  (removing its hand-rolled `<tool_call>` regex and branch persistence in favor
  of the server conversation).
- **Files**: `packages/tui-protocol/src/index.ts`, `packages/tui/src/controller.ts`,
  `apps/workspace/src/components/chat/useChat.ts`,
  `apps/workspace/src/components/chat/`.
- **Verify**: `pnpm --filter @vestara/tui-protocol test`, both clients stream a
  tool-using turn without raw markup.

## Phase 3 — TUI component decomposition

Split `packages/tui/src/app.tsx` (1,092 lines) into the component/hook layout
already specified in `docs/CLI-TUI-REDESIGN-PLAN.md` Phase 3, with chat pulled
out as its own module:

```text
packages/tui/src/
  components/
    chat.tsx              # Conversation + MarkdownText + ToolExecution
    header.tsx navigation.tsx main-view.tsx agent-panel.tsx editor.tsx
    status-bar.tsx list-view.tsx overlay.tsx routing-picker.tsx
    confirmation.tsx toasts.tsx progress.ts
  hooks/
    use-keyboard.ts use-connection.ts use-history.ts use-chat.ts
  app.tsx                 # ~120 lines: composition + state
```

- `use-chat.ts` owns conversation state (messages, streaming, tools) and the
  conversation lifecycle (create on first message, resume via `/api/conversations/:id`).
- Reuse `useChat`-style state patterns already proven in the Workspace.
- **Files**: `packages/tui/src/**` (new component/hook files), `app.tsx`
  (shrinks), `controller.ts` (shrinks), `__tests__/**`.
- **Verify**: `pnpm --filter @vestara/tui build` + `pnpm --filter @vestara/tui test`;
  `vestara console` still renders every view.

## Phase 4 — Workspace UI convergence

- Point Workspace chat at `POST /api/conversations/:id/stream` and the shared
  `useChat`-style state already present in `apps/workspace/src/components/chat/`.
- Replace the local "branches" localStorage model with server-side
  conversations (keep an in-memory fallback when the API is unreachable).
- **Files**: `apps/workspace/src/components/chat/useChat.ts`, `ChatLayout.tsx`,
  related components.
- **Verify**: `pnpm --filter @vestara/workspace-ui build`; chat send/stream/
  history in the UI.

## Phase 5 — Tests, docs, cleanup

- Unit tests: conversation service persistence, REST handlers, protocol
  guards, TUI `use-chat` state.
- Integration: create → stream → history round-trip against the running API.
- Update `docs/CLI-TUI-REDESIGN-PLAN.md` (cross-reference), `docs/CLI.md`,
  and this plan's status once approved.
- Remove dead `apps/console/` shim if still unreferenced (see existing plan
  Phase 0.1) and the now-unused duplicate SSE parsing.
- **Verify**: `pnpm lint && pnpm build && pnpm test`; `pnpm docs:validate`.

---

## Implementation order & risk

| Phase | Depends on | Effort | Risk |
|-------|-----------|--------|------|
| 0: Persistence | — | ~3h | Medium — touching `@vestara/conversation` |
| 1: Conversations API | 0 | ~4h | Medium — new route surface |
| 2: Shared protocol | 1 | ~3h | Medium — migrating two clients |
| 3: TUI decomposition | 2 | ~3h | Low — mechanical extraction |
| 4: Workspace convergence | 2 | ~3h | Medium — replaces local persistence |
| 5: Tests/docs/cleanup | 0-4 | ~3h | Low |

**Total:** ~19 hours.

## Open questions

1. **Conversation storage home.** Keep persistence in `@vestara/conversation`
   (in-memory today) or move the writer to `conversation-runtime`'s SQLite
   store? Recommendation: make `conversation-runtime` the storage owner and
   `@vestara/conversation` the engine, matching the harness/event-store split.
2. **Back-compat window for `/api/chat/*`.** Keep aliases permanently or
   delete after both clients migrate? Recommendation: delete after Phase 4
   lands, updating `misc.ts` route list.
3. **Auth.** Conversation routes are currently unauthenticated like chat.
   Should history be scoped per workspace/user (`X-Vestara-Actor` header like
   `routing.ts`)? Recommendation: yes — carry the actor header through.

## Out of scope

- CLI command-registry refactor (covered by `CLI-TUI-REDESIGN-PLAN.md`).
- Remote/concurrent chat across devices; conversation sharing; multi-model
  branching UI (the Workspace's "branches" concept stays client-side only).
- Voice/audio chat timeline already in `conversation-runtime`.

## Verification checklist

- [ ] `pnpm lint && pnpm build && pnpm test` green (Biome, tsc, Vitest).
- [ ] `pnpm --filter @vestara/conversation test`, `@vestara/tui`,
      `@vestara/workspace-ui`, `@vestara/api` tests pass.
- [ ] Create conversation → send → stream → GET history → restart → history
      persists.
- [ ] TUI chat: no raw DSML markup, tool calls render as cards, history loads.
- [ ] Workspace chat: same behavior, no `<tool_call>` regex in client.
- [ ] `pnpm docs:validate` passes for this doc.
