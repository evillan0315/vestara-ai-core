---
id: "adr-103"
adr: "ADR-103"
title: "Workspace-Native Context"
category: "foundation"
version: 1.0
date: "2025-07-30"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@ai-engineer", "@backend-engineer"]
informed: ["@team"]
tags: ["workspace", "context", "architecture", "session"]
depends_on:
  - id: "adr-100"
    relationship: "agents in the organization need shared context to collaborate"
referenced_by:
  - type: "constitution"
    target: "08-product-constitution (Article I)"
  - type: "blueprint"
    target: "06-workspace/"
  - type: "blueprint"
    target: "23-conversation/04-group-chat.md"
influences:
  - "Context Agent"
  - "Workspace Runtime"
  - "Knowledge Graph"
  - "Memory Architecture"
  - "Planner"
---

## Context

In most AI coding tools, context is ad-hoc: the user pastes code, describes their project, or the tool scans files at startup. Context is re-established every session. This creates a cycle of repetition — the user explains their project structure, current task, and decisions every time they start a new conversation.

Vestara's Product Constitution (Article I: The User Never Starts From Zero) demands that every session begins with full awareness. The user should never re-explain what the system already knows.

## Decision

Every conversation belongs to a **Workspace**, and every agent in that conversation automatically inherits the Workspace's full context:

- Repository structure and current branch
- Knowledge graph (dependencies, architecture, patterns)
- Active project and open tasks
- Session history and previous decisions
- User preferences and workspace configuration

Context is not passed as a monolithic blob. Agents retrieve what they need from the workspace through structured queries (knowledge graph, memory, file system). The WorkspaceRuntime is the authority on workspace state; agents consume it, they do not reconstruct it.

## Consequences

### Positive

- The user never re-explains context between sessions or conversations
- Each agent accesses only the context relevant to its responsibility
- Workspace understanding improves over time, benefiting every conversation automatically
- New agents immediately have access to the full workspace without special setup

### Negative

- Workspace Runtime becomes a critical dependency for every conversation
- Context retrieval latency affects conversation startup time
- Workspace state must be consistent across concurrent conversations

### Risks

- Agents may retrieve stale context (mitigation: workspace events invalidate cache; agents query fresh on critical operations)
- Workspace Runtime becomes a bottleneck (mitigation: context retrieval is read-optimized; knowledge graph is indexed)

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| User-provided context | Simple, no infrastructure | Violates Article I; repetitive; error-prone | Rejected by Product Constitution |
| AI-inferred context from file scan | Automatic | Expensive per session; no memory across sessions; no structured understanding | Workspace knowledge graph is more efficient and persistent |
| Global context (all projects) | Maximum awareness | Expensive; irrelevant context dilutes relevance; privacy concerns | Workspace scoping is the correct boundary |

## Implementation Notes

- Migration required? No — workspace-native context is the founding model
- Breaking changes? N/A
- Timeline: Already implemented (WorkspaceRuntime owns context; agents query through workspace API)

## Related

- Product Constitution Article I — The User Never Starts From Zero
- `06-workspace/` — Workspace volume
- ADR-017 — WorkspaceRuntime as Orchestration Boundary
- ADR-018 — RepositoryWorkspace as Canonical Domain Object
