---
title: IDE-RECOVERY-001 — AI Planner Capability Audit
version: 1.0.0
status: audit-only
owner: vestara
last-reviewed: 2026-09-18
next-review: 2026-10-18
---

# IDE-RECOVERY-001 — AI Planner Capability Audit (Cross-Repository)

**Status:** AUDIT ONLY — ZERO MUTATION
**Date:** 2026-09-18
**Scope:** `ai-planner` (React/IDE UI) + `project-board-server` (API/Runtime/Services) vs `vestara-ai-core` (target platform)
**Mode:** Inspect, compare, classify. No porting, no repair, no dependency changes.

**Sources inspected:**
- Frontend: `/home/user/projects/ai-planner` (cloned 2026-09-18, `src/` tree, `package.json`, `docs/OVERVIEW_ARCHITECTURE.md`, `README.md`)
- Backend: `https://github.com/evillan0315/project-board-server` — `src/terminal/*`, `src/file/*`, `src/folder/*` (via raw fetch), plus local clone `apps/gemini-live/server/src/gemini/*` (NestJS gateway + service read directly), `apps/ai-audio-app`, `apps/live-audio`
- Target: `/home/user/projects/vestara-ai-core` — `apps/workspace/src/features/files/**`, `packages/filesystem-runtime`, `packages/terminal-runtime`, `apps/api/src/routes/*`, `packages/diff-engine`, docs viewer (`DocCodeBlock.tsx`)

---

## A. Executive Summary

**What ai-planner actually is.** A two-sided historical system:

1. **`ai-planner` — React 18 + Vite + TypeScript SPA.** A working AI-assisted IDE surface ("Codejector Workspace") plus an AI Code Planner and an LLM Prompt Generator. State via **Nanostores**, UI via **MUI v5 + Tailwind v4**, routing via **react-router-dom v6**, HTTP via **axios**, realtime terminal via **Socket.IO client + Xterm.js 5.5** (fit/webgl/clipboard addons). Monaco via `@monaco-editor/react` 4.6 / `monaco-editor` 0.50.
2. **`project-board-server` — NestJS monorepo backend (the runtime authority).** REST controllers + Socket.IO gateways + Prisma persistence + direct host `fs`/`fs-extra` access + `node-pty` PTY sessions + `ssh2` SSH sessions + Google Generative AI SDK (`@google/generative-ai`) for Gemini Live (audio/text turns over WebSocket). Auth: JWT + Google/GitHub OAuth2, `JwtAuthGuard` + `RolesGuard` (ADMIN-gated file/terminal endpoints).

**How much is relevant to the Vestara Engineering Workspace.** High relevance in exactly six areas, in this priority order:

1. **Terminal end-to-end behavior** (highest value): persistent per-client PTY, explicit `input`/`resize`/`set_cwd`/`exec_terminal`/`ssh-connect` protocol, CWD tracking, command-history persistence (`terminalSession` + `commandHistory` via Prisma), SSH escape hatch. Vestara's terminal has known issues; ai-planner's terminal is reported working in actual use.
2. **File Browser → Editor round-trip**: full CRUD (create/read/write/delete/rename/copy/move) + drag-and-drop move + context menu + media routing (code→editor route, media→floating window) + secured media stream URLs with HTTP Range support (`GET /api/file/stream`, `GET /api/file/download`).
3. **Monaco multi-tab editor with draft/dirty semantics**: `multiTabEditorStore` (tabs, active index, draft vs persisted content, unsaved guard) + singleton drawer store + floating-window store; Ctrl+S shortcut, cursor line/column status footer, 500 KB large-file gate, language detection (`detectLanguage` + Monaco mapping).
4. **Media preview split**: image/video/audio routed to floating resizable/draggable windows with dedicated `VideoPlayer`/`AudioPlayer`, secured stream URL flow (`mediaStreamUrl`/`mediaUrlLoading`/`mediaUrlError`).
5. **AI planning loop**: natural-language request + project-root/scan-path context + structured `IPlan` output (ADD/MODIFY/DELETE/REPAIR + diffs + tests + git instructions) + dry-run preview + per-change apply (`POST /api/plan/apply`, `POST /api/file/apply-changes`, `POST /api/file/git-diff`, `POST /api/file/scan`).
6. **Gemini Live realtime pattern**: session lifecycle over WebSocket (`startLiveSession`/`textInput`/`audioInput`/`processTurn`/`endLiveSession`), server-side session map with inactivity reaper, PCM→WAV assembly for audio turns, streamed `aiResponse` events. Valuable as a *protocol pattern* for Vestara realtime AI, not as code to copy (Gemini-SDK-coupled).

**What is NOT relevant:** MUI v5 visual system, Nanostores stores, react-router route shapes, ADMIN-only role model, direct `BASE_DIR`/CWD filesystem authority, `fs-extra` move/copy semantics, Prisma `terminalSession`/`commandHistory` schema as-is, OAuth redirect flow as-is, demo apps (`ai-audio-app` simulated oscillator UI, `live-audio` shaders), `faster-whisper-env` vendored venv (dependency bundle, no custom service found).

**Bottom line:** Recover *behaviors and protocols*, not code. Terminal PTY behavior + file CRUD protocol + Monaco tab/draft semantics + media-stream URL pattern + plan-apply loop are the five recoverable capabilities. Everything else is REBUILD (same capability, Vestara contracts) or DROP.

---

## B. Repository Capability Map

### B.1 ai-planner (frontend) — module inventory

