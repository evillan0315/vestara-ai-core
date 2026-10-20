---
title: "Architectural Decision Log (ADR)"
volume: "00-governance"
book: "Book 1: Vision & Business"
version: "1.1.0"
status: "approved"
owner: "@chief-architect"
last-reviewed: "2026-08-02"
next-review: "2026-11-02"
canonical: true
supersedes: []
tags: ["adr", "decisions", "architecture", "governance"]
---

# Architectural Decision Log (ADR)
## Immutable Record of Architectural Decisions

> **Every architectural decision MUST be recorded here. Code without ADR is technical debt.**

---

## ═══════════════════════════════════════════════════════════════════
### 📋 ADR TEMPLATE
### ═══════════════════════════════════════════════════════════════════

```markdown
---
id: "adr-xxx"              # immutable — does not change if filename changes
adr: "ADR-XXX"             # human-readable label, may be renamed
title: "Short descriptive title"
category: "foundation | implementation | standard"
version: 1.0
date: "YYYY-MM-DD"
status: "proposed | accepted | superseded | deprecated"
author: "@role"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer", "@ai-engineer"]
informed: ["@team"]
tags: ["database", "api", "security", "ai"]
depends_on:
  - id: "adr-yyy"
    relationship: "explains why"  # optional: explains how this ADR relies on another
referenced_by:
  - type: "blueprint"
    target: "XX-volume/YY-file.md"
  - type: "constitution"
    target: "CONSTITUTION_NAME"
  - type: "runtime"
    target: "RuntimeName"
influences:
  - "RoleName"  # organizational roles that must understand this ADR
---

## Context
What is the issue? What constraints exist? What triggered this decision?

## Decision
What did we decide? Be specific.

## Consequences

### Positive
- Benefit 1
- Benefit 2

### Negative
- Trade-off 1
- Trade-off 2

### Risks
- Risk 1 (mitigation: ...)
- Risk 2 (mitigation: ...)

## Alternatives Considered
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Alt 1 | ... | ... | ... |
| Alt 2 | ... | ... | ... |

## Implementation Notes
- Migration required? (Y/N)
- Breaking changes? (Y/N)
- Timeline?

## Related
- ADR-XXX (supersedes)
- ADR-YYY (related)
- Blueprint volume: XX-volume/YY-file.md
```

---

## ═══════════════════════════════════════════════════════════════════
### 📚 DECISION INDEX
### ═══════════════════════════════════════════════════════════════════

| ADR | Title | Status | Date | Blueprint Impact |
|-----|-------|--------|------|------------------|
| ADR-001 | SQLite as Primary Database | accepted | 2025-01-15 | 12-data, 04-platform |
| ADR-002 | OpenCode as Default AI Provider | accepted | 2025-01-15 | 05-ai-core, 03-product |
| ADR-003 | Immutable A/B OS Architecture | accepted | 2025-02-01 | 07-operating-system |
| ADR-004 | TypeScript Strict Mode + Zod Boundaries | accepted | 2025-01-15 | 14-engineering |
| ADR-005 | Feature-First Module Organization | accepted | 2025-01-20 | 14-engineering, all services |
| ADR-006 | EventBus for Inter-Service Communication | accepted | 2025-01-25 | 04-platform, all services |
| ADR-007 | UUID v7 for Primary Keys | accepted | 2025-02-10 | 12-data, all services |
| ADR-008 | Local-First Sync with .vestara Folder | accepted | 2025-02-15 | 06-workspace, 12-data |
| ADR-009 | Ollama On-Demand (No Auto-Start) | accepted | 2025-03-01 | 05-ai-core, 08-cloud |
| ADR-010 | Secure Boot + Verified Boot Chain | accepted | 2025-03-15 | 07-operating-system, 11-security |
| ADR-011 | VestaraApp Type for Fastify Routes | accepted | 2025-01-20 | 14-engineering, services/api |
| ADR-012 | SWR for Frontend Data Fetching | accepted | 2025-02-01 | 22-user-experience, apps/dashboard |
| ADR-013 | Tailwind CSS 4 + Vestara Design Tokens | accepted | 2025-02-10 | 22-user-experience |
| ADR-014 | Provider-Agnostic AI Router | accepted | 2025-03-20 | 05-ai-core, services/api |
| ADR-015 | Agent Runtime as First-Class Service | accepted | 2025-04-01 | 05-ai-core, services/agents |
| ADR-016 | Architecture Freeze v1.0 | accepted | 2025-07-23 | All blueprint volumes |
| ADR-017 | WorkspaceRuntime as Orchestration Boundary | accepted | 2026-07-23 | 06-workspace |
| ADR-018 | RepositoryWorkspace as Canonical Domain Object | accepted | 2026-07-23 | 06-workspace |
| ADR-019 | Vestara Specification-Driven Engineering (VSDE) | accepted | 2026-07-24 | 14-engineering |
| ADR-020 | Workspace Kernel & Subsystem Architecture | accepted | 2026-07-27 | 06-workspace, 07-operating-system, 22-user-experience |
| ADR-021 | Widget Manifest System & Dashboard Runtime | accepted | 2026-07-27 | 22-user-experience, 06-workspace |
| ADR-022 | Standard Subsystem Directory Layout | accepted | 2026-07-27 | 14-engineering, all subsystems |
| **ADR-100** | **AI Organization Over AI Assistant** | **accepted** | **2025-07-30** | [adr/ADR-100-ai-organization.md](adr/ADR-100-ai-organization.md) |
| **ADR-101** | **Conversation as Independent Architecture** | **accepted** | **2025-07-30** | [adr/ADR-101-conversation-architecture.md](adr/ADR-101-conversation-architecture.md) |
| **ADR-102** | **Framework-Agnostic Design System (VDS)** | **accepted** | **2025-07-30** | [adr/ADR-102-vds-framework-agnostic.md](adr/ADR-102-vds-framework-agnostic.md) |
| **ADR-103** | **Workspace-Native Context** | **accepted** | **2025-07-30** | [adr/ADR-103-workspace-native-context.md](adr/ADR-103-workspace-native-context.md) |
| **ADR-104** | **Evidence-Based Verification** | **accepted** | **2025-07-30** | [adr/ADR-104-evidence-based-verification.md](adr/ADR-104-evidence-based-verification.md) |
| **ADR-105** | **Event-Sourced Engineering Graph** | **accepted** | **2026-08-01** | [adr/ADR-105-event-sourced-engineering-graph.md](adr/ADR-105-event-sourced-engineering-graph.md) |
| **ADR-106** | **Provider-Neutral Engineering Provider Runtime** | **accepted** | **2026-08-01** | [adr/ADR-106-provider-neutral-engineering-provider-runtime.md](adr/ADR-106-provider-neutral-engineering-provider-runtime.md) |
| **ADR-107** | **Workspace UI and CLI as Shared Runtime Clients** | **proposed** | **2026-08-01** | [adr/ADR-107-workspace-ui-and-cli-as-shared-runtime-clients.md](adr/ADR-107-workspace-ui-and-cli-as-shared-runtime-clients.md) |
| **ADR-109** | **Blueprint Implementation-Alignment Metadata and Versioned Reconcilement** | **accepted** | **2026-08-01** | [adr/ADR-109-blueprint-implementation-alignment-metadata.md](adr/ADR-109-blueprint-implementation-alignment-metadata.md) |
| **ADR-110** | **Blueprint Volume Renumbering** | **accepted** | **2026-08-01** | [adr/ADR-110-blueprint-volume-renumbering.md](adr/ADR-110-blueprint-volume-renumbering.md) |
| **ADR-111** | **Agent-Harness-Centered Runtime Architecture** | **accepted** | **2026-08-01** | [adr/ADR-111-agent-harness-centered-runtime-architecture.md](adr/ADR-111-agent-harness-centered-runtime-architecture.md) |
| **ADR-112** | **Extension Platform and Local Package Manager** | **accepted** | **2026-08-01** | [adr/ADR-112-extension-platform-and-local-package-manager.md](adr/ADR-112-extension-platform-and-local-package-manager.md) |
| **ADR-113** | **Native TUI as Canonical Interactive Interface** | **accepted** | **2026-08-01** | [adr/ADR-113-native-tui-as-canonical-interactive-interface.md](adr/ADR-113-native-tui-as-canonical-interactive-interface.md) |
| **ADR-114** | **Linux Host Integration Foundation Before Bootable Distribution** | **accepted** | **2026-08-01** | [adr/ADR-114-linux-host-integration-foundation.md](adr/ADR-114-linux-host-integration-foundation.md) |
| **ADR-115** | **Marketplace Foundation and Workspace Experience** | **accepted** | **2026-08-02** | [adr/ADR-115-marketplace-foundation-and-workspace-experience.md](adr/ADR-115-marketplace-foundation-and-workspace-experience.md) |
| **ADR-129** | **Workspace UI as a Standalone Desktop Application** | **accepted** | **2026-08-12** | [adr/ADR-129-standalone-workspace-ui.md](adr/ADR-129-standalone-workspace-ui.md) |
| **ADR-116** | **Capability System — Permission-Gated Agent Access** | **accepted** | **2026-08-02** | [adr/ADR-116-capability-system.md](adr/ADR-116-capability-system.md) |
| **ADR-117** | **Filesystem Runtime — Sandboxed, Approval-Gated Executor** | **accepted** | **2026-08-02** | [adr/ADR-117-filesystem-runtime.md](adr/ADR-117-filesystem-runtime.md) |
| **ADR-118** | **Multi-Agent Workflow Orchestration** | **accepted** | **2026-08-02** | [adr/ADR-118-multi-agent-workflow-orchestration.md](adr/ADR-118-multi-agent-workflow-orchestration.md) |
| **ADR-128** | **Execution Platform Initiative — Provider-Neutral Execution Boundary** | **proposed** | **2026-08-12** | [adr/ADR-128-execution-platform-initiative.md](adr/ADR-128-execution-platform-initiative.md) |

> **Reconcilement note**: ADR-128 (proposed, 2026-08-12) records the **Execution
> Platform** as a major architectural initiative, not an implementation
> commitment. The current OpenCode path (`AgentRuntime` →
> `OpenCodeRuntimeProvider` → custom OpenCode integration) is the **evidenced
> reference path** earned by ORB; the new `@vestara/execution` boundary is
> developed beside it and stays experimental until a second provider implements
> the contract (EP-011). ADR-106's provider-neutrality is operationalized: the
> execution contract must contain no OpenCode SDK type, and the provider-neutral
> abstraction is not declared stable until multiple fundamentally different
> substrates implement it. **EP-001 is authorized as a read-only forensic
> architecture inventory** — it documents existing behavior and must not
> introduce interfaces, packages, or migration code. **EP-002 and beyond are
> withheld** pending review of the inventory. Progression is gated by explicit
> reviews after EP-001 and EP-002 and by a mandatory architecture review at
> EP-011 before provider-neutrality may be considered established; no phase
> auto-advances. **models.dev** is incorporated as the **catalog authority for
> model metadata** (`@vestara/model-catalog`, with `CatalogModel` /
> `ProviderModel` / `AvailableModel`), not as the runtime source of truth, and
> EP-002 must resolve the `ExecutionProvider` vs `InferenceProvider` vocabulary
> collision. Invariant: catalog presence does not establish runtime
> availability, runtime availability does not establish selection, and
> selection does not establish authority. Full plan:
> `05-ai-core/execution-platform.md`.
>
> **Reconcilement note**: ADR-016 "Architecture Freeze v1.0" is **superseded** by
> ADR-109. The Blueprint is now reconciled in **versions** against the
> implementation (`vestara-ai-core`), with per-document alignment metadata and a
> validation script, rather than permanently frozen. ADR-002 (OpenCode as
> default provider) is reframed by ADR-106: the architecture is
> provider-neutral; OpenCode is a default distribution provider.
> ADR-023 ("Everything is a Runtime") is narrowed by ADR-111. A component is a
> runtime only when it owns durable lifecycle, recovery, concurrency, isolation,
> resources, and observability; other concepts remain services, providers,
> strategies, policies, or projections.
> ADR-114 establishes Linux and systemd as the OS-0 machine plane and records
> host integration separately from the future bootable distribution.
> ADR-112's distribution layer is now partially realized by ADR-115: the
> Marketplace foundation (catalog, local registry, search, resolution, install
> orchestration, CLI, Workspace API and UI, WebSocket operation center) is
> implemented above `extension-runtime`. Remote registries, publishing, and
> signature enforcement remain future.
> ADR-116, ADR-117, and ADR-118 record the agent capability boundary
> (ADR-025/033/034 realized for agent execution): agents reach the filesystem only
> through `AgentCapabilityManager` (ADR-116) into the sandboxed, approval-gated
> `FilesystemRuntime` (ADR-117), and multi-agent project execution is designed
> around a `WorkflowOrchestrator` (ADR-118, accepted — orchestration core Phases
> 1-3 are implemented in `packages/workflow-orchestrator/`: project/plan/task
> state machines, stores, retry/revision policy, task-graph waves,
> checkpoint/resume, harness-backed dispatch, review/test stages, Approval
> Gateway, parallel waves, token budgets, and event-sourced reconcile; see
> `vestara-ai-core/docs/PCS-025-multi-agent-project-management.md`).
> Implementation ADRs mirror these decisions in `vestara-ai-core/docs/ADR/`
> (ADR-001 runtime, ADR-002 capability system, ADR-003 filesystem runtime,
> ADR-004 multi-agent workflow, ADR-005 intent, ADR-006 ownership, ADR-007
> decision pipeline, ADR-008 marketplace, ADR-009 recovery, ADR-010 dashboard,
> ADR-011 remote worker).
> ADR-024 through ADR-030 are **accepted with implemented runtime packages**:
> `@vestara/job` (ADR-024), `@vestara/worker` + `@vestara/scheduler`
> (ADR-025), `@vestara/intent` (ADR-026), `@vestara/ownership` (ADR-027),
> `@vestara/verification` + `@vestara/trust` (ADR-028), the kernel
> `FailureBudget` + worker quarantine (ADR-029), and the composed
> `@vestara/kernel` boot (ADR-030).

