---
title: Vestara Third-Party Software (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Third-Party Software — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. Separates four categories that must never be conflated. No
> redistribution rights are assumed for anything Vestara does not own.

## 1. The four categories

| # | Category | Examples (evidenced) | License posture |
|---|---|---|---|
| 1 | Vestara first-party code | `packages/*`, `apps/*` (`@vestara/*`) | See `SOFTWARE-LICENSE.md` — headline finding applies |
| 2 | Open-source dependencies | `node_modules` tree; auditable via `pnpm licenses list` | Per-package OSS licenses; inventory NOT yet generated |
| 3 | Third-party proprietary software/services | External AI providers via OpenCode; OAuth IdPs; browser/screenshot services; OpenVidu adapter; Telegram integration surfaces | Their terms/privacy policies govern; Vestara terms do not replace them |
| 4 | Marketplace packages | Publisher-keyed assets (`publisherId/packageName`), local + (planned) remote registries (`packages/marketplace/src/`) | Separately licensed; availability ≠ redistribution rights |

## 2. Evidenced third-party touchpoints (CURRENT unless noted)

- **AI providers** via OpenCode adapter (`localhost:4096`; `/api/opencode/*`
  boundary): prompts/context may leave the machine — `AI-PROVIDER-DISCLOSURE.md`.
- **OAuth integrations**: OpenCode OAuth routes for providers/integrations/MCP
  (`packages/opencode-runtime/openapi/opencode.openapi.json`); Vestara-native
  Google/GitHub bindings PLANNED.
- **Build/runtime tools**: Node 22, pnpm 11, Vite, Tauri (desktop shell),
  systemd units (`os/`), Playwright/Chromium for visual regression.
- **Communication surfaces**: Telegram integration (surface/participation,
  not identity authority per milestone text); OpenVidu adapter; websearch/
  webfetch egress in assistant tooling.
- **Remote Marketplace registries**: PLANNED (`registry.ts`: "designed for
  future public/enterprise registries").

## 3. Rules

- Category 3 and 4 terms apply alongside Vestara's drafts, never instead of them.
- Do not assume Marketplace availability means Vestara has redistribution
  rights — **LEGAL REVIEW REQUIRED** per channel.
- SBOM/license/provenance generation is a future requirement (no automation
  evidenced) — DO NOT IMPLEMENT here.

## Statements deliberately withheld

Exhaustive vendor list; data-processing terms with any vendor; redistribution
rights for any specific package or service.