| Area | Path | Contents | Deps/coupling |
|---|---|---|---|
| App shell | `src/App.tsx`, `src/main.tsx`, `src/pages/` (`PlannerPage`, `LoginPage`, `CodejectorPage`), `src/components/Layout.tsx` | Router, MUI theme provider, layout | `react-router-dom@6`, `@mui/material@5`, theme store |
| File Explorer | `src/components/file-explorer/` — `FileExplorer.tsx`, `FileTreeRenderer.tsx`, `FileTreeItem.tsx`, `FileExplorerControls.tsx`, `FileExplorerContextMenu.tsx` (23 KB), `hooks/useFileTreeState`, `stores/fileTreeStore`, `api/fileExplorerService.ts`, `types/` | Tree browse, expand/collapse, single/toggle/range select, DnD move, context menu CRUD, project-root set | `axios`, `@nanostores/react`, `path-browserify`, `react-router-dom` (navigate to `/codejector/editor?path=`), `dialogService`, backend `/api/file/*` |
| Editor | `src/components/editor/` — `FileEditorViewer.tsx` (orchestrator, 3 modes), `monaco/MonacoEditor.tsx`, `views/FileContentRenderer.tsx`, `views/MultiTabHeader.tsx`, `views/EditorStatusFooter.tsx`, `stores/editorStore.ts`, `stores/multiTabEditorStore.ts`, `stores/floatingWindowsStore.ts` | Singleton drawer + dedicated multi-tab route + contextual floating mode; Monaco/code/markdown/iframe/image/video/audio/plaintext/unsupported routing | `@monaco-editor/react@4.6`, `monaco-editor@0.50`, nanostores, `fileExplorerService`, `CODE/IMAGE/VIDEO/AUDIO_MIME_TYPES` constants |
| Terminal | `src/components/terminal/` — `Terminal.tsx` (366 lines), `TerminalToolbar.tsx`, `TerminalSettingsDialog.tsx`, `services/terminalSocketService.ts`, `stores/terminalStore`, `types/terminal` | Xterm + Fit + WebGL + Clipboard, `onData`/`onKey` input split, Ctrl+C/Enter/Tab/arrows, CWD prompt events, auto-connect, resize-to-backend | `@xterm/xterm@5.5`, addons (fit/webgl/clipboard + others in package.json), `socket.io-client`, `strip-ansi`, `authStore` JWT, backend `/terminal` namespace |
| Gemini/AI planning | `src/api/geminiService.ts` (441 lines), `src/components/gemini/`, `src/components/planner/` (7 dirs), `src/components/generator/` | `GeminiService` class (axios non-stream + fetch SSE stream, retries/backoff, multi-shape payload extraction), plan generate/review/edit/apply UI, prompt generator | `axios`, backend `/api/plan/*`, `/api/file/scan|apply-changes|git-diff`, Google/OAuth backend |
| Media players | `src/components/ui/player/AudioPlayer`, `VideoPlayer` | Floating media playback | Secured stream URL from backend |
| Markdown | `src/components/markdown/MarkdownRenderer`, `src/components/docs/*` | Markdown + Mermaid-ish docs rendering | `react-markdown@10`, `remark-gfm`, `rehype-raw` |
| State | `src/stores/` (`authStore`, `themeStore`, `geminiStore`, `projectRootDirectoryStore`) | JWT in localStorage, theme light/dark, API key, project root | `nanostores`, `localStorage` |
| Transport | `src/services/socketClientFactory.ts`, `src/api/authService.ts` | Namespaced Socket.IO factory (`/terminal`), JWT auth header/query, connect/disconnect/emit/on/off | `socket.io-client`, `VITE_TERMINAL_WS_URL` (default `http://localhost:3003`), `VITE_API_URL` (default `http://localhost:5000/api`) |

### B.2 project-board-server (backend) — module inventory

| Area | Path (GitHub tree `main` + local clone) | Contents | Deps/coupling |
|---|---|---|---|
| File REST | `src/file/file.controller.ts` (fetched), `src/file/file.service.ts` (fetched) | `POST open/close/read/read-many/create/create-folder/write/delete/rename/copy/move/search/upload/upload-multiple/scan/apply-changes/git-diff`, `GET list/stream/download/proxy` | NestJS, `fs`/`fs-extra`, `mime-types`, multer, Prisma (indirect), `JwtAuthGuard+RolesGuard` (ADMIN), `BASE_DIR`, `EXCLUDED_FOLDERS`, module-control gate |
| Folder REST | `src/folder/folder.controller.ts` (fetched) + `folder.service` | CRUD + paginated (`POST/GET/PATCH/DELETE /api/folder`) | NestJS + Prisma, ADMIN-gated |
| Terminal WS | `src/terminal/terminal.gateway.ts` (fetched), `terminal.service.ts` (fetched), `dto/`, `interfaces/`, `terminal.module.ts`, `terminal.controller.ts` | `/terminal` namespace; `set_cwd/exec_terminal/exec/input/resize/close/ssh-connect`; `node-pty` persistent session per client; `cwdMap/sshClientMap/sshStreamMap`; DB `terminalSession` create + `commandHistory` per command; `osinfo`/`cd` internal commands; prompt events | `@nestjs/websockets`, `socket.io`, `node-pty`, `ssh2`, Prisma (`terminalSession`, `commandHistory`), JWT guard |
| Gemini Live WS | Local: `apps/gemini-live/server/src/gemini/` — `gemini.gateway.ts`, `gemini.service.ts`, `dto/`, `interfaces/`, `gemini.module.ts` | `/gemini` namespace; `startLiveSession/textInput/audioInput/processTurn/endLiveSession`; server session map + 5-min inactivity reaper; PCM→WAV assembly; `chat.sendMessageStream` streaming `aiResponse` | `@google/generative-ai`, RxJS, `WsJwtGuard`, `GOOGLE_API_KEY` |
| Auth | `src/auth/*` (gateway imports `AuthService`, `JwtAuthGuard`, `RolesGuard`, `UserRole.ADMIN`) | Token validation per socket handshake, OAuth (Google/GitHub) | Passport/JWT, Prisma users |
| Audio demos | `apps/ai-audio-app/src/App.tsx` (read), `apps/live-audio/*` | Simulated oscillator + canvas visualizer; 3D shaders; UI-only toggles (noiseReduction etc. — no backend AI) | Web Audio API, canvas; NO Python service |
| Python | `faster-whisper-env/` (vendored venv only) | `pip`/`certifi`/`coloredlogs`/`requests` site-packages; **no custom face/camera/vision service found** in inspected trees | N/A — dependency bundle, not a capability |
| Demos | `apps/codegen-live`, `apps/kanban-board`, `apps/resume-app`, etc. | Unrelated demo frontends | Out of scope |

### B.3 Dependency ledger (historical, do-not-copy)

Frontend: `react@18`, `react-router-dom@6`, `@mui/material@5` + `@mui/icons-material@5`, `@emotion/*`, `nanostores@1` + `@nanostores/react`, `axios@1`, `@monaco-editor/react@4.6` + `monaco-editor@0.50`, `@xterm/xterm@5.5` + 10 addons (fit, webgl, clipboard, attach, canvas, image, ligatures, search, unicode11, web-links), `socket.io-client`, `path-browserify`, `react-markdown@10`, `strip-ansi`, `framer-motion`, `date-fns`. Backend: NestJS + `socket.io`, `node-pty`, `ssh2`, `fs-extra`, `mime-types`, multer, Prisma, `@google/generative-ai`, RxJS.

---

## C. IDE Architecture (as-built)

### C.1 Frontend runtime shape (ai-planner)

```
pages/ (PlannerPage, CodejectorPage, LoginPage)
  └─ components/file-explorer/FileExplorer.tsx
  │    ├─ hooks/useFileTreeState  (tree fetch/expand/refresh)
  │    ├─ FileTreeRenderer → FileTreeItem (select/DnD/context)
  │    ├─ FileExplorerContextMenu (CRUD ops → fileExplorerService)
  │    └─ on file click: media? openFileInEditor→floatingWindow : navigate(/codejector/editor?path=)
  ├─ components/editor/FileEditorViewer.tsx (3-mode orchestrator)
  │    ├─ contextual (floating) → FileContentRenderer (read-only media)
  │    ├─ dedicated route (?path=) → multiTabEditorStore + MultiTabHeader + FileContentRenderer + EditorStatusFooter
  │    └─ singleton drawer → editorStore + FileContentRenderer + EditorStatusFooter
  ├─ components/terminal/Terminal.tsx (Xterm) → terminalSocketService → /terminal
  └─ components/planner/* → plannerService → /api/plan/* (+ /api/file/scan, /apply-changes)
```

State: Nanostores atoms per domain (`editorStore`, `multiTabEditorStore`, `floatingWindowsStore`, `fileTreeStore`, `terminalStore`, `authStore`, `themeStore`). No global undo/redo, no OT/CRDT, no cross-tab sync.

### C.2 Cross-Repository Runtime Map (required)

Conventions: `FE:` = ai-planner, `BE:` = project-board-server, `V:` = vestara-ai-core counterpart.

| # | Capability | FE component/store/service | Protocol / event / endpoint | BE controller/gateway/service → runtime/resource | Response/event → FE | V counterpart |
|---|---|---|---|---|---|---|
| R1 | Directory browse | `FileExplorer.tsx` + `useFileTreeState` + `fileExplorerService.fetchDirectoryContents` | `GET /api/file/list?directory=&recursive=false` + `Authorization: Bearer JWT` | `FileController.getFiles` → `FileService.getFilesByDirectory` → `fs.readdir` (+`fs.stat` per file, `mime-types` lookup, `detectLanguage`, `EXCLUDED_FOLDERS`/blocked `/proc /sys /dev` filter) | `FileTreeNode[]` (`name/path/isDirectory/type/lang/mimeType/size/createdAt/updatedAt`) → tree render | `useFiles` (fixture + `/api/diagnostics/filesystem` insights only); NO browse endpoint — **missing** |
| R2 | File read (code/text) | `editorStore.openFileInEditor` / `multiTab.openTab` → `fileExplorerService.readFileContent` | `POST /api/file/read` `{filePath}` (+ upload/url/blob variants) | `FileController.readFileContent` → `FileService.resolveFile` → `readFile` (mime+lang detect, optional base64 data-URL) | `{filePath, content, mimeType, language}` → draft init | `GET /api/files/content?path=` (FILES-ASSETS-001, NEW) → `FilesystemRuntime.read` |
| R3 | File write/save | `saveFileContent` / `saveActiveTabContent` → `fileExplorerService.writeFileContent` | `POST /api/file/write` `{filePath, content}` | `FileController.writeFileContent` → `FileService.writeLocalFileContent` (`mkdir -p` + `writeFile`, extension allowlist) | `{success, message}` → content=draft, unsaved=false | `POST /api/files/write` (NEW) → `FilesystemRuntime.write` (policy + approval) |
| R4 | Create/delete/rename/copy/move | `FileExplorerContextMenu` → `fileExplorerService.create/delete/rename/copy/move` | `POST /api/file/create|delete|rename|copy|move`, `POST /api/folder` | `FileService.createLocalFileOrFolder/deleteLocalFile/rename/copy/move` (`fs-extra`); `FolderService` (Prisma CRUD) | `{success, message, paths}` → `handleRefresh()` | V: NO equivalent file-mutation endpoints — **missing** (only agent-side `FilesystemRuntime`) |
| R5 | Media stream | `FileContentRenderer` (image/video/audio) + `floatingWindowsStore` (`mediaStreamUrl*`) | `GET /api/file/stream?filePath=` (Range-capable) | `FileController.streamFile` → `fs.createReadStream({start,end})`, 206 partial content, mime via `mime-types` | Binary stream → `<img>` / `VideoPlayer` / `AudioPlayer` | V: base64-blob preview only (FILES-ASSETS-001); NO range streaming — **missing** |
| R6 | Media download | (context menu / viewer) | `GET /api/file/download?filePath=` | `FileController.downloadFile` → `StreamableFile` + `Content-Disposition: inline` | File bytes | V: NONE — **missing** |
| R7 | Project scan (AI context) | Planner page (projectRoot + scanPaths) → `plannerService` | `POST /api/file/scan` `{scanPaths, projectRoot, verbose}` | `FileService.scan` (hardcoded relevant-extension + excluded-dir/file lists, BFS queue, dedupe, read content) | `ScannedFileDto[]` (`filePath/relativePath/content`) → LLM prompt | V: `FilesystemRuntime.search/references` + diagnostics scan; NO AI-context scan shape — **partially missing** |
| R8 | Apply AI changes | Plan review UI (per-change + bulk) | `POST /api/file/apply-changes` `{changes: ADD/MODIFY/DELETE/REPAIR, projectRoot}`; `POST /api/file/git-diff` | `FileService.applyFileChanges` (mkdir+write/unlink per action); `getGitDiff` (`git rev-parse/diff/ls-files`, `--no-index` fallback) | `{success, messages[]}` / `{diff}` → UI status | V: changesets/verification pipeline (`ImplementationService`, `VerificationService`) — SUPERSEDED pattern, different shape |
| R9 | Terminal session | `Terminal.tsx` (Xterm) + `terminalSocketService` + `terminalStore` | WS `/terminal`: `connect(initialCwd?)`, `input{input}`, `resize{cols,rows}`, `set_cwd{cwd}`, `exec_terminal{command,newCwd?}`, `ssh-connect{}`, `close`; server→client: `output/outputMessage/error/outputInfo/outputPath/prompt{cwd}/close` | `TerminalGateway` (JWT handshake, `cwdMap`, `sshClientMap/sshStreamMap`) → `TerminalService.initializePtySession` (`node-pty` spawn bash/powershell, `onData→emit output`, `onExit→close`) + Prisma `terminalSession.create` + per-command `commandHistory.create`; `cd/osinfo` handled gateway-side | Live PTY bytes + prompt/cwd events → `term.write`, `setCurrentPath` | V: `TerminalSessionRegistry` (spawn+pty drivers) + `/ws/terminal?sessionId=` JSON ops (`input/interrupt/resize/ping` → `stdout/stderr/cwd/exit/error`) — same shape, different wire |
| R10 | SSH terminal | `ssh-connect` emit (config host/port/user/pass/key) | `ssh-connect` event | `TerminalGateway.handleSshConnect` → `ssh2.Client.shell` → stream→`output` | Remote bytes over same socket | V: NONE — **missing** (deliberate? threat surface) |
| R11 | Gemini text/stream | `api/geminiService.ts` (`generateContent` axios + `streamGenerateContent` fetch-SSE + `streamContent`) | `POST {base}/:generateContent`, `POST {base}/:streamGenerateContent?alt=sse` (`x-goog-api-key`, retries/backoff, `AbortSignal`) | Direct Google API (no BE proxy in this path) | Normalized `chunk{delta}` events → UI stream | V: OpenCode runtime provider (`/api/opencode/*`, `/api/providers`) — SUPERSEDED |
| R12 | Gemini Live realtime | (gemini-live frontend: `useGeminiLiveSocket`, audio recorder) | WS `/gemini`: `startLiveSession/textInput/audioInput/processTurn/endLiveSession` → `sessionStarted/textInputBuffered/audioInputBuffered/aiResponse/sessionEnded` | `GeminiGateway` → `GeminiService` (session map, 5-min reaper, PCM→WAV, `chat.sendMessageStream`) | Streamed `aiResponse` deltas + `turnComplete` | V: NONE (no live voice/video AI loop) — candidate ADD |

### C.3 Obsolete duplication / incorrect splits (historical)