> **Foundational ADRs (100+)** define the architectural philosophy that governs all other decisions. Each has a standalone document in `00-governance/adr/`.
| ADR-023 | Core Runtime Model — Everything is a Runtime | superseded by ADR-111 | 2026-07-27 | 07-operating-system, all subsystems |
| ADR-024 | Job Model — Standard Operation Lifecycle | accepted | 2026-07-27 | 07-operating-system |
| ADR-025 | Worker Model & Capability Scheduling | accepted | 2026-07-27 | 07-operating-system, 05-ai-core |
| ADR-026 | Intent Model — Goals to Execution Plans | accepted | 2026-07-27 | 05-ai-core, 14-engineering |
| ADR-027 | Ownership & Resource Locking | accepted | 2026-07-27 | 07-operating-system, 11-security |
| ADR-028 | Verification & Trust Engine | accepted | 2026-07-27 | 07-operating-system, 11-security |
| ADR-029 | Recovery & Failure Budget | accepted | 2026-07-27 | 07-operating-system |
| ADR-030 | Kernel Architecture — Runtime Composition | accepted | 2026-07-27 | 07-operating-system, 04-platform |
| ADR-031 | Runtime State Machine & Job State Machine | accepted | 2026-07-27 | 07-operating-system |
| ADR-032 | Event Specification — Standard Envelope & System Events | accepted | 2026-07-27 | 04-platform, 07-operating-system |
| ADR-033 | Capability Taxonomy — Controlled Vocabulary | accepted | 2026-07-27 | 05-ai-core, 14-engineering |
| ADR-034 | Runtime Registry & Permission Model | accepted | 2026-07-27 | 07-operating-system, 11-security |
| ADR-035 | Decision Pipeline — Permission, Policy, Verification, Trust & History | accepted | 2026-07-27 | 07-operating-system, 11-security |
| ADR-036 | Policy Model — Declarative Organizational Rules | accepted | 2026-07-27 | 07-operating-system, 11-security |
| ADR-043 | Shared Understanding Snapshot | accepted | 2026-07-28 | 05-ai-core, 06-workspace, 22-user-experience |

---

## ═══════════════════════════════════════════════════════════════════
### 📝 FULL ADR RECORDS
### ═══════════════════════════════════════════════════════════════════

### ADR-001: SQLite as Primary Database

```yaml
adr: "ADR-001"
title: "SQLite as Primary Database"
date: "2025-01-15"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer", "@devops-engineer"]
tags: ["database", "architecture"]
```

**Context**: Need a database for Gen 1 portable AI OS. Requirements: zero host dependencies, single-file, runs on SSD, offline-first, survives OS updates, supports migrations.

**Decision**: Use SQLite (better-sqlite3) as the sole database. No PostgreSQL, MySQL, or external database dependencies.

### ADR-002: OpenCode as Default AI Provider

```yaml
adr: "ADR-002"
title: "OpenCode as Default AI Provider"
date: "2025-01-15"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer"]
tags: ["ai", "providers", "architecture"]
```

**Context**: Need an LLM provider that works immediately with zero configuration on a fresh system. The default must not require API keys, environment variables, or network access.

**Decision**: Use OpenCode (`@opencode` JS library) as the default AI provider. OpenCode runs local inference via Node.js with zero configuration. It is provider-swappable through the Provider Router (ADR-014).

### ADR-003: Immutable A/B OS Architecture

```yaml
adr: "ADR-003"
title: "Immutable A/B OS Architecture"
date: "2025-02-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager", "@product-manager"]
consulted: ["@devops-engineer", "@security-engineer"]
tags: ["architecture", "security", "portability"]
```

**Context**: Portable OS must survive power loss, unsafe ejection, and OS updates without data corruption. Single root filesystem is vulnerable.

**Decision**: Use A/B dual-partition with immutable root filesystem. OS updates write to inactive partition. User data (`.vestara`) on separate data partition with journaling.

### ADR-004: TypeScript Strict Mode + Zod Boundaries

```yaml
adr: "ADR-004"
title: "TypeScript Strict Mode + Zod Boundaries"
date: "2025-01-15"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["engineering", "quality", "typescript"]
```

**Context**: Need type safety at runtime, not just compile time. Need to validate all external input (API, config, IPC, database, user input).

**Decision**: TypeScript strict mode with no implicit any. Zod schemas at every system boundary. Runtime type checking enforced at all trust boundaries.

### ADR-005: Feature-First Module Organization

```yaml
adr: "ADR-005"
title: "Feature-First Module Organization"
date: "2025-01-20"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer", "@frontend-engineer"]
tags: ["engineering", "organization", "modules"]
```

**Context**: Need to organize code in a way that scales with the number of features. Traditional layer-based structure (controllers, services, models) causes cross-cutting changes.

**Decision**: Feature-first organization. Each feature owns its complete vertical slice: types, logic, storage, UI, and tests. Cross-cutting concerns (auth, logging) remain shared.

### ADR-006: EventBus for Inter-Service Communication

```yaml
adr: "ADR-006"
title: "EventBus for Inter-Service Communication"
date: "2025-01-25"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["platform", "communication", "architecture"]
```

**Context**: Services need to communicate without tight coupling. Direct imports create circular dependencies and make testing difficult.

**Decision**: Use in-process EventBus for publish/subscribe. Services emit events, other services react. No direct inter-service calls. Events are versioned and schematized via Zod.

### ADR-007: UUID v7 for Primary Keys

```yaml
adr: "ADR-007"
title: "UUID v7 for Primary Keys"
date: "2025-02-10"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["data", "database", "ids"]
```

**Context**: Primary key strategy must support offline-first, distributed runtimes, and chronological sorting without a central sequencer.

**Decision**: Use UUID v7 for all primary keys. Timestamp-prefixed, sortable, unique without coordination. Stored as TEXT in SQLite.

### ADR-008: Local-First Sync with .vestara Folder

```yaml
adr: "ADR-008"
title: "Local-First Sync with .vestara Folder"
date: "2025-02-15"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer", "@devops-engineer"]
tags: ["workspace", "data", "architecture"]
```

**Context**: Users work across devices and need their workspace state to persist and synchronize. Network may be unreliable or absent.

**Decision**: Local-first architecture with `.vestara/manifest.json` as the system of record. Sync is asynchronous and conflict-free (CRDT-inspired merge). No cloud dependency.

### ADR-009: Ollama On-Demand (No Auto-Start)

```yaml
adr: "ADR-009"
title: "Ollama On-Demand (No Auto-Start)"
date: "2025-03-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer", "@devops-engineer"]
tags: ["ai", "providers", "infrastructure"]
```

**Context**: Local AI inference via Ollama is needed for offline operation. But Ollama is a background daemon consuming ~4GB+ RAM and significant GPU resources. Auto-starting it on boot would degrade the system for users who don't immediately need AI.

**Decision**: Ollama starts on-demand when the user requests local inference. The system monitors Ollama's health and stops it after 5 minutes of inactivity. CLI command: `vestara ai start|stop|status`.

### ADR-010: Secure Boot + Verified Boot Chain

```yaml
adr: "ADR-010"
title: "Secure Boot + Verified Boot Chain"
date: "2025-03-15"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@security-engineer", "@devops-engineer"]
tags: ["operating-system", "security", "boot"]
```

**Context**: Portable OS on external SSD must guarantee integrity. Malicious boot, tampered partitions, and unauthorized access must be prevented.

**Decision**: Secure Boot chain: UEFI → signed bootloader → verified kernel → integrity-checked partition. All manifests hash-verified at boot. Developer mode disables verification but logs warnings.

### ADR-011: VestaraApp Type for Fastify Routes

```yaml
adr: "ADR-011"
title: "VestaraApp Type for Fastify Routes"
date: "2025-01-20"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["engineering", "api", "types"]
```

**Context**: Fastify provides `FastifyInstance`, but routes need to access Vestara domain objects (services, config, context) without passing them individually.

**Decision**: Define `VestaraApp` as a wrapper around `FastifyInstance` that exposes domain objects. Route handlers use `VestaraApp` exclusively, never raw `FastifyInstance`.

### ADR-012: SWR for Frontend Data Fetching

```yaml
adr: "ADR-012"
title: "SWR for Frontend Data Fetching"
date: "2025-02-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@frontend-engineer"]
tags: ["user-experience", "frontend", "data"]
```

**Context**: Dashboard needs real-time data updates, caching, background revalidation, and optimistic UI. Redux is overkill for this use case.

**Decision**: Use SWR (stale-while-revalidate) for all frontend data fetching. Cache-first, background refresh, automatic revalidation on focus/mount.

### ADR-013: Tailwind CSS 4 + Vestara Design Tokens

```yaml
adr: "ADR-013"
title: "Tailwind CSS 4 + Vestara Design Tokens"
date: "2025-02-10"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@frontend-engineer", "@product-manager"]
tags: ["user-experience", "styling", "design"]
```

**Context**: UI needs consistent theming, dark mode, and responsive design. Multiple UI frameworks would cause inconsistency.

**Decision**: Tailwind CSS 4 as sole styling framework. Vestara Design Tokens (colors, spacing, typography) defined as CSS variables. Dark mode via class strategy.

### ADR-014: Provider-Agnostic AI Router

```yaml
adr: "ADR-014"
title: "Provider-Agnostic AI Router"
date: "2025-03-20"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer"]
tags: ["ai", "providers", "architecture"]
```

**Context**: Multiple AI providers may be available (OpenCode, OpenAI, Gemini, Ollama, custom). The system must switch between them transparently and gracefully degrade.

**Decision**: Provider Router abstracts all AI providers behind `ConversationEngine` interface. Router selects provider based on capability, cost, availability, and user preference. OpenCode is default with zero config.

### ADR-015: Agent Runtime as First-Class Service

```yaml
adr: "ADR-015"
title: "Agent Runtime as First-Class Service"
date: "2025-04-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer"]
tags: ["ai", "agents", "architecture"]
```

**Context**: AI agents need a managed lifecycle: create, configure, persist, execute, recover. Ad-hoc agent spawning lacks governance and audit.

