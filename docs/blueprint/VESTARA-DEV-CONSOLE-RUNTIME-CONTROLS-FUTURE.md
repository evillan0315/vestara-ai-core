---
title: "Future Development — Developer Console, Runtime Controls & Terminal"
version: 1.0.0
status: future-development
owner: vestara
recorded: 2026-09-11
last-reviewed: 2026-09-11
next-review: TBD
authorization: NOT AUTHORIZED FOR IMPLEMENTATION
---

# Future Development — Vestara Developer Console, Runtime Controls & Terminal

**Status:** FUTURE DEVELOPMENT / RECORDED / NOT AUTHORIZED FOR IMPLEMENTATION

**Recorded:** 2026-09-11

**Do not add this work to the current Activity Room Premium UX milestone.**

---

## Objective

Vestara should provide reusable operational surfaces for:

- Live developer/server logs
- Governed service lifecycle controls
- Interactive terminal sessions

**These capabilities must not belong exclusively to Activity Room.**

They should be reusable platform/tool capabilities that can be hosted by Activity Room, Engineering Workspace, Diagnostics, Global Assistant where appropriate, and other authorized Vestara surfaces.

---

## 1. Developer Console

Create a future reusable `DeveloperConsole` / `Console` capability capable of observing multiple log sources.

### Initial candidate sources

| Source | Description |
|--------|-------------|
| Vestara API | Runtime boot, provider registration, service startup |
| OpenCode | Session lifecycle, tool execution, provider calls |
| Workspace UI / Vite | HMR, build, compilation |
| Kernel/runtime | Lifecycle events, recovery, initialization |
| Build | Compilation, bundling, type checking |
| Tests | Test execution, failures, coverage |
| Workflows/executions | Orchestration, task dispatch, approval |
| Other registered services | Any service that produces structured logs |

### Current dogfood example

`/tmp/vestara-api.log` contains runtime boot information such as:

- Runtime profile
- Capability activation
- Kernel creation
- Provider registration/loading
- Service registration
- Service startup
- Workspace initialization
- Boot timings
- Errors/warnings

**Architectural note:** Vestara should eventually expose this through an authoritative log/runtime source rather than requiring the UI to shell out to `tail` directly. **Do not make `/tmp/vestara-api.log` the canonical architecture.**

---

## 2. Console UI

The console should support a premium reusable presentation:

```text
Console
┌─────────────────────────────────────────────────────────────┐
│ [API] [OpenCode] [Workspace] [Kernel] [...]                  │
│                                                               │
│ Filter...              Level: All     ● Live                 │
│                                                               │
│ 13:35:23 INFO  Configuration loaded                           │
│ 13:35:24 INFO  Provider loaded: opencode                      │
│ 13:35:25 INFO  Provider loaded: opencode-go                   │
│                                                               │
│                          Clear  Pause  ↗ Detach              │
└─────────────────────────────────────────────────────────────┘
```

### Candidate functionality

- Live follow
- Pause/resume display
- Search
- Level filtering
- Source filtering
- Timestamps
- Structured context inspection
- Copy
- Clear presentation
- Download/export where authorized
- Auto-scroll
- Bounded history

### Clearing invariant

**Clearing the visual console must not automatically delete authoritative logs.**

Visual presentation state is separate from log storage authority.

---

## 3. Attach / Detach Model

The Console and Terminal should be reusable surfaces rather than page-specific implementations.

### Conceptual states

```text
Tool Surface
     │
     ├── docked
     ├── collapsed
     ├── expanded
     ├── detached
     └── reattached
```

Activity Room could dock them at the bottom or side.

Detaching should move presentation ownership, not create another console/runtime/session.

### Freeze

| Invariant | Meaning |
|-----------|---------|
| **DETACH ≠ TERMINATE** | Detaching a surface does not end the underlying session |
| **ATTACH ≠ CREATE NEW SESSION** | Reattaching resumes the existing session |
| **UI SURFACE ≠ TOOL AUTHORITY** | The UI is a viewer, not the source of truth |

