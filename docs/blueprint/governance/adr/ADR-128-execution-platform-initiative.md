---
id: "adr-128"
adr: "ADR-128"
title: "Execution Platform Initiative — Provider-Neutral Execution Boundary"
category: "foundation"
version: 1.0
date: "2026-08-12"
status: "proposed"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@ai-engineer", "@backend-engineer"]
informed: ["@team"]
tags: ["execution", "providers", "models", "architecture", "initiative", "provider-neutral"]
depends_on: ["adr-106", "adr-111", "adr-116", "adr-117", "adr-118"]
referenced_by:
  - type: "blueprint"
    target: "05-ai-core/execution-platform.md"
  - type: "blueprint"
    target: "05-ai-core/provider-architecture.md"
  - type: "blueprint"
    target: "20-roadmaps/provider-platform-roadmap.md"
influences:
  - "AgentPlatform"
  - "ExecutionPlatform"
  - "ProviderPlatform"
---

# ADR-128 — Execution Platform Initiative

## Status of this record

**Initiative record, not an implementation commitment.** This ADR establishes the
target boundaries and invariants for a major architectural initiative. The exact
implementation shape is deliberately left open: phases EP-001 through EP-011 may
challenge it. This record is reviewed before EP-001 is authorized.

**Review status (2026-08-12):** Blueprint direction **approved** by the Reviewer.
ADR-128 **remains PROPOSED** — the proposed package and provider contracts are
**not** stabilized architecture. EP-001 is **authorized as a read-only forensic
architecture inventory** under the boundary in
`05-ai-core/execution-platform.md` (§ EP-001). EP-001 must not design or
introduce new interfaces; it documents what exists. Authorization for EP-002 and
beyond is withheld until the inventory is reviewed.

**Independent artifact review (2026-08-12):** Reviewer inspected the recorded
documents, not the Developer's summary. Verdict: the architecture, invariants,
and EP-001 forensic discipline are faithfully preserved (concept separation,
contract neutrality, invariant ownership, and EP-001 openness all verified);
the **phase-gate discipline was incompletely recorded** and has been corrected
in this record per the review — an explicit review gate after EP-002, a named
ARCHITECTURE REVIEW at EP-011 before provider-neutrality may be considered
established, and the sanctioned EP-001 outcome that the six-layer
classification may be found insufficient. Re-review verifies these corrections.

## Context

The current OpenCode path has become an **evidenced reference implementation**.
Five experimental ORB runs earned concrete invariants: discovery order is not
execution identity, elapsed time is not execution liveness, selection must never
silently pick a model, and organization, agent, and provider concerns are
currently mixed in one path (`AgentRuntime` → `OpenCodeRuntimeProvider` →
custom OpenCode integration). ADR-106 declared provider-neutrality in principle;
the runtime still couples execution semantics to a single provider.

Vestara must be able to source intelligence from anywhere — OpenCode SDK, local
runtimes, future providers — without those choices leaking into organizational
or agent semantics. The current path must keep working while that is proven.

## Decision

Adopt the **Vestara Execution Platform** as a major architectural initiative,
developed **beside** the current system, not as a rewrite of it.

> **Governing rule: build the replacement architecture beside the current
> system, prove it independently, then migrate responsibilities across one
> boundary at a time.**

### The current path is the evidenced reference path

Do **not** rewrite or retire the current OpenCode path during foundation work.
Record it conceptually as:

```text
CURRENT — evidenced reference path

Organization
    ↓
AgentRuntime
    ↓
OpenCodeRuntimeProvider
    ↓
custom OpenCode integration
```

The new architecture starts beside it:

```text
CURRENT                          NEXT

AgentRuntime                     ExecutionPlatform
    ↓                                ↓
OpenCodeRuntimeProvider          ProviderRegistry
    ↓                                ↓
custom transport                 OpenCodeExecutionProvider
                                      ↓
                                 OpenCode SDK
```

No current production route changes until a controlled, per-responsibility
cutover proves behavioral parity.

### Three new architectural domains

- **Agent Platform** — who can perform a responsibility: agent, role,
  instructions, context policy, requirements.