**Decision`: Agent Runtime is a first-class service with full lifecycle management via Runtime interface. Agents are registered, configured, started, stopped, and recovered through the Kernel.

### ADR-016: Architecture Freeze v1.0

```yaml
adr: "ADR-016"
title: "Architecture Freeze v1.0"
date: "2025-07-23"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
tags: ["architecture", "governance"]
```

**Context**: Architecture has reached a stable state. Need to prevent unnecessary churn while core features are built.

**Decision**: Architecture freeze v1.0. No new architectural changes without ADR. Changes must demonstrate clear value. Focus shifts to implementation.

### ADR-017: WorkspaceRuntime as Orchestration Boundary

```yaml
adr: "ADR-017"
title: "WorkspaceRuntime as Orchestration Boundary"
date: "2026-07-23"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
tags: ["workspace", "architecture"]
```

**Context**: Multiple subsystems need to be composed into a coherent workspace. Without an orchestration boundary, subsystems would interact directly, creating tight coupling.

**Decision**: `WorkspaceRuntime` is the orchestration boundary. It owns the lifecycle of all subsystems within a workspace. Subsystems communicate through WorkspaceRuntime, not directly.

### ADR-018: RepositoryWorkspace as Canonical Domain Object

```yaml
adr: "ADR-018"
title: "RepositoryWorkspace as Canonical Domain Object"
date: "2026-07-23"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
tags: ["workspace", "domain", "architecture"]
```

**Context**: The workspace operates on repositories. Multiple representations of a repository (git, filesystem, metadata, analysis) create inconsistency.

**Decision**: `RepositoryWorkspace` is the single domain object representing a repository within the workspace. It aggregates: git state, file system, analysis data, capabilities, and session state.

### ADR-019: Vestara Specification-Driven Engineering (VSDE)

```yaml
adr: "ADR-019"
title: "Vestara Specification-Driven Engineering (VSDE)"
date: "2026-07-24"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
tags: ["engineering", "process", "specifications"]
```

**Context**: Engineering work needs a consistent specification format that bridges documentation and implementation. Inconsistent spec formats create confusion between AI agents and human engineers.

**Decision**: Adopt VSDE: a four-part specification format (Context, Problem, Solution, Evolution) for all engineering work. Specifications are written before code and evolve with the codebase.

### ADR-020: Workspace Kernel & Subsystem Architecture

```yaml
adr: "ADR-020"
title: "Workspace Kernel & Subsystem Architecture"
date: "2026-07-27"
status: "proposed"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["workspace", "architecture", "kernel"]
```

**Context**: The workspace is growing beyond a simple application. Multiple subsystems (memory, session, planner, tools) need to coexist without tight coupling. Without a kernel, each subsystem would create its own startup/shutdown logic, health checks, and inter-subsystem communication patterns.

**Decision**: Introduce a Workspace Kernel that owns the lifecycle of all subsystems. The kernel:
1. Registers subsystems by manifest
2. Resolves dependency graph between subsystems
3. Manages lifecycle states (created → initialized → started → stopped)
4. Provides shared services (EventBus, logging, metrics)
5. Enforces policy via hooks

### ADR-021: Widget Manifest System & Dashboard Runtime

```yaml
adr: "ADR-021"
title: "Widget Manifest System & Dashboard Runtime"
date: "2026-07-27"
status: "proposed"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@frontend-engineer"]
tags: ["user-experience", "workspace", "widgets"]
```

**Context**: Dashboard needs dynamic widget placement, different views per project/role, and persistence. Hard-coded layouts don't scale.

**Decision**: Widget Manifest declares widget identity, placement defaults, data dependencies, and capabilities. Dashboard Runtime interprets manifests, manages layout state, and provides lifecycle hooks.

### ADR-022: Standard Subsystem Directory Layout

```yaml
adr: "ADR-022"
title: "Standard Subsystem Directory Layout"
date: "2026-07-27"
status: "proposed"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["engineering", "organization", "subsystems"]
```

**Context**: Each subsystem has unique files and configuration. Without a standard layout, navigation becomes unpredictable.

**Decision**: Standard directory layout for all subsystems:
```
subsystem/
├── __tests__/
├── src/
│   ├── index.ts
│   └── ...
├── package.json
├── tsconfig.json
└── README.md
```

### ADR-023: Core Runtime Model — Everything is a Runtime

> **Status update (2026-08-01): superseded by ADR-111.** The shared lifecycle
> base remains useful, but not every engineering concept qualifies as a
> first-class runtime. Apply the ADR-111 graduation criteria.

```yaml
adr: "ADR-023"
title: "Core Runtime Model — Everything is a Runtime"
date: "2026-07-27"
status: "proposed"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["operating-system", "architecture", "runtime"]
```

**Context**: The system has many long-lived components (workspaces, sessions, agents, tools, widgets). Each has its own lifecycle, health, and permissions. Without a unified abstraction, each component would implement its own lifecycle, leading to inconsistency.

**Decision**: Everything is a Runtime. Runtime is the base abstraction with:
- Lifecycle (created → initializing → ready → running → stopping → stopped → failed)
- Health checks
- Event emission (lifecycle events)
- Permissions (role-based access control)
- Metrics

### ADR-024: Job Model — Standard Operation Lifecycle

```yaml
adr: "ADR-024"
title: "Job Model — Standard Operation Lifecycle"
date: "2026-07-27"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["operating-system", "jobs", "architecture"]
```

**Context**: The system performs operations (compilation, analysis, deployment, testing) that share: state transitions, error handling, retry logic, and observability. Without a standard model, each operation implements its own lifecycle.

**Decision**: Job is the standard operation unit with:
- Lifecycle (draft → queued → assigned → running → completed → failed → cancelled)
- Metadata (type, owner, priority, timeout)
- Capability requirements (what the job needs from a worker)
- Result (status, output, evidence, errors)

### ADR-025: Worker Model & Capability Scheduling

```yaml
adr: "ADR-025"
title: "Worker Model & Capability Scheduling"
date: "2026-07-27"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer", "@backend-engineer"]
tags: ["operating-system", "workers", "scheduling"]
```

**Context**: The Execution Engine needs to dispatch jobs to executors (AI models, Docker containers, human reviewers, CI runners). Each executor has different capabilities, capacity, and trust levels. Without a worker abstraction, the scheduler would need to understand every executor type.

**Decision**: Worker is the execution abstraction. Workers:
1. Declare capabilities (what they can do)
2. Declare capacity (how much they can do concurrently)
3. Accept job assignments
4. Report status and results

### ADR-026: Intent Model — Goals to Execution Plans

```yaml
adr: "ADR-026"
title: "Intent Model — Goals to Execution Plans"
date: "2026-07-27"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer"]
tags: ["ai", "architecture", "planning"]
```

**Context**: Users express goals in natural language. The system must translate goals into executable plans. Without an Intent model, the Planner has no structured input.

**Decision**: Intent is the structured representation of a user goal. The Intent model captures:
1. Goal description
2. Constraints (time, cost, quality)
3. Success criteria
4. Context references

### ADR-027: Ownership & Resource Locking

```yaml
adr: "ADR-027"
title: "Ownership & Resource Locking"
date: "2026-07-27"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer", "@security-engineer"]
tags: ["operating-system", "security", "resources"]
```

**Context**: Multiple runtimes may access shared resources (files, repositories, databases). Concurrent writes cause conflicts. Without ownership, no runtime is accountable for resource state.

**Decision**: Every resource has an owner (the runtime that created it). Ownership grants write permission. Other runtimes must request write access. Resource locking prevents concurrent write conflicts. Lock timeout prevents deadlock.

### ADR-028: Verification & Trust Engine

```yaml
adr: "ADR-028"
title: "Verification & Trust Engine"
date: "2026-07-27"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer", "@security-engineer"]
tags: ["operating-system", "security", "verification"]
```

**Context**: Execution results must be verified before they're trusted. Workers may produce incorrect results. Without verification, the system cannot distinguish successful from failed execution.

**Decision**: Verification Engine checks execution results against success criteria. Trust Engine accumulates verification history to produce worker trust scores. Verification is deterministic. Trust is probabilistic.

### ADR-029: Recovery & Failure Budget

```yaml
adr: "ADR-029"
title: "Recovery & Failure Budget"
date: "2026-07-27"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["operating-system", "recovery", "reliability"]
```

**Context**: Runtimes fail. Workers crash. Jobs time out. Without a recovery strategy, the system degrades unpredictably. Without a failure budget, there's no objective measure of system health.

**Decision**: Recovery Manager handles runtime failures with configurable retry policy. Failure budget tracks error rates across services. Budget exhaustion triggers alerts and automated mitigation.

### ADR-030: Kernel Architecture — Runtime Composition

```yaml
adr: "ADR-030"
title: "Kernel Architecture — Runtime Composition"
date: "2026-07-27"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["operating-system", "kernel", "architecture"]
```

**Context**: Multiple runtimes (workspace, session, agent, worker) need to coexist within a single process. Without a kernel, each runtime would manage its own lifecycle, logging, metrics, and health, leading to duplicated infrastructure and inconsistent behavior.

**Decision**: The Kernel is the composition root. It:
1. Owns the lifecycle of all runtimes and services
2. Provides shared infrastructure (EventBus, logging, metrics, health)
3. Enforces permissions and policy
4. Manages service dependency graph
5. Coordinates boot and shutdown sequence

### ADR-031: Runtime State Machine & Job State Machine

```yaml
adr: "ADR-031"
title: "Runtime State Machine & Job State Machine"
date: "2026-07-27"
status: "proposed"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["operating-system", "state-machine", "architecture"]
```

**Context**: Runtimes and Jobs have well-defined states and transitions. Without explicit state machines, illegal transitions can occur, leading to inconsistent system state.

**Decision**: State machines are first-class abstractions with validated transitions, entry/exit hooks, and event emission. Runtime and Job use distinct state machines optimized for their respective lifecycles.

### ADR-032: Event Specification — Standard Envelope & System Events

```yaml
adr: "ADR-032"
title: "Event Specification — Standard Envelope & System Events"
date: "2026-07-27"
status: "proposed"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer"]
tags: ["platform", "events", "architecture"]
```

**Context**: Events flow between all subsystems. Without a standard envelope and event catalog, event consumers must understand every event producer's format. Ad-hoc event formats break tooling, monitoring, and replay.

**Decision**: All events use a standard envelope (ADR-032 specifies the exact schema). System events are cataloged by domain. Event types are namespaced (e.g., `runtime:boot.completed`, `job:state.changed`).

### ADR-033: Capability Taxonomy — Controlled Vocabulary

```yaml
adr: "ADR-033"
title: "Capability Taxonomy — Controlled Vocabulary"
date: "2026-07-27"
status: "proposed"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer", "@backend-engineer"]
tags: ["ai", "architecture", "capabilities"]
```

**Context**: Workers declare capabilities (what they can do). Jobs require capabilities (what they need). Without a controlled vocabulary, capability strings drift. One worker says "code.write" while another says "code.develop".

**Decision**: Capability Taxonomy defines the hierarchy, aliases, and relationships between capabilities. Capability matching uses the taxonomy for compatibility checks, not string equality.

### ADR-034: Runtime Registry & Permission Model

```yaml
adr: "ADR-034"
title: "Runtime Registry & Permission Model"
date: "2026-07-27"
status: "proposed"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@backend-engineer", "@security-engineer"]
tags: ["operating-system", "security", "registry"]
```

**Context**: Runtimes need to be registered, discovered, and authorized. Without a registry, there is no authoritative source of which runtimes exist. Without permissions, any runtime can perform any operation.

**Decision**: RuntimeRegistry is the authoritative source for runtime metadata. PermissionManager enforces role-based access control. Every operation goes through permission check. Default roles are assigned by runtime type.

### ADR-035: Decision Pipeline — Permission, Policy, Verification, Trust & History

```yaml
adr: "ADR-035"
title: "Decision Pipeline — Permission, Policy, Verification, Trust & History"
date: "2026-07-27"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer", "@security-engineer", "@backend-engineer"]
tags: ["operating-system", "decision-pipeline", "governance", "architecture"]
```

**Context**: The Execution Engine (ADR-024, ADR-025, ADR-030) can reliably execute jobs. It has permission checks (ADR-034) and verification concepts (ADR-028). However, there is no defined *order* or *invariant chain* connecting these stages. Without a decision pipeline, subsystems can bypass governance, skip verification, or conflate policy with trust.

For example, today a worker could self-verify, a runtime could execute without permission, and there is no system-wide rule preventing it. The architecture lacks a *laws of the operating system* — a contract that every subsystem obeys.

**Decision**: Establish the **Decision Pipeline** as an invariant chain. Every request that flows through the system MUST pass through the following stages in order, and no stage may be bypassed or reordered:

```
Request
    ↓
Permission
    ↓
Policy
    ↓
Execution
    ↓
Verification
    ↓
Trust
    ↓
History
```

**Read-only operations** (e.g., listing jobs, reading metrics) that require no execution may skip the Execution, Verification, and Trust stages, but must still pass Permission and Policy. All other operations must traverse the full pipeline.

#### Stage Boundaries (Knowledge Constraints)

Each stage may only know information required for its specific responsibility. This prevents accidental coupling between stages:

| Stage | May Know | Must Not Know |
|-------|----------|---------------|
| Permission | User, Role, Operation | Build results, Trust score |
| Policy | Job, Context, Organization rules | Execution outcome |
| Scheduler | Workers, Capabilities, Capacity | Trust algorithms, Policy logic |
| Worker | Assigned Job | Organizational policy |
| Verification | Execution artifacts | User permissions |
| Trust | Verification evidence, History | Scheduling decisions |
| History | Everything that happened | Nothing future-facing |

#### Data Contract (Append-Only Pipeline)

Each stage consumes a typed result from the previous stage and produces a new typed result. No stage mutates a prior record:

```
PermissionResult
    ↓
PolicyDecision
    ↓
ExecutionResult
    ↓
VerificationResult
    ↓
TrustRecord
    ↓