1. **File authority duplicated, not shared.** `FileService` (host-fs CRUD) and `FolderService` (Prisma folder CRUD) are two authorities for the same "create a folder" action (`POST /api/file/create` with `isDirectory` vs `POST /api/folder`). FE only uses the file path. The Prisma folder track is dead weight for IDE purposes.
2. **Two terminal command paths.** `exec_terminal` (preferred, with `newCwd` + history + ssh + cd/osinfo handling) and legacy `exec` (same logic, kept "for now"). The `input` path is the third — raw keystrokes also flow here. Three ingresses, one PTY.
3. **`cd` handled twice.** Gateway intercepts `cd` (updates `cwdMap`, emits `prompt`) AND writes to PTY. Comment in code admits "let the PTY handle the output" — the split causes prompt/CWD skew risk.
4. **Media URL indirection.** FE builds stream URL via `getFileStreamUrl` (client-side URL construction) while BE also supports `generateBlobUrl` base64 embedding. Two media-delivery mechanisms for one need.
5. **AI context scan vs file list.** `getFilesByDirectory` (explorer, with `EXCLUDED_FOLDERS`) and `scan` (AI context, with separate hardcoded `RELEVANT_*/EXCLUDE_*` sets) maintain two independent exclusion taxonomies.
6. **AuthZ on IDE ops.** Every file/terminal endpoint requires ADMIN (`@Roles(UserRole.ADMIN)`). No view/edit/save separation — one role gates everything, contradicting Vestara's `View ≠ Edit ≠ Save` boundary.

---

## D. File Browser Audit

**FE:** `FileExplorer.tsx` (386 lines) + `useFileTreeState` + `FileTreeRenderer`/`FileTreeItem` + `FileExplorerControls` + `FileExplorerContextMenu` (23 KB) + `fileTreeStore` + `fileExplorerService`.

| Capability | ai-planner behavior (evidence) | Vestara equivalent | Verdict |
|---|---|---|---|
| Tree navigation (expand/collapse, breadcrumb, go-up, refresh) | `handleToggleExpand/handleNavigate/handleGoUp/handleRefresh`, `currentDirectoryContents` + `cachedContents` | `FileBrowser.tsx` (breadcrumb, segments, facet pills, fuzzy search, sort) | **ADAPT** — Vestara search/facets are stronger; adopt ai-planner's expand-persist + refresh-trigger pattern |
| Multi-select (single/toggle/range) | `handleSelectionClick` with `visiblePathsRef` + `visiblePathsMap`, Shift-range + Ctrl-toggle | None | **ADAPT** — valuable for bulk ops; needs Vestara selection contract |
| Context menu CRUD | `openContextMenu(e, entries, path)`; create/rename/delete/copy/move wired to service | None (Copy-path/Terminal/Activity links only) | **REBUILD** — behavior valuable; MUI menu + ADMIN-gated endpoints must not survive |
| Drag-and-drop move | `handleDragStart/Over/Enter/Leave/Drop` → `moveFileOrFolder`, subdir-into-self guard | None | **ADAPT** — small, self-contained; adopt guard logic |
| Create/rename/delete/move/copy | `POST /api/file/*` full set (R4) | NONE (agent-side `FilesystemRuntime` only) | **REBUILD** — user-facing file ops missing in Vestara; must go through `FilesystemRuntime` + policy/approval, not direct fs |
| Search files by name | `POST /api/file/search` → `searchFilesByName` (recursive walk, excluded-folder skip) | `matchScore` client filter; `FilesystemRuntime.search` (content/glob) | **SUPERSEDED** (Vestara search covers it) |
| Project-root set | `setProjectRoot` + dialog confirm; `initialCwd` handshake for terminal | `VESTARA_REPO` / session fingerprint | **DROP** (Vestara workspace identity supersedes manual root) |
| Upload/download | `upload/upload-multiple` (multer) + `download` (`StreamableFile`) | None | **REBUILD** (scoped: download first; upload needs policy) or DROP upload until governed |
| Authority model | BE direct `fs` under `BASE_DIR`; ADMIN role gates all; no view/edit split | `FilesystemRuntime` (sandbox resolve, deny-list, symlink confinement, policy engine, approvals, audit) | **SUPERSEDED** — Vestara authority is strictly stronger; never copy direct-fs pattern |

**Authority analysis:** ai-planner's browser IS the filesystem authority (UI → REST → direct `fs`). This violates every Vestara boundary (`File Browser ≠ Filesystem Authority`, `Edit Permission ≠ Save Authority`). The recoverable asset is the *interaction repertoire* (select/DnD/menu/refresh), not the authority path.

---

## E. File Viewer Audit

**FE:** `FileContentRenderer.tsx` (286 lines) — `determineRendererType()` → code/markdown/image/video/audio/iframe/plaintext/unsupported.

| Preview | ai-planner (FE + BE) | Vestara (FILES-ASSETS-001) | Verdict |
|---|---|---|---|
| Code/text | Monaco editable (or read-only contextual); 500 KB gate (`contentString.length > 512000` → plaintext/unsupported); `getMonacoLanguage` | `CodeEditor.tsx`/`CodeViewer` (highlight.js, textarea edit, 2 MB edit / 5 MB preview caps) | **ADAPT** — adopt 500 KB *editor* caution as warning tier; keep Vestara caps; Monaco decision is §F |
| Markdown | `MarkdownRenderer` full-page | `DocCodeBlock` + docs viewer | **SUPERSEDED** |
| HTML | `iframe srcDoc` sandboxed (`allow-scripts allow-same-origin`) | None | **DROP** (XSS surface; `allow-same-origin` + scripts is unsafe to recover) |
| Image | `<img src={mediaStreamUrl \|\| path}>`, floating window | `<img>` blob URL in `FilePreview` | **ADAPT** — adopt secured-URL-over-blob direction (see §K); keep Vestara layout |
| Video | `VideoPlayer` + fullscreen-action registration (`onRegisterPlayerAction`) | `<video controls>` blob URL | **ADAPT** — adopt fullscreen-action pattern; transport needs range streaming (missing) |
| Audio | `AudioPlayer` | `<audio>` blob URL | **ADAPT** — same as video |
| Binary/large fallback | Warning alert with path + renderer type | `unsupported` + `too-large` states with size/mime | **SUPERSEDED** (Vestara states are more truthful) |
| Media transport | Range-capable `GET /api/file/stream` (206), `GET /api/file/download` | Base64-in-JSON (`contentBase64`) | **REBUILD** — Vestara needs a range-streaming endpoint before video >~5 MB is real |

---

## F. Monaco Editor Audit

**FE:** `monaco/MonacoEditor.tsx` (121 lines) + `multiTabEditorStore.ts` (273) + `editorStore.ts` (239) + `floatingWindowsStore.ts` + `MultiTabHeader` + `EditorStatusFooter` + `utils/editorUtils` (`getMonacoLanguage`).

