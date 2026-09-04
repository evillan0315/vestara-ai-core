---
title: Documentation v2.0 — Living Engineering Documentation Blueprint
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Documentation v2.0 — Living Engineering Documentation Blueprint

## Status

**Blueprint proposal** — implementation is intentionally deferred.

## Purpose

Vestara Documentation v2.0 defines documentation as a first-class, observable, governed stage of the engineering lifecycle. Documentation is not a manual activity performed after implementation. It participates in planning, agent execution, verification, review, milestone governance, design-system evolution, and release management.

The central principle is:

> Documentation is a derived, verifiable representation of Vestara's engineering state.

Markdown remains the human-readable interface. Structured entities, Engineering Graph relationships, events, evidence, implementation records, policies, and package contracts provide the underlying truth.

---

## 1. Engineering lifecycle integration

```text
Intent
  ↓
Plan
  ↓
Implementation
  ↓
Execution
  ↓
Evidence
  ↓
Verification
  ↓
Documentation
  ↓
Review
  ↓
Milestone
  ↓
Release
```

Every engineering action can produce implementation, evidence, and documentation consequences. A task cannot be considered complete until its documentation impact has been evaluated.

The default agent workflow becomes:

```text
Task created
  ↓
Planner identifies documentation obligations
  ↓
Agents receive documentation context
  ↓
Implementation is performed
  ↓
Behavior is verified
  ↓
Documentation impact is recalculated from actual changes
  ↓
Documentation proposals are produced
  ↓
Documentation claims and references are verified
  ↓
Implementation and documentation are reviewed together
  ↓
Task is completed
```

A task with no documentation impact must record an explicit, evidence-backed exemption rather than silently skipping the documentation stage.

---

## 2. Documentation as a Vestara domain

Documentation must be represented as structured Vestara entities rather than anonymous Markdown files.

### Core entities

- `DocumentationDocument`
- `DocumentationSection`
- `DocumentationRequirement`
- `DocumentationClaim`
- `DocumentationReference`
- `DocumentationTask`
- `DocumentationProposal`
- `DocumentationSnapshot`
- `DocumentationRelease`
- `ArchitectureDecision`
- `Milestone`
- `ImplementationRecord`
- `DesignToken`
- `DesignComponent`
- `DesignPattern`
- `DesignAsset`

### Core relationships

```text
package documented-by document
document describes runtime
document references entity
document supersedes document
document depends-on document
implementation satisfies milestone
milestone requires implementation
component uses design-token
design-document defines component
code-change impacts document
claim verified-by evidence
decision recorded-by ADR
release includes document
agent produces documentation-artifact
workflow requires documentation-requirement
```

These relationships allow Vestara to answer:

- Which documents are affected by this package change?
- Which milestones claim completion without implementation evidence?
- Which packages have no documentation?
- Which documents describe APIs that no longer exist?
- Which design components use deprecated tokens?
- Which documentation claims have not been verified recently?
- Which agent execution introduced or invalidated a claim?

---

## 3. Proposed package integration

Documentation automation should initially be implemented through a small set of composable packages:

```text
packages/
├── documentation/
├── documentation-runtime/
├── documentation-verifier/
├── milestone-runtime/
└── design-system/
```

Additional packages may be extracted later when responsibilities become independently substantial:

```text
packages/
├── documentation-graph/
├── documentation-generator/
├── documentation-policy/
├── documentation-templates/
├── documentation-publisher/
├── implementation-registry/
├── design-system-runtime/
└── design-system-verifier/
```

### `@vestara/documentation`

Defines documentation entities, categories, metadata, relationships, requirements, tasks, proposals, claims, findings, verification results, templates, and events.

### `@vestara/documentation-runtime`

Orchestrates scanning, indexing, graph hydration, impact analysis, task generation, agent collaboration, filesystem proposals, policy decisions, verification, approval, event publication, telemetry, and index regeneration.

### `@vestara/documentation-verifier`

Performs structural, repository, behavioral, temporal, claim, reference, and provenance verification independently from the agent that generated the documentation.

### `@vestara/milestone-runtime`

Models milestone state, status gates, implementation links, evidence, verification, dependencies, releases, and rendering of milestone views.

### `@vestara/design-system`

Defines machine-readable design tokens, themes, component contracts, patterns, accessibility requirements, motion, brand rules, metadata, and generated documentation sources.

---

## 4. Agent workflow contracts

Every agent execution receives documentation context and returns documentation impact information.

```ts
interface AgentDocumentationContext {
  affectedDocumentIds: string[];
  requiredDocumentTypes: DocumentationCategory[];
  implementationRecordId?: string;
  milestoneIds: string[];
  architectureDecisionRequired: boolean;
  designSystemImpact: boolean;
  publicApiImpact: boolean;
  documentationPolicy: "none" | "evaluate" | "required";
}
```