HistoryRecord
```

Each object becomes progressively richer as it accumulates evidence through the pipeline. This naturally enables event sourcing, replay, and audit.

To make the pipeline practical, introduce a **DecisionContext** that flows through all stages. Each stage receives the current context and returns a new context with exactly one additional populated field:

```
DecisionContext
├── request (immutable — the original request)
├── principal (user or runtime identity)
├── job (once created)
├── permissionResult (populated by Permission stage)
├── policyDecision (populated by Policy stage)
├── executionResult (populated by Execution stage)
├── verificationResult (populated by Verification stage)
├── trustRecord (populated by Trust stage)
└── historyRecord (populated by History stage)
```

DecisionContext is the canonical object flowing through the pipeline — akin to `Job` in the Execution Layer. It provides:
- A single object for logging, replay, and audit
- Full state inspection at any point in the pipeline
- Natural support for event sourcing and distributed execution
- Strong typing through the pipeline via generics

#### Stage Responsibilities

**Permission** — Authentication and authorization. Answers: *Does this principal have the right role to perform this operation?* Deterministic. No awareness of organizational rules or execution history.

**Policy** — Organizational governance. Answers: *Does this action comply with organizational rules?* Deterministic. Examples: production deployments require human approval, external LLMs not permitted on confidential code, cost limits, deployment windows. Policy does NOT deny work because it *failed* — it denies work because rules say it *cannot proceed*.

**Scheduler** — See ADR-025. Orchestrates job assignment to workers based on capabilities and capacity. Makes no policy or trust decisions.

**Worker** — Executes the assigned job. Never self-authorizes or self-verifies. See ADR-025.

**Verification** — Evidence collection and evaluation. Answers: *Did the execution produce the expected outcome?* Produces evidence, not opinions. VerificationResult contains: status (passed/failed/skipped), build artifacts, test results, coverage, security scan results, performance metrics, logs, reports. Verification is deterministic and produces an append-only audit record.

**Trust** — Reputation scoring. Answers: *How reliable is this worker/model/repository/plan?* Consumes Verification evidence and historical records to produce a TrustScore. Trust is the first probabilistic stage in the pipeline. It never inspects execution artifacts directly — it only consumes VerificationResult and history.

**History** — Immutable recording. Appends the complete DecisionContext to the historical record. Nothing edits history. History enables debugging, auditing, replay, and future planning input.

#### Architectural Principles (Invariants)

1. **Every decision is deterministic until Trust.** Permission, Policy, and Verification produce the same output given the same input. Trust is the first and only probabilistic stage.
2. **Trust is the first probabilistic stage.** No deterministic stage should depend on trust scores.
3. **History is immutable and append-only.** No record is ever edited or deleted. Errors are recorded as new records that reference the original.
4. **Verification produces evidence, not opinions.** A VerificationResult records what happened (build output, test logs, coverage data). It does not score or rank.
5. **Policy enforces governance, not quality.** Policy prevents actions that violate organizational rules. It does not evaluate execution quality.
6. **Permission enforces authorization, not governance.** Permission checks identity and role, not organizational policy.
7. **Scheduler makes no policy decisions.** The scheduler matches capabilities, not governance rules.
8. **Workers never self-authorize or self-verify.** Authorization and verification are the kernel's responsibility, never delegated to the executor.

#### Consequences

**Positive:**
- Defines the single invariant chain that every subsystem obeys
- Prevents coupling between governance, execution, and evaluation
- DecisionContext becomes the canonical pipeline object — simplifying logging, replay, and distributed execution
- Each stage can be developed, tested, and scaled independently
- Natural event sourcing — every decision is recorded immutably
- Creates a clear contract for future subsystems (Planner, Intent, Memory) — they become pipeline participants, not pipeline bypassers

**Negative:**
- Adds latency for full-pipeline traversals (mitigation: most queries will be read-only and skip execution stages)
- Requires existing Permission, Scheduler, and Worker implementations to integrate with DecisionContext (mitigation: gradual adoption — ADR-035 defines the pipeline contract; existing code can wrap its results in DecisionContext incrementally)

**Risks:**
- Risk: Stages may be tempted to reach outside their knowledge boundary (mitigation: enforce via TypeScript — each stage receives only its allowed inputs)
- Risk: Performance under high-throughput scenarios (mitigation: stages are synchronous where possible; asynchronous stages use isolated worker pools)
- Risk: DecisionContext may become bloated (mitigation: DecisionContext is a typed discriminated union — each stage sees only its relevant fields)

#### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Flat pipeline without DecisionContext | Simpler initial implementation | No single audit object, harder to debug, harder to distribute | DecisionContext's benefits compound over time |
| Merge Permission and Policy | Fewer stages | Conflates identity with governance | Violates separation of concerns; permission and policy have different sources of truth |
| Merge Verification and Trust | Simpler scoring pipeline | Conflates evidence with reputation | Verification is deterministic; trust is probabilistic — different guarantees |
| Make Trust deterministic (score-based only) | Predictable | Cannot capture real-world reliability patterns | Trust must incorporate probabilistic evidence (failure rates, recovery patterns) |
| Allow workers to self-verify | Lower latency | Cannot trust self-reports | Violates principle that verification must be independent of execution |

#### Implementation Notes
- Migration required: Yes — existing Permission, Scheduler, and Worker interfaces need minor integration with DecisionContext
- Breaking changes: Yes — Permission stage must now return PermissionResult in DecisionContext; Scheduler must accept DecisionContext
- Timeline: Phase 2.1 — implement @vestara/policy, @vestara/verification, @vestara/trust as packages that consume and produce DecisionContext

#### Related
- ADR-023 (Runtime Model)
- ADR-024 (Job Model)
- ADR-025 (Worker Model & Scheduling)
- ADR-028 (Verification & Trust Engine)
- ADR-030 (Kernel Architecture)
- ADR-033 (Capability Taxonomy)
- ADR-034 (Runtime Registry & Permission Model)
- Blueprint volume: 07-operating-system/01-decision-pipeline.md

### ADR-036: Policy Model — Declarative Organizational Rules

```yaml
adr: "ADR-036"
title: "Policy Model — Declarative Organizational Rules"
date: "2026-07-27"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer", "@security-engineer", "@backend-engineer"]
tags: ["operating-system", "policy", "governance", "architecture"]
```

**Context**: ADR-035 defines *where* Policy sits in the Decision Pipeline — between Permission and Scheduler. But a stage is not a model. Without defining what a policy *is*, the Policy Engine would devolve into ad-hoc conditionals scattered across the codebase.

The system needs a first-class Policy object, just as it has Runtime, Job, and Worker. Several design questions must be answered before implementation:

- What is a Policy?
- Who owns a Policy?
- Can Policies be versioned?
- Are Policies hierarchical?
- Are Policies composable?
- Can Policies be enabled/disabled dynamically?
- Can different scopes (workspace, project, runtime) have different policy sets?
- How are conflicts resolved?
- How is every policy decision audited?

Without answers to these, the Policy Engine will be coupled to implementation details from day one.

**Decision**: Introduce Policy as a first-class runtime object with the following model, repository, and engine architecture.

#### Policy Model

```
Policy
├── id              (unique identifier)
├── name            (human-readable)
├── version         (integer, monotonic)
├── priority        (higher = evaluated first; for conflict resolution)
├── scope           (which contexts this policy applies to)
├── enabled         (dynamic, no restart required)
├── conditions      (when this policy triggers)
├── actions         (what happens when triggered)
└── metadata        (author, description, tags, createdAt, updatedAt)
```

Policies are **declarative**, not code-first. They are defined as data (JSON, YAML, database rows, UI-managed objects) and interpreted by the Policy Engine. This prevents business rules from leaking into scheduler, worker, or verification logic.

#### Two-Package Architecture

The Policy subsystem is split into two packages with strict responsibility boundaries:

**`@vestara/policy-types`** — Pure contracts. No evaluation logic, no storage, no parsers, no runtime dependencies. This is the contract everything depends on. Once stable, it should rarely change.

```
@vestara/policy-types
├── PolicyDefinition
├── PolicyCondition
├── PolicyConditionNode (composable AND/OR/NOT tree)
├── PolicyAction
├── PolicyScope
├── PolicyContext
├── PolicyDecision
├── PolicyRepository (interface)
└── PolicyEngine (interface)
```

**`@vestara/policy-engine`** — Implementation. Single public entry point (`evaluate()`). Internal modules for condition evaluation, conflict resolution, action execution, and decision recording.

```
@vestara/policy-engine
├── DefaultPolicyEngine
├── ConditionEvaluator
├── ConflictResolver
├── ActionExecutor
├── DecisionRecorder
└── BuiltInPolicies
```

The engine is stateless and deterministic — same inputs always produce same outputs. It exposes exactly one public operation:

```typescript
evaluate(request: PolicyEvaluationRequest): Promise<PolicyDecision>;
```

#### Policy Repository

Stores policy definitions. Responsible for load, query, versioning, and scope resolution. The repository resolves the scope hierarchy for a given job: collects all policies whose scope matches the job's context, ordered by priority.

The engine never depends on a specific repository implementation. The repository interface supports multiple providers:

```
PolicyRepository (interface)
      ▲
      │
├── MemoryPolicyRepository
├── YamlPolicyRepository
├── DatabasePolicyRepository
└── RemotePolicyRepository
```

#### PolicyContext — Separate Facts from Evaluation

The kernel assembles a complete evaluation context before calling the Policy Engine. Policies never query the world directly — they receive all required facts up front. This keeps evaluation deterministic.

```typescript
interface PolicyContext {
  job: Job;
  worker?: Worker;
  runtime?: Runtime;
  user: UserIdentity;
  workspace: WorkspaceContext;
  repository?: RepositoryContext;
  system: SystemContext;
  metadata: Record<string, unknown>;
}
```

Pipeline flow:

```
Permission
    │
    ▼
PolicyContext (assembled by kernel)
    │
    ▼
PolicyEngine.evaluate()
    │
    ▼
PolicyDecision
```

#### Policy Scope

Policies are hierarchical by scope level. A job inherits policies from all containing scopes:

```
global (applies to everything)
  └── organization (applies to all workspaces in org)
        └── workspace (applies to all projects in workspace)
              └── project (applies to all runtimes in project)
                    └── runtime (applies to a specific runtime instance)
```

More specific scopes may override more general ones, but the conflict resolution strategy determines the behavior (see below).

#### Conditions — Composable Condition Tree

Conditions are declarative tree nodes, not a flat list. A policy's conditions form a tree of logical operators with atomic conditions as leaves. The evaluator is recursive rather than full of special cases.

```typescript
type ConditionNode =
  | { type: 'and'; conditions: ConditionNode[] }
  | { type: 'or'; conditions: ConditionNode[] }
  | { type: 'not'; condition: ConditionNode }
  | { type: 'leaf'; condition: PolicyCondition };
```

Leaf conditions are field-operator-value triples:

```typescript
interface PolicyCondition {
  field: string;        // e.g., "job.spec.branch", "principal.role", "runtime.type"
  operator: 'equals' | 'not_equals' | 'contains' | 'matches' |
            'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'not_exists' |
            'in' | 'not_in';
  value: unknown;
}
```

Example condition tree:

```
AND
├── OR
│   ├── operation == "delete"
│   └── operation == "force_push"
├── branch == "main"
└── NOT (role == "admin")
```

YAML representation:
```yaml
conditions:
  type: and
  conditions:
    - type: or
      conditions:
        - type: leaf
          condition:
            field: job.spec.operation
            operator: equals
            value: delete
        - type: leaf
          condition:
            field: job.spec.operation
            operator: equals
            value: force_push
    - type: leaf
      condition:
        field: job.spec.branch
        operator: equals
        value: main
    - type: not
      condition:
        type: leaf
        condition:
          field: principal.role
          operator: equals
          value: admin
```

Leaf condition examples:
- `{ field: "job.spec.operation", operator: "equals", value: "delete" }`
- `{ field: "principal.role", operator: "not_equals", value: "admin" }`
- `{ field: "job.spec.provider", operator: "in", value: ["openai", "anthropic"] }`
- `{ field: "runtime.monthlyCost", operator: "gt", value: 100 }`

#### Actions — Extensible Action Model

Actions define what happens when conditions are met. The action model is designed for extensibility — many actions do not stop execution, they transform it.

```typescript
type ActionType =
  | 'allow'              // permit execution
  | 'deny'               // forbid execution
  | 'require_approval'   // pause for human approval
  | 'modify_priority'    // change execution priority
  | 'modify_retry'       // change retry policy
  | 'delay'              // defer execution
  | 'inject_metadata'    // attach data to the job
  | 'request_verify'     // require extra verification
  | 'escalate'           // route to higher authority
  | 'audit_only';        // log without blocking

