---
title: Vestara AI OS Architecture
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Vestara AI OS Architecture

**Version**: 1.0
**Status**: Approved
**Owner**: @chief-architect
**Last Updated**: 2026-07-24

---

## Purpose

This document describes the enduring architecture of the Vestara AI Operating System — the service model, boot lifecycle, communication patterns, and security boundaries. Unlike the roadmap (which describes evolution), this document describes structure.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                   User Interfaces                    │
│  ┌──────────┐  ┌──────────┐  ┌──────┐  ┌────────┐ │
│  │   CLI    │  │ Workspace│  │ IDE  │  │  REST  │ │
│  │          │  │    UI    │  │ Ext  │  │  API   │ │
│  └────┬─────┘  └────┬─────┘  └──┬───┘  └───┬────┘ │
└───────┼─────────────┼───────────┼───────────┼──────┘
        │             │           │           │
┌───────┴─────────────┴───────────┴───────────┴──────┐
│              @vestara/events-server                 │
│         (HTTP + SSE + WebSocket Gateway)            │
└─────────────────────┬──────────────────────────────┘
                      │
┌─────────────────────┴──────────────────────────────┐
│              WorkspaceRuntime                       │
│         (Orchestration Boundary)                    │
└──────┬──────┬──────┬──────┬──────┬──────┬──────────┘
       │      │      │      │      │      │
┌──────┴┐ ┌───┴───┐ ┌┴────┐ ┌┴────┐ ┌┴────┐ ┌┴──────┐
│Discover│ │Analyze│ │Plan │ │Impl │ │Verify│ │Collabor│
└───────┘ └───────┘ └─────┘ └─────┘ └─────┘ └───────┘
       │      │      │      │      │      │
       └──────┴──────┴──────┴──────┴──────┘
                      │
              ┌───────┴───────┐
              │  EventBus     │
              │ (Pub/Sub)     │
              └───────────────┘
```

---

## Core OS Services

There are 14 native services. Each is independently startable, stoppable, and observable.

| Service | ID | Responsibility | Depends On |
|---------|----|---------------|------------|
| Vestara Kernel | `vestara-kernel` | Core lifecycle, service registry | — |
| Workspace Manager | `vestara-workspace` | Session management, workspace lifecycle | Kernel |
| Repository Monitor | `vestara-monitor` | File system watching, auto-indexing | Workspace |
| Memory Daemon | `vestara-memory` | Memory consolidation, importance scoring | Kernel |
| Knowledge Indexer | `vestara-knowledge` | Background indexing, document parsing | Workspace |
| Planning Engine | `vestara-planning` | Plan orchestration, task scheduling | Knowledge |
| Implementation Engine | `vestara-implement` | Change set execution, patch generation | Planning |
| Verification Engine | `vestara-verify` | Automated verification, trend analysis | Implementation |
| Cloud Controller | `vestara-cloud` | Remote execution, job queue | Kernel |
| Plugin Runtime | `vestara-plugin` | Plugin lifecycle, hook execution | Kernel |
| Agent Scheduler | `vestara-agent` | Agent orchestration, task dispatch | Workspace |
| Enterprise Controller | `vestara-enterprise` | Policy enforcement, audit, RBAC | Kernel |
| Event Broker | `vestara-events` | Event routing, subscription management | Kernel |
| Telemetry | `vestara-telemetry` | Metrics collection, health monitoring | Kernel |

## Service Lifecycle

```
Registered → Starting → Running → Draining → Stopped
                                        ↘
                                      Failed → Restarting
```

Each service implements the `ServiceContract` interface:

```typescript
interface ServiceContract {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<HealthCheckResult>;
  status(): Promise<ServiceStatus>;
  register(): Promise<void>;
}
```

## Boot Sequence

```
Power On
  │
  ▼
UEFI Firmware
  │
  ▼
GRUB (Vestara-themed)
  │
  ▼
Linux Kernel (signed)
  │
  ▼
Initramfs
  │
  ▼
Systemd
  │
  ▼
vestara-boot.service
  │
  ├── 1. Load configuration
  ├── 2. Start Vestara Kernel
  ├── 3. Register core services
  ├── 4. Start Workspace Manager
  ├── 5. Restore last workspace session
  ├── 6. Start Knowledge Indexer
  ├── 7. Start Agent Scheduler
  ├── 8. Start Repository Monitor
  ├── 9. Start Plugin Runtime
  ├── 10. Start Event Broker
  │
  ▼