```ts
interface AgentExecutionDocumentationResult {
  impact: "none" | "minor" | "major" | "breaking";
  affectedEntityIds: string[];
  requiredUpdates: DocumentationRequirement[];
  producedArtifacts: DocumentationArtifact[];
  exemption?: DocumentationExemption;
}
```

The documentation result becomes part of the normal `AgentExecutionResult` contract.

### Planner Agent

The Planner defines documentation requirements alongside implementation and verification requirements.

A plan should identify:

- affected architecture and implementation documents;
- package README or API reference changes;
- milestone and roadmap impact;
- ADR requirements;
- design-system impact;
- migration and release-note requirements;
- required evidence and verification.

### Developer Agent

The Developer Agent produces structured implementation facts rather than relying on the Documentation Agent to infer everything from a diff.

```ts
interface ImplementationDocumentationReport {
  summary: string;
  changedBehavior: string[];
  publicApiChanges: PublicApiChange[];
  configurationChanges: ConfigurationChange[];
  newLimitations: string[];
  resolvedLimitations: string[];
  migrationRequirements: string[];
  evidenceIds: string[];
}
```

### Architect Agent

The Architect Agent evaluates architectural impact and determines whether an ADR or architecture-document update is required when changes affect system boundaries, ownership, source-of-truth semantics, data flow, package contracts, lifecycle, persistence, governance, or trust boundaries.

### Design Agent

The Design Agent reports affected tokens, components, patterns, accessibility behavior, visual evidence, deprecations, and migration requirements.

### Security Agent

The Security Agent contributes security documentation requirements, threat-model changes, trust-boundary changes, policy effects, risks, mitigations, and evidence.

### Verifier Agent

The Verifier validates implementation behavior and the corresponding documentation claims. It detects mismatches between code, runtime behavior, evidence, milestones, design contracts, and documentation.

### Documentation Agent

The Documentation Agent participates throughout the workflow:

- during planning, to discover obligations;
- during execution, to consume structured reports from other agents;
- after implementation, to create bounded documentation proposals;
- during maintenance, to identify stale, orphaned, contradictory, or missing documentation.

The Documentation Agent must distinguish observed implementation, inferred behavior, planned behavior, unverified claims, and deprecated behavior. It must not independently declare a milestone complete.

### Reviewer Agent

The Reviewer evaluates implementation changes, verification evidence, documentation proposals, documentation verification, milestone proposals, design-system impact, and unresolved risks as one review bundle.

A technically correct implementation with misleading or unsupported documentation fails review.

---

## 5. Agent-to-agent documentation artifacts

Agents exchange structured artifacts instead of relying only on prose.

```ts
type DocumentationArtifact =
  | ImplementationDocumentationReport
  | ArchitectureDocumentationReport
  | SecurityDocumentationReport
  | DesignDocumentationReport
  | VerificationDocumentationReport
  | MigrationDocumentationReport;
```

```text
Developer Agent
  └── ImplementationDocumentationReport

Architect Agent
  └── ArchitectureDocumentationReport

Security Agent
  └── SecurityDocumentationReport

Design Agent
  └── DesignDocumentationReport

Verifier Agent
  └── VerificationDocumentationReport

Documentation Agent
  └── Consolidated documentation proposal
```

These artifacts preserve provenance and let other agents trust, challenge, verify, or reuse the documentation facts produced during execution.

---

## 6. Workflow gates

Vestara introduces documentation-aware gates:

### Implementation gate

- Required code and configuration changes exist.

### Verification gate

- Required behavior has supporting execution evidence.

### Documentation gate

- Documentation impact was evaluated.
- Required documents were updated or explicitly exempted.
- Claims are linked to implementation or evidence.
- No blocking stale or contradictory documentation remains.

### Review gate

- Implementation, evidence, and documentation are mutually consistent.

### Completion gate

- No blocking implementation, verification, documentation, milestone, or design-system findings remain.

Recommended task states:

```text
planned
  ↓
implementing
  ↓
implemented
  ↓
verifying
  ↓
verified
  ↓
documenting
  ↓
documented
  ↓
reviewing
  ↓
completed
```

---

## 7. Engineering Graph integration

The Documentation Runtime uses the Engineering Graph as its principal integration layer.

When repository entities change, bounded documentation impact is calculated through graph traversal.

```text
source file changed
  ↓
belongs-to package
  ↓
documented-by package document
  ↓
referenced-by implementation document
  ↓
satisfies milestone
  ↓
appears-in milestone and release views
```

