---
title: Architecture Traceability
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Architecture Traceability
## Every PR Traces Back to Frozen Contracts

> **This file documents how every module in `vestara-ai-core` maps back to the frozen architecture. Every PR must identify exactly what contract it satisfies.**

---

## Traceability Template

Every pull request must include a traceability section in its description:

```markdown
## Architecture Traceability

### Blueprint Reference
- Book: [Book N: Title]
- Volume: [XX-volume]
- Document: [Specific document]

### Specification Reference
- Capability: CAP-XXX
- Event: event:type
- API: [endpoint]
- AI Contract: AI-CON-XXX

### Foundation Reference
- Object Model: VOM-[Object]
- Interface: [Interface name]
- SDK Contract: [Provider/Plugin SDK section]

### Runtime Reference
- Kernel: [Section]
- Lifecycle: [Component lifecycle]
- Observability: [Logging/Metrics specification]

### Verification
- [ ] Implements the contract as specified
- [ ] Does not deviate from frozen architecture
- [ ] Tests validate contract compliance
- [ ] Golden Path still passes
```

---

## Module-to-Contract Mapping

### Kernel (`packages/kernel/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `VestaraKernel.boot()` | 04-platform → Platform Services | RT-001 | — | VESTARA-KERNEL.md → Boot Sequence |
| `VestaraKernel.shutdown()` | 04-platform → Platform Services | RT-001 | — | VESTARA-KERNEL.md → Shutdown Sequence |
| Boot Manager | 04-platform → Platform Services | RT-001 | — | VESTARA-KERNEL.md → Boot Manager |
| Dependency Resolver | 04-platform → Dependency Graph | — | — | VESTARA-KERNEL.md → Boot Manager |
| Shutdown Manager | 04-platform → Platform Services | — | — | VESTARA-KERNEL.md → Shutdown Manager |

### Event Bus (`packages/event-bus/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `EventBus` | 04-platform → Event Architecture | EVT-CATALOG | Universal Interface → EventBus | LIFECYCLE.md |
| Event Emission | 04-platform → Data Flows | EVT-CATALOG | Universal Interface → EventBus | LIFECYCLE.md |

### Service Registry (`packages/service-registry/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `ServiceRegistry` | 04-platform → Service Architecture | SVC-CATALOG | Universal Interface → ServiceRegistry | LIFECYCLE.md |
| `VestaraService` | 04-platform → Service Architecture | SVC-CATALOG | Universal Interface → VestaraService | LIFECYCLE.md → Service |

### Configuration (`packages/configuration/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `ConfigurationManager` | 14-engineering → Engineering Standards | — | Universal Interface → ConfigurationProvider | VESTARA-KERNEL.md → Configuration Manager |

### Logging (`packages/logging/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `Logger` | 15-devops → Logging | — | Universal Interface → Logger | LOGGING-ARCHITECTURE.md |
| Log Sinks | 15-devops → Logging | — | — | LOGGING-ARCHITECTURE.md → Sinks |

### Metrics (`packages/metrics/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `MetricsCollector` | 15-devops → Observability | — | Universal Interface → MetricsCollector | METRICS-ARCHITECTURE.md |
| Metric Export | 15-devops → Observability | — | — | METRICS-ARCHITECTURE.md → Export |

### Storage (`packages/storage/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| SQLite Wrapper | 12-data → Database | DATA-DICT | — | — |
| Migration Engine | 12-data → Database | DATA-DICT | — | — |

### Provider Runtime (`packages/provider-runtime/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `ProviderRuntime` | 05-ai-core → Provider Manager | AI-CON-004 | Provider SDK → AIProvider | LIFECYCLE.md → Provider |
| Fallback Chain | 05-ai-core → Provider Manager | AI-CON-004 | Provider SDK → Fallback | — |
| Health Monitoring | 05-ai-core → Provider Manager | AI-CON-004 | Provider SDK → Health | METRICS-ARCHITECTURE.md |

### OpenCode Provider (`packages/providers/opencode/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `OpenCodeProvider` | 05-ai-core → Provider Manager | AI-CON-004 | Provider SDK → AIProvider | — |

### Conversation Runtime (`packages/conversation-runtime/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `ConversationService` | 05-ai-core → Conversation | CAP-001 | VOM-Conversation | — |
| Context Assembly | 05-ai-core → Conversation | CAP-001 | VOM-Context | — |
| Streaming | 05-ai-core → Conversation | CAP-001 | Provider SDK → StreamChunk | — |

### Tool Runtime (`packages/tool-runtime/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `ToolRuntime` | 05-ai-core → Agents | AI-CON-005 | Tool Catalog → Contract | — |
| Permission Check | 05-ai-core → Agents | AI-CON-005 | Tool Catalog → Permissions | — |
| Tool Sandbox | 05-ai-core → Agents | AI-CON-005 | Tool Catalog → Security | — |

### Filesystem Tool (`packages/tools/filesystem/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `ReadFile` | 05-ai-core → Tools | T-001 | Tool Catalog → T-001 | — |

### Memory Runtime (`packages/memory-runtime/` — v0.2)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `MemoryService` | 05-ai-core → Memory | AI-CON-001 | VOM-Memory | — |
| Consolidation | 05-ai-core → Memory | AI-CON-001 | VOM-Memory → Scoring | — |

### Agent Runtime (`packages/agent-runtime/` — v0.2)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| `AgentRuntime` | 05-ai-core → Agents | AI-CON-005 | VOM-Agent | LIFECYCLE.md → Agent |

### CLI (`apps/cli/`)

| Component | Blueprint | Spec | Foundation | Runtime |
|-----------|-----------|------|------------|---------|
| REPL | 06-workspace → CLI | — | — | — |

---

## Golden Path Traceability

```
Boot Runtime           → Kernel.boot() → VESTARA-KERNEL.md
Initialize Kernel      → Kernel.boot() → VESTARA-KERNEL.md
Register Services      → ServiceRegistry.register() → Universal Interface
Load Provider          → ProviderRuntime → Provider SDK → AIProvider
Create Conversation    → ConversationService.create() → VOM-Conversation
Read File              → ToolRuntime.execute() → Tool Catalog → T-001
Generate Response      → AIProvider.complete()/stream() → Provider SDK
Persist Conversation   → Storage → DATA-DICT
Restart Runtime        → Kernel.boot() → VESTARA-KERNEL.md
Resume Conversation    → ConversationService.getHistory() → VOM-Conversation
```

---

## Enforcement

- Every PR must include a traceability section
- CI checks that all referenced contracts exist
- No contract reference = PR blocked
- Deviation from frozen contract requires ADR before merge
