---
title: VDS cross-surface provider UX
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# VDS cross-surface provider UX

The provider settings contract is shared by Workspace UI, native TUI, and the
CLI. Workspace/API owns persistence and revision checks; each client renders a
projection of that state and sends governed CRUD commands.

## Semantic states

Clients use the VDS 1.1 states `healthy`, `degraded`, `unavailable`, `disabled`,
`authentication-required`, `approval-required`, `conflict`, `saving`, `saved`,
`failed`, `blocked`, `pending`, and `working`. State labels and symbols remain
available when color is disabled.

## Provider/model identity

Provider identity is always scoped: `providerId` plus `modelId`. Credentials are
masked and never persisted in client history. TUI selection and CLI commands
are equivalent to the Workspace provider editor and use the same revision-aware
API operations.

## Validation

Run `pnpm vds:validate` from `vestara-ai-core` to check that the canonical VDS
documents, semantic CSS tokens, Workspace status component, TUI adapter, and
CLI adapter are present.