Documentation sources implement `EntitySource` and `RelationshipSource` contracts so documentation participates in the same integration model as the rest of Vestara.

---

## 8. Engineering Event Store integration

Documentation history must be reconstructable.

Events include:

- document discovered, indexed, created, updated, deprecated, archived, and published;
- documentation impact detected;
- task and proposal created;
- generation and verification started or completed;
- claim added, removed, verified, contradicted, or invalidated;
- approval requested, approved, or rejected;
- milestone status proposed or changed;
- implementation record updated;
- design token introduced, changed, or deprecated;
- ADR proposed, accepted, superseded, or rejected.

This enables temporal queries such as:

- Show documentation as it existed for a release.
- Why was this milestone marked verified?
- Which change invalidated this claim?
- What documentation changed during this agent execution?
- Diff the design system between two versions.

Markdown is the human-readable representation. Events retain temporal truth.

---

## 9. Filesystem Runtime and policy integration

Documentation Agents never write directly to disk.

```text
Agent produces proposal
  ↓
Filesystem Runtime creates dry-run diff
  ↓
Documentation Verifier validates the result
  ↓
Policy determines approval requirements
  ↓
Approved change is applied
  ↓
Filesystem telemetry and evidence are recorded
```

Low-risk deterministic changes may be applied automatically. High-risk changes require approval, including:

- deleting or archiving documents;
- changing completed milestone state;
- rewriting architectural foundations;
- changing public API documentation;
- modifying vision, governance, or brand foundations;
- replacing or deprecating core design-system contracts.

---

## 10. Documentation verification

Generation and verification are separate responsibilities.

### Structural verification

- required metadata and sections exist;
- headings satisfy the document contract;
- internal links resolve;
- referenced paths exist;
- diagrams and generated tables compile;
- indexes include the document.

### Repository verification

- packages, exports, commands, routes, configuration keys, components, events, tools, capabilities, and paths referenced by documentation exist.

### Behavioral verification

Claims about behavior are linked to demonstrations, tests, runtime observations, telemetry, or other execution evidence.

### Temporal verification

The verifier evaluates document age, implementation changes since review, changed dependencies, associated milestone changes, design-token changes, and the commit against which the document was verified.

### Claim provenance

Each generated claim records source entities, evidence, confidence, verification status, and the execution or agent that produced it.

---

## 11. Milestones and implementation records

`MILESTONES.md`, `ROADMAP.md`, and `IMPLEMENTATION.md` should evolve into rendered human-facing views over structured entities rather than remaining the sole source of truth.

Milestone state progresses through governed gates:

```text
proposed
  ↓
planned
  ↓
in-progress
  ↓
implemented
  ↓
verified
  ↓
released
```

- `implemented` means the expected implementation exists.
- `verified` means supporting behavioral evidence exists.
- `released` means the verified implementation belongs to a named release.

The runtime detects milestone drift, including completion without evidence, implementation without milestone updates, unsatisfied dependencies, renamed or removed capabilities, release status without a release artifact, and planned behavior presented as current.

Implementation records connect capabilities to packages, source entities, tests, executions, evidence, documents, milestones, limitations, and verification state.

Every implementation view clearly distinguishes:

- implemented;
- partially implemented;
- verified;
- not yet implemented;
- known limitations;
- future work.

---

## 12. Vestara Design System integration

The Vestara Design System is both machine-readable and documented.

It defines:

- semantic color tokens;
- typography;
- spacing;
- radius;
- elevation;
- motion;
- themes;
- component contracts and states;
- interaction patterns;
- responsive behavior;
- accessibility requirements;
- brand and logo rules;
- migration and deprecation metadata.

When design tokens or component contracts change:

```text
Design source changed
  ↓
Design entities updated
  ↓
Affected components identified
  ↓
Documentation impact generated
  ↓
Token and component references regenerated
  ↓
Examples and accessibility requirements verified
  ↓
Visual verification requested
  ↓
Migration notes proposed
```

A UI task cannot be marked complete if it introduces undocumented tokens, variants, states, interactions, patterns, or accessibility behavior.

Visual verification may integrate Puppeteer or another browser runtime to render affected screens and attach visual evidence.

---

## 13. Workspace and telemetry integration

Documentation appears as an observable stage inside every agent execution:

```text
Execution
├── Plan
├── Implementation
├── Files Changed
├── Verification
├── Documentation
│   ├── Impact
│   ├── Requirements
│   ├── Agent reports
│   ├── Proposed diffs
│   ├── Claims and provenance
│   └── Verification
├── Review
└── Completion
```

The Workspace Documentation area should include:

