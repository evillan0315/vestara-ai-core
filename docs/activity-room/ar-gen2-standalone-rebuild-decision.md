---
title: Activity Room Gen2 — Clean Standalone Rebuild + Workflow Reproducibility
version: 1.0.0
status: decided-record-only
owner: vestara
last-reviewed: 2026-09-27
next-review: 2026-10-27
---

# VESTARA DESIGN DECISION — Activity Room Gen2 Clean Standalone Rebuild + Workflow Reproducibility

> **STATUS: DECIDED / RECORD ONLY.**
> No implementation, mutation, repo creation, task reset, Gen1 modification,
> Workflow/Graph/Inventory contract change, evidence-model change, source copy,
> UI/API implementation, or autonomous execution is authorized by this record.
> Activation of any bounded work requires its own governed milestones/tasks.
> Immediate next step: return to AR-INVENTORY.

## Purpose

Vestara will build the production-oriented standalone Activity Room as a clean
Generation 2 implementation rather than extracting, copying, or progressively
untangling the existing Generation 1 Activity Room.

Generation 1 remains an authoritative source of discovered product behavior,
visual references, implementation evidence, architectural lessons, failures,
tests, contracts, and reusable capabilities.

It is NOT automatically the architecture of Generation 2.

## Core principle

Same product experience.
Clean implementation.
Reuse proven capabilities.
Do not inherit accidental Gen1 coupling.

Activity Room Gen2 should preserve the intended Activity Room product identity
and visual experience while allowing its implementation architecture to be
derived from frozen contracts, inventory, evidence, dependency analysis, and
standalone product requirements.

## Why this is possible

Vestara already contains much of the material required to construct the
standalone product:

- Activity Room implementation history
- accepted architectural and product decisions
- conversations containing design discoveries and rationale
- milestones, plans, and historical tasks
- reusable packages and runtimes
- contracts
- tests
- evidence
- known failures and unresolved questions
- canonical Vestara UI system
- existing Activity Room screens and visual behavior
- Inventory work identifying capabilities and dependencies

The standalone build should therefore begin with discovery and reuse analysis,
not immediate task generation or reimplementation.

## Invariant

Planning begins with capability discovery, not task generation.

## Target model

```text
Existing Vestara
    |
    +-- Inventory
    +-- Evidence
    +-- Graph / relationships
    +-- Contracts
    +-- Conversations
    +-- Historical milestones/plans/tasks
    +-- Reusable packages/runtimes/tools
    +-- Visual references
    +-- Tests and verification history
    |
    v
Workflow
    |
    +-- discover
    +-- classify
    +-- consolidate
    +-- determine REUSE / ADAPT / BUILD / INVESTIGATE / DECIDE
    +-- establish dependencies
    +-- create new execution milestones/tasks
    +-- execute bounded work
    +-- verify
    +-- preserve evidence
    +-- reevaluate eligible work
    |
    v
Clean Activity Room Gen2
```

## Historical work

Historical completed tasks MUST NOT simply be reset to pending.

Historical completion means that work occurred in its historical context.
A new standalone implementation may require equivalent work again, but that
must be represented by a NEW execution task with lineage to the historical
source.

Historical completion != future execution state.

Candidate lineage may include:

- derivedFromTaskIds
- derivedFromMilestoneIds
- derivedFromConversationIds
- evidenceRefs
- sourceRepoRef
- sourceCommit

Exact contracts remain subject to audit/design.

## Conversation discovery

Existing Vestara conversations may contain important Activity Room product
requirements, principles, rejected ideas, architectural discoveries, and
design rationale.

However:

Conversation != Requirement.

Conversation-derived material must be classified/corroborated before becoming
current product authority.

Possible classifications include:

- accepted requirement
- accepted principle
- design lineage
- historical context
- unresolved question
- rejected/obsolete idea

## Visuals are first-class workflow inputs

The existing Activity Room screens are valuable evidence of intended product
experience.

Workflow should eventually support:

```text
Canonical visual reference
    ->
Visual analysis
    ->
Presentation requirements
    ->
Implementation
    ->
Rendered result
    ->
Visual comparison
    ->
Verification/evidence
```

Visual analysis may establish presentation observations such as composition,
spacing, hierarchy, visible controls, disclosure patterns, and interaction
surfaces.

It MUST NOT independently establish hidden architecture, persistence,
authority, permission, runtime ownership, or other behavior that cannot be
observed visually.

Visual evidence tells Workflow what something looks like.
It does not necessarily tell Workflow why it behaves that way.

The objective is visual fidelity to our canonical Activity Room experience,
not blind cloning of Gen1 implementation.

