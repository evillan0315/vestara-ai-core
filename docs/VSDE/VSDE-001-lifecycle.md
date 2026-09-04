---
title: VSDE-001 — The Engineering Lifecycle
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# VSDE-001 — The Engineering Lifecycle

## Lifecycle

```
Vision
  ↓
Governance (Does this belong? → PRODUCT-PRINCIPLES.md)
  ↓
Capability Proposal (What problem? → Brief)
  ↓
Specification Package (What exactly? → CSP)
  ↓
Review Gates (Is it ready? → VSDE-004)
  ↓
Implementation (Code)
  ↓
Verification (ATS + tests)
  ↓
Metrics (Did it improve outcomes?)
  ↓
Learning (Update documentation, improve next cycle)
```

## Rules

1. No stage begins until the previous stage's artifact is approved.
2. The specification is the primary artifact — code is an implementation of it.
3. Verification must prove conformance to the specification.
4. Metrics determine whether the capability was successful.