interface PolicyAction {
  type: ActionType;
  config?: {
    reason?: string;
    priority?: number;             // for modify_priority
    retryPolicy?: RetryPolicy;     // for modify_retry
    delayMs?: number;              // for delay
    metadata?: Record<string, unknown>;  // for inject_metadata
    approvalRole?: string;         // for require_approval
    verificationLevel?: string;    // for request_verify
    escalationTarget?: string;     // for escalate
    notificationChannel?: string;  // for notify
  };
}
```

#### Policy Outcomes Delivered to Scheduler

The Scheduler receives only three possible outcomes from the Policy Engine. It never knows *why* a policy denied or modified a job.

| Outcome | Meaning | Scheduler Behavior |
|---------|---------|--------------------|
| `ALLOW` | No matching policies forbid or modify this job | Proceed normally |
| `DENY` | A matching policy forbids this job | Reject; record reason in PolicyDecision |
| `MODIFY` | A matching policy requires changes before execution | Apply modifications; proceed with altered JobSpec |

The Scheduler remains completely deterministic. It does not interpret policy logic. It does not evaluate conditions. It receives a decision and acts on it.

#### Composition and Conflict Resolution

Multiple policies may match a single job. The composition strategy determines how their decisions combine. The engine resolves conflicts in a defined order:

```
Priority → Scope Specificity → Composition Strategy → Conflict Resolver
```

1. **Priority** — Higher-priority policies evaluated first
2. **Scope Specificity** — More specific scope wins when priorities are equal
3. **Composition Strategy** — Determines how individual decisions are combined
4. **Conflict Resolver** — Handles remaining conflicts (extensible)

```typescript
type CompositionStrategy =
  | 'deny_overrides'    // any DENY → final DENY (default for security)
  | 'allow_overrides'   // any ALLOW → final ALLOW (permissive)
  | 'priority_ordered'  // highest priority policy wins outright
  | 'first_match'       // first matching policy wins (in priority order)
  | 'most_restrictive'  // least permissive outcome wins
  | 'merge'             // merge all modifications
  | 'consensus';        // majority vote

interface ConflictResolver {
  resolve(decisions: IndividualPolicyDecision[]): PolicyDecision;
}
```

Recommended defaults:
- `global` scope: `deny_overrides` — security policies always apply
- `organization` scope: `deny_overrides` — governance rules cannot be bypassed
- `workspace` scope: `priority_ordered` — workspace admin can tune
- `project` scope: `priority_ordered` — project lead can tune
- `runtime` scope: `first_match` — explicit per-runtime rules

#### PolicyDecision — Single Immutable Result

The engine returns a single `PolicyDecision` that folds all matching policies into one immutable record. The scheduler consumes this directly — it never inspects individual policy definitions.

```typescript
interface PolicyDecision {
  id: DecisionId;
  jobId: JobId;
  result: 'allow' | 'deny' | 'modify';
  matchedPolicies: Array<{
    policyId: PolicyId;
    policyVersion: number;
    priority: number;
    scope: PolicyScope;
    matchedConditions: ConditionNode[];
    individualResult: IndividualPolicyResult;
  }>;
  modifications: PolicyModification[];   // for 'modify' result
  reason: string;                        // human-readable summary
  evaluatedAt: string;
  engineVersion: string;
}

interface IndividualPolicyResult {
  action: ActionType;
  reason?: string;
  config?: Record<string, unknown>;
}

interface PolicyModification {
  field: string;         // e.g., "spec.priority"
  oldValue: unknown;
  newValue: unknown;
  source: PolicyId;      // which policy caused this change
}
```

The scheduler receives only the three outcomes it needs:

| Result | Meaning | Scheduler Behavior |
|--------|---------|--------------------|
| `allow` | All matching policies permit execution | Proceed normally |
| `deny` | At least one policy forbids execution | Reject; record reason in audit |
| `modify` | One or more policies transformed the job | Apply all modifications; proceed with altered JobSpec |

The scheduler remains completely deterministic. It does not interpret policy logic. It does not evaluate conditions. It receives a decision and acts on it.

PolicyDecisions are appended to the Execution History alongside PermissionResult, VerificationResult, and TrustRecord. This makes every execution answerable:

- *"Why was this job rejected?"* → Query the PolicyDecision
- *"Which policy delayed this deployment?"* → Query the MODIFY PolicyDecision
- *"How many times was policy X triggered this week?"* → Query the audit trail

No logic replay is needed. The evidence is in the record.

#### Examples

**Protected branch (condition tree format):**
```yaml
id: repository.protected.main
name: "Protect main branch"
version: 1
priority: 100
scope:
  level: global
enabled: true
conditions:
  type: and
  conditions:
    - type: or
      conditions:
        - type: leaf
          condition:
            field: job.spec.operation
            operator: in
            value: [delete, force_push]
    - type: leaf
      condition:
        field: job.spec.branch
        operator: equals
        value: main
    - type: not
      condition:
        type: leaf
        condition:
          field: principal.role
          operator: equals
          value: admin
actions:
  - type: deny
    config:
      reason: "Main branch is protected. Contact an admin."
```

**AI cost limit (with PolicyContext reference):**
```yaml
id: ai.cost.limit
name: "AI provider cost limit"
version: 2
priority: 80
scope:
  level: workspace
enabled: true
conditions:
  type: and
  conditions:
    - type: leaf
      condition:
        field: job.spec.provider
        operator: in
        value: [openai, anthropic]
    - type: leaf
      condition:
        field: runtime.monthlyCost  # from PolicyContext.runtime
        operator: gt
        value: 100
actions:
  - type: require_approval
    config:
      reason: "Monthly AI cost limit exceeded. Manager approval required."
      approvalRole: manager
  - type: audit_only
```

**Deployment window (modify action):**
```yaml
id: deployment.window
name: "Production deployment window"
version: 1
priority: 90
scope:
  level: organization
enabled: true
conditions:
  type: and
  conditions:
    - type: leaf
      condition:
        field: job.spec.environment
        operator: equals
        value: production
    - type: leaf
      condition:
        field: system.currentHour  # from PolicyContext.system
        operator: lt
        value: 6
actions:
  - type: modify_priority
    config:
      reason: "Deployment queued until deployment window (06:00-22:00 UTC)"
      priority: low
  - type: delay
    config:
      reason: "Outside deployment window"
      delayMs: 28800000  # 8 hours until window opens
```

#### Consequences

**Positive:**
- Policy becomes a first-class runtime object with a clear lifecycle
- Declarative policies prevent business logic from leaking into scheduler/worker code
- Composition strategies give clear, predictable conflict resolution
- Every policy decision is auditable without logic replay
- Policy Repository abstraction allows multiple backends (YAML, SQLite, HTTP)
- Hierarchical scoping matches organizational structure naturally
- Dynamic enable/disable enables operational control without redeployment

**Negative:**
- Policy evaluation adds a pipeline stage and latency (mitigation: conditions are simple comparisons; evaluation is <1ms per policy; caching for hot paths)
- Declarative conditions are less expressive than code (mitigation: composability across policies covers the 90% case; custom condition handlers can be registered for the remaining 10%)
- Versioning adds complexity to the repository (mitigation: policies are versioned as a whole, not per-field; stored with the decision for audit)

**Risks:**
- Risk: Policy sets grow large and become hard to reason about (mitigation: scope hierarchy limits blast radius; audit trail shows which policies matched each decision)
- Risk: Deny-override at global scope makes local overrides impossible (mitigation: this is intentional — global security policies cannot be bypassed; less restrictive composition at lower scopes for non-security policies)

#### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Code-first policies (functions) | Maximum expressiveness | Opaque, untestable, cannot audit or serialize | Declarative policy can be stored, versioned, and rendered in UI |
| Single flat policy space | Simple to implement | Cannot model organizational hierarchy | Scoped hierarchy is essential for multi-org/multi-workspace |
| Boolean ALLOW/DENY only | Simplest possible interface | Cannot express modifications or approvals | MODIFY and require_approval are critical for real-world governance |
| Merge policy into permission | Fewer stages | Conflates authorization with governance | ADR-035 explicitly separates these; permission=identity, policy=rules |
| No composition strategy | Simple evaluation | Ambiguous when policies conflict | Composition must be explicit and predictable |

#### Implementation Notes
- Migration required: No (new packages; no existing code to refactor)
- Breaking changes: No (Policy engine is a new stage between Permission and Scheduler; existing Permission and Scheduler interfaces unchanged)
- Timeline: Phase 2.1 — first package after ADR-035 ratification
- Build order:
  1. `@vestara/policy-types` (pure contracts, zero dependencies beyond shared types)
  2. `@vestara/policy-engine` (in-memory implementation, depends only on policy-types)
  3. `MemoryPolicyRepository` (default implementation shipped with policy-engine)
  4. `DefaultConditionEvaluator` (recursive condition tree evaluator)
  5. `DefaultConflictResolver` (implements deny_overrides, priority_ordered, first_match, most_restrictive, merge, consensus)
  6. `DefaultPolicyEngine` (single evaluate() entry point composing evaluator + resolver + recorder)
  7. Kernel integration (insert between Permission and Scheduler)
  8. Integration tests for invariant chain: Permission → Policy → Scheduler

#### Related
- ADR-035 (Decision Pipeline — defines where Policy sits in the invariant chain)
- ADR-034 (Runtime Registry & Permission Model — Permission is the stage before Policy)
- ADR-025 (Worker Model & Scheduling — Scheduler consumes PolicyDecision, not policy definitions)
- ADR-024 (Job Model — Policy conditions reference JobSpec fields and Runtime state)
- ADR-033 (Capability Taxonomy — policies may reference capability hierarchies)
- Blueprint volume: 07-operating-system/02-policy-model.md

---

### ADR-037: Trust Engine — Evidence-Based Probabilistic Reputation

**Date:** 2026-07-27
**Status:** Ratified (Phase 2.1)
**Decided by:** Architect + AI Agent
**Title:** `@vestara/trust` — Derived, temporal, multidimensional trust computation from verification evidence

#### Context

The Decision Pipeline (ADR-035) defines Verification → Trust as the evaluation feedback loop. With Verification producing objective facts about execution outcomes, Trust is the first probabilistic subsystem in the platform — it answers "what should we expect to happen next?" rather than "what happened?"

Key architectural inflection point: everything prior (Types → State Machine → Events → Registry → Permissions → Runtime → Capabilities → Job → Worker → Scheduler → Policy → Verification) is deterministic — same inputs, same outputs, provably correct. Trust introduces uncertainty by design.

#### Decision

Build `@vestara/trust` as a single package with six governing principles:

**1. Trust is derived, never authored.** No component sets trust directly. The engine consumes `VerificationOutcome` objects (authored by Verification), transforms them into `TrustEvidence` internally, and computes `TrustSnapshot` from evidence history. No `setTrustScore()` method exists.

**2. Trust is temporal.** Evidence has timestamps; recency matters. The `SimpleTrustModel` applies exponential decay weighting (`weight = e^(-λ · age)`) so recent outcomes dominate old ones. Default decay rate: λ = 0.02/day (≈50% weight at 35 days, ≈25% at 69 days).

**3. Trust is multidimensional.** Every snapshot contains:
- `overall` — recency-weighted composite score
- `dimensions.reliability` — passed/failed ratio with decay weighting
- `dimensions.consistency` — outcome stability over recent window

More dimensions (recovery rate, latency, policy compliance, human approval, accuracy) are additive — the interface supports extension without modification.

**4. Trust is evidence-based.** Every score is traceable to specific `VerificationOutcome` records. Confidence is a function of sample size (`confidence = n / (n + 20)`). No opaque scoring.

**5. Trust is contextual.** Scores are computed per capability (e.g., `repository.commit` vs `security.review`), not as a single global reputation. The scheduler and planner can consume capability-specific trust.

**6. Trust is never consumed by execution.** Trust exists solely in the evaluation feedback loop (after Verification, before History). It influences future planning and scheduling decisions, not the current execution.

#### Architecture

```
VerificationOutcome
        ↓
DefaultTrustEngine.recordVerificationOutcome()
        ↓
TrustEvidence (internal, derived)
        ↓
DefaultTrustRepository.storeEvidence()
        ↓
SimpleTrustModel.compute(all evidence for source)
        ↓
TrustSnapshot (overall × dimensions × byCapability)
        ↓
DefaultTrustRepository.storeSnapshot()
        ↓
DefaultTrustEngine.getTrustSnapshot()
```

**Package structure** (zero runtime dependencies):
- `src/types/` — `evidence.ts`, `snapshot.ts`, `model.ts`, `repository.ts`, `engine.ts`, `errors.ts`
- `src/models/simple-trust-model.ts` — Phase 1+2: deterministic aggregation with exponential decay
- `src/repository/default-trust-repository.ts` — in-memory evidence + snapshot store
- `src/default-trust-engine.ts` — orchestration (accept outcome → derive evidence → compute → persist)

**TrustModel phases (evolutionary, not revolutionary):**
- Phase 1 (shipped): Simple aggregation with recency weighting — passed/failed counting, decay, multidimensional scores
- Phase 2 (shipped with Phase 1): Weighted scoring — recent > old, failures > warnings
- Phase 3 (future): Trend analysis — improving/stable/declining classification
- Phase 4 (future): Predictive trust — probability of success for given capability

#### Consequences

**Positive:**
- Trust is always explainable (every score traces to verification outcomes)
- No opaque AI scoring in the trust pipeline
- Contextual trust aligns with existing capability taxonomy
- Temporal weighting means trust self-corrects as new evidence arrives
- Zero runtime dependencies (pure TypeScript math)

**Negative:**
- No built-in persistence (DefaultTrustRepository is in-memory; production deployments need a database-backed repository)
- No trend analysis yet (Phase 3 will add improving/stable/declining)
- Dimensionality is currently limited (reliability + consistency; more dimensions need new data sources)

**Risks:**
- Risk: Exponential decay requires tuning (mitigation: decay rate is configurable via `TrustModelConfig`)
- Risk: In-memory repo loses state on restart (mitigation: `TrustRepository` is an interface; production implementations can use SQLite or Postgres)
- Risk: Phase 2 weighting interacts with Phase 1 math in ways that need testing (mitigation: 15 behavioral tests cover temporal bias, mixed outcomes, empty state, confidence scaling)

#### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Single float trust score | Maximum simplicity | No explainability, no contextual nuance | Multidimensional is required for capability-adaptive scheduling |
| Bayesian inference | Principled uncertainty | Opaque to non-specialists; harder to test | Phased approach starts with transparent math, adds sophistication later |
| Machine learning model | Potentially most accurate | Non-deterministic, unprovable, opaque | Trust must be explainable and provable in the deterministic pipeline context |
| Store trust in Verification package | Fewer packages | Conflates facts with opinions | ADR-035 explicitly separates Verification (facts) from Trust (opinions) |
| Trust as part of History | Single immutable record | Trust snapshots would be query-time computations | Caching computed trust snapshots enables efficient scheduler/planner queries |

#### Implementation Notes
- Migration required: No (new package; no existing code to refactor)
- Breaking changes: No
- Timeline: Phase 2.1 — third package after ADR-035 (policy-types → policy-engine → verification → trust)
- Build order: `trust` after `verification` in build-order.sh
- Test count: 15 tests across 7 describe blocks (derivation principle, accumulation, temporality, multidimensionality, evidence traceability, contextuality, repository isolation)

#### Related
- ADR-035 (Decision Pipeline — Trust is the 5th stage after Verification)
- ADR-025 (Worker Model — Trust scores influence worker selection in future scheduler)
- ADR-033 (Capability Taxonomy — Trust is contextual per capability)
- This ADR supersedes: nothing (new subsystem)

---

### ADR-038: History Store — Immutable Append-Only Audit Trail

**Date:** 2026-07-27
**Status:** Ratified (Phase 2.1)
**Decided by:** Architect + AI Agent
**Title:** `@vestara/history` — Closes the Decision Pipeline evaluation feedback loop with an append-only, queryable audit trail

#### Context

The Decision Pipeline (ADR-035) defines the invariant chain as Permission → Policy → Execution → Verification → Trust → History. The first five stages were built (ADR-034, ADR-036, ADR-037, plus Verification). Each stage produces a decision artifact, but nothing persists them into a coherent record.

Without History, the pipeline produces evidence and trust but has no long-term memory. The Planner, Scheduler, and Memory systems have no canonical source of truth for "what happened."

#### Decision

Build `@vestara/history` as a zero-dependency package that answers one question:

> "What happened?"

It does not answer why, whether it was correct, how confident we are, or what to do next. Those belong to Policy, Verification, Trust, and the Planner respectively.

**Design principles:**

1. **Append-only.** Records are never deleted, mutated, or updated. The `HistoryStore` interface exposes `append()`, `get()`, `find()`, and `timeline()` — no `delete()`, `update()`, or mutation methods.

2. **Immutable by contract.** Records are typed as `readonly DecisionRecord`. The store returns array copies, not internal references. Compile-time immutability is enforced by TypeScript's strict mode.

3. **Stage-discriminated.** Each record carries a `PipelineStage` discriminator (`'permission' | 'policy' | 'execution' | 'verification' | 'trust'`), making it self-describing. Consumers filter by stage without depending on the producing package's types.

4. **Generic data payload.** Stage-specific data is stored as `Record<string, unknown>` in the `data` field. History does not interpret the data — it preserves it. This keeps History decoupled from all five upstream packages while still providing a typed structure.

5. **Timeline queries.** `timeline(entityId)` returns all records associated with a `requestId` or `jobId` in insertion order, reconstructing the full decision pipeline for a single unit of work.

6. **Duplicate detection.** Appending a record with an existing ID throws `DuplicateRecordError`. This prevents accidental double-recording and ensures idempotent retry logic can detect conflicts.

**Data model:**

```typescript
interface DecisionRecord {
  readonly id: string;
  readonly timestamp: string;
  readonly stage: PipelineStage;
  readonly requestId: string;
  readonly jobId?: string;
  readonly runtimeId?: string;
  readonly workerId?: string;
  readonly data: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly parentRecordId?: string;
}

interface HistoryQuery {
  readonly stage?: PipelineStage;
  readonly requestId?: string;
  readonly jobId?: string;
  readonly runtimeId?: string;
  readonly workerId?: string;
  readonly fromTimestamp?: string;
  readonly toTimestamp?: string;
  readonly limit?: number;
  readonly offset?: number;
}
```

#### Consequences

**Positive:**
- Closes the evaluation feedback loop: every decision from Permission through Trust is now persisted
- Zero package dependencies — any stage can push records without importing History types
- Timeline reconstruction enables future Planner training on complete decision histories
- Duplicate detection prevents double-recording without requiring external idempotency keys
- `DefaultHistoryStore` is in-memory and testable; production deployments swap in a database-backed `HistoryStore` implementation without changing the pipeline

**Negative:**
- No built-in persistence (same pattern as `DefaultTrustRepository` — in-memory default, interface for production)
- No streaming API (v1 exposes `find()` with pagination; `stream()` deferred until a database-backed store exists)
- No cross-record analytics or aggregation — those belong in higher layers (Memory, Analytics, Explainability)

**Risks:**
- Risk: In-memory store loses all records on restart (mitigation: `HistoryStore` is an interface; production implementations use SQLite/Postgres; in-memory is for testing and single-process development)
- Risk: `Record<string, unknown>` data field is too loose (mitigation: `PipelineStage` discriminator tells consumers which type to expect; upstream packages document the shape in their own types)
- Risk: Timeline queries on large datasets will be O(n) without an index (mitigation: deferred to production-backed implementation with proper indexing)

#### Package Structure

```
packages/history/
├── src/
│   ├── types/
│   │   ├── record.ts     — DecisionRecord, PipelineStage
│   │   ├── query.ts      — HistoryQuery
│   │   ├── store.ts      — HistoryStore interface
│   │   ├── errors.ts     — HistoryError, RecordNotFoundError, DuplicateRecordError
│   │   └── index.ts
│   ├── default-history-store.ts  — in-memory implementation
│   └── index.ts
├── __tests__/
│   └── history.test.ts   — 24 tests across 7 describe blocks
├── package.json
└── tsconfig.json
```

#### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Centralized event bus | Existing infrastructure | Events are transient; no query API for historical data | History needs persistence + query, not pub/sub |
| Store in Verification package | Fewer packages | Verification produces facts, not records of the entire pipeline | History spans all five stages; colocating would break Separation of Concerns |
| SQL-first (better-sqlite3) | Query power, persistence | Adds dependency; tight coupling to storage backend | Interface-first allows swapable backends; default is pure in-memory |
| Typed generics per stage | Type-safe data access | History depends on all upstream packages; circular dependency risk | `Record<string, unknown>` + stage discriminator keeps it decoupled |
| Event sourcing framework | Full CQRS/ES patterns | Massive overkill for what is fundamentally an append log | A simple HistoryStore with `append()`/`find()` covers the need |

#### Implementation Notes
- Migration required: No (new package; no existing code to refactor)
- Breaking changes: No
- Timeline: Phase 2.1 — final package in the Decision Pipeline
- Build order: `history` after `trust` in build-order.sh
- Test count: 24 tests across 7 describe blocks (append-only, immutable by contract, get by id, find by criteria, timeline, stage coexistence, edge cases)

#### Related
- ADR-035 (Decision Pipeline — History is the 6th and final stage in the evaluation loop)
- ADR-037 (Trust Engine — Trust snapshots are stored in History as `trust` stage records)
- ADR-025 (Worker Model — History provides the audit trail for worker selection decisions)
- ADR-033 (Capability Taxonomy — History records capability context in `data` payloads)
- This ADR supersedes: nothing (new subsystem)

---

### ADR-039: RuntimeContractTest — Behavioral Contract for All Runtimes

**Date:** 2026-07-27
**Status:** Ratified
**Title:** Every Runtime implementation must satisfy a reusable behavioral contract suite

#### Context

Nine subsystem Runtimes were migrated to extend the base `Runtime` class. Each migration was validated manually through individual tests. There was no shared contract guaranteeing that every Runtime handles lifecycle, health, events, and failure states identically.

As the ecosystem grows (plugin Runtimes, third-party Runtimes, dynamically loaded agents), manual validation becomes a bottleneck. A formal contract ensures behavioral compatibility without requiring deep knowledge of each Runtime's internals.

#### Decision

Create `runRuntimeContractTests()` as a reusable test suite exported from `@vestara/runtime`. Every Runtime implementation must pass this suite to be considered compliant.

**Contract requirements:**

Lifecycle:
- initializes from `created` → `running`
- stops from `running` → `stopped`
- restarts from `stopped` → `running`
- throws on double initialize
- destroys from `stopped` → `destroyed`
- suspends and resumes (if applicable)

Health:
- reports `healthy` after initialization
- reports uptime and serviceId
- health status is readable at any state

Degrade and recover (if applicable):
- transitions to `degraded` on degrade()
- recovers to `running` on recover()

**Usage:**
```typescript
import { runRuntimeContractTests } from '@vestara/runtime';

describe('MemoryRuntime', () => {
  runRuntimeContractTests({
    runtimeName: 'MemoryRuntime',
    createRuntime: () => new DefaultMemoryRuntime(),
    describe, it, expect,
  });
});
```

#### Consequences

- Every new Runtime must pass the contract before it can be added to RuntimeGroup
- Contract test failures are immediately visible in CI
- Plugin/third-party Runtimes have a clear specification of what's expected
- Tests are reusable, reducing boilerplate

#### Related
- ADR-041 (Workspace Composition — RuntimeGroup consumes contract-compliant Runtimes)
- Base `Runtime` class (the abstraction under test)

---

### ADR-040: Product Event Model — Separating Infrastructure Events from User-Facing Events

**Date:** 2026-07-27
**Status:** Ratified
**Title:** UI consumes Product Events only; infrastructure events are translated through ProductEventTranslator

#### Context

Runtime lifecycle events (`runtime.failed`, `runtime.started`, `runtime.degraded`) are infrastructure events. They describe the health of the execution environment, not the progress of user-facing work. If the UI subscribes to raw runtime events, it becomes coupled to internal architecture — changing Runtime internals would require UI changes.

#### Decision

Define a `ProductEvent` type in `@vestara/workspace` representing user-facing events:

```typescript
type ProductEventType =
  | 'agent.thinking'
  | 'agent.planning'
  | 'agent.executing'
  | 'agent.completed'
  | 'workflow.progress'
  | 'workflow.completed'
  | 'file.created'
  | 'file.modified'
  | 'decision.saved'
  | 'memory.stored'
  | 'project.created'
  | 'conversation.response'
  | 'system.ready';
