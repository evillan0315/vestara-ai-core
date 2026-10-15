---
title: "Architecture Knowledge Graph (AKG)"
volume: "00-governance"
book: "Book 1: Vision & Business"
version: "1.0.0"
status: "draft"
owner: "@chief-architect"
last-reviewed: "2025-07-30"
next-review: "2026-07-30"
tags: ["akg", "adr", "knowledge-graph", "architecture", "governance"]
---

# Architecture Knowledge Graph (AKG)

## What This Is

The ADR directory is not a flat document collection. It is a **directed graph** — the Architecture Knowledge Graph — where every node is an ADR and every edge is a typed relationship.

The AKG connects constitutions, architectural decisions, blueprint volumes, runtimes, and organizational roles into a single navigable structure. Both humans and AI agents traverse this graph to answer questions like:

- *What depends on this decision?*
- *Where is this principle applied?*
- *Who must enforce this?*

---

## Node Types

| Node | Source | Example |
|------|--------|---------|
| **Constitution** | `00-governance/` | Product Constitution (Article VIII) |
| **ADR** | `adr/ADR-NNN-*.md` | ADR-100: AI Organization Over AI Assistant |
| **Blueprint** | `XX-volume/YY-file.md` | `23-conversation/04-group-chat.md` |
| **Runtime** | `vestara-ai-core/packages/*` | Verifier Runtime, Conversation Runtime |
| **Role** | Agent definitions | Planner, Engineer, Verifier |

---

## Edge Types

### `depends_on` — Structural dependency

An ADR may depend on other ADRs. If the target ADR changes, this ADR may need to change.

```
ADR-104 ──depends_on──→ ADR-103
```

Interpretation: *ADR-104 cannot be understood without ADR-103; altering ADR-103 may require updating ADR-104.*

### `referenced_by` — Navigational link

Points to ecosystem artifacts that reference or implement this ADR.

```
ADR-100 ──referenced_by──→ 08-product-constitution (Article VIII)
ADR-100 ──referenced_by──→ 23-conversation/04-group-chat.md
```

Interpretation: *These artifacts are where this ADR's principles appear in practice.*

### `influences` — Organizational ownership

Names the roles (human or agent) that must understand or enforce this ADR.

```
ADR-100 ──influences──→ Planner, Engineer, Reviewer, Verifier, Context
```

Interpretation: *Every agent in the AI organization must understand this ADR.*

---

## Current Graph

```text
ADR-100 (Organization)
  depends_on: —
  referenced_by: Product Constitution, 23-conversation/04-group-chat.md
  influences: Planner, Engineer, Reviewer, Verifier, Context
  │
  ├── ADR-101 (Conversation)
  │     depends_on: ADR-100
  │     referenced_by: 23-conversation/
  │     influences: Conversation Runtime, Planner, Engineer, Voice Pipeline
  │
  └── ADR-103 (Workspace Context)
        depends_on: ADR-100
        referenced_by: Product Constitution (Art. I), 06-workspace/
        influences: Context Agent, Workspace Runtime, Knowledge Graph, Memory, Planner
        │
        └── ADR-104 (Verification)
              depends_on: ADR-100, ADR-103
              referenced_by: Product Constitution (Art. VI), EvaluationHarness
              influences: Verifier, Evaluation Engine, Review Workflow, CI Pipeline

ADR-102 (VDS)
  depends_on: —
  referenced_by: 13-design-system/
  influences: Frontend Engineer, UI Designer, Workspace UI, Mobile Engineer

ADR-111 (Agent Harness)
  depends_on: ADR-103, ADR-104, ADR-105, ADR-106, ADR-107
  referenced_by: 04-platform/agent-harness-architecture.md,
                 04-platform/engineering-operating-system.md
  influences: Platform Engineer, AI Engineer, Security Engineer,
              Workspace UI, CLI, Agent Runtime

ADR-112 (Extension Platform)
  depends_on: ADR-104, ADR-106, ADR-111
  referenced_by: 10-developer-platform/extension-platform.md,
                 20-roadmaps/extension-platform-roadmap.md
  influences: Platform Engineer, Security Engineer, Developer Experience,
              Provider Runtime, Workspace UI, CLI

ADR-113 (Native TUI)
  depends_on: ADR-106, ADR-111, ADR-112
  referenced_by: 13-design-system/17-terminal-console.md
  influences: Platform Engineer, Frontend Engineer, Developer Experience,
              CLI, Workspace Runtime, Extension Platform

ADR-114 (Linux Host Integration)
  depends_on: ADR-104, ADR-107, ADR-111
  referenced_by: 07-operating-system/os-0-host-integration.md,
                 07-operating-system/README.md
  influences: Platform Engineer, DevOps Engineer, Security Engineer,
              Kernel, Host Runtime, Boot Runtime
```

---

## Graph Rules

1. **No cycles.** An ADR must not depend on another ADR that transitively depends on it.
2. **`depends_on` is conservative.** List only direct architectural dependencies. If ADR-B would be incoherent without ADR-A, list the dependency.
3. **`influences` names roles, not individuals.** Use agent role names (Planner, Verifier) or engineering roles (Frontend Engineer), not personal names.
4. **`referenced_by` is maintained.** When a blueprint document or runtime is created that embodies an ADR, add the reference. When one is removed, remove the reference.
5. **ADR frontmatter is a public API.** Agents read these fields programmatically. Do not treat them as prose — every value should be parseable and predictable.
6. **`id` is immutable.** The `id` field (e.g., `adr-100`) never changes, even if the filename or human-readable `adr` label is renamed. All cross-references use `id`, never the filename or `adr` string. This prevents broken links during reorganization.

---

## Future Direction

As the graph grows, the AKG can power:

- **Impact analysis** — *"If ADR-103 changes, what else is affected?"*
- **Agent onboarding** — *"Which ADRs must the Verifier agent understand?"*
- **Architecture Explorer** — Interactive visualization in the workspace UI
- **Consistency verification** — Automated checks that blueprint docs correctly reference the ADRs they implement
- **`vestara blueprint verify`** — Structural integrity checks: all `depends_on` targets exist, no cycles, every `referenced_by` path resolves, no orphaned ADRs, no broken `id` references
- **Architecture Runtime** — A service that indexes the AKG and exposes `findDependencies()`, `findAffectedCapabilities()`, `validateConsistency()` as queryable operations

The AKG is not documentation. It is the **shared architectural memory** that both human and AI participants reason over.

## Related documents

- [ADR 119 agent type selection](ADR-119-agent-type-selection.md)
- [ADR 120 durable agent execution](ADR-120-durable-agent-execution.md)
- [ADR 121 engineering event projection](ADR-121-engineering-event-projection.md)
- [ADR 122 real time workflow lifecycle](ADR-122-real-time-workflow-lifecycle.md)
- [ADR 123 eight stage workflow agent attribution](ADR-123-eight-stage-workflow-agent-attribution.md)
- [ADR 124 unified marketplace asset model](ADR-124-unified-marketplace-asset-model.md)
- [ADR 125 ai qualification by governed engineering behavior](ADR-125-ai-qualification-by-governed-engineering-behavior.md)
- [ADR 126 activity room as projection](ADR-126-activity-room-as-projection.md)
- [ADR 127 local first marketplace](ADR-127-local-first-marketplace.md)
- [ADR 128 execution platform initiative](ADR-128-execution-platform-initiative.md)
- [ADR 129 workspace ui as standalone desktop application](ADR-129-standalone-workspace-ui.md)

