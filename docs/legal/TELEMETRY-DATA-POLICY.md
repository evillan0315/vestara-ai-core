---
title: Vestara Telemetry Data Policy (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Telemetry & Data Policy — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. Describes evidenced behavior. Claims no external telemetry,
> no consent mechanism, and no compliance position.

## 1. What telemetry exists (CURRENT)

- `@vestara/telemetry`: `TelemetryRuntime` with typed events, snapshots, and
  subscribers (`packages/telemetry/src/`). CURRENT.
- Workflow/orchestration hooks: `onTelemetry` operation callbacks, observation
  evaluation sinks, filesystem-runtime op tracking. CURRENT.
- Surfaces: TUI telemetry/logs view (`packages/tui/src/`), `/api/telemetry/agents`
  endpoint, diagnostics snapshots (read-only collection;
  `apps/api/src/diagnostics/`). CURRENT.
- Redaction: `packages/external-runtime/src/redact.ts` redacts token/key/
  secret/password/credential patterns before persistence, logging, telemetry,
  and graph writes; `packages/media-runtime` tests assert telemetry payloads
  carry no secrets. CURRENT (control evidenced, completeness not audited).

## 2. Where telemetry goes (CURRENT)

- Local-only evidenced: in-process sinks, local stores, loopback API reads.
  **No repository evidence of telemetry transmitted off-machine** (no external
  telemetry endpoint found). This is an evidence statement, not a guarantee:
  future integrations could add egress, and provider-bound payloads are
  covered by `AI-PROVIDER-DISCLOSURE.md`, not this file.

## 3. Telemetry consent

- No telemetry consent mechanism, opt-in/out setting, or consent record was
  evidenced. Telemetry consent is therefore UNKNOWN / not implemented.
  **LEGAL REVIEW REQUIRED** before any telemetry leaves the machine or any
  consent claim is made. Consent runtime (`ConsentRecord`) is future work —
  DO NOT IMPLEMENT in LEGAL-TRUST-001.

## 4. Diagnostics vs telemetry

- Diagnostics snapshots are read-only, no-persistence collection
  (`apps/api/src/diagnostics/snapshots.ts`). Telemetry events are buffered
  operational records. Logs include API/CLI output. All three are local unless
  the operator exports them (e.g. attaching logs to a bug report — operator
  action, out of scope for this policy's claims).

## Statements deliberately withheld

Event taxonomy; retention periods; sampling; any off-machine telemetry;
consent UX; DNT/regulatory signals handling.
