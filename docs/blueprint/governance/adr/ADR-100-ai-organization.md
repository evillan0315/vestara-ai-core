---
id: "adr-100"
adr: "ADR-100"
title: "AI Organization Over AI Assistant"
category: "foundation"
version: 1.0
date: "2025-07-30"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@ai-engineer", "@frontend-engineer"]
informed: ["@team"]
tags: ["philosophy", "architecture", "agents", "organization"]
depends_on: []
referenced_by:
  - type: "constitution"
    target: "08-product-constitution (Article VIII)"
  - type: "blueprint"
    target: "23-conversation/04-group-chat.md"
  - type: "blueprint"
    target: "05-ai-core/01-ai-architecture-overview.md"
influences:
  - "Planner"
  - "Engineer"
  - "Reviewer"
  - "Verifier"
  - "Context"
---

## Context

Most AI developer tools model intelligence as a single monolithic assistant — one model that attempts to fulfill every role (planner, coder, reviewer, debugger) simultaneously. This creates several problems:

1. **Role confusion** — The same model context must switch between strategic thinking and line-level debugging, diluting both.
2. **No accountability** — No single agent owns verification, so verification is optional.
3. **No specialization** — Every task uses the same capabilities, ignoring that planning, implementation, review, and verification require different tools, context, and evaluation criteria.
4. **No transparency** — The user cannot see which "part" of the assistant is working or why.

Vestara's philosophy (Product Constitution Article VIII) holds that intelligence is better modeled as a collaborative organization.

## Decision

Model Vestara's AI capability as an **organization of specialized agents**, not a monolithic assistant. Each agent has:

- A single, clear **responsibility** (plan, implement, review, verify, discover context)
- Its own **tool access** scoped to that responsibility
- **Independent participation** in group conversation
- **Observable presence** and status
- **No authority outside its role** — Planner does not review, Reviewer does not implement, Verifier does not plan

The agents communicate through the Conversation Runtime, not through shared model context. The user participates as a member of the organization, not as a consumer of a single black box.

## Consequences

### Positive

- Each agent can be optimized for its specific responsibility without compromising others
- Verification becomes a first-class function with its own agent, not an afterthought
- The user can observe which agent is working and why
- New specialist agents can be added without changing existing agents
- Group chat, presence, and agent handoff become natural features of the architecture

### Negative

- Higher coordination overhead than a single-model approach
- More complex routing logic (which agent handles which message)
- Users accustomed to monolithic assistants may initially find the multi-agent pattern unfamiliar
- Requires a robust Conversation Runtime as the coordination backbone

### Risks

- Agents may conflict or duplicate work (mitigation: clear responsibility boundaries in the agent definition)
- Coordination latency may exceed single-model response time (mitigation: parallel agent execution where possible)

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Single monolithic assistant | Simple, familiar | No accountability, no specialization, black box | Violates Product Constitution Article VIII |
| Two-agent (coder + reviewer) | Slightly better than monolith | Still conflates planning, context, and verification | Not enough specialization |
| Agent swarm (unstructured) | Flexible | No clear responsibility, chaotic | Predictability and transparency are more important than flexibility |

## Implementation Notes

- Migration required? No — this is the founding architecture
- Breaking changes? N/A
- Timeline: Already implemented (Planner, Engineer, Reviewer, Verifier, Context agents exist in codebase)

## Related

- Product Constitution Article VIII — AI Organization Over AI Assistant
- `23-conversation/04-group-chat.md` — Multi-agent collaboration vision
- Blueprint volume: `23-conversation/`