```

Create `ProductEventTranslator` that bridges infrastructure events to product events. The translator emits on the shared EventBus with a `_productEvent: true` flag so consumers can filter.

**Rules:**
- UI subscribes to product events only
- Infrastructure code emits infrastructure events only
- Translators are the only code that maps between the two
- New product events require a demonstrated user need

#### Consequences

- UI is decoupled from Runtime internals
- Runtime internals can be redesigned without UI changes
- Product events are stable API for future consumers (Vestara Desktop, mobile, cloud dashboard)
- One-time cost of maintaining translators

#### Related
- ADR-041 (Workspace Composition — WorkspaceRuntime orchestrates translators)
- Vestara UI layer (consumer of product events)

---

### ADR-041: Workspace Composition — Orchestration Through RuntimeGroup Without Modifying Runtime

**Date:** 2026-07-27
**Status:** Ratified
**Title:** WorkspaceRuntime composes subsystem Runtimes through RuntimeGroup; Runtime base class is not modified

#### Context

After migrating nine subsystem Runtimes to extend `Runtime`, the architecture needed a composition layer to orchestrate them into a coherent system. The Workspace is this composition root. Critical constraint: the base `Runtime` class must not be modified to support composition — composition should be external to the primitive.

#### Decision

Build three composition primitives external to `Runtime`:

1. **`DependencyResolver`** — topological sort of `Runtime[]` by dependency graph. Supports strict mode (throws on missing deps) and non-strict mode (graceful skip). Detects and reports cycles with full path.

2. **`RuntimeGroup`** — manages a set of registered Runtimes. `initializeAll()` starts Runtimes in dependency order; `stopAll()` stops in reverse order. Supports `critical` flag for health aggregation.

3. **`HealthAggregator`** — aggregates health across all Runtimes. Critical runtime failure → Workspace unhealthy. Non-critical failure → Workspace degraded at worst.

`WorkspaceComposition` extends `Runtime` and delegates `onInitialize`/`onStop` to a `RuntimeGroup`. It is intentionally thin — any logic beyond delegation is a warning sign.

`WorkspaceFactory` creates `WorkspaceComposition` from a declarative `WorkspaceDefinition`:

```typescript
interface WorkspaceDefinition {
  name: string;
  runtimes: RuntimeRegistration[];
}
```

**Architectural invariants:**
- Runtime base class is unchanged
- Composition is external to the primitive
- WorkspaceComposition is thin delegation
- All subsystem Runtimes are replaceable/optional

#### Consequences

- Nine subsystem Runtimes validated that composition works without base changes
- RuntimeGroup is reusable for future composition contexts (DesktopWorkspace, CloudWorkspace, AgentWorkspace)
- Dependency resolution prevents startup ordering bugs as runtime count grows
- Health aggregation provides a unified view for diagnostics, CLI, and UI

#### Related
- ADR-039 (RuntimeContractTest — gates which Runtimes can join RuntimeGroup)
- ADR-040 (Product Event Model — Workspace owns the ProductEventTranslator)
- All nine subsystem Runtime ADRs (each proven composable without modification)

---

### ADR-042 — Architecture Freeze & Product Validation

**Date:** 2026-07-27
**Status:** Ratified
**Title:** Runtime platform is considered stable; new infrastructure requires demonstrated product need

#### Context

The Runtime platform has been validated across nine subsystem Runtimes, one composition Runtime, and three composition primitives. 662 tests pass. The base `Runtime` class has not been modified since the composition layer was built. The architecture has reached the point where continuing to add infrastructure has diminishing returns.

#### Decision

Declare the Runtime Platform feature-complete. From this point:

1. **Runtime platform is stable.** No new lifecycle states, hooks, or base class changes without a demonstrated product need from an Experience Validation workflow.

2. **New infrastructure requires a user story.** Proposed changes to the foundation must be justified by a concrete user workflow that cannot be implemented within the existing architecture.

3. **Product development takes priority.** Engineering effort shifts from "what does the architecture need?" to "what does the user need to accomplish next?"

4. **Architectural changes are evolutionary, not exploratory.** The next iteration of Runtime internals should come from observing friction during real user workflows, not from theoretical design.

**Experience Validation** (EV) is defined as the primary development methodology:

| ID | Experience | Validates |
|---|---|---|
| EV-001 | Create a project with AI | Conversation, Planning, Workflow, Repository, Memory |
| EV-002 | Continue yesterday's work | Memory, Workspace restoration, Context recovery, Agent continuity |
| EV-003 | Refactor existing project | Repository analysis, Planning, Workflow execution, Progress reporting |
| EV-004 | Voice interaction | Audio, Conversation, Agent, Workflow |

**Guiding principle:** No new framework without a user story.

#### Consequences

- Prevents "architecture for its own sake" expansion
- Ensures every new capability is validated against real user need
- Protects the stability of the 662-test-strong foundation
- Shifts engineering culture from framework design to experience design

#### Related
- ADR-039 (RuntimeContractTest — the gate for future Runtime additions)
- ADR-040 (Product Event Model — the boundary between infrastructure and product)
- ADR-041 (Workspace Composition — the last composition primitive before the freeze)

---

### Milestone: Runtime Platform v1.0 — Closed

**Date:** 2026-07-27
**Status:** Complete

The Runtime Platform fulfilled its purpose. It provides a stable execution model, lifecycle management, composition, event boundaries, and persistent context without constraining product evolution. Experience Validation demonstrated that new capabilities — workflow orchestration, AI planning, and project continuity — could be added without modifying the Runtime foundation.

**Deliverables:**
- Runtime lifecycle (11 states, 28 transitions, 9 hooks)
- RuntimeContractTest (behavioral gate for all Runtimes)
- 9 subsystem Runtimes (Agent, Repository, Workflow, Plugin, API, CLI, Memory, Conversation, Audio)
- 3 composition primitives (DependencyResolver, RuntimeGroup, HealthAggregator)
- WorkspaceComposition (thin delegation, zero base Runtime changes)
- ProductEventTranslator (infrastructure/product event boundary)
- 2 planner implementations (HardcodedProjectPlanner + AiProjectPlanner)
- PlanningContext + MemoryContextService (project continuity)

**Architectural invariants preserved:**
- Base Runtime modifications: 0 (across all migrations and EV milestones)
- New Runtime types: 0 (after initial 9)
- Composition changes: 0 (no changes to DependencyResolver, RuntimeGroup, WorkspaceComposition)
- Cross-Runtime coupling: 0 (all communication through interfaces and events)

**Product Foundation:**
- EV-001a: Orchestration proof — platform executes complete workflow
- EV-001b: Substitution proof — AI planner replaces deterministic planner at same interface
- EV-002: Continuity proof — context carries across sessions, resume vs new detection

**Transition:**
- Era I (Platform Engineering): Complete
- Era II (Product Foundation): Complete
- Era III (Product Evolution): Begins with EV-003

**Guiding principle for Era III:**
> Every new capability should make Vestara understand the user's work more deeply — not make the platform more complicated.

**Lessons Learned:**
- Stable abstractions are validated by product development, not by framework completeness
- Runtime composition required no changes to the Runtime base class
- AI integration succeeded by replacing an implementation, not by changing orchestration
- Context continuity is more valuable than conversation persistence
- Product events successfully isolated the UI from infrastructure events
- Experience Validation is a better driver of architectural evolution than speculative framework expansion

---

### ADR-043: Shared Understanding Snapshot

```yaml
adr: "ADR-043"
title: "Shared Understanding Snapshot"
date: "2026-07-28"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer", "@backend-engineer", "@frontend-engineer"]
tags: ["understanding", "workspace", "architecture", "product-evolution"]
```

**Context**: Each workspace capability (planner, conversation, recommendations, overview UI, voice, agents) independently reconstructed semantic context from repository, memory, and conversation state. This created three problems: (1) divergent interpretations — the planner and the overview could reach different conclusions about the same workspace; (2) redundant computation — every consumer ran its own context assembly; (3) ungrounded AI — LLM prompts contained raw signals but no shared interpretation, producing inconsistent responses.

The Runtime established `Runtime` as the shared lifecycle abstraction (ADR-023). Product Evolution needed an equivalent abstraction for shared understanding.

**Decision**: A workspace produces exactly one immutable `WorkspaceUnderstanding` snapshot per observation cycle. All product components consume this shared snapshot. No component independently reconstructs semantic context from repository, memory, or conversation state.

```
WorkspaceSession
        │
        ▼
UnderstandingEngine
        │
        ├── WorkspaceObservation   (raw signals, no interpretation)
        │
        ├── WorkspaceUnderstanding  (immutable snapshot)
        │
        └── PlanningContext        (task-specific projection)
                │
                ├── Conversation
                ├── Planner
                ├── Overview UI
                ├── Voice
                └── Agents
```

Key properties of the snapshot:

- **Immutable** — `WorkspaceUnderstanding` is fully `readonly`. No component mutates it.
- **Identified** — Each snapshot carries `id` (content hash of workspace identity + observation timestamp). Consumers assert they share the same snapshot by comparing `id`.
- **Traced** — Every snapshot carries `fromObservationTimestamp` linking it to the observation it derived from.
- **Provenant** — Every conclusion in `WorkspaceUnderstanding` traces to an observation field. Risks carry `observationSource`. Summaries derive from deterministic fields.
- **Deterministic** — `WorkspaceUnderstanding` is produced without AI. AI may enrich a separate `narrative` field, but the structured understanding must always be producible from deterministic rules alone.
- **Cyclic** — When a new observation cycle completes, a new snapshot replaces the old one. Consumers observe the replacement via `workspace:understood` event.

**Workspace lifecycle extended**:

```
workspace.opening  →  infrastructure boot
workspace.ready    →  runtimes initialized, session created
workspace.understood → semantic snapshot produced, consumers bound
workspace.interactive → user can begin productive work
```

**Consequences**:

**Positive:**
- Every consumer operates on the same semantic view of the workspace — verifiable by snapshot `id`
- No redundant context reconstruction — reduces prompt size and latency
- Provenance enables explainability — every conclusion has an `observationSource` trace
- Snapshot identity enables diff-based features ("what changed since yesterday?")
- Separates interpretation (UnderstandingEngine) from consumption (planner, conversation, UI)

**Negative:**
- Requires a re-observe cycle when workspace state changes significantly (mitigation: cycles are fast — deterministic observation is <500ms)
- Components that previously read repository state directly must now read through the snapshot (mitigation: gradual adoption — new capabilities consume snapshots; legacy code deprecates incrementally)

**Risks:**
- Risk: A component may bypass the snapshot and read repository state directly (mitigation: enforced through dependency injection — components receive the snapshot, not the session)
- Risk: Snapshot may become stale between cycles (mitigation: `workspace:understood` event signals freshness; components may request re-observation through the engine)

**Alternatives Considered**:

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Lazy context assembly per consumer | No shared model to maintain | Each consumer diverges independently | Divergent interpretations break trust |
| Mutable understanding updated in place | Always current | No version identity, no diff capability | Cannot compare snapshots or trace provenance |
| AI-only understanding | Rich interpretations | Not reproducible, not explainable | Violates determinism invariant |

**Related**:
- ADR-023 (Core Runtime Model — Everything is a Runtime)
- ADR-026 (Intent Model — Goals to Execution Plans)
- ADR-035 (Decision Pipeline)
- Blueprint volume: 05-ai-core, 06-workspace, 22-user-experience
- Package: `packages/understanding/`

---

## Design Principles (Emergent)

These principles are not ADRs — they are invariants observed across multiple decisions. They guide future architecture without prescribing implementation.

### Principle 1: Lifecycle and Understanding are orthogonal

> **Runtime ensures every component progresses through the same lifecycle. Understanding ensures every component begins from the same mental model.**

These two guarantees are independent and complementary:

- Runtime (ADR-023) guarantees consistent execution — every component lives according to the same lifecycle.
- Understanding (ADR-043) guarantees consistent interpretation — every component reasons from the same semantic snapshot.

Execution without shared understanding produces coordinated but uninformed systems. Understanding without consistent execution produces insightful but unreliable systems. Together they form the structural backbone of Vestara.

### Principle 2: Execution, Knowledge, and Experience are separate planes

The architecture separates three concerns:

- **Execution Plane** — how the system operates (Runtime → WorkspaceRuntime → RuntimeGroup)
- **Knowledge Plane** — what the system knows (Observation → Understanding → PlanningContext)
- **Experience Plane** — how the user benefits from that knowledge (Conversation, Planner, Overview, Voice, Agents)

No plane bypasses the one above it. The Knowledge Plane answers "what does the system know?" before the Experience Plane answers "how does the user benefit?" This prevents consumers from independently reconstructing semantic context.

### Principle 3: Evaluation is the fourth engineering discipline

> **Runtime executes. Workflow acts. Understanding knows. Evaluation measures.**

Improvement without measurement is intuition. The evaluation corpus (`packages/evaluation/`) is the executable specification for understanding quality:

| Dimension | Measures | Gate |
|-----------|----------|------|
| Accuracy  | Are the conclusions correct? | ≥ threshold per dimension |
| Coverage  | How much of the project is understood? | Expanding over time |
| Confidence| How certain is each conclusion? | Per-assertion minimum |
| Traceability | Can every conclusion be traced to an observation? | ≥ 80% |
| Regression | Did previously passing assertions regress? | Zero critical regressions |

The calibration loop for shared understanding:

```text
Corpus Report → Find weakest dimension → Improve one producer → Run evaluation → Verify no regressions → Repeat
```

This mirrors the engineering discipline of Platform Engineering: stabilize the contract first, then iterate within it. The contract tests verify API compliance; the corpus tests verify semantic correctness — they answer fundamentally different questions about the same system.

### Principle 4: One owner per semantic field

> **Every semantic field in WorkspaceUnderstanding has exactly one producer.**

This is the fourth recurrence of Vestara's consistent architectural pattern:

| Layer | Coordinator | Specialist | Pattern |
|-------|-------------|------------|---------|
| Execution | RuntimeGroup | Runtime | Coordinator owns lifecycle; runtime owns behavior |
| Pipeline | WorkspaceRuntime | Pipeline stage | Coordinator owns sequencing; stage owns analysis |
| Knowledge | UnderstandingAssembler | Producer | Coordinator owns composition; producer owns interpretation |
| Evaluation | Harness | Corpus entry | Coordinator owns measurement; entry owns assertion |

The invariant: a coordinator delegates to specialists, each of which owns exactly one dimension. Specialists never mutate shared state — they contribute results that the coordinator composes. This makes each specialist independently measurable, improvable, and replaceable without affecting others.

## Freeze Point: Methodology Freeze (EV-003b)

The architecture has reached a methodology freeze. The recurring pattern — coordinator composes, specialist decides, every concern has one owner — has proven itself across four independent subsystems. Future work proceeds within this pattern rather than redesigning it.

### Three rules to preserve

1. **Coordinators do not accumulate domain logic.** They orchestrate; they do not decide.
2. **No two specialists own the same semantic field.** Ownership remains singular per concern.
3. **No improvement is accepted without evidence from the evaluation harness.** The corpus is the arbiter of progress.

### The engineering process

```text
Read evaluation report → Pick weakest producer → Improve only that producer → Run corpus → Accept only if accuracy improves, confidence remains calibrated, regressions remain zero → Repeat
```

### Questions answered

| Epoch | Question | Answer |
|-------|----------|--------|
| Runtime Platform v1.0 | Can it execute? | Runtime. |
| Product Foundation | Can it accomplish work? | Workflow. |
| Product Evolution (EV-003a) | Can it understand? | Understanding. |
| Evaluation Engineering (EV-003b) | Can we prove it improves? | Corpus-driven calibration. |

### Product philosophy: Orientation before interaction

> **Vestara minimizes the amount of context a developer must reconstruct before they can make their next good decision.**

Every interaction should begin by reducing uncertainty. Before asking the user anything, Vestara should answer questions they haven't yet asked:

- Is my workspace healthy?
- Did anything change?
- What milestone am I on?
- What's blocking progress?
- What's the highest-value next step?

This principle connects every subsystem to a single product outcome:

| Subsystem | Reduces |
|-----------|---------|
| Runtime | Operational complexity |
| Workflow | Execution complexity |
| Understanding | Cognitive reconstruction |
| Evaluation | Engineering uncertainty |
| Timeline (future) | Historical reconstruction |

The product question for every future milestone: *Does this feature reduce the time between opening a workspace and making a confident next decision?*

### Principle 5: Introduce abstractions only when product experience demands them

> **Introduce a new abstraction only when multiple product experiences cannot be expressed by the existing ones.**

Product pressure — not technical curiosity — is what earns a new foundational model. By this standard:

- Runtime earned its place (multiple components needed a shared lifecycle).
- Workflow earned its place (multiple capabilities needed a shared execution model).
- Understanding earned its place (multiple consumers needed a shared semantic model).
- Evaluation earned its place (multiple producers needed objective measurement).

Timeline, Intent, and other future models must earn their place the same way.

### The architecture's role has changed

The architecture has shifted from **enabling development** to **protecting product focus**. When a product idea appears, the first questions are now:

1. Which existing model already contains this information?
2. Which producer should improve?
3. Which consumer should render it?
4. How will we measure whether the experience got better?

These questions prevent local optimizations from creating long-term inconsistency. The architecture acts as a constraint — in a good way.

### Governance layers

The `vestara-blueprint/00-governance/` directory now contains two orthogonal constitutions:

| Document | Answers | Audience |
|----------|---------|----------|
| `01-ai-constitution.md` | How should Vestara behave as an engineering system? | Contributors |
| `08-product-constitution.md` | How should Vestara behave as an engineering experience? | Everyone |

Technical governance protects the integrity of the implementation. Product governance protects the integrity of the user's experience. Neither contains the other's concerns.

### Technical/Product pairs

Every major technical abstraction has a corresponding product outcome:

| Technical | Product |
|-----------|---------|
| Runtime | Orientation |
| Workflow | Progress |
| Understanding | Awareness |
| Evaluation | Confidence |
| Memory | Continuity |
| Planner | Guidance |

The left side is implementation. The right side is perception. Users never experience a Runtime — they experience reliability. They never experience Understanding — they experience being understood.

### Capability model (emerging)

The next evolution organizes the repository around **developer capabilities** rather than **software architecture**. Every capability answers three questions:

| Verb | Question | Examples |
|------|----------|----------|
| Observe | Can it gather signals? | Understanding, Evaluation |
| Decide | Can it reason about those signals? | Planner, Understanding |
| Act | Can it execute based on those decisions? | Workflow, Runtime |

Chat is not a capability — it is an interface. The same capability can be reached through voice, terminal, IDE plugin, REST API, automation, or another AI. The capability stays identical; only the interface changes.

The capability catalog is defined in `09-capability-catalog.md` — a contract listing every capability, its inputs, outputs, consumers, and owner. Not documentation, but a product API that survives implementation changes. Five capabilities defined, one foundation (Intent Model) identified as the next likely new abstraction.

### Capability Validation (CV) — the next epoch

The next milestones are not technical. They validate the capability model through real developer journeys:

| ID | Scenario | Question |
|----|----------|----------|
| CV-001 | Open unfamiliar workspace | Does the developer understand in seconds? |
| CV-002 | Return after interruption | Does the developer recover context? |
| CV-003 | Choose next task | Does Vestara provide a grounded recommendation? |
| CV-004 | Execute a change | Does the developer observe progress and outcome? |
| CV-005 | Review evolution | Does the developer understand what changed over time? |

Each validation asks "Did Vestara improve the developer's cognitive state?" — not "Did we add another feature?"

### The three layers of identity

```
                    Vestara Identity


                         Vision
                           │
              "Reduce cognitive effort while preserving agency"
                           │
                  Product Capabilities
                           │
         Understand / Decide / Act / Learn
                           │
                 Implementation Platform
                           │
 Runtime / Workflow / Understanding / Evaluation / Agents