This should follow the same lifecycle lesson discovered during **GA-DETACH-001**: presentation lifecycle must not own execution/runtime lifecycle.

---

## 4. Service Lifecycle Controls

Activity Room should eventually expose governed controls for relevant development services such as:

- Vestara API
- OpenCode
- Workspace UI

### Candidate actions

| Action | Classification |
|--------|---------------|
| Status | READ |
| Start | WRITE |
| Stop | WRITE / classified risk |
| Restart | WRITE / classified risk |
| Reload | WRITE |

### Design principle

**Do not implement these as arbitrary shell commands embedded in React.**

Model them through an authoritative service/process/runtime control abstraction.

### Conceptual interface (not a frozen contract)

```text
ServiceControlPort

inspect(service)   → ServiceStatus
start(service)     → OperationResult
stop(service)      → OperationResult
restart(service)   → OperationResult
reload(service)    → OperationResult
```

**Clarification:** `ServiceControlPort` is currently conceptual, not a frozen contract. Before creating it, determine whether existing Host/Runtime/System/Boot ownership should be reused or generalized.

### Reuse directive

Reuse existing Host/Boot/System/Runtime abstractions if they already own this responsibility rather than creating a duplicate service-management architecture.

---

## 5. Governance

Observability and mutation must remain separate.

### Permission classification

| Operation | Classification |
|-----------|---------------|
| `logs.read` | READ |
| `service.inspect` | READ |
| `service.start` | WRITE |
| `service.reload` | WRITE |
| `service.restart` | WRITE / classified risk |
| `service.stop` | WRITE / classified risk |
| `terminal.execute` | classify from requested operation |

### Architectural invariants

Existing Vestara permission/governance contracts remain authoritative.

A human or AI actor being able to **see** a service does not automatically authorize **mutation** of that service.

**Preserve:**

| Invariant | Meaning |
|-----------|---------|
| Capability ≠ Authority | Having the ability does not grant permission |
| Observation ≠ Mutation | Reading state does not authorize writing state |

---

## 6. Activity Room Integration

Activity Room should eventually be able to host a compact operational control area:

```text
┌─────────────────────────────────────────┐
│ SERVICES                                │
│                                          │
│ API          ● Running       ↻  ■       │
│ OpenCode     ● Running       ↻  ■       │
│ Workspace    ● Running       ↻  ■       │
│                                          │
│ ─────────────────────────────────────── │
│                                          │
│ Console | Terminal                       │
└─────────────────────────────────────────┘
```

This would make Activity Room a much stronger engineering control room while preserving its role as an interaction/projection surface.

### Architectural constraint

**Activity Room must invoke governed runtime actions; it must not become service lifecycle authority.**

Activity Room is the presentation surface. The service control abstraction is the authority.

---

## 7. Terminal

Add a reusable Terminal capability/surface suitable for:

- Activity Room
- Engineering Workspace
- Developer tooling
- Diagnostics
- Other authorized packages

### Candidate capabilities

- Create session
- Attach session
- Detach session
- Resize
- Input
- Output
- Working directory
- Environment/context
- Terminate
- Reconnect where supported

### Architecture directive

**Reuse the existing Vestara terminal/runtime infrastructure if present.**

Prefer existing xterm.js/PTY architecture where already canonical.

**Do not implement a second terminal runtime merely for Activity Room.**

---

## 8. Terminal Governance

The terminal is more powerful than the Console.

### Governance principles

- Terminal availability must not imply unrestricted command authority
- Commands/actions remain subject to existing actor identity, permissions, execution policy and evidence requirements
- AI use should occur through a governed Tool capability rather than pretending UI terminal access itself grants shell authority

### Permission model

```text
terminal.execute
  → classified from requested operation
  → subject to actor identity + permissions + execution policy
  → evidence recorded for audit
```

---

## 9. Tool Exposure

Console/runtime operations should also eventually be available to authorized AI actors as tools.

