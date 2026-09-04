---
title: Product Era Principles
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Product Era Principles

## Vestara AI Core — v0.3.0+

---

## 1. `RepositoryWorkspace` Is the Center of Gravity

`RepositoryWorkspace` is what `AST` is to a compiler or what `Document` is to an editor. It represents the canonical state of an opened project. Every capability enriches it rather than creating competing models.

```text
RepositoryWorkspace
  ├── Identity
  ├── Repository Intelligence
  ├── Knowledge Index
  ├── Memory
  ├── Conversation
  ├── Plans
  ├── Missions
  ├── Verification
  └── Metrics
```

If a new feature cannot express itself as an enrichment of `RepositoryWorkspace`, treat that as an architectural review point.

---

## 2. Every Capability Is Independently Demonstrable

Every version must be showable from the CLI:

```
v0.3.0  vestara open
v0.3.3  vestara explain
v0.4    vestara plan
v0.5    vestara implement
v0.6    vestara verify
```

If a capability cannot be demonstrated from the terminal, too much logic has leaked into a future UI. CLI demonstration is the forcing function for clean abstraction.

---

## 3. Evolve Intelligence Before Autonomy

The capability ladder builds user trust incrementally:

```
Understand  →  Explain  →  Plan  →  Implement  →  Verify
```

A developer will allow automated implementation only after weeks of consistently accurate understanding and explanations. Skip steps and you lose trust.

---

## 4. Measure Capabilities, Not Components

Engineering metrics (boot time, memory, stage timings) are supporting metrics, not primary goals. Product Era success is measured by developer outcomes:

| Capability         | Primary Metric                   |
|--------------------|----------------------------------|
| `vestara open`     | Time to repository comprehension |
| `vestara explain`  | Explanation usefulness/accuracy  |
| `vestara plan`     | Plan acceptance rate             |
| `vestara implement`| Successful implementation rate   |
| `vestara verify`   | Defects detected before merge    |

---

## 5. Every Capability Should Leave the Workspace Richer Than It Found It

The value of a command is measured not only by what it displays to the user in the moment, but also by the durable knowledge, intent, or evidence it contributes to the workspace for future capabilities to build upon.

```
Command          Immediate result       Durable artifact
─────────────────────────────────────────────────────────
vestara open     Repository understood  RepositoryWorkspace
vestara explain  Contextual explanation Explanation record
vestara plan     Actionable proposal    Plan
vestara implement Repository changes    Implementation / Change Set
vestara verify   Validation results     Verification Report
vestara collaborate Coordinated exec    Collaboration State
```

Each capability adds a new artifact type without changing the meaning of the workspace itself. Commands don't merely answer questions — they progressively enrich the workspace with additional knowledge and intent.

---

## 6. Two Questions Before Any Feature

Before implementing a new capability, answer:

1. **Which existing capability does it strengthen, or which new capability does it introduce?**
2. **Which architectural contract does it rely on without changing?**

If both answers are clear, the feature likely belongs. If not, more design work is needed.

---

## 6. The Complete Governance Pipeline

```
Vision
  ↓
Architecture Governance (What must remain true?)
  ↓
Repository Governance (How do we build consistently?)
  ↓
Product Governance (Why should this capability exist?)
  ↓
Capability Engineering
  ↓
Implementation
  ↓
Measurement
  ↓
Learning
  ↺  (feeds back into product governance)
```

Each layer owns a distinct class of decisions and hands off to the next. Metrics are not the endpoint — they close the feedback loop into product governance.

---

## 7. The Capability Lifecycle

```
Product Principle
  ↓
PCS (Product Capability Specification)
  ↓
UX (User Experience Specification)
  ↓
ATS (Acceptance Test Specification)
  ↓
Implementation
  ↓
Measurement
  ↓
Learning
  ↺
```

| Artifact | Question it answers |
|----------|--------------------|
| Product Principles | Should we build this? |
| PCS | What capability are we delivering? |
| UX | What should the experience feel like? |
| ATS | How do we know it works? |
| Implementation | How is it built? |
| Metrics | Did the user actually gain the capability? |
| Learning | What should we do differently next time? |

---

## 8. The Four Enduring Questions

| Layer | Question |
|-------|----------|
| Architecture | What must remain true? |
| Repository | How do we build consistently? |
| Product | Why should this capability exist? |
| Capability | Did we improve the developer's experience? |

These questions are independent. A capability can fail without implying the architecture is wrong. A repository practice can evolve without changing the product philosophy.

---

## 9. Operating Charter

> **Every capability must be traceable from product principle through specification, implementation, and measurable developer outcome without violating the architectural contracts.**

This is the single sentence that ties together the Architecture Era and the Product Era:

- The **architecture** provides stable constraints.
- The **repository** provides consistent execution.
- The **product principles** provide direction.
- The **capability lifecycle** provides repeatability.
- The **metrics** provide evidence.

A feature that satisfies all five is likely to belong. A feature that cannot be expressed through this framework needs more design work before implementation begins.

---

## 10. Three Classes of Durable Artifact

The workspace accumulates three distinct categories of durable artifacts:

| Class | Examples | Represents |
|-------|----------|------------|
| Knowledge | `RepositoryWorkspace`, Explanations | "What is" |
| Intent | `Plan` | "What should be" |
| Execution | Change Set, Verification Report | "What changed" / "Did it succeed?" |

Each class is orthogonal and durable. A capability produces artifacts in one or more classes. Subsequent capabilities consume those artifacts rather than reproducing earlier work.

---

## 11. Commands Are Ephemeral. Artifacts Are Durable.

A command exists only while it is running. Its value is the artifact it leaves behind:

| Command | Durable artifact |
|---------|-----------------|
| `vestara open` | `RepositoryWorkspace` |
| `vestara explain` | Explanation |
| `vestara plan` | Plan |
| `vestara implement` | Change Set |
| `vestara verify` | Verification Report |
| `vestara collaborate` | Collaboration State |

The CLI is a transport mechanism. The workspace is the persistent system of record. Future interfaces (desktop, IDE, REST API, OS) operate on the same artifacts — not on terminal output.

---

## 12. Vestara Specification-Driven Engineering (VSDE)

> Specifications are the primary engineering artifact. Source code is an implementation of those specifications. Verification demonstrates conformance. Metrics determine product success.

No implementation may begin until the capability specification is complete, internally consistent, and approved.

Every capability produces a Capability Specification Package (CSP) under `docs/capabilities/CSP-XXX-name/` with up to 14 documents (see `docs/standards/VSDE.md` for the full specification).

The development lifecycle:

```
Product Principle → Specification → Architecture → Implementation → Verification → Measurement → Learning
```

A developer—or AI agent—should be able to implement the feature from the CSP alone, without consulting prior conversations.

AI never invents behavior — it implements documented behavior. Documentation quality is a build gate.

---

## 13. Architecture Is Infrastructure, Not the Product

The architecture no longer changes meaningfully. New work introduces product capabilities, not foundational concepts. The architecture provides the foundation; product capabilities demonstrate why someone would use Vestara.
