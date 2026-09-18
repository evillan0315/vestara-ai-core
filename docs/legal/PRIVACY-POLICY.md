---
title: Vestara Privacy Policy (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Privacy Policy — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. Makes no compliance claim (GDPR, CCPA, or otherwise). Categories
> below reflect repository evidence, tagged CURRENT / PLANNED / UNKNOWN.

## 1. Controller identity

- UNKNOWN. No organization identity, contact, or jurisdiction found in the
  repository. **LEGAL REVIEW REQUIRED** — a privacy policy cannot be effective
  without a named controller and contact.

## 2. Information Vestara may process (evidence-grounded)

| Category | Basis in repository | Processing footprint |
|---|---|---|
| Account/identity information | Identity registry `docs/IDENTITY-OWNERSHIP.md`; planned `HumanPrincipal`/`ExternalIdentity` (`packages/workspace/src/milestone-service.ts`) | Local stores; PLANNED external IdP bindings (Google/GitHub) |
| Authentication bindings | OpenCode OAuth routes (`packages/opencode-runtime/openapi/opencode.openapi.json`: `/provider/{id}/oauth/*`, `/api/integration/.../connect/oauth`); planned Google OIDC/GitHub OAuth adapters | CURRENT for OpenCode-mediated flows; Vestara-native Google/GitHub login PLANNED |
| Host/system information | `@vestara/host-runtime` read-only observation; `apps/api/src/diagnostics/collect.ts` (CPU/memory/disks/network/GPU/Docker/processes); OS-0 baseline `docs/foundation/12-os-0-host-integration.md` | CURRENT, local |
| Workspace/repository/file information | Filesystem runtime, repository binding (`VESTARA_REPO`), change-event bridge, `apps/api/src/bridges/change-event-bridge.ts` | CURRENT, local |
| Conversations/messages | SQLite-backed conversation store persists conversation + message rows across restarts (`packages/conversation-runtime/src/conversation-store.ts`); interaction persistence (`packages/interaction-persistence/src/sqlite-store.ts`); activity store | CURRENT, local SQLite |
| AI prompts/context/results | Provider executor streams via OpenCode (`apps/api` assistant path → `localhost:4096`); real-LLM e2e uses `.env` credentials (`scripts/wfo-e2e-002b-live.ts`) | CURRENT: transmitted to configured external providers (see `AI-PROVIDER-DISCLOSURE.md`) |
| Provider/model metadata | OpenCode `/config` + `/config/providers` projections; API key stripping (`apps/api/src/workspace-context.ts`) | CURRENT, local; keys stripped from projections |
| Agent/workflow/execution information | Agent harness, workflow orchestrator, runtime sessions, evidence pipeline (`packages/evidence/src/`) | CURRENT, local |
| Telemetry/logs/diagnostics | `@vestara/telemetry` (`TelemetryRuntime`); orchestrator `onTelemetry`; TUI telemetry view; `/api/telemetry/agents` | CURRENT, local. No external telemetry transmission evidenced |
| Capture/artifacts | `@vestara/screen-capture` (portal-mediated, opaque tokens, permission defaults); evidence visual ingest/serve (`packages/evidence/src/`, `packages/media-runtime/src/`) | CURRENT, local |
| Credentials/secrets | `.env` holds live-agent credentials, gitignored, never committed (`AGENTS.md`); centralized redaction before persistence/logging/telemetry (`packages/external-runtime/src/redact.ts`); media-runtime telemetry secret test | CURRENT, local; redaction is defense-in-depth, not a secrecy guarantee |
| Marketplace information | Installed-package state, publisher IDs, verification signals (`packages/marketplace/src/`) | CURRENT, local; remote registries PLANNED |

## 3. Local vs external vs future-cloud processing

- **Local processing (CURRENT):** API/UI/CLI persist SQLite stores, logs,
  telemetry, evidence on the host machine. Default API bind is loopback
  (`127.0.0.1:3001`).
- **External-provider processing (CURRENT when configured):** AI provider
  calls, OAuth integrations, browser/screenshot services transmit selected
  data per configuration. Do NOT assume data remains local — the architecture
  permits external transmission (`AI-PROVIDER-DISCLOSURE.md`).
- **Future cloud processing (PLANNED):** cloud/headless/runtime workers per
  VES-BASELINE-001. No cloud data handling evidenced — **LEGAL REVIEW REQUIRED**
  before any cloud offering.

## 4. Purposes,Retention, rights

- Purposes, lawful bases, retention periods, and data-subject rights are
  UNKNOWN beyond what `DATA-RETENTION-DELETION-POLICY.md` evidences (SQLite
  persistence; no evidenced deletion/export APIs). **LEGAL REVIEW REQUIRED.**

## 5. Security

- See `SECURITY-POLICY.md`. Redaction, loopback binding, and deny-by-default
  power operations are engineering controls, not compliance certifications.

## Statements deliberately withheld

Controller identity/contact; DPO; lawful bases; retention schedule; subject
rights procedure; international transfers; children's data; cookie/tracking
position; breach-notification process.