### Candidate tools

| Tool | Classification |
|------|---------------|
| `console.read` | READ |
| `console.search` | READ |
| `service.inspect` | READ |
| `service.restart` | WRITE / classified risk |
| `terminal.execute` | classified from operation |

### Agent workflow example

```text
Observe failure
     ↓
Read API logs
     ↓
Identify evidence
     ↓
Request/receive restart authority
     ↓
Restart API
     ↓
Observe boot
     ↓
Verify readiness
```

### Critical invariant

**This is especially relevant to the interruption/recovery and Observer work already recorded.**

The Observer may observe a failed service but must not acquire restart authority merely because it detected the failure.

**Observation does not confer mutation authority.**

---

## 10. Evidence

Lifecycle actions should produce Activity Room/evidence events where appropriate.

### Example evidence sequence

```text
Eddie · Director
Restarted Vestara API

API · Runtime
Starting...

API · Runtime
✓ Ready · 5.3s
```

### AI-initiated action evidence requirements

AI-initiated actions must preserve:

| Field | Description |
|-------|-------------|
| actor | Who initiated the action |
| action | What was done |
| target service | Which service was affected |
| authorization/policy decision | How authority was granted |
| execution | What actually happened |
| result | Outcome |
| timestamp | When it occurred |
| evidence | Supporting artifacts |

### Anti-pattern

**Do not fabricate causal explanations from logs.**

Evidence is factual record. Causal explanation requires separate authorization.

---

## 11. Future Activity Room UX

When this capability exists, the premium Activity Room right-side operational context can legitimately expand beyond the currently authoritative data.

### Example expanded context

```text
┌─────────────────────────────────────────┐
│ SYSTEMS                                 │
│                                          │
│ API             ● Running                │
│ OpenCode        ● Running                │
│ Workspace       ● Running                │
│                                          │
│ [Open Console]                           │
│ [Open Terminal]                          │
└─────────────────────────────────────────┘
```

The Console/Terminal may then dock into Activity Room or detach into their own workspace surface.

---

## 12. Architectural Audit Before Implementation

**Before implementing this future milestone, audit existing:**

| Area | Existing capability |
|------|-------------------|
| Terminal/xterm.js | Current state |
| PTY/runtime | Current state |
| Host Runtime | Current state |
| Boot Runtime | Current state |
| System/Firmware Platform | Current state |
| process/service management | Current state |
| logging/Pino | Current state |
| telemetry/OpenTelemetry | Current state |
| execution tools | Current state |
| permissions | Current state |
| Activity Room events | Current state |
| evidence | Current state |
| existing engineering workspace | Current state |

### Classification matrix

| Classification | Meaning |
|---------------|---------|
| **REUSE** | Existing capability meets requirement as-is |
| **ADAPT** | Existing capability needs extension |
| **GENERALIZE** | Existing capability is too narrow, needs broadening |
| **MISSING** | No existing capability, must be built |
| **DUPLICATED** | Multiple overlapping implementations exist |
| **AMBIGUOUS** | Unclear which existing capability owns this |

### Architectural directive

**Do not build parallel runtimes where Vestara already has canonical ownership.**

---

## Status

```text
FUTURE DEVELOPMENT / RECORDED / NOT AUTHORIZED FOR IMPLEMENTATION
```

**Do not add this work to the current Activity Room Premium UX implementation.**

The current Activity Room milestone may visually reserve/extensibly support future operational tooling, but must not fabricate Console, Terminal, or service-control functionality before their authoritative runtime capabilities exist.

---

## Related Records

| Record | Relationship |
|--------|-------------|
| ARX-015 UX Production Milestone | Current Activity Room milestone — this capability is future |
| AR-GA-CORE-003 Execution Interruption Recovery | Related Observer/invariant pattern |
| GA-DETACH-001 | Presentation lifecycle ≠ execution lifecycle lesson |
| Activity Room Authority Map | Read/write boundary reference |
