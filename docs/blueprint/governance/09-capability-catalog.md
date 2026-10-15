---
title: "Capability Catalog"
volume: "00-governance"
book: "Book 1: Vision & Business"
version: "1.0.0"
status: "draft"
owner: "@chief-architect"
tags: ["capabilities", "catalog", "product-api"]
---

# Vestara Capability Catalog

> **Capabilities are what Vestara can do for a developer. Everything else — Runtime, Workflow, Understanding, Evaluation — is implementation.**

A capability is validated when it changes a developer's cognitive state, not when a function returns successfully. Each capability describes:
- what problem it solves,
- what inputs it requires,
- what outputs it produces,
- what evidence supports it,
- what agency remains with the developer.

---

## CAP-001: Workspace Orientation

**Purpose**: Transform an unfamiliar or returning workspace into an understandable context within seconds.

| Aspect | Description |
|--------|-------------|
| Input | A repository path or workspace |
| Output | A developer who understands the workspace state |
| Observe | Repository structure, files, dependencies, history, memory |
| Decide | Architecture classification, maturity assessment, detected risks |
| Act | None — orientation informs, it does not execute |
| Agency | Developer chooses what to do with the understanding |

**Questions it answers**:
- What is this project?
- Can I safely work on it?
- What happened recently?
- How is it organized?
- Where did I stop?
- What should I do next?

**Architecture**: `WorkspaceUnderstanding` + Overview UI. No new foundation required.

**Validation**: A developer opening an unfamiliar workspace can answer the six questions above within 30 seconds.

---

## CAP-002: Contextual Continuation

**Purpose**: Restore a developer's mental state after interruption — whether hours, days, or weeks.

| Aspect | Description |
|--------|-------------|
| Input | A returning workspace session |
| Output | A developer who remembers where they were and what mattered |
| Observe | Previous session state, last decisions, pending work |
| Decide | What changed since last session, what remains relevant |
| Act | None — restoration precedes action |
| Agency | Developer chooses whether to continue or redirect |

**Questions it answers**:
- What was I working on?
- What decisions were made?
- What was pending?
- What changed since I left?

**Architecture**: `Memory` + `Understanding` + Timeline (future). No new foundation required.

---

## CAP-003: Intent Alignment

**Purpose**: Capture the developer's current goal and align the system's recommendations with that goal.

| Aspect | Description |
|--------|-------------|
| Input | A developer's stated or inferred goal |
| Output | A shared understanding of what success looks like |
| Observe | Current workspace state, recent activity, explicit user input |
| Decide | What goal makes sense given the context, what constraints apply |
| Act | None — alignment precedes execution |
| Agency | Developer defines the goal; Vestara refines and questions |

**Questions it answers**:
- What are we trying to achieve?
- Why does it matter?
- What are the constraints?
- How will we know it succeeded?

**Architecture**: `Intent` model (future foundation). This is the next likely new abstraction.

---

## CAP-004: Guided Execution

**Purpose**: Execute approved work with observable progress, verification, and human oversight.

| Aspect | Description |
|--------|-------------|
| Input | An approved plan aligned with intent |
| Output | Verified changes that fulfill the plan |
| Observe | Plan constraints, repository state, verification results |
| Decide | What to execute next, when to pause for approval |
| Act | Execute planned changes, verify outcomes, report results |
| Agency | Developer approves each stage before execution proceeds |

**Questions it answers**:
- What is happening now?
- What succeeded?
- What failed?
- What needs human review?

**Architecture**: `Workflow` + `Planner` + `Runtime`. No new foundation required.

---

## CAP-005: Engineering Memory

**Purpose**: Preserve knowledge that outlives individual sessions — decisions, trade-offs, rationale — and make it accessible when relevant.

| Aspect | Description |
|--------|-------------|
| Input | Engineering activity (decisions, plans, outcomes) |
| Output | An enduring knowledge base that improves future sessions |
| Observe | Decisions made, plans approved, outcomes verified |
| Decide | What is worth remembering, what is transient |
| Act | Store, consolidate, recall on relevance |
| Agency | Developer controls what is promoted to long-term memory |

**Questions it answers**:
- What decisions were made and why?
- What trade-offs were considered?
- What approaches were rejected?
- What should I know before making a similar decision?

**Architecture**: `Memory` + `History`. No new foundation required.

---

## Capability Summary

| ID | Capability | Foundation | Status |
|----|-----------|------------|--------|
| CAP-001 | Workspace Orientation | Understanding + Overview | ✅ Complete |
| CAP-002 | Contextual Continuation | Memory + Understanding | ⬜ Ready |
| CAP-003 | Intent Alignment | Intent Model (new) | ⬜ Next abstraction |
| CAP-004 | Guided Execution | Workflow + Runtime | ⬜ Ready |
| CAP-005 | Engineering Memory | Memory + History | ⬜ Ready |

---

## Relationship to Validation

Each capability is validated through a developer journey (CV), not a unit test:

| Journey | Capability | Question |
|---------|-----------|----------|
| CV-001 | CAP-001 | Can a developer understand an unfamiliar workspace in seconds? |
| CV-002 | CAP-002 | Can a developer recover context after interruption? |
| CV-003 | CAP-003 | Can Vestara align with the developer's goal? |
| CV-004 | CAP-004 | Can Vestara execute work with observable progress and human approval? |
| CV-005 | CAP-005 | Does Vestara become more useful over time? |

---

## The role of AI

Every capability functions without AI. AI enriches decisions — it does not enable them. A capability's core path is deterministic. AI is a provider that can be swapped, removed, or degraded without breaking the capability contract.

---

## The observe/decide/act taxonomy

Every capability answers three binary questions:

| Capability | Observe | Decide | Act |
|------------|---------|--------|-----|
| CAP-001 Orientation | ✓ | ✓ | ✗ |
| CAP-002 Continuation | ✓ | ✓ | ✗ |
| CAP-003 Intent | ✓ | ✓ | ✗ |
| CAP-004 Execution | ✓ | ✓ | ✓ |
| CAP-005 Memory | ✓ | ✓ | ✗ |

Chat is not a capability. It is an interface through which capabilities are accessed.

---

*This catalog documents what Vestara can do, not how it works. It survives implementation changes.*
