---
id: "adr-101"
adr: "ADR-101"
title: "Conversation as Independent Architecture"
category: "foundation"
version: 1.0
date: "2025-07-30"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@ai-engineer", "@frontend-engineer"]
informed: ["@team"]
tags: ["conversation", "architecture", "runtime", "communication"]
depends_on:
  - id: "adr-100"
    relationship: "conversation is the coordination medium for the AI organization"
referenced_by:
  - type: "blueprint"
    target: "23-conversation/README.md"
  - type: "blueprint"
    target: "23-conversation/01-conversation-runtime.md"
  - type: "blueprint"
    target: "05-ai-core/01-ai-architecture-overview.md"
influences:
  - "Conversation Runtime"
  - "Planner"
  - "Engineer"
  - "Voice Pipeline"
---

## Context

Conversation was originally placed inside `05-ai-core/` — treated as a capability of the AI layer. This created two problems:

1. **Conversation is not AI inference** — It is the communication medium between participants (human and agent). Treating it as an AI feature conflates *how the system thinks* with *how the system communicates*.
2. **Every surface needs it** — CLI, workspace UI, API, and future voice interfaces all need the same conversation model. Nesting it inside AI Core made it inaccessible to non-AI surfaces without pulling in the entire AI dependency tree.

As Vestara evolved toward a multi-agent organization model, conversation became the coordination backbone — not just a user interface.

## Decision

Promote Conversation to a top-level architecture volume (`23-conversation/`) independent of AI Core. The Conversation Runtime owns:

- Message lifecycle and session management
- Participant routing (human, agent, group)
- Streaming protocol
- Voice in/out pipeline
- Presence and status
- Conversation memory and retrieval
- Artifact lifecycle

AI Core provides the *intelligence* that participants use. Conversation provides the *medium* through which they communicate. These are separate concerns with separate evolution paths.

## Consequences

### Positive

- Conversation can evolve independently of AI model changes
- Non-AI participants (human, external tools) use the same runtime
- Voice, group chat, and meetings become natural extensions of the same model
- CLI, API, workspace UI, and future surfaces share one conversation implementation
- Clear dependency direction: Conversation depends on AI Core, not the reverse

### Negative

- Additional abstraction layer between AI and the user
- Conversation Runtime must maintain its own session state and persistence
- Some features (e.g., agent handoff) require coordination between Conversation and AI Core

### Risks

- Conversation Runtime may grow too large (mitigation: bounded by the 12 documents in `23-conversation/`; features outside that scope belong elsewhere)
- Duplication with AI Core's context management (mitigation: conversation memory is *communication history*; AI Core context is *reasoning state* — distinct concepts)

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Keep inside AI Core | Simpler dependency graph | Every surface depends on AI; voice/meetings feel bolted on | Violates separation of concerns |
| Conversation as part of Workspace | Closer to UI | Workspace is a consumer, not the owner; non-workspace contexts need conversation too | Wrong abstraction boundary |

## Implementation Notes

- Migration required? Yes — conversation code was previously in `05-ai-core/conversation/`
- Breaking changes? No — the interface remains the same; only the architectural home changes
- Timeline: Completed with Blueprint 2.0 restructure

## Related

- `23-conversation/README.md` — Volume overview
- `23-conversation/01-conversation-runtime.md` — Core runtime specification
- ADR-100 — AI Organization Over AI Assistant (conversation is the coordination medium for the AI organization)
