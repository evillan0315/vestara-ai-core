---
title: CSP-016-os-integration — AI OS Integration
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-20
next-review: 2026-11-20
---

# CSP-016-os-integration — AI OS Integration

**Capability Specification Package**

| Field | Value |
|-------|-------|
| ID | CSP-016-os-integration |
| Name | AI OS Integration |
| Version | 1.0 |
| Status | Implemented (v2.0) |

> **Status note (T10 reconciliation, 2026-10-20):** frontmatter `status:
> proposed` is the *document* lifecycle state (shared vocabulary across all
> CSPs; `implemented` would additionally require
> `implementation-repository` / `implementation-commit` per
> `scripts/docs-automation.mjs`). The table's "Implemented (v2.0)" is the
> *capability* implementation state. See VES-UI-001 plan finding A10.
>
> **Note (VES-UI-002 U5, 2026-10-21):** Tauri-first host port has no on-disk
> deep-link implementation (`teal://vestara-shell` absent from
> `apps/workspace/src-tauri/tauri.conf.json` / `Cargo.toml` / `src/*.rs`;
> deep-link mapping tests NOT ESTABLISHED, blocked on U3). Bundle config ships
> `app.security.csp: null` — no bundle CSP; scheme/CSP review is due when U3
> lands. `os/` systemd/Plymouth scope is explicitly excluded from VES-UI-002.