| Behavior | ai-planner evidence | Vestara | Verdict |
|---|---|---|---|
| Editor component | `@monaco-editor/react` `Editor`, `automaticLayout`, `wordWrap on`, `minimap off`, `tabSize 2`, font 14; theme map `light→vs-light/dark→vs-dark` from `themeAtom` | highlight.js + textarea (FILES-ASSETS-001, zero new deps) | **ADAPT (conditional)** — Monaco justified only if Vestara commits to multi-cursor/diff/deep-language features; otherwise keep highlight.js (no 2 MB+ bundle, no worker CSP work) |
| Tabs | `openTab(path)` (normalize, dedupe→activate, placeholder tab + async fill), `closeTab` (unsaved confirm, neighbor activation, index shift), `closeAllTabs` (bulk confirm) | None | **REBUILD** — tab semantics are the asset; reimplement on Vestara state (not Nanostores) |
| Draft vs persisted | `content` vs `draftContent`, `hasUnsavedChanges = draft !== content`; save writes draft, then content=draft | Same shape (`originalContentRef` vs `content`, `isDirty`) | **SUPERSEDED** — Vestara already mirrors it; adopt ai-planner's *per-tab* draft map |
| Save | `writeFileContent(path, draft)`; loading-per-tab; error-per-tab; `{success, message}` | `POST /api/files/write` → `FilesystemRuntime.write` (policy/approval/audit) | **SUPERSEDED** (authority); adopt per-tab loading/error UX |
| Ctrl+S | `editor.addCommand(CtrlCmd+S)` → `onSaveShortcut`, `return true` (suppress browser dialog) | Ctrl+S + Esc-cancel + Tab-indent in textarea | **ADAPT** — adopt Monaco command pattern if Monaco lands |
| Cursor/status | `onDidChangeCursorPosition` → `EditorStatusFooter` (path, unsaved dot, Ln/Col, eslint-count placeholder) | None | **ADAPT** — status footer is cheap, high-value |
| Language detection | Server `language`/`mimeType` → fallback extension; `getMonacoLanguage(path)` | `file-classification.ts` (MIME-first) + `getHighlightLanguage` | **SUPERSEDED** (Vestara MIME-first is correct per `File Type ≠ Extension`) |
| Theme | App theme → Monaco theme; no token system | `@vestara/ui-tokens` + `@vestara/ui-theme` canonical | **REBUILD** — Monaco theme must be generated from Vestara tokens, never hard-coded `vs-dark` palette |
| Large files | 500 KB content-length gate | 2 MB edit / 5 MB preview | **ADAPT** — add ai-planner's *warning tier* (~500 KB: "large, editing may be slow") under Vestara caps |
| Media in editor | Blocked from tabs ("typically opened in floating windows") | Unified `FilePreview` router | **SUPERSEDED** (Vestara unified preview is simpler) |
| Deps/coupling | `@monaco-editor/react`, `monaco-editor`, nanostores, `path-browserify`, router query `?path=` | None of these | Migration risk **MEDIUM**: bundle/workers/CSP + store rewrite + token-theme bridge |

**Decision gate for FILES-EDITOR-001:** Choose (a) keep highlight.js + add tabs/status/multi-file (low risk, preserves FILES-ASSETS-001), or (b) adopt Monaco (needs worker build, CSP, token theme, a11y pass). Audit recommends (a) first, (b) only on demonstrated need (diff view, multi-cursor refactor, or >5-language IntelliSense).

---

## G. Terminal Audit

### G.1 ai-planner path (complete, verified in source)

```
Terminal.tsx (Xterm: cursorBlink, Fira Code 13, scrollback 3000, dark/light theme)
 ├─ onData → terminalSocketService.sendInput(data) → emit('input',{input})
 └─ onKey  → Ctrl+C (no selection → '\x03') | Enter→'\r' | Tab→'\t' | Arrows→ESC[A/B/C/D]
       │  Socket.IO /terminal (JWT auth, transports:['websocket'], initialCwd query)
       ▼
TerminalGateway.handleConnection → validateToken → cwdMap.set(id, initialCwd|BASE_DIR|homedir)
       → TerminalService.initializePtySession(id, socket, cwd, userId)
           ├─ pty.spawn(bash|powershell.exe, {name:'xterm-color', cols:80, rows:30, cwd, env})
           ├─ prisma.terminalSession.create({createdById, ip, userAgent, status:ACTIVE})
           ├─ shell.onData → client.emit('output', data)
           └─ shell.onExit → client.emit('close', …) + dispose
Terminal.tsx ← on('output'|'outputMessage'|'error'|'outputInfo'|'prompt'|… ) → term.write / store
Resize: fitAddon.fit() → emit('resize',{cols,rows}) → pty.resize
CWD: emit('set_cwd') / exec_terminal{newCwd} / prompt{cwd} events → setCurrentPath
SSH: emit('ssh-connect',{host,port,user,pass/key}) → ssh2 shell → stream→output
Cleanup: unmount → disconnectTerminal(); server handleDisconnect → dispose + ssh dispose
```

Xterm config: `allowProposedApi`, `FitAddon`, `WebglAddon` (try/catch fallback), `ClipboardAddon`, `convertEol`, themes per app theme. Reconnect: none (single connect on mount; disconnect on unmount).

### G.2 Vestara path (current)

```
TerminalWorkspace.tsx + TerminalPane (xterm) + useTerminalSessions
 ├─ POST /api/terminal/sessions → TerminalSessionRegistry.create({cwd,cols,rows})
 └─ WS /ws/terminal?sessionId= (native WebSocket, JSON frames)
     client→server: {op:input|interrupt|resize|ping}   server→client: {op:stdout|stderr|cwd|exit|error|driver|pong}
Registry: spawn (default, piped bash --noediting -i, detached pg, SIGINT→-pid) | pty (node-pty, lazy-load, fallback-closed)
     + PROMPT_COMMAND CWD-marker protocol (stream.ts), redacted transcript ring, idle/lifetime sweeper, secret-scrubbed env
```

### G.3 Objective comparison

| Dimension | ai-planner | Vestara | Note |
|---|---|---|---|
| PTY fidelity | `node-pty` always (true echo, job control, fullscreen) | spawn default; pty opt-in w/ fallback | ai-planner behaves better out-of-box; Vestara spawn needs client echo + line buffering (known issues) |
| Input handling | Raw passthrough (`onData` + explicit control bytes); shell owns editing | Dual-mode: pty passthrough vs spawn line-buffer + local echo | ai-planner simpler and more correct for interactive use |
| Ctrl+C | Selection-aware (copy if selected, else ETX) | `interrupt` op → SIGINT pg (spawn) / ETX (pty) | **Adopt ai-planner's selection check** |
| Arrows/Tab/Enter | Explicit ESC sequences via `onKey` | Raw bytes (pty) / line discipline (spawn) | ai-planner's explicitness is a robustness asset |
| CWD | `cwdMap` + `prompt{cwd}` + `set_cwd` + `cd` interception | `PROMPT_COMMAND` marker parse (cross-chunk reassembly) | Both work; ai-planner's explicit events are simpler, Vestara's marker survives `cd` without interception |
| Resize | fit → `resize` → `pty.resize` (real) | `resize` op → driver resize (noop on spawn) | Same shape; ai-planner always real |
| Session lifecycle | Socket-bound (disconnect kills PTY + DB ENDED) | Detached (socket drop ≠ kill; idle/lifetime reaper) | **Vestara model is correct** per `UI lifecycle ≠ execution lifecycle`; ai-planner loses work on refresh — DO NOT copy |
| Persistence | Prisma `terminalSession` + per-command `commandHistory` (auditable) | Redacted transcript ring + registry events (no per-command table) | Adopt *command-history* as auditable log behind Vestara retention/redaction |
| Toolbar/settings | `TerminalToolbar` (connect/disconnect/settings/logout) + `TerminalSettingsDialog` + `outputInfo` sysinfo | `TerminalTabs` + `TerminalStatusBar` (cwd/state/uptime) | Rough parity; adopt `osinfo` equivalent (Vestara has diagnostics) |
| SSH | Full `ssh2` shell over same socket | None | **DROP** (threat surface; conflicts with `Terminal Session ≠ OS Identity`) unless a governed milestone justifies it |
| Auth | JWT handshake + ADMIN guard | Local-session API (no JWT-on-terminal; workspace-scoped) | Vestara containment (`resolveSessionCwd`, secret-scrubbed env) is stronger; never copy ADMIN-gate |
| Rendering | WebGL + Clipboard + Canvas + 7 idle addons | (pane-level, equivalent xterm) | Adopt WebGL-with-fallback + clipboard explicitly; skip idle addons |

