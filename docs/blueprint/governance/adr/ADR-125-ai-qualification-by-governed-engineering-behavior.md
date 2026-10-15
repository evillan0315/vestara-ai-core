---
id: "adr-125"
adr: "ADR-125"
title: "AI Qualification by Governed Engineering Behavior"
category: "architecture"
version: 1.0
date: "2026-08-06"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer"]
informed: ["@team"]
tags: ["ai", "qualification", "governance", "planner", "reviewer", "engineer", "verifier"]
depends_on: ["adr-120", "adr-123"]
referenced_by:
  - type: "blueprint"
    target: "05-ai-core/ai-qualification-framework.md"
---

## Context

Vestara delegates engineering work to AI agents (Planner, Reviewer, Engineer,
Verifier). Without qualification, agents may produce outputs that don't meet
engineering standards — hallucinated references, schema violations, scope drift.
The earlier model treated agent trust as binary (trusted or not). Practice showed
that agent competence varies by role, scope, and codebase familiarity.

## Decision

Qualify AI agents by their governed engineering behavior, measured continuously:

- **Repository Grounding**: agent references map to real codebase entities
- **Schema Reliability**: outputs conform to expected schemas
- **Revision Efficiency**: mean iterations to reach approval
- **Scope Discipline**: outputs stay within the stated objective
- **Approval Awareness**: outputs correctly identify approval requirements

Qualification is role-specific. A Planner is qualified differently from an
Engineer. Each role has its own criteria. Qualification feeds into the
engineering lifecycle gates — unqualified agents trigger human review or scope
reduction.

## Consequences

- Agents must demonstrate competence before receiving autonomy
- Qualification metrics are observable and comparable over time
- The framework supports a future capability ladder (Assist → Collaborate → Execute → Orchestrate)
- Human reviewers can override qualification decisions
