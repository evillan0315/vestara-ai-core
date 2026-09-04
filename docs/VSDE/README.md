---
title: Vestara Specification-Driven Engineering
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Vestara Specification-Driven Engineering

**Version 1.0 — Established 2026-07-24**

---

## What VSDE Is

VSDE is the engineering operating model for the Vestara platform. Every capability follows the same lifecycle: specification before implementation, verification before acceptance, measurement before release.

## Core Principle

> Specifications are the primary engineering artifact. Source code is an implementation of those specifications. Verification demonstrates conformance. Metrics determine product success.

## Documents

| Document | Purpose |
|----------|---------|
| `VSDE-001-lifecycle.md` | The engineering lifecycle and governance gates |
| `VSDE-002-capability-package.md` | Specification package standard and checklist |
| `VSDE-003-artifact-contracts.md` | Independent versioned contracts for domain artifacts |
| `VSDE-004-review-gates.md` | Formal review gates before implementation |
| `VSDE-005-ci-pipeline.md` | CI enforcement of specification completeness |
| `VSDE-006-capability-states.md` | Maturity model for capabilities |

## Related

- `docs/PRODUCT-PRINCIPLES.md` — Product governance
- `docs/CAPABILITY-REGISTRY.md` — Index of all capabilities with maturity
- `docs/artifacts/` — Independent artifact contracts
- `docs/capabilities/` — Capability Specification Packages