- **Execution Platform** — how responsibility becomes execution: assignment,
  lifecycle, liveness, cancellation, provenance, provider selection, model
  selection, capability matching.
- **Provider Platform** — where execution happens: a provider-neutral contract
  with concrete provider implementations.

Models are resources exposed through providers but own a separate normalized
catalog. The governing principle:

> **Vestara owns the organization. Agents own responsibilities. The execution
> platform owns execution semantics. Providers own runtime integration. Models
> provide intelligence. No lower layer acquires the authority of the layer
> above it.**

### Dependency direction (recorded, not optional)

```text
Vestara Organization
        ↓
Agent Platform
        ↓
Execution Platform
        ↓
Provider Contract
        ↓
Provider Implementations
        ↓
Native SDK / Runtime
        ↓
Models
```

With the corresponding prohibitions:

```text
Models      ✗ define Agent authority
Providers   ✗ define organizational semantics
SDKs        ✗ leak into Vestara domain contracts
Agents      ✗ depend directly on providers
OpenCode    ✗ become the Vestara architecture
```

### Package boundary

The core must have zero OpenCode dependency:

```text
@vestara/execution                      OpenCode dependencies = 0
@vestara/model-catalog                  models.dev dependencies = 0 outside this package
@vestara/execution-provider-opencode    depends on @vestara/execution + @opencode-ai/sdk
@vestara/execution-provider-test        second implementation of the same contract
( eventually ) @vestara/execution-provider-local
```

Never the reverse dependency. An architectural test prevents
`@opencode-ai/sdk` imports outside the OpenCode provider package. The same
rule applies to model metadata: `@opencode-ai/models` types terminate at the
`@vestara/model-catalog` adapter boundary and never spread into the Execution
Platform, agents, Workspace UI, or selection policy.

### Model catalog capability (models.dev)

Incorporate **models.dev** as the **catalog authority for model metadata** —
not the authority for which model Vestara actually uses. `@opencode-ai/models`
is the official typed client: provider maps, provider-agnostic metadata, a
combined catalog, typed errors, custom `fetch`/headers/abort, and a bundled
offline snapshot entrypoint. The distinction matters:

> **models.dev describes models; execution providers establish availability;
> Vestara policy chooses models.**

Three separate concepts are modeled, so the same canonical model can exist
through multiple providers without duplicating identity:

```text
CatalogModel     what models.dev knows
ProviderModel    what a configured execution provider actually exposes
AvailableModel   Vestara's reconciled view
```

The catalog resolves `LIVE → SNAPSHOT` (bundled offline snapshot) on failure,
so offline Vestara still knows model capabilities, context limits, modalities,
pricing metadata, and identity. Full detail, package layout, and the MC phase
track are in `05-ai-core/execution-platform.md`.

Architectural invariant:

> **Catalog presence does not establish runtime availability, runtime
> availability does not establish selection, and selection does not establish
> authority.**

### Open vocabulary question for EP-002

The word `provider` is overloaded twice. models.dev uses "provider" in the
model-serving sense (Anthropic, OpenAI, Zhipu, Google); this initiative uses
`ExecutionProvider` for the execution substrate (OpenCode, local, future).
EP-002's vocabulary reconciliation must resolve this collision as an **open
question**, not a decided implementation:

```text
ExecutionProvider   OpenCode / Local / Future      ≠
InferenceProvider   Anthropic / OpenAI / Zhipu / Google / etc.
Model               Claude / GPT / GLM / Gemini / etc.
```

`ExecutionProvider` and `InferenceProvider` must be distinguished so that
provider identity stays namespaced (execution route vs model-serving provider
vs canonical model vs native model ID) and the word `provider` does not
overload again. EP-001 remains forensic; this is resolved during EP-002.

### Experimental status of the abstraction

`@vestara/execution` is **experimental until EP-011**. An
`OpenCodeExecutionProvider` proves that OpenCode fits the interface; it does
**not** prove the interface is provider-neutral. The second implementation
(the test provider) is what challenges that claim. Only after a fundamentally
different execution substrate implements the contract naturally do we treat it
as stable Vestara foundation:

> **Don't declare an architectural property because the design says it has that
> property. Produce evidence that it does.**

## Domain boundaries

