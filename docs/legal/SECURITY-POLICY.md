---
title: Vestara Security Policy (Draft)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# Security Policy — DRAFT

| Field | Value |
|---|---|
| Status | DRAFT |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal |

> Draft only. Mirrors evidenced `SECURITY.md` plus evidenced controls. Claims
> no certification, standard conformance, or audit outcome.

## 1. Reporting (CURRENT — from `SECURITY.md`)

- Report privately to maintainers; do not open public issues. Acknowledgement
  within 48 hours; maintainers work on a fix. CURRENT (as documented).
- Gap: no reporting address is given in `SECURITY.md`. **LEGAL REVIEW
  REQUIRED**: publish a monitored contact before any release.

## 2. Supported versions (CURRENT — from `SECURITY.md`)

- "Only the latest release receives security patches." CURRENT (as
  documented). Release/versioning practice for security advisories is
  UNKNOWN — **LEGAL REVIEW REQUIRED**.

## 3. Evidenced engineering controls (CURRENT)

- Loopback-default API bind (`127.0.0.1:3001`); UI proxies `/api`+`/ws`. CURRENT.
- API keys stripped from config projections; credentials in gitignored `.env`,
  never committed. CURRENT.
- Centralized secret redaction before persistence/logging/telemetry/graph
  writes; secret-free telemetry assertions. CURRENT.
- Permission allow/ask/deny + repository confinement. CURRENT.
- OS-0: read-only host observation; power operations deny-by-default,
  requiring authorization callback + policy permission; no power mutation via
  HTTP/CLI. CURRENT.
- Marketplace: strict manifest validation, digest verification, traversal
  guards, independent verification signals; signatures validated only with
  configured keys (limitation recorded in `MARKETPLACE-PACKAGE-POLICY.md`). CURRENT.
- Screen capture: portal-mediated opaque tokens, permission defaults; agents
  must not gain window handles. CURRENT.

## 4. Not claimed

- No SOC 2, ISO 27001, penetration-test, or audit claim. No vulnerability-SLA
  beyond the 48-hour acknowledgement in `SECURITY.md`. No EOL/EOU policy.
  All withheld — **LEGAL REVIEW REQUIRED**.

## Statements deliberately withheld

Security contacts; advisory process; CVE handling; incident response;
subprocessor posture for future cloud; customer notification duties.