vestara-desktop.target
  │
  ├── Launch Workspace UI (native fullscreen)
  ├── Show login/restore screen
  └── Desktop Ready
```

## Communication Patterns

### In-process: EventBus

Services communicate via the in-process EventBus with pattern matching:

```
serviceA → EventBus.emit('plan:created', payload)
              ↓
         EventBus.subscribe('plan:*', handler)
              ↓
         serviceB receives event
```

### Cross-process: Event Server

The events server bridges the EventBus to external consumers:

```
serviceA → EventBus
              ↓
         subscribeToEventBus(EventBus)
              ↓
         events-server (HTTP + SSE)
              ↓
         Workspace UI | IDE | REST clients
```

### Event Types

```
workspace:*     — workspace.ready, workspace.discovered, workspace.analyzed
plan:*          — plan.created, plan.updated, plan.approved, plan.completed
changeset:*     — changeset.created, changeset.applied, changeset.rolled-back
verification:*  — verification.completed, verification.failed
agent:*         — agent.started, agent.completed, agent.failed
session:*       — session.created, session.completed
collaboration:* — collaboration.submitted, collaboration.approved, collaboration.rejected
memory:*        — memory.stored, memory.consolidated, memory.indexed
```

## Workspace Lifecycle

```
Repository Path Provided
  │
  ▼
Discover (walk files)
  │
  ▼
Fingerprint (git identity + content hash)
  │
  ▼
Analyze (language, packages, entry points, risks)
  │
  ▼
Manifest (create .vestara/)
  │
  ▼
Index (parse documents, chunk, store)
  │
  ▼
Present (deterministic facts + optional AI narrative)
  │
  ▼
Session (create conversation, initialize memory)
  │
  ▼
Monitor (live file watching, auto-reindex)
```

## Repository Monitoring

```
File Changed (inotify/fsevents)
  │
  ▼
Detect Change
  │
  ├── New file → parse → index
  ├── Modified file → reparse → reindex
  └── Deleted file → remove from index
  │
  ▼
Update Health Score
  │
  ▼
Emit workspace:updated event
  │
  ▼
UI updates via event stream
```

## Security Boundaries

| Boundary | Enforced By | Description |
|----------|-------------|-------------|
| Service isolation | Process boundaries | Each service runs in its own process |
| Plugin sandbox | Subprocess worker | Plugins execute in isolated child processes |
| Agent permissions | PermissionEngine | Agents have resource-based permissions |
| Enterprise policies | EnterpriseController | RBAC + approval policies gate operations |
| Audit trail | Append-only storage | All state transitions recorded immutably |
| Workspace isolation | `.vestara/` directory | Each workspace has its own database |

## Failure Recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Service crash | Health check failure | Auto-restart via service manager |
| Workspace corruption | Manifest validation failure | Restore from last checkpoint |
| Knowledge index corruption | Index integrity check | Reindex from file system |
| Agent hang | Execution timeout | Kill and reschedule |
| Event broker failure | Subscription timeout | Reconnect with exponential backoff |
| Provider unavailable | Completion error | Degrade to deterministic mode |

## Persistence Model

```
.vestara/
  workspace.json        — Manifest (identity, analysis, metadata)
  knowledge/
    chunks.db           — Document chunks (SQLite)
  plans/
    plans.db            — Plans, change sets, verifications, decisions, impact assessments
  memory/
    memories.db         — Memory records
  sessions/
    last.session        — Last active session ID
```

## Relationship to Existing Platform

```
vestara-ai-core/            (implementation)
  packages/
    workspace/              → WorkspaceRuntime, all services
    events-server/          → HTTP + SSE gateway
    kernel/                 → Kernel service
  apps/
    cli/                    → CLI interface
    workspace/              → Web UI (future native desktop)
  docs/
    AI-OS-ROADMAP.md        → Evolution roadmap
    AI-OS-ARCHITECTURE.md   ← This document
    VSDE/                   → Engineering methodology
```

## Design Principles

1. **WorkspaceRuntime is the orchestration boundary** — No service bypasses it.
2. **RepositoryWorkspace is the canonical domain object** — Every capability enriches it.
3. **AI is optional** — All pipelines degrade gracefully to deterministic output.
4. **Events are the integration fabric** — Services communicate via EventBus, not direct imports.
5. **Persistence is local-first** — `.vestara/` is the system of record.
6. **Observability is built-in** — Every service exposes health, every state change emits an event.
7. **Security is layered** — Process isolation, permissions, policies, audit.