`Agent`, `Model`, `Provider`, and `Execution` are distinct concepts and must
not collapse:

| Concept | Answers | Owns |
|---------|---------|------|
| Agent | Who may occupy a responsibility? | identity, role, instructions, capabilities, context policy, authority profile |
| Execution | How does one invocation run? | assignment, lifecycle, liveness, cancellation, provenance |
| Provider | Where does execution happen? | runtime integration, transport, native SDK |
| Model | What intelligence is available? | capabilities, context window, availability, economics |

An `AgentDefinition` never contains an OpenCode session, provider ID, OpenCode
events, HTTP configuration, or SDK objects. Selection failure resolves to an
explicit unresolved assignment — never a silent fallback, never `models[0]`.

Model identity is similarly split: `CatalogModel` (catalog metadata),
`ProviderModel` (runtime exposure), and `AvailableModel` (reconciled view) are
distinct, so "same model, different provider, different price/latency/privacy
boundary/rate limits" is representable without duplicating identity. Execution
route and intelligence identity are not the same thing.

## Initiative phases

The detailed plan is in `05-ai-core/execution-platform.md`. Sequence summary:

| Phase | Milestone | Deliverable |
|-------|-----------|-------------|
| EP-000 | Freeze current architecture | Conceptual label of the evidenced reference path; no behavior change |
| EP-001 | Forensic architecture inventory (read-only) | ADR + inventory tracing the actual runtime end-to-end; classify every behavior into ORGANIZATION/AGENT/EXECUTION/PROVIDER/MODEL/PROTOCOL; record mixed ownership; **no new interfaces or code** |
| EP-002 | Canonical vocabulary | Precise domain model: Agent, ExecutionProvider, Model, ExecutionAssignment, Execution |
| EP-003 | Provider-neutral contract | `ExecutionProvider` interface with no OpenCode SDK type anywhere |
| EP-004 | Normalized execution events | `execution.started/activity/output.delta/tool.started/tool.completed/waiting/completed/failed/cancelled` |
| EP-005 | ORB invariants preserved | Discovery order ≠ execution identity; elapsed time ≠ execution liveness |
| EP-006 | Provider registry | Providers become plugins: register/unregister/get/list/capabilities/health |
| EP-007 | Model registry | Separate from provider registry; what intelligence is available |
| EP-008 | Selection policy | Deterministic, no AI choosing AI; failure → explicit unresolved |
| EP-009 | OpenCode provider | Official SDK behind the contract; SDK types terminate here |
| EP-010 | Compatibility layer | SDK/server/contract versions; compatible/degraded/incompatible/unknown |
| EP-011 | Test provider | Second implementation + `ExecutionProviderContractSuite`; abstraction experimental until here |
| EP-012 | Shadow execution | Run new layer beside current path; compare model resolution, streaming, events, liveness, cancellation, errors, cleanup, provenance |
| EP-013 | ORB regression harness | ORB findings become architectural protection (regression cases) |
| EP-014 | Agent execution requirements | Agents declare requires/prefers/model characteristics; genuinely provider-neutral |
| EP-015 | Agent context architecture | Responsibility → Agent → Context Policy → Context Assembly → ExecutionRequest |
| EP-016 | Structured organizational output | Structured obligations/uncertainties/assumptions as an agent capability |
| EP-017 | Controlled cutover | One responsibility at a time: Planner → Developer → Verifier → Reviewer |
| EP-018 | Legacy retirement | Only after contract proven, second provider proven, SDK proven, regression green, agents provider-neutral, shadow parity, cutover complete |

### Evidence gates — no implicit auto-progression

Phases do **not** auto-advance. Progression is gated by explicit review and
authorization:

```text
EP-001  Forensic inventory
            ↓
        REVIEW          ← required before EP-002

EP-002  Vocabulary / domain reconciliation
            ↓
        REVIEW          ← required before EP-003

EP-003  Experimental contracts (EP-003 … EP-010)
            ↓
        each subsequent phase requires its own authorization

EP-011  Second-provider challenge
            ↓
        ARCHITECTURE REVIEW
            ↓
        provider-neutrality may finally be considered established
```