**Terminal verdict:** Behavior **ADAPT**, architecture **REBUILD/SUPERSEDED**. Recover: selection-aware Ctrl+C, explicit control-byte handling, WebGL+clipboard addon discipline, command-history audit shape, `osinfo` equivalent. Keep: Vestara detached lifecycle, cwd containment, secret scrubbing, dual driver, JSON frame protocol. Do not repair Vestara terminal in this milestone (out of scope); file TERM-001 items instead (§M).

---

## H. Gemini AI Integration Audit

### H.1 What the assistant could actually do (implemented vs planned)

| Surface | Implemented (evidence) | Planned/incomplete |
|---|---|---|
| `GeminiService` (`src/api/geminiService.ts`) | `generateContent` (axios, retries, timeout 60 s, `x-goog-api-key`, abort) + `streamGenerateContent` (fetch SSE, `data:`/`event:`/`id:` parse, `[DONE]`, 4-shape text extractor) + `streamContent` convenience | — |
| Planner | NL prompt + root/scanPaths + schema-enforced `IPlan` + per-plan and per-change apply + dry-run preview | Streaming plan generation (noted as future WebSocket) |
| Prompt generator | Schema/constraints/examples composer for system prompts | — |
| File awareness | `POST /api/file/scan` context builder (extension/dir/name filters) | Diff preview for MODIFY (noted future) |
| Terminal interaction | None (AI cannot drive terminal) | — |
| Vision/camera | None found (no face/camera code in inspected trees) | gemini-live roadmap lists video streaming as TODO |
| Gemini Live | Session/turn/audio protocol fully implemented server-side (`gemini.service.ts` 348 lines) + gateway; PCM→WAV; streaming deltas | Frontend video uplink; TTS fallback |

### H.2 IDE coupling

Planner is tightly coupled to host-fs authority: `projectRoot` (absolute host path from FE!) flows into scan/apply; `VITE_BASE_DIR` must match host. AI output (`ADD/MODIFY/DELETE/REPAIR`) executes as direct `fs` writes. No policy, no approval, no containment beyond `BASE_DIR`. Vestara's agent/harness/verification pipeline (`PlanningService`, `ImplementationService`, `VerificationService`, changesets, OpenCode runtime) supersedes this loop architecturally; the recoverable asset is the **plan *shape*** (thought/assumptions/confidence/effort/tests/git) and the **per-change apply UX**, not the execution path.

### H.3 Classification

- `GeminiService` streaming client (multi-shape extractor, backoff, abort): **ADAPT** as SSE-consumption pattern for Vestara provider streaming (rehome onto OpenCode transport; drop `x-goog-api-key` direct-call shape).
- Plan shape + per-change apply + dry-run: **ADAPT** into Vestara plan/changeset UX vocabulary.
- Direct-LLM-from-browser + absolute-host-root + ADMIN-gate: **DROP** (violates provider boundary `/api/opencode/*` vs `/api/providers`, and all file authorities).
- Gemini Live session/turn protocol: **ADAPT as protocol reference** for any future realtime voice loop; SDK-coupled service itself: **DROP** (Vestara provider platform owns model access).

---

## I. Python / Vision / Other Capability Discovery

| Subsystem | Evidence | Finding |
|---|---|---|
| Face/camera detection | Searched `*.py` + `camera/face/vision/opencv/cv2/mediapipe` across ai-planner (zero hits) and project-board-server main-branch apps | **NOT FOUND in inspected trees.** No face/camera service to recover. (gemini-live roadmap mentions future video streaming; `react-webcam`/`webrtc-adapter` appear only as README acknowledgements, not wired code.) |
| Python services | `faster-whisper-env/` = vendored venv (pip/certifi/coloredlogs/requests); no custom service modules found | **No custom Python capability.** Whisper/STT capability: **DROP** (Vestara has `packages/stt`, `packages/tts`, `packages/audio`, media-runtime) |
| Audio/speech | `ai-audio-app` = simulated oscillator + canvas visualizer, UI-only toggles; `live-audio` = shaders; `gemini-live` server = real audio-turn pipeline (PCM→WAV→Gemini) | Only `gemini-live` audio-turn path is real (§H); demos: **DROP** |
| Uploads/downloads | multer `upload/upload-multiple`, `StreamableFile` download, `proxy` image proxy | Download: **REBUILD** scoped; upload/proxy: **DROP** until governed (proxy is SSRF surface) |
| Process execution | `runCommandOnce` (`spawn` bash), `runSshCommandOnce` (ssh2 exec) one-shot helpers | **DROP** (Vestara governed shell + harness own this) |
| Package scripts | `getPackageScripts` + `detectPackageManager` (yarn/pnpm/npm lock sniff) | **ADAPT** (tiny, safe, useful for workspace tasks UX) |
| Search | Name search (recursive walk) | **SUPERSEDED** |
| Auth | JWT + Google/GitHub OAuth, ADMIN roles | **SUPERSEDED/DROP** (Vestara local-session + capability model) |

---

## J. Vestara Comparison Matrix

*Legend: REUSE = lift nearly as-is · ADAPT = same behavior, Vestara contracts · REBUILD = same capability, new architecture · SUPERSEDED = Vestara already stronger · DROP = do not carry.*

