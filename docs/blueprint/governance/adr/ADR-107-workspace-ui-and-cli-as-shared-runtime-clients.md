---
id: "adr-107"
adr: "ADR-107"
title: "Workspace UI and CLI as Shared Runtime Clients"
category: "foundation"
version: 1.0
date: "2026-08-01"
status: "proposed"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@backend-engineer"]
informed: ["@team"]
tags: ["cli", "workspace", "integration"]
referenced_by:
  - type: "blueprint"
    target: "06-workspace/cli-workspace-integration.md"
---

## Context

The Workspace UI and the CLI currently boot separate runtimes, so identity,
history, approvals, and verification diverge. The target is two clients of one
runtime.

## Decision

Adopt the target model where Workspace UI (HTTP/WebSocket) and Vestara CLI
(HTTP/IPC/Unix socket) are clients of the same Workspace API, sharing workspace
identity, configuration, execution history, approvals, verification, command
origin, and event origin. Introduce a shared command envelope
(`commandId`, `workspaceId`, `source`, `type`, `payload`, `requestedAt`,
`correlationId`, `causationId`, `sessionId`) only after confirming no existing
session/intent/execution contract already fulfills it.

## Consequences

### Positive
- One source of truth for history and approvals.
- CLI activity visible in the UI; UI commands equivalent in the CLI.

### Negative
- Migration of the CLI runtime to the shared API.
- Correlation envelope must thread through the system.

### Risks
- Duplicating an existing command contract (risk; mitigation: extend the
  engineering session contract first).

## Alternatives Considered
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Keep separate runtimes | no work | divergent state | rejected |
| Full shared kernel embedded in both | strong | heavy | deferred |

## Implementation Notes
- Migration required? Yes (CLI runtime).
- Status: proposed; not implemented.