The gates at EP-001, EP-002, and EP-011 are **mandatory**. Phases between
EP-003 and EP-010 are experimental and individually authorized — none starts
merely because the previous one completed. ADR-128 stays PROPOSED until the
EP-011 architecture review; nothing below that gate is stabilized architecture.

### Model catalog track (MC-001 … MC-009)

The models.dev work runs as its own phased track beside the EP phases,
coordinated with the vocabulary work:

| Phase | Milestone | Deliverable |
|-------|-----------|-------------|
| MC-001 | models.dev contract inventory | No runtime changes |
| MC-002 | Define Vestara canonical model metadata | No SDK leakage |
| MC-003 | Implement `ModelsDevCatalogAdapter` | using `@opencode-ai/models` |
| MC-004 | Live + offline snapshot fallback | `LIVE → SNAPSHOT` resolution |
| MC-005 | Reconcile catalog models with ExecutionProvider-discovered models | CatalogModel × ProviderModel → AvailableModel |
| MC-006 | Expose normalized `ModelRegistry` | Vestara canonical representation |
| MC-007 | Model provenance + catalog version | generatedAt/checksum recorded |
| MC-008 | Workspace model/provider UI migration | render normalized metadata |
| MC-009 | Role/model recommendation evidence hooks | evidence hooks only, no recommendation engine |

MC-001/MC-002 start only **after EP-001** and likely together with EP-002 —
the vocabulary is directly related. No existing provider/model code is replaced
with models.dev now; models.dev cannot establish runtime availability. The
hierarchy stays:

```text
models.dev          "this model exists and has these characteristics"
ExecutionProvider   "I can actually execute this model"
Vestara policy      "this model may/should execute this responsibility"
Director            "I authorize/prefer this selection"
```

## Deliberately out of scope

Activity Room remediation, automatic revision loops, Observer redesign,
marketplace, model benchmarking, automatic cost optimization, AI-driven
provider selection, local provider production implementation, agent personality
improvements, and UI redesign are **not** part of this initiative. The new
architecture must make them possible later, not deliver them now.

## Consequences

### Positive
- Separates **what Vestara is** from whatever intelligence and execution
  technology Vestara uses today.
- The evidenced OpenCode path keeps working while the replacement is proven.
- Adding a provider becomes: implement the contract, normalize models/events,
  map cancellation/failures, run the contract suite, register — with no changes
  to Planner, Developer, Verifier, Reviewer, AcceptanceBoundary, Organization,
  Workflow, Evidence, or Director authority.
- Adding a model becomes cheaper still (provider discovers → ModelRegistry →
  selection policy → eligible Agents).

### Negative
- New package surface and a long, staged sequence before any cutover.
- Two execution paths coexist during foundation and shadow phases.

### Risks
- Abstraction retains hidden OpenCode assumptions (mitigation: mandatory
  test-provider proof at EP-011 before anything depends heavily on it).
- ORB invariants regress during migration (mitigation: EP-013 regression
  harness required before EP-017 cutover).
- Initiative scope creep (mitigation: explicit out-of-scope list above).

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Refactor the OpenCode path in place | fewer packages | couples the architecture to one provider; risks the evidenced path | rejected |
| Replace the runtime in one cutover | single migration | throws away ORB-learned invariants; no parity proof | rejected |
| Design all three domains as separate packages immediately | clean separation | package architecture before domain boundaries are proven | rejected — one broad `@vestara/execution` package first |

## Implementation Notes

- Migration required? No current production route changes during foundation.
- Breaking changes? No current path breaks; cutover is per responsibility.
- The current OpenCode integration is recorded as the **evidenced reference
  path**, not as legacy code to be immediately replaced.
- Implementation repository: `evillan0315/vestara-ai-core` (mirrored as
  `vestara-ai-core/` in the coordination repo).

## Related

- ADR-106 (provider-neutral engineering provider runtime) — reframed and
  operationalized by this initiative
- ADR-111 (agent-harness-centered runtime), ADR-116 (capability system),
  ADR-117 (filesystem runtime), ADR-118 (multi-agent orchestration) — the
  current agent/execution substrate this initiative runs beside
- Blueprint: `05-ai-core/execution-platform.md`
