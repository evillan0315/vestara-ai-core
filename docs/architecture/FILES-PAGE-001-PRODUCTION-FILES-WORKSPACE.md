---
title: FILES-PAGE-001 — Production Files Workspace
version: 1.0.0
status: implemented
owner: vestara
last-reviewed: 2026-09-18
next-review: 2026-10-18
implementation-repository: vestara-ai-core
implementation-commit: 6350c75a0a314a92a7a757eb3265134701f960d1
---

# FILES-PAGE-001 — Production Files Workspace

**Status:** IMPLEMENTED 2026-09-18 — verification: `pnpm build` ✓, `pnpm lint:check` ✓, 63 vitest (6 files) ✓, `vite build` bundle ✓, live CDP dogfood 18/18 ✓ zero console errors. Remaining: full `tsc -b` for workspace-ui blocked by unrelated pre-existing `assistant-navigation.ts` error (not touched); Search/Git/References per scope decision below.
**Baseline:** FILES-EDITOR-001 + FILES-EDITOR-002 accepted. Do not reopen tabs, footer, mutation endpoints, streaming, download, DnD, token work, or the authority model except where integration requires it.
**Rule:** `Files Page = workspace/control surface` · `FilesystemRuntime = authority`
**Scope decision:** Do NOT build Search, Git, References, or deep Activity integration merely because they appear in the concept image. Give them layout extension points, activate only when governed capabilities exist.

## Goal

Rebuild the Files page into the canonical three-pane workspace below while preserving the governed filesystem architecture, so Files feels structurally like Activity Room: one Vestara shell, multiple bounded panes, authoritative runtime underneath, projections in the UI.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ FILES PAGE HERO / WORKSPACE STATUS                                           │
│ Files    vestara-ai-core • Live    Files | Dirs | Storage    New | Upload   │
│ Search files by name, path, or content...                                   │
├────────────────┬──────────────────────────────────────┬──────────────────────┤
│ FILE BROWSER   │ WORK AREA                            │ INSPECTOR            │
│ repository     │ Files | Editor | Preview | Search   │ Details              │
│ tree           │                                      │ Activity             │
│ recent         │ breadcrumbs                          │ Git                  │
│ storage        │ directory / editor / preview         │ References           │
│                │                                      │ governed actions     │
├────────────────┴──────────────────────────────────────┴──────────────────────┤
│ FILE OPERATIONS / STATUS                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

## FP-1 — Shared workspace shell

Page composition from reusable layout primitives (same structural grammar as Activity Room: bounded container, pane borders, header treatment, scroll ownership, responsive collapse, canonical spacing). Do not copy Activity Room CSS; share layout primitives.

```text
FilesPage
├── FilesPageHero
├── FilesToolbar
└── FilesWorkspaceLayout
    ├── FilesExplorerPane
    ├── FilesWorkArea
    ├── FileInspectorPane
    └── FileOperationsBar
```

## FP-2 — Hero (operational, Activity Room-style)

`Files` + workspace identity + live state + file/dir/storage metrics (from authoritative/project data — never hardcoded) + New / Upload / overflow. Upload stays disabled until a governed upload capability exists.

## FP-3 — Toolbar

Global search field + view/type/sort/filter controls. Invariant: **visible control ⇒ supported capability**. No fake search; content search only if runtime-backed.

## FP-4 — Explorer pane

Persistent left navigator over the FILES-EDITOR-002 browse projection (no second tree model): expand/collapse, selection, active file, keyboard nav, nested scroll, loading/empty/snapshot/truncation states, context menu, governed DnD move. Own vertical scroll.

## FP-5 — Central work area

Modes `Files | Editor | Preview | Search | Git`; only backed capabilities active (Files/Editor/Preview now; Search only if runtime-backed; Git HOLD). Directory mode: breadcrumbs + Name/Type/Size/Modified table.

## FP-6 — Editor integration

Reuse FILES-EDITOR-001 (`MultiTabHeader` + `CodeEditor` + `EditorStatusFooter`). No second editor. Preserve `View ≠ Edit ≠ Save`, `Draft ≠ Persisted`; tabs stay local presentation state.

## FP-7 — Inspector (contextual)

Details (implement) | Activity (only file-correlated ops from existing projections) | Git (HOLD) | References (HOLD). No fixture-filled tabs. Actions: Open, Open in Editor, Download, Copy Path, Rename, Duplicate, Delete — all via FP-8.

## FP-8 — Shared file-operation controller

One `useFileOperations()` layer (create/rename/duplicate/move/delete/download/refresh) used by tree menu, directory table, and inspector — never per-component endpoint calls.

## FP-9 — Operations bar

Real operation state (idle/active/success/failure/approval-required with Review/Dismiss). Consumes state; never an execution authority.

## FP-10 — Approval UX (first-class 402)

`User action → File operation → Runtime policy → ALLOW/DENY/APPROVAL`; approval UI surfaces the pending operation with approve/reject + retry; denials explained, never hidden behind generic failure.

## FP-11 — Snapshot/truncation states

Snapshot fallback must be visually unmistakable (`⚠ SNAPSHOT …`); browse `truncated` must surface (`⚠ Partial tree …`). Closes the FILES-EDITOR-002 UI gap without touching browse authority.

## FP-12 — Responsive

Desktop `Explorer | Work Area | Inspector`; medium `Explorer | Work Area` + inspector drawer; small work-area-first with drawers. One layout owner; bounded panes scroll internally.

## FP-13 — Design enforcement

`@vestara/ui-tokens`, `@vestara/ui-theme`, `@vestara/ui` primitives, Tailwind v4 through canonical tokens only, MUI/Material Icons where appropriate. No `bg-zinc-*`/`text-slate-*`/hardcoded colors. Must sit beside Activity Room.

## FP-14 — Verification

Component tests (explorer, directory nav, tabs, inspector sync, op/approval/snapshot/truncation states, keyboard, panes) + integration flow (browse→select→open→edit→dirty→save→persisted→rename→refresh→move→download→delete→refresh) + live runtime dogfood.

## Sequence

FP-1 shell → FP-2 hero → FP-3 toolbar → FP-4 explorer → FP-5 directory area → FP-6 editor → FP-7 inspector → FP-8 controller → FP-9 ops bar → FP-10 approval → FP-11 states → FP-12 responsive → FP-13 tokens → FP-14 verification → DOGFOOD → EVIDENCE → FREEZE.
