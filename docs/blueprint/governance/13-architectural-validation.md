---
title: "Architectural Validation & The Vestara Evolution Cycle"
volume: "00-governance"
book: "Book 1: Vision & Business"
version: "1.0.0"
status: "draft"
owner: "@chief-architect"
created: "2026-08-05"
last-reviewed: "2026-08-05"
next-review: "2026-11-05"
tags: ["governance", "evolution", "validation", "process"]
---

# Architectural Validation & The Vestara Evolution Cycle

## Architectural Validation

Every major architectural decision should be validated by converting one real
system to the new model before the model is considered complete.

```text
Architecture Proposal
        │
        ▼
Reference Implementation
        │
        ▼
Evidence Collection
        │
        ▼
Verification
        │
        ▼
General Availability
```

This is consistent with Vestara's existing philosophy around evidence and
verification: an architecture is not done when it is documented, but when it
is proven on a real product.

The current proof-of-concept is
[EW-PV-001](../../roadmaps/VESTARA-RAG-ROADMAP.md): package
the Engineering Workspace as the first official Vestara product. If the
Workspace can be removed from the platform build, installed as a product
package, launched through Product Runtime, verified, and replaced without
modifying Vestara Core, the product-centric architecture is proven.

## The Vestara Evolution Cycle

Capabilities enter the platform through a recurring lifecycle:

```text
Idea
  ↓
Blueprint
  ↓
Standard
  ↓
Roadmap
  ↓
Reference Implementation
  ↓
Verification
  ↓
Evidence
  ↓
Platform Capability
```

This is larger than software engineering. It is how Vestara evolves itself.

When someone asks "How do we introduce a new capability?", the answer is:

1. Document the vision.
2. Define the architecture.
3. Write or extend the VES standard.
4. Create the roadmap.
5. Build a reference implementation.
6. Verify it.
7. Collect evidence.
8. Promote it to a supported platform capability.

## When to Apply

Use this cycle when:

- Proposing a new product kind (applications, agents, themes, etc.)
- Extending the platform with a new subsystem (identity, licensing, updates)
- Introducing a new architectural layer or runtime

Do not use this cycle for bug fixes, minor features, or documentation-only
changes. It is for capabilities that change how the platform is structured.

## Relationship to AIDL

The [AI Development Lifecycle](03-ai-development-lifecycle.md) governs how
individual features are built day-to-day. The Evolution Cycle governs how
*capabilities* enter the platform as first-class concepts. AIDL operates
within a phase; the Evolution Cycle operates across phases.