| Capability | ai-planner source | Vestara equivalent | Verdict | Reason | Dependencies | Migration risk |
|---|---|---|---|---|---|---|
| PTY session behavior (echo, job control, fullscreen) | `terminal.service.ts:pty.spawn` + gateway | `terminal-runtime/driver.ts` (pty opt-in) + `registry.ts` | ADAPT | Make pty the *tested default path* or document spawn limits; copy behavior, not code | node-pty (already optional in V) | LOW-MED |
| Terminal input discipline (selection-aware Ctrl+C, explicit Enter/Tab/arrows) | `Terminal.tsx: onData/onKey` | `TerminalWorkspace.handleTerminalData` | ADAPT | Fixes known Vestara terminal issues at UI layer | xterm only | LOW |
| Xterm addons (WebGL w/ fallback, clipboard) | `Terminal.tsx` try/catch webgl + `ClipboardAddon` | `TerminalPane` | ADAPT | Proven rendering perf + clipboard | `@xterm/addon-*` (already in V workspace deps) | LOW |
| Command history (auditable) | Prisma `commandHistory` per exec/input | Transcript ring + registry events | ADAPT | Add retained, redacted command log behind existing stores | Existing eng-event store | LOW |
| CWD tracking | `cwdMap` + `prompt{cwd}` + `set_cwd` | `PROMPT_COMMAND` marker (`stream.ts`) | SUPERSEDED | Vestara marker survives cd without interception; keep | — | — |
| Detached session lifecycle | Socket-bound (dies on disconnect) | Registry survives socket drops + reapers | SUPERSEDED | Vestara model is correct; never regress | — | — |
| SSH terminal | `ssh2` shell over terminal socket | None | DROP | Threat surface; violates session≠identity | ssh2, secrets handling | HIGH (rejected) |
| File CRUD ops (user-facing) | `file.controller` + `FileService` + explorer menu/DnD | NONE for users (agent-only `FilesystemRuntime`) | REBUILD | Capability missing; authority must be `FilesystemRuntime` + policy/approval | Existing runtime | MED |
| Media range streaming | `GET /api/file/stream` (206) | Base64-in-JSON only | REBUILD | Required before >5 MB video is real | New endpoint + range impl | MED |
| Media download | `GET /api/file/download` | None | REBUILD (scoped) | Small, safe, auditable | Same as above | LOW |
| Multi-tab editor + draft map | `multiTabEditorStore` | None (single-file `CodeEditor`) | REBUILD | Highest-value editor gap | Vestara state (not nanostores) | MED |
| Status footer (Ln/Col, dirty, path) | `EditorStatusFooter` | None | ADAPT | Cheap, high signal | None | LOW |
| Ctrl+S / Esc / Tab-indent | Monaco command + textarea handlers | Already in `CodeEditor` | SUPERSEDED | Keep Vestara's | — | — |
| Monaco itself | `@monaco-editor/react@4.6` | highlight.js viewer | ADAPT (gated) | Only on proven need (diff/multi-cursor); see §F gate | Bundle/workers/CSP/theme bridge | MED-HIGH |
| Plan shape (thought/assumptions/confidence/tests/git) | `IPlan` + planner UI | Changesets + verification reports | ADAPT | Vocabulary transplant, not code | None | LOW |
| Per-change apply + dry-run | `apply-changes` + UI | `ImplementationService.apply` + verification | SUPERSEDED (execution) / ADAPT (UX) | Keep UX pattern; execution stays governed | — | LOW |
| AI context scan | `FileService.scan` (extension/dir filters) | `search`/`references` + diagnostics | REBUILD | Needs a governed "context pack" shape | FilesystemRuntime | MED |
| Gemini direct client | `geminiService.ts` | OpenCode runtime (`/api/opencode/*`) | SUPERSEDED | Provider boundary is settled | — | — |
| Gemini Live turn protocol | `gemini.gateway/service` | None | ADAPT (protocol ref) | Reference for future realtime loop | Future milestone | MED (deferred) |
| Package-manager sniff | `detectPackageManager` | None (diagnostics adjacent) | ADAPT | Trivial, safe | None | LOW |
| Upload / image proxy | multer + `proxyImage` | None | DROP | SSRF + ingestion policy unresolved | — | HIGH (rejected) |
| MUI/Nanostores/router/auth | Throughout FE + `ADMIN` guards | `ui-tokens/ui-theme`, workspace session, capability model | DROP | Visual/state/identity systems superseded | — | — |
| Face/camera/vision Python | NOT FOUND | `stt/tts/audio/media-runtime` | DROP (nothing to recover) | No source evidence | — | — |

---

## K. Missing Vestara Capabilities (proven in ai-planner, absent in Vestara)

1. **User-facing file mutation API** — create/rename/delete/move/copy over `FilesystemRuntime` with policy/approval/audit. (Biggest functional gap; FILES-EDITOR-001 prerequisite.)
2. **Multi-tab editor with per-tab drafts** — open/activate/close semantics with unsaved guards. (Biggest UX gap.)
3. **Editor status footer** — path, dirty dot, Ln/Col, language. (Smallest effort, immediate signal.)
4. **Range-capable media streaming + download** — `GET` with `Range`/`206` + `Content-Disposition`; unblocks real video/audio. (Media gap.)
5. **Terminal input discipline fixes** — selection-aware Ctrl+C, explicit control bytes, WebGL+clipboard discipline. (Known-issue fixes; no architecture change.)
6. **Auditable command history** — retained redacted command log (shape, not Prisma schema).
7. **Governed AI context pack** — scanPaths-like bundle builder with exclusion taxonomy unified with explorer (replaces two historical taxonomies with one).
8. **Per-change plan apply + dry-run UX vocabulary** — transplant into changeset review UI.

---

## L. Migration Dependency Graph

```
Layer 0 (authority — must come first; no UI depends on ungoverned fs)
 └─ L0.1 Governed file-mutation endpoints over FilesystemRuntime
     (create/rename/delete/move/copy + policy/approval/audit)
Layer 1 (transport)
 ├─ L1.1 Range media streaming + download (needs L0.1 authZ shape)
 └─ L1.2 Governed context-pack builder (needs L0.1 read path)
Layer 2 (editor UX — needs L0.1)
 ├─ L2.1 Multi-tab store + tab header (Vestara state)
 ├─ L2.2 Status footer (Ln/Col, dirty, path, language)
 └─ L2.3 Large-file warning tier (~500 KB) under existing caps
Layer 3 (terminal behavior — independent of L0-L2)
 ├─ L3.1 Input discipline (Ctrl+C selection, control bytes)
 ├─ L3.2 WebGL+clipboard addon discipline
 └─ L3.3 Command-history audit shape
Layer 4 (AI loop — needs L1.2 + L0.1)
 ├─ L4.1 Plan-shape vocabulary in changeset UX
 └─ L4.2 Per-change apply + dry-run affordances
Deferred (no dependency on above; separate milestones)
 ├─ D1 Monaco adoption gate (§F decision)
 ├─ D2 Realtime voice/video loop (protocol ref only)
 └─ D3 SSH (rejected unless governed milestone justifies; default DROP)
```

Ordering rule: nothing in L2/L4 starts before L0.1 lands — otherwise UI would imply an authority that does not exist.

---

## M. Recommended Milestone Decomposition

### FILES-EDITOR-001 (file ops + tabs + footer)

- **F-E-1 (authority):** `POST /api/files/{create,rename,delete,move,copy}` + `GET /api/files/stream` (range) + `GET /api/files/download`, all delegating to `FilesystemRuntime`, with permission checks (`View ≠ Edit ≠ Save`), size caps, audit events. *Acceptance: each op traverses policy/approval; direct-fs impossible from UI.*
- **F-E-2 (tabs):** Vestara tab store (open/dedupe/activate/close/close-all with unsaved guards) + `MultiTabHeader` in `ui-tokens`/`ui-theme` styling. *Acceptance: per-tab draft isolation; refresh-safe where sessions persist.*
- **F-E-3 (footer + warning tier):** `EditorStatusFooter` equivalent + 500 KB caution under 2 MB/5 MB caps. *Acceptance: Ln/Col live, dirty dot, language label.*
- **F-E-4 (menu/DnD):** Context menu + drag-and-drop move (with subdir-self guard) wired to F-E-1. *Acceptance: failed ops surface truthful errors; tree refreshes.*
- **Monaco gate (exit criteria):** Ship F-E-1–F-E-4 on highlight.js. Open Monaco track only with written justification (diff view, multi-cursor, or measured language-service need) + worker/CSP/token-theme/a11y plan.

### TERM-001 (terminal behavior, no architecture change)