UI implementation remains governed by canonical Vestara design contracts,
tokens, themes, and reusable presentation primitives.

## Workstreams

The standalone product should distinguish at least:

1. Activity Room UI
2. Activity Room API/backend
3. Shared/reusable capabilities

UI and API are separate workstreams even if ultimately housed in the same
product repository.

Before implementation, Workflow must determine how reusable Vestara packages
are consumed by the standalone product.

Candidate mechanisms requiring explicit decision include:

- direct monorepo dependency
- workspace/package linking
- published packages
- extraction
- another governed distribution mechanism

Blind source copying is not an acceptable default.

## Clean target

The standalone Activity Room should be created in a clean target environment
only after its input contracts, reusable capability boundary, and workflow
plan are sufficiently established.

The clean environment is deliberate.

It tests whether Vestara can reconstruct the product from governed knowledge
without accidentally depending upon Gen1 application structure.

## Autonomous workflow experiment

Activity Room Gen2 will also serve as a real-world test of Vestara Workflow.

Candidate progression:

```text
Goal
  ->
Capability/Inventory discovery
  ->
Requirement and lineage discovery
  ->
Evidence assessment
  ->
Visual reference analysis
  ->
Reuse/Adapt/Build/Investigate/Decide classification
  ->
Dependency analysis
  ->
Milestone and bounded task generation
  ->
Eligible task selection
  ->
Bounded agent execution
  ->
Verification
  ->
Evidence capture
  ->
State/Graph update
  ->
Dependency reevaluation
  ->
Next eligible task
  ->
Product acceptance
```

AI reasoning operates inside governed steps.

AI is not itself Workflow authority.

Unknown or contradictory evidence may produce INVESTIGATE or HOLD rather than
BUILD.

## Visual execution evidence

FFmpeg recording should be considered as a future evidence capability for the
standalone build experiment.

The workflow may record the build and verification process so that humans can
inspect how the product was produced.

Recording != execution evidence authority.

Machine-verifiable evidence remains authoritative for tests, contracts,
workflow transitions, permissions, verification, and completion.

Video is observational/human-understandable evidence and may be correlated
with structured workflow events and timestamps.

## Reproducibility test

The defining experiment is:

```text
Build it.
Verify it.
Delete the generated product.
Build it again.
```

The second build tests whether the first result depended upon transient model
context, hidden manual intervention, accidental repository state, or
unrecorded reasoning.

A stronger subsequent experiment is:

```text
Build it again -- but change one requirement.
```

This tests whether Workflow can modify the product intentionally while
preserving unaffected requirements.

Three proof levels therefore emerge:

- BUILD — Can Vestara produce the product?
- REBUILD — Can Vestara reproduce the product from governed knowledge?
- CHANGE + REBUILD — Can Vestara adapt the product while preserving unaffected requirements?

## Reproducibility evidence

Future comparison should include, where available:

- workflow/run identity
- inventory snapshot
- product contracts
- visual references
- reusable capability decisions
- generated milestones/tasks
- dependency decisions
- agent/tool operations
- permissions/approvals
- source output
- commits
- builds
- tests
- runtime behavior
- screenshots
- visual comparison
- evidence bundles/manifests
- human interventions
- failures/recoveries
- duration/resource usage
- final acceptance result

## Success criterion

The demonstration is not merely:

"Activity Room works."

The stronger demonstration is:

"Vestara knows enough about the product, its available capabilities, its
relationships, its evidence, its visual identity, and its governed development
process to construct the standalone Activity Room and reproduce that result."

## Boundaries

This decision DOES NOT authorize:

- creating the clean repository yet
- resetting historical tasks
- modifying Activity Room Gen1
- implementing Workflow
- changing Graph contracts
- changing Inventory contracts
- creating new evidence models
- copying Gen1 source into Gen2
- treating screenshots as architecture authority
- implementing standalone UI/API
- beginning autonomous execution

Those actions require their own governed milestones/tasks after the current
Inventory work establishes sufficient truth.

## Immediate next step

Return to AR-INVENTORY.

Complete the current Inventory/Evidence work before deriving the standalone
Activity Room execution plan.

Inventory is a prerequisite because Workflow must know what Vestara already
has before deciding what Activity Room Gen2 needs to reuse, adapt,
investigate, decide, or build.

## Final decision

Activity Room Gen2 will be a clean standalone reconstruction driven by
Vestara's governed knowledge and reusable capabilities.

Generation 1 teaches us what we built.
Inventory tells us what we have.
Evidence tells us what we know.
Graph tells us how it relates.
Visual references tell us what the product should look like.
Workflow determines how to move from that known state to the new product.

The eventual proof is simple:

```text
"Build it again."
```
