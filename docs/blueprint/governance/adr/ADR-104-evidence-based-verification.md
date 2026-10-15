---
id: "adr-104"
adr: "ADR-104"
title: "Evidence-Based Verification"
category: "foundation"
version: 1.0
date: "2025-07-30"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@ai-engineer", "@qa-engineer"]
informed: ["@team"]
tags: ["verification", "evidence", "trust", "quality"]
depends_on:
  - id: "adr-100"
    relationship: "Verifier is a specialized agent in the AI organization"
  - id: "adr-103"
    relationship: "verification criteria are scoped to workspace context"
referenced_by:
  - type: "constitution"
    target: "08-product-constitution (Article VI)"
  - type: "blueprint"
    target: "05-ai-core/01-ai-architecture-overview.md"
  - type: "runtime"
    target: "VerificationEngine"
  - type: "runtime"
    target: "EvaluationHarness"
influences:
  - "Verifier Agent"
  - "Evaluation Engine"
  - "Review Workflow"
  - "CI Pipeline"
---

## Context

In most AI-assisted development, code changes are accepted based on the AI's confidence — which is a subjective self-assessment. The model says "this looks correct" and the user must trust that judgment. There is no independent verification, no reproducible evidence, and no audit trail.

Vestara's architecture includes a dedicated Verifier agent. If verification is just another model expressing an opinion, the Verifier adds no value over the Engineer who wrote the code. Verification must be *objective* — grounded in evidence that can be independently reproduced.

## Decision

The Verifier agent does not express opinions. It **gathers evidence** and **evaluates against criteria**. Every verification result must include:

1. **What was checked** — The specific criteria or test
2. **What evidence was gathered** — Command output, file contents, test results, lint reports
3. **The verdict** — Pass, fail, or inconclusive, derived from evidence
4. **How to reproduce** — The exact command or procedure that produced the evidence

If the Verifier cannot produce evidence for a claim, that claim is marked as unverifiable — not assumed true. The Verifier's authority comes from its evidence, not from its model.

## Consequences

### Positive

- Verification is objective and reproducible, not subjective
- The user can trust a Pass verdict because they can re-run the evidence
- Unverifiable claims are surfaced explicitly rather than hidden
- Audit trail exists for every verification decision
- The Verifier can be tested against its own criteria

### Negative

- Some quality attributes (design elegance, code readability) are difficult to verify with automated evidence
- Evidence gathering takes longer than model self-assessment
- The Verifier cannot approve changes without executable criteria

### Risks

- Teams may write criteria that pass without meaningful verification (mitigation: criteria must include evidence commands, not just model-generated assertions)
- Evidence may become stale (mitigation: verification timestamps; re-verify on context changes)

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Model self-assessment | Fast, zero infrastructure | Subjective, no audit trail, Verifier adds no value | Violates the purpose of having a dedicated Verifier |
| Human-only review | Gold standard | Does not scale; slow; inconsistent | The Verifier augments human review, it does not replace it |
| Test coverage gating | Objective | Only measures coverage, not correctness or design quality | Valuable but insufficient alone; evidence-based verification includes but is broader than test coverage |

## Implementation Notes

- Migration required? No — evidence-based verification is the founding model
- Breaking changes? N/A
- Timeline: Already implemented (Verifier agent in codebase; `@vestara/verification` package)

## Related

- `05-ai-core/01-ai-architecture-overview.md` — Verifier role
- ADR-028 — Verification & Trust Engine
- ADR-100 — AI Organization Over AI Assistant (Verifier is a specialized agent)
- Product Constitution Article VI — Confidence Is Visible