- **T-1:** Selection-aware Ctrl+C + explicit Enter/Tab/arrows handling (ai-planner `onKey` discipline ported to `TerminalWorkspace`).
- **T-2:** WebGL-with-fallback + clipboard addon wiring + resize-after-fit ordering.
- **T-3:** Command-history audit shape (redacted, retained, queryable) behind engineering-event store.
- **Non-goals:** No SSH, no lifecycle change (detached model stays), no protocol change (JSON frames stay).

### Engineering Workspace (composition, later)

- File browser (tabs) + terminal + assistant composed in one layout with shared selection/context (context-pack L1.2 feeds assistant).
- Plan-shape vocabulary (thought/assumptions/confidence/tests/git) in changeset review; per-change apply affordances on governed execution.

### Additional justified milestone

- **MEDIA-STREAM-001** (or fold into F-E-1): range streaming + download + fullscreen-action registration for video. Justified because FILES-ASSETS-001 blob previews cannot carry real video; ai-planner proves the transport shape.

---

## N. Evidence (path → symbol → counterpart)

| Claim | ai-planner / project-board-server evidence | Vestara counterpart |
|---|---|---|
| Full file CRUD exists historically | `ai-planner/src/components/file-explorer/api/fileExplorerService.ts` (`fetchDirectoryContents/readFileContent/createFileOrFolder/writeFileContent/deleteFileOrFolder/rename/copy/moveFileOrFolder/getFileStreamUrl`); `project-board-server src/file/file.controller.ts` (`open/close/list/stream/download/read/read-many/proxy/create/create-folder/write/delete/rename/copy/move/search/upload/upload-multiple/scan/apply-changes/git-diff`); `file.service.ts` (`getFilesByDirectory/getFileContent/writeLocalFileContent/deleteLocalFile/rename/copy/move/searchFilesByName/scan/applyFileChanges/getGitDiff`) | `packages/filesystem-runtime/src/{index.ts,types.ts}` (agent-side authority); `apps/workspace/src/features/files/*` (browser, no mutation); NEW `apps/api/src/routes/files.ts` (FILES-ASSETS-001 read/write only) |
| Multi-tab draft semantics proven | `editor/stores/multiTabEditorStore.ts` (`openTab/closeTab/closeAllTabs/setActiveTab/updateActiveTabDraft/saveActiveTabContent`, `IEditorTab` with `content/draftContent/hasUnsavedChanges`) + `editorStore.ts` (singleton) + `floatingWindowsStore.ts` | `features/files/components/CodeEditor.tsx` (single-file draft/dirty/save) — no tabs |
| Monaco wiring proven | `editor/monaco/MonacoEditor.tsx` (`Editor`, `addCommand(CtrlCmd+S)`, `onDidChangeCursorPosition`, `MONACO_THEME_MAP`) + `views/FileContentRenderer.tsx` (`determineRendererType`, 500 KB gate) + `views/EditorStatusFooter.tsx` | `DocCodeBlock.tsx` (highlight.js); `file-classification.ts` (MIME-first) |
| Terminal PTY proven | `terminal/Terminal.tsx` (Xterm 366 lines: fit/webgl/clipboard, `onData/onKey` split) + `services/terminalSocketService.ts` (`connect/disconnect/execCommand/setCwd/resize/sshConnect/sendInput/closeSession`) + `services/socketClientFactory.ts` (`/terminal`, JWT, `initialCwd` query) + BE `terminal.gateway.ts` (`cwdMap/sshClientMap/sshStreamMap`, `exec_terminal/exec/input/resize/set_cwd/ssh-connect/close`, `cd/osinfo` handling) + `terminal.service.ts` (`node-pty` spawn, `onData→output`, Prisma `terminalSession` + `commandHistory`, `runCommandOnce/runSshCommandOnce/getPackageScripts`) | `packages/terminal-runtime/{driver.ts,registry.ts,stream.ts}` + `TerminalWorkspace.tsx` + `/ws/terminal` frame protocol |
| Media stream with ranges proven | `FileController.streamFile` (206 partial, `mime-types`) + `downloadFile` (`StreamableFile`) + FE `mediaStreamUrl/Loading/Error` + `VideoPlayer/AudioPlayer` | `FilePreview.tsx` (blob URLs, no ranges) |
| Gemini text+SSE proven | `src/api/geminiService.ts` (`generateContent/streamGenerateContent/streamContent`, backoff, 4-shape extractor) | `/api/opencode/*`, `/api/providers` (OpenCode runtime — different boundary) |
| Gemini Live turn protocol proven | `apps/gemini-live/server/src/gemini/gemini.gateway.ts` (`startLiveSession/textInput/audioInput/processTurn/endLiveSession`) + `gemini.service.ts` (session map, 5-min reaper, PCM→WAV, `sendMessageStream`) | None |
| No face/camera/Python service | Zero `*.py` service hits; `faster-whisper-env` vendored only; `ai-audio-app` simulated oscillator (read in full); `live-audio` shaders | `packages/{stt,tts,audio}`, `media-runtime` cover the space |
| Auth coupling (do not copy) | `JwtAuthGuard + RolesGuard + @Roles(ADMIN)` on file/terminal/folder endpoints; JWT handshake on sockets; `localStorage` token | Local-session API, workspace-scoped containment, capability model |

---

## O. HOLD / Unknowns (do not guess)

1. **BE branch identity.** The `src/{file,folder,terminal}` NestJS tree was fetched from the GitHub `main` tree view; the local `project-board-server` clone's `main` branch shows a different app-monorepo layout without that `src/` tree. Exact commit/branch correspondence between fetched backend files and either local clone or ai-planner's pinned backend is **unestablished**. All backend citations above are to the fetched tree contents, which match ai-planner's `VITE_API_URL` contract (`/api/file/*`, `/terminal` namespace).
2. **Terminal "works well in actual use" basis.** Taken as reporter testimony (task statement); no load/latency/error-rate data in source. Comparison is architectural + code-path, not benchmarked.
3. **Prisma schema specifics** (`terminalSession`, `commandHistory`, folder models) were imported but schema files were not inspected — command-history recommendation is *shape-only*.
4. **`floatingWindowsStore` internals** (drag/resize/z-order/persistence) were referenced but not line-read; floating-window recovery is scoped to media-stream URL + action-registration patterns only.
5. **`utils/editorUtils.getMonacoLanguage` mapping table** not line-read; language-detection comparison rests on `file.service` `detectLanguage` call-site + constants sets.
6. **Folder Prisma service** (`folder.service`) not fetched (controller only); folder-DB duality finding rests on controller + FE non-use.
7. **`plannerService` / `IPlan` type file** not line-read (planner dir listed, service referenced from README + docs); plan-shape finding rests on README feature list + `apply-changes`/`git-diff` DTOs.
8. **Licensing/provenance** of vendored `faster-whisper-env` and `icons/` not audited — irrelevant (nothing recovered from them).
9. **Performance characteristics** (Monaco bundle weight in this app, PTY throughput, scan latency on large repos) not measured — classifications use structural reasoning, flagged where load-bearing (Monaco gate).

---

*End of IDE-RECOVERY-001. No code modified, no dependencies installed, no migration started. Highest-value recoverables: governed file-mutation endpoints (L0.1) → multi-tab drafts + status footer → range media streaming → terminal input/addon discipline → context-pack + plan-shape UX. Monaco and realtime-voice deferred behind explicit gates; SSH and proxy/upload rejected.*
