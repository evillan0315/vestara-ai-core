---
title: CSP-010-workspace-ui — Workspace UI
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-20
next-review: 2026-11-20
---

# CSP-010-workspace-ui — Workspace UI

**Capability Specification Package**

| Field | Value |
|-------|-------|
| ID | CSP-010-workspace-ui |
| Name | Workspace UI |
| Version | 1.0 |
| Status | Implemented (v1.1) |

> **Status note (T10 reconciliation, 2026-10-20):** frontmatter `status:
> proposed` is the *document* lifecycle state (shared vocabulary across all
> CSPs; `implemented` would additionally require
> `implementation-repository` / `implementation-commit` per
> `scripts/docs-automation.mjs`). The table's "Implemented (v1.1)" is the
> *capability* implementation state. See VES-UI-001 plan finding A10.
>
> **Note (VES-UI-002 U5, 2026-10-21):** shell bridge mapping is Vitest-guarded
> (`packages/boot-runtime/__tests__/shell-bridge.test.ts`, 7 green). There is no
> Playwright visual gate: the visual-regression workflow and its governance were
> removed, and `pnpm screenshots:*` remains a local-only diagnostic. The Tauri
> bundle ships the same `../dist` output the web build serves.
