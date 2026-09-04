---
title: Definition of Living — Vestara v0.1
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Definition of Living — Vestara v0.1

## First Living Assistant — Capability Acceptance Criteria

> **A living platform is not defined by its features. It is defined by its capabilities acting together consistently. These are the measurable criteria for Vestara v0.1.**

---

## 10 Capabilities of a Living Platform

| # | Capability | Definition | v0.1 Target |
|---|------------|------------|-------------|
| 1 | **Awareness** | Knows current runtime state, services, hardware, active workspace | ✅ Built (vestara doctor) |
| 2 | **Action** | Uses tools to modify files, execute commands, interact with services | ✅ Built (Action Runtime) |
| 3 | **Recovery** | Restores itself after restart without losing context | ✅ Built (State Runtime) |
| 4 | **Communication** | Streams responses through text | ✅ Built (Streaming + Conversation) |
| 5 | **Observation** | Monitors system continuously | ✅ Built (Health, Metrics, Events) |
| 6 | **Memory** | Remembers conversations, projects, preferences | 🔄 Partial (SQLite persistence) |
| 7 | **Planning** | Breaks goals into executable tasks | 📋 v0.2 |
| 8 | **Reflection** | Evaluates responses and improves future decisions | 📋 v0.3 |
| 9 | **Learning** | Builds knowledge over time instead of starting from zero | 📋 v0.4 |
| 10 | **Autonomy** | Performs approved background work without constant prompting | 📋 v0.4 |

---

## v0.1 Golden Path Acceptance Test

```bash
vestara demo golden-path
```

Expected outcome:

```
✓ Runtime Booted
✓ Provider Loaded
✓ Conversation Created
✓ Message Streamed
✓ File Read via Tool
✓ Action Authorized
✓ Response Generated
✓ Runtime Persisted
✓ Runtime Restarted
✓ Conversation Restored

Golden Path PASSED
```

### Traceability

| Step | Subsystems Validated | Milestone |
|------|----------------------|-----------|
| Boot | Kernel, Config, Logger, Metrics, EventBus, ServiceRegistry | 3.1 |
| Provider | Provider Runtime, AIProvider | 3.2 |
| Conversation | ConversationService, ContextAssembler | 3.3 |
| Streaming | StreamRuntime, canonical chunks | 3.4 |
| File Read | ActionRuntime, PermissionEngine, read_file tool | 3.5 |
| Persistence | StateRuntime, SQLite checkpoint | 3.6 |
| Restart/Restore | Full lifecycle recovery | 3.6 |

---

**This document marks the transition from component implementation to platform integration. The remaining work is proving the subsystems behave as one.**