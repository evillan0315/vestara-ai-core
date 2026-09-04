---
title: VSDE-004 — Review Gates
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# VSDE-004 — Review Gates

## Gate 1: Product Review

Before specification begins:
- [ ] Does it solve a real developer problem?
- [ ] Does it align with PRODUCT-PRINCIPLES.md?
- [ ] Does it fit the capability ladder?

## Gate 2: Architecture Review

Before implementation begins:
- [ ] Does it violate any frozen contracts?
- [ ] Does it introduce unwanted coupling?
- [ ] Does it require an ADR?
- [ ] Does it preserve the build order?

## Gate 3: Specification Review

Before implementation begins:
- [ ] CSP complete (all required documents exist)
- [ ] CSP internally consistent
- [ ] ATS defines measurable acceptance criteria
- [ ] Performance targets defined
- [ ] CLI contract defined
- [ ] Domain model defined

## Gate 4: Implementation

Only opens after Gates 1-3 pass.

## Gate 5: Verification

Before release:
- [ ] ATS passes
- [ ] Golden path passes
- [ ] Performance targets met
- [ ] No regressions

## Gate 6: Product Validation

After release:
- [ ] Metrics collected
- [ ] Developer outcome measured
- [ ] Documentation updated