```

The implementation platform no longer defines the product. It supports it.

### Fifth discipline: Learning Engineering

| Discipline | Owns |
|-----------|------|
| Platform Engineering | Execution |
| Product Engineering | Work |
| Knowledge Engineering | Understanding |
| Evaluation Engineering | Measurement |
| **Learning Engineering** | **Continuous product evolution from evidence** |

Learning Engineering's artifacts are not models or features. They are findings, lessons, validated improvements, and closed hypotheses. Its repository is `docs/evidence/learning-log.md`.

### Assets vs. Evidence

Everything built falls into one of two categories:

| Category | Produces | Changes when |
|----------|----------|-------------|
| Assets | Code, contracts, governance, UI, producers | Engineers implement |
| Evidence | Corpus reports, validation runs, findings | Developers use Vestara |

Assets represent what Vestara is. Evidence represents what Vestara has learned. Over time, the evidence tree may become the more valuable one — it records not only what Vestara became, but why it became that way.

The long-term cycle:

```
Vision → Architecture → Capability → Experience → Evidence → Learning → Better Capability
```

Architecture has become infrastructure for learning rather than the destination of development.

---

### ADR-119: Agent Type Selection — Workspace vs Registry Agents

**Date**: 2026-08-02
**Status**: Accepted
**Category**: Implementation
**Deciders**: @chief-architect, @ai-engineer
**Consulted**: @security-engineer

**Context**:
The Agent Control Center allows users to create and manage agents, but all agents
are treated identically regardless of their origin. Some agents are created locally
within the workspace (workspace agents), while others are installed from the
marketplace registry (registry agents). This distinction affects:

1. **Configuration**: Registry agents source their provider/model from the
   marketplace package, while workspace agents use locally configured providers.
2. **Lifecycle**: Registry agents can be updated/uninstalled via the marketplace,
   while workspace agents are managed entirely within the workspace.
3. **Discovery**: Users need to distinguish between agents they created and agents
   installed from the registry.

Without an explicit agent type, the system cannot properly route configuration,
lifecycle management, or display appropriate UI controls.

**Decision**:
Introduce an `agentType` field on `AgentDefinition` with two values:
- `'workspace'` — Local agents created in the workspace
- `'registry'` — Agents installed from the marketplace registry

**Implementation**:
- Added `agentType: AgentType` to `AgentDefinition` interface
- Added `agent_type TEXT DEFAULT 'workspace'` column to agents table
- Updated `saveAgent()` and `rowToAgent()` to persist/read the field
- Added radio button selector in Agent Registry Modal
- When "Registry Agent" selected, provider/model replaced with registry source/version
- POST/PUT API handlers read `body.agentType` with workspace default

**Consequences**:
- Agent CRUD operations now include `agentType` in request/response payloads
- Agent list UI can filter/display by type (future enhancement)
- Marketplace integration can auto-set `agentType: 'registry'` on install
- All built-in agents default to workspace type

---

### ADR-120: Durable Agent Execution via AgentHarnessRuntime

**Status:** accepted
**Date:** 2026-08-02
**Category:** architecture

**Context**:
Agent execution was stateless across restarts. If the API server restarted mid-execution, all in-progress agent work was lost and had to be restarted from scratch.

**Decision**:
Introduce `AgentHarnessRuntime` as the durable execution layer. The harness owns the model/tool/observation/verification turn. It persists execution state so agents can resume after restart.

**Consequences**:
- Agent execution survives server restarts
- The harness is the single lifecycle authority for agent turns
- Other components (planning, browser use, learning) are specialists, not autonomous runtimes

---

### ADR-121: Engineering Event Projection (harness.* and change.*)

**Status:** accepted
**Date:** 2026-08-02
**Category:** architecture

**Context**:
Subsystem events (harness events, change events) needed to be projected to users in real-time, but the projection format differed by consumer (TUI vs Workspace UI).

**Decision**:
Standardize on engineering event projection. All subsystem events flow through a canonical projection layer that formats them for display. The projection owns redaction, ordering, and formatting.

**Consequences**:
- Single projection layer serves all consumers
- Event schema changes don't directly break UIs
- Projection is testable independently of event sources

---

### ADR-122: Real-Time Workflow Lifecycle

**Status:** accepted
**Date:** 2026-08-02
**Category:** architecture

**Context**:
The engineering workflow had no real-time lifecycle representation. Users could not see which stage a workflow was in or what was happening.

**Decision**:
Define a real-time workflow lifecycle with stages that are projected to the UI. Each stage has deterministic transitions and an owning agent.

**Consequences**:
- Users see live workflow state
- Stage transitions are deterministic and auditable
- The lifecycle is the backbone for the Activity Room

---

### ADR-123: Eight-Stage Workflow Agent Attribution and Workspace Surfaces

**Status:** accepted
**Date:** 2026-08-02
**Category:** implementation

**Context**:
The eight-stage workflow projection (ADR-122) described stages but did not attribute an owning agent to each lifecycle stage.

**Decision**:
Every workflow stage carries an owning agent, derived deterministically from tool-call `payload.agentId` or a role default per stage.

**Consequences**:
- UI can answer "which agent owns this stage"
- Agent display names resolved from agent registry
- TUI and Workspace UI consume the same canonical projection

---

### ADR-124: Unified Marketplace Asset and Installation Model

**Status:** accepted
**Date:** 2026-08-03
**Category:** architecture

**Context**:
The Marketplace asset model and installation model were specified separately, leading to inconsistencies in how products were described vs how they were installed.

**Decision**:
Unify the asset and installation models. A single product manifest describes both the catalog view and the installation requirements.

**Consequences**:
- One manifest serves discovery and installation
- Reduces specification drift
- Simplifies publisher workflow

---

### ADR-125: AI Qualification by Governed Engineering Behavior

**Status:** accepted
**Date:** 2026-08-06
**Category:** architecture

**Context**:
Vestara delegates engineering work to AI agents. Without qualification, agents may produce outputs that don't meet engineering standards.

**Decision**:
Qualify AI agents by their governed engineering behavior, measured continuously: repository grounding, schema reliability, revision efficiency, scope discipline, approval awareness. Qualification is role-specific and feeds into engineering lifecycle gates.

**Consequences**:
- Agents must demonstrate competence before receiving autonomy
- Qualification metrics are observable and comparable
- Unqualified agents trigger human review or scope reduction

---

### ADR-126: Activity Room as Projection, Not Event Source

**Status:** accepted
**Date:** 2026-08-06
**Category:** architecture

**Context**:
The Activity Room was initially designed as a direct consumer of the event bus, creating coupling between event schema and UI.

**Decision**:
The Activity Room is a projection of engineering events, not a direct consumer. Subsystem events flow through a projection layer (redaction, ordering, formatting) into an append-only store, then through a History API to the Activity Room.

**Consequences**:
- Event schema changes don't directly break the UI
- Redaction is centralized
- Activity history is replayable and auditable

---

### ADR-127: Local-First Marketplace with Optional Cloud Identity

**Status:** accepted
**Date:** 2026-08-06
**Category:** architecture

**Context**:
The Marketplace must work offline while supporting future cloud features. Local product installation must not require a cloud account.

**Decision**:
The Marketplace is local-first. Offline mode is fully functional (local identity, catalog, installation, lifecycle). Online mode is additive, enabled by linking a Vestara account (OAuth → Vestara Account → Organization RBAC).

**Consequences**:
- Vestara is usable without internet or cloud account
- Cloud features are additive, not prerequisites
- Three authorization layers remain separate: identity, RBAC, product capabilities

---

**END OF DECISION LOG**

*This log is append-only. Decisions are never deleted — only superseded with new ADR.*
