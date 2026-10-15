---
title: "Vestara Language & Terminology"
volume: "00-governance"
book: "Book 1: Vision & Business"
version: "1.0.0"
status: "draft"
owner: "@chief-architect"
last-reviewed: "2025-07-30"
next-review: "2026-07-30"
tags: ["governance", "language", "terminology", "glossary"]
---

# Vestara Language & Terminology

> **Purpose**: Prevent terminology drift by defining what every key term means in the Vestara context. When a document, agent, or contributor uses one of these terms, this is the authoritative definition.

---

## Core Domain Terms

| Term | Definition | Not To Be Confused With |
|------|------------|------------------------|
| **Workspace** | A scoped environment containing a repository, its knowledge graph, conversation history, and project state. The unit of user activity. | A code workspace / editor workspace |
| **Session** | A single span of interaction (conversation or task) with defined scope, participants, and lifecycle. | HTTP session / login session |
| **Artifact** | A persistent object created or modified during conversation (code snippet, diagram, document, plan). | Build artifact |
| **Execution** | A single run of a plan, tool, or agent subtask with a defined input, output, and result. | Process execution |
| **Capability** | A named, versioned, measurable unit of platform functionality that can be validated. | Feature / use case |
| **Runtime** | The execution environment that hosts a set of services, manages their lifecycle, and provides inter-service communication. | Node.js runtime |
| **Agent** | An AI participant with a defined role, tool access, and decision authority. Acts within a session. | Generic "AI agent" |
| **Context** | The set of information available to an agent or runtime at a given point — files, history, memory, workspace state. | LLM context window |
| **Memory** | Persistent storage of past interactions, decisions, and learned patterns, structured for retrieval. | RAM / working memory |
| **Knowledge** | Structured understanding of a codebase or domain — dependency graph, architecture, patterns, risks. | General knowledge / wiki |
| **Provider** | A source of AI inference (OpenCode, OpenAI, Ollama, etc.) accessed through a unified interface. | Cloud provider |
| **Blueprint** | The canonical architecture specification for the Vestara ecosystem. Source of truth for all decisions. | Design doc / README |

---

## Event Naming Convention

Events use colon-delimited namespacing:

```
{domain}:{action}:{subject}
```

| Domain | Examples |
|--------|----------|
| `workspace` | `workspace:opened`, `workspace:indexed` |
| `conversation` | `conversation:message:created`, `conversation:session:resolved` |
| `planning` | `planning:task:started`, `planning:task:completed` |
| `implementation` | `implementation:file:created`, `implementation:code:reviewed` |
| `verification` | `verification:check:passed`, `verification:check:failed` |
| `system` | `system:boot:complete`, `system:shutdown:started` |
| `agent` | `agent:task:delegated`, `agent:task:completed` |
| `memory` | `memory:record:created`, `memory:record:retrieved` |
| `profile` | `profile:preferences:updated` |

---

## Capability Naming Convention

Capabilities use the prefix `CSP-` (Capability Specification) followed by a three-digit number:

```
CSP-{NNN}
```

Existing slots: `CSP-001` (Workspace Orientation) through `CSP-019` (Decision Intelligence).

---

## File & Directory Naming

| Context | Convention | Example |
|---------|-----------|---------|
| Blueprint volumes | `NN-name` | `05-ai-core`, `23-conversation` |
| Blueprint documents | `NN-name.md` | `01-conversation-runtime.md` |
| Event bus topics | `domain:action:subject` | `workspace:opened` |
| ADR documents | `ADR-{NNN}-title.md` | `ADR-016-freeze-architecture.md` |
| Environment variables | `UPPER_SNAKE_CASE` | `VESTARA_API_PORT` |
| TS packages | `@vestara/{name}` | `@vestara/kernel` |
| TS symbols | PascalCase (types), camelCase (values) | `WorkspaceRuntime`, `openWorkspace()` |
