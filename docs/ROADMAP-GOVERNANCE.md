# Roadmap Governance

**How Vestara milestones are proposed, validated, and completed.**

---

## Purpose

This document defines the process for managing the Vestara roadmap. It ensures that every milestone is necessary, well-defined, and produces measurable outcomes before it is marked complete. The roadmap evolves with the same rigor as the rest of the Vestara ecosystem.

---

## 1. How Milestones Are Proposed

Anyone may propose a milestone. Proposals follow a standard template:

```
Proposed Milestone: vX.Y — Title
Category: Platform | Product
Problem: What problem does this solve?
Solution: What capability does it add?
Artifacts: What durable artifacts will be created or enriched?
Exit Criteria: How will we know it's done?
Dependencies: What existing milestones does this build on?
```

Proposals are reviewed against the following criteria:

1. **Contract Stability** — Does it require redesigning stable architectural contracts?
2. **Artifact-Backed** — Does it introduce or enrich durable workspace artifacts?
3. **Provider-Agnostic** — Does it depend on a specific AI provider?
4. **Documentation-First** — Can we write PCS → UX → ATS before implementation?
5. **Measurable** — Can we define clear exit criteria?

---

## 2. Milestone Lifecycle

Each milestone moves through these stages:

```
Proposed → Reviewed → Approved → In Development → Validated → Complete
```

| Stage | Requirements |
|-------|--------------|
| **Proposed** | Template submitted, problem identified |
| **Reviewed** | Architecture impact assessed, dependencies mapped |
| **Approved** | PCS, UX, and ATS documents written and accepted |
| **In Development** | Code implementation in progress |
| **Validated** | Exit criteria verified, tests pass, documentation updated |
| **Complete** | Milestone tagged, artifacts indexed, status updated in MILESTONES.md |

A milestone cannot skip stages. No code is written without approved specifications.

---

## 3. Exit Criteria Requirements

Every milestone must define measurable exit criteria before development begins. Exit criteria operate at two levels:

### Capability Level
- Can the user successfully complete the workflow?
- What is the measurable improvement over the previous state?
- What are the performance targets (latency, throughput, reliability)?

### Artifact Level
- Was the correct durable artifact created or enriched?
- Can a subsequent capability consume this artifact without reconstructing it?
- Is the artifact persisted and queryable?

Example exit criteria for a conversation analytics milestone:
```
- Conversation pipeline health is measurable in under 500ms
- Dashboard renders analytics for workspaces with 10,000+ events
- All 12 conversation packages are represented in the analytics
```

---

## 4. How Milestones Can Be Split or Merged

### Splitting

A milestone may be split if:

1. Its exit criteria are too broad to validate independently
2. It combines platform and product work that should ship separately
3. Dependencies on other milestones change during development

**Process**: File a split proposal identifying the two new milestones and how the original exit criteria are distributed between them.

### Merging

Two milestones may be merged if:

1. Their exit criteria are tightly coupled and cannot be validated independently
2. One milestone is a prerequisite for another and they are being developed sequentially in the same cycle
3. The merged milestone produces a single coherent capability

**Process**: File a merge proposal identifying the combined exit criteria and why independence is not valuable.

---

## 5. How the Roadmap Itself Can Change

The roadmap is a living document. Changes follow this process:

### Minor Changes (adding detail to planned milestones)
- No formal review required
- Must be documented in the next commit

### Major Changes (adding/removing/reordering milestones)
- Requires a review with architectural impact assessment
- Must update MILESTONES.md and IMPLEMENTATION_STATUS.md
- Must be approved by verifying contract stability

### Era Changes (adding new eras or changing the transformation story)
- Requires full governance review
- Must update the Summary Dashboard in MILESTONES.md
- Must be documented in DECISIONS.md

---

## 6. Completion Evidence

Before a milestone is marked complete, the following evidence must exist:

1. **PCS** — Product Capability Specification (accepted)
2. **UX** — User Experience Specification (accepted)
3. **ATS** — Acceptance Test Specification (accepted)
4. **Implementation** — Code changes merged
5. **Tests** — Automated tests passing (unit + integration)
6. **Documentation** — MILESTONES.md updated, IMPLEMENTATION_STATUS.md updated
7. **Exit Criteria** — Each criterion verified with evidence
8. **Build** — `bash build-order.sh` passes with zero errors

---

## 7. Roles

| Role | Responsibility |
|------|----------------|
| **Proposer** | Submits milestone proposal with template |
| **Reviewer** | Assesses architecture impact, contract stability |
| **Approver** | Accepts PCS/UX/ATS documents |
| **Developer** | Implements the milestone |
| **Validator** | Verifies exit criteria are met |
| **Documenter** | Updates MILESTONES.md, IMPLEMENTATION_STATUS.md |

A single person may hold multiple roles, but the Approver and Validator must be different from the Developer for major milestones.

---

## 8. Versioning Policy

- Versions follow `vX.Y` where X is the era and Y is the increment within the era
- Breaking changes to public APIs increment the era number
- New capabilities within an existing contract increment the version number
- Patch versions (vX.Y.Z) are reserved for bug fixes with no capability changes
- The roadmap defines planned versions; actual version numbers may shift based on development order

---

## 9. Principles

These principles govern every milestone decision:

1. **Contract Stability** — No milestone may require redesigning stable architectural contracts.
2. **Artifact-Backed** — Every milestone must introduce or significantly enrich durable workspace artifacts.
3. **Documentation-First** — Every milestone begins with documentation (PCS → UX → ATS) before implementation.
4. **Measurable Outcomes** — Every milestone must define measurable developer or operational outcomes.
5. **Provider-Agnostic** — Platform capabilities must remain provider-agnostic.
6. **First-Class Citizens** — Conversation, events, and artifacts are first-class citizens across the platform.
7. **Governance Before Autonomy** — AI autonomy must be preceded by governance frameworks.
8. **Evolution Over Revolution** — Each milestone builds on the previous one. No skipping layers.