- overview and coverage;
- document registry;
- stale and contradictory documents;
- unsupported claims;
- pending proposals and approvals;
- verification results;
- milestones and implementation records;
- design-system explorer;
- ADRs and releases;
- documentation history and evidence.

Telemetry should expose actual operations, including scanning, graph traversal, impact discovery, claim extraction, generation, link checking, repository reference checking, verification, proposal creation, approval, filesystem changes, indexing, and publication.

Useful metrics include documentation coverage, package coverage, verified-claim ratio, stale-document count, broken references, undocumented packages, milestone evidence coverage, design-system coverage, average document age, and documentation verification success rate.

---

## 14. Continuous documentation workflow

### On planning

- identify documentation requirements;
- assign responsible agents;
- determine policy and verification requirements.

### On source changes

- detect changed entities;
- calculate documentation impact;
- update obligations;
- create stale-document findings.

### On verification

- attach execution evidence;
- validate implementation and documentation claims together.

### On review

- present implementation, evidence, documentation, milestone, design, and risk changes as one review bundle.

### On merge

- append engineering events;
- apply approved documentation changes;
- rebuild indexes and coverage;
- update implementation records.

### On release

- verify milestone evidence;
- generate release documentation;
- snapshot documentation state;
- generate migration notes;
- publish versioned documentation.

---

## 15. Automation modes

### Observe

Discover impact, stale documentation, missing coverage, and contradictions without creating writes.

### Propose

Generate evidence-backed diffs and wait for approval.

### Governed automatic

Apply verified low-risk changes such as indexes, export tables, generated package metadata, event catalogs, relationship catalogs, token tables, and deterministic references.

### Fully automatic

Reserved for deterministic generated content sourced directly from schemas, exports, manifests, registries, or structured design definitions.

Human-authored vision, architectural reasoning, milestone declarations, governance, and design philosophy remain governed.

---

## 16. Blueprint delivery milestones

### D2.0 — Documentation domain foundation

Define entities, events, metadata, graph sources, document scanning, and the documentation registry.

### D2.1 — Documentation impact engine

Implement code-to-document relationships, graph traversal, change-set analysis, stale-document detection, and coverage reporting.

### D2.2 — Agent workflow integration

Extend planning, agent execution, handoff artifacts, workflow states, completion contracts, and documentation gates.

### D2.3 — Documentation Agent

Implement typed templates, package and implementation generation, structured reports, bounded proposals, and dry-run diffs.

### D2.4 — Documentation verification

Implement structural, repository, behavioral, temporal, claim, provenance, and evidence validation.

### D2.5 — Filesystem and policy integration

Add policy decisions, approval gates, safe filesystem application, events, and telemetry.

### D2.6 — Milestone and implementation runtime

Add structured milestones, implementation records, status gates, evidence coverage, drift detection, and rendered Markdown views.

### D2.7 — Vestara Design System

Add machine-readable tokens, component contracts, generated reference documentation, graph entities, impact analysis, accessibility checks, and visual evidence hooks.

### D2.8 — Workspace Documentation Center

Add documentation inspection, proposals, verification, milestones, implementation records, design-system exploration, telemetry, history, and governance.

### D2.9 — Continuous and release documentation

Add pull-request impact reporting, release generation, snapshots, migration notes, publishing, and versioned documentation history.

---

## 17. Definition of done

Documentation v2.0 is complete when:

1. Every Vestara package has a documentation owner or explicit exemption.
2. Every major capability has an implementation record.
3. Every completed milestone has implementation and verification evidence.
4. Every agent workflow evaluates documentation impact.
5. Every agent can produce structured documentation artifacts.
6. Documentation requirements are established during planning.
7. Documentation generation and verification are separate operations.
8. Documentation writes pass through the Filesystem Runtime and policy engine.
9. Documentation relationships participate in the Engineering Graph.
10. Documentation history can be reconstructed from the Event Store.
11. Every design token and documented component maps to a machine-readable contract.
12. Documentation telemetry and evidence are visible in the Workspace.
13. Releases include a verified documentation snapshot.
14. Aspirational, implemented, verified, and released capabilities are clearly distinguished.
15. Documentation claims can be traced to repository entities, agents, executions, or evidence.

---

## 18. Architectural outcome

Documentation becomes part of Vestara's trust system and part of how agents communicate their work to humans and to other agents.

The system should always be able to show:

- what an agent says changed;
- what actually changed;
- what was verified;
- what documentation was updated;
- which claims are supported by evidence;
- which milestone or design-system contracts were affected;
- what remains incomplete or contradictory.

Documentation is therefore not a final manual step after engineering. It is an executable, observable, verifiable, and governed stage of the Vestara engineering workflow.
