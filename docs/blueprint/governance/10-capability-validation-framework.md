---
title: "Capability Validation Framework"
volume: "00-governance"
book: "Book 1: Vision & Business"
version: "1.0.0"
status: "draft"
owner: "@chief-architect"
tags: ["validation", "capabilities", "experience", "measurement"]
---

# Capability Validation Framework

> **The corpus measures machine accuracy. Capability validation measures human effectiveness.**

A capability is validated when it changes a developer's cognitive state — not when a function returns, an API responds, or a model generates output.

---

## Validation Loop

```
Capability Definition
        ↓
User Scenario
        ↓
Expected Developer Outcome
        ↓
Experience Measurement
        ↓
Capability Improvement
```

The same pattern used for Understanding evaluation (corpus → measure → improve) applied to human outcomes rather than machine accuracy.

---

## CAP-001 Validation: Workspace Orientation

### Capability Statement

> A developer opening a workspace can quickly understand what it is, its current condition, recent activity, important decisions, and the most reasonable next step.

### Success Condition

The developer can make a better decision after seeing the orientation — not "all cards render."

### Scenario: Returning Developer

| Before Vestara | After Vestara |
|----------------|---------------|
| "Where did I leave this?" | "This is the payment service." |
| "What changed?" | "Three files changed since my last session." |
| "Is anything broken?" | Health is good; 1 architectural risk. |
| "What was I planning?" | "The last milestone was API stabilization." |
| "What should I do next?" | "Integration testing is the outstanding task." |

The user reaches orientation without asking questions.

### Contract

```
Workspace Orientation Contract

Given:
  A workspace with known repository state,
  history, memory, and understanding snapshot

Then:
  ✓ Identity is presented
  ✓ Current state is presented
  ✓ Recent activity is presented
  ✓ Decisions are presented
  ✓ Risks are visible
  ✓ Next action is explainable

And:
  ✓ UI does not reconstruct workspace facts
  ✓ UI does not query individual systems
  ✓ Every displayed fact has provenance
```

The first six are user outcomes. The last three are architectural protections.

### Measurement Model

```typescript
interface CapabilityOutcome {
  capability: string;
  scenario: string;
  beforeState: string;
  afterState: string;
  measurements: {
    timeToOrientation: number;
    confidenceBefore: number;
    confidenceAfter: number;
    unansweredQuestions: number;
  };
}
```

### First Validation Run

A developer opens five different repositories. For each, before viewing Vestara:

> Rate your confidence: "What is the state of this project?" (1-5)

After viewing Orientation, rate again.

| Signal | Target |
|--------|--------|
| Confidence increase | +2 or higher average |
| Time to understand | < 2 minutes |
| Incorrect assumptions | 0 critical errors |

---

## The Two Evaluation Planes

```
Machine Understanding

  Corpus → Understanding → Producer accuracy

Human Understanding

  Scenario → Experience → Developer confidence
```

Both matter. A perfectly accurate system that overwhelms users has failed. A beautiful interface with incorrect information has also failed.

### Quality Dimensions

| Dimension | Machine | Human |
|-----------|---------|-------|
| Accuracy | Is the conclusion correct? | Is the orientation useful? |
| Coverage | How many fields are populated? | How many questions are answered? |
| Confidence | How certain is each field? | How confident is the developer? |
| Traceability | Can conclusions be traced? | Can explanations be understood? |
| Regressions | Did previous assertions break? | Did the experience regress? |

---

## Capability Maturity Stages

| Stage | Criteria |
|-------|----------|
| **Defined** | Capability is documented in catalog |
| **Implemented** | A working experience exists |
| **Validated** | Developer confidence increase is measured |
| **Trusted** | Consistent positive outcomes across scenarios |
| **Earned** | Capability survives implementation changes without losing effectiveness |

---

## Orientation vs. Summary

A summary provides information. An orientation supports decisions.

| Provides | Example |
|----------|---------|
| Summary | "There are 12 packages." |
| Orientation | "There are 12 packages organized as a monorepo. The API package depends on shared runtime packages. The current risk is incomplete test coverage in authentication." |

Orientation must explain, not merely summarize. This distinction matters for every capability.

## Key Metric: Cognitive Efficiency

The most important metric is not `confidenceAfter` alone. It is the relationship:

```
Confidence gained
-----------------
Time required
```

Vestara's goal is not simply making developers confident — a senior developer can achieve confidence by spending two hours reading code. The goal is achieving necessary confidence with less cognitive effort. That is the measurable expression of the Product Constitution.

## Diagnostic Matrix

| Machine quality | Human outcome | Interpretation |
|----------------|---------------|----------------|
| High | High | Capability is working |
| High | Low | Correct but difficult experience |
| Low | High | User succeeds despite weak understanding |
| Low | Low | Fundamental problem |

The second case (high machine accuracy, low human outcome) is especially valuable. It means the intelligence works, but the experience needs improvement — a different class of problem than producer accuracy.

## Validation Instrumentation

The measurement bridge between `WorkspaceUnderstanding` and human confidence.

```typescript
interface CapabilityValidationSession {
  readonly id: string;
  readonly capability: "CAP-001";
  readonly workspaceId: string;
  readonly understandingId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly orientation: OrientationMeasurement;
  readonly outcome: DecisionOutcome;
  readonly diagnosis?: ValidationDiagnosis;
}

interface OrientationMeasurement {
  readonly confidenceBefore: number;
  readonly confidenceAfter: number;
  readonly timeToOrientationMs: number;
  readonly questionsBefore: readonly string[];
  readonly questionsAfter: readonly string[];
  readonly trustScore: number;
}

interface DecisionOutcome {
  readonly nextActionIdentified: boolean;
  readonly actionDescription: string;
  readonly actionConfidence: number;
  readonly reasonForAction: string;
}

interface ValidationDiagnosis {
  readonly source: "producer" | "understanding" | "experience" | "intent" | "workflow";
  readonly reason: string;
}
```

The critical invariant: `understandingId` must trace back to `WorkspaceUnderstanding.id` — every human experience is traceable to the semantic snapshot that produced it.

## Evidence Artifact

Every validation session produces a single record:

```typescript
interface CapabilityValidationResult {
  readonly capability: "CAP-001";
  readonly workspaceId: string;
  readonly orientation: {
    readonly confidenceBefore: number;
    readonly confidenceAfter: number;
    readonly timeToOrientationMs: number;
  };
  readonly cognitiveGaps: readonly string[];
  readonly trustIssues: readonly string[];
  readonly recommendedImprovement: {
    readonly source: "producer" | "assembler" | "experience";
    readonly reason: string;
  };
}
```

The critical field is `recommendedImprovement.source` — it enforces the rule that improvements target the source, never the consumer.

## Explanation Trust

Confidence alone can hide problems. A user may say "I understand" but mean "I accepted what I saw." The signal that distinguishes them is:

> "Which statement from Vestara influenced your next action?"

Weak: "The health score was 87%." Strong: "I avoided changing this package because Vestara showed it has three downstream dependencies and recent changes introduced failures there."

## Capability Dependency Graph

The five capabilities form a natural progression:

```
CAP-001  Workspace Orientation       — establish reality
    ↓
CAP-002  Contextual Continuation     — restore context
    ↓
CAP-003  Intent Alignment            — define destination
    ↓
CAP-004  Guided Execution            — act safely
    ↓
CAP-005  Engineering Memory          — improve over time
```

The order matters. A system cannot align intent if it cannot establish reality. It cannot execute safely if it does not understand intent. It cannot become wiser over time if it does not preserve meaningful memory.

## Capability Maturity Model

Every capability progresses through four levels of maturity:

| Level | Name | Example |
|-------|------|---------|
| L0 | No orientation | Developer starts from zero |
| L1 | Information | "120 files, TypeScript project." |
| L2 | Understanding | "This is a monorepo where shared packages support API and workspace applications." |
| L3 | Decision support | "Changing this package affects three applications." |
| L4 | Confidence | "I understand the risk. I know my next step." |

CAP-001 should ultimately target Level 4 — a developer who can safely act.

## The Evidence Loop

```
User Scenario
        ↓
Capability Outcome
        ↓
Experience Evidence
        ↓
Product Improvement
```

The first validation run should include three workspaces with different cognitive difficulty:

| Workspace | Question |
|-----------|----------|
| Small greenfield project | Can Vestara quickly explain a simple system? |
| Active production project | Can Vestara explain current reality? |
| Older unfamiliar codebase | Can Vestara reduce exploration time? |

The output is not a feature list — it is a diagnosis identifying the capability bottleneck.

## Diagnostic Decision Tree

Every validation failure maps to exactly one layer:

| Symptom | Source | Fix |
|---------|--------|-----|
| Wrong fact | Producer | Improve the producer |
| Wrong interpretation | Understanding | Improve the assembler or model |
| Wrong presentation | Experience | Improve the interface |
| Unclear goal | Intent | Introduce Intent abstraction (new) |
| Execution failure | Workflow | Improve workflow execution |

A bad experience does not create random feature requests. It maps back to a layer. This prevents architectural drift.

## Experiment Flow

### Hypothesis
A developer using Vestara reaches a confident next decision faster than the same developer working without Vestara.

### Baseline
Developer opens an unfamiliar workspace without Vestara. Timer starts. Developer investigates: structure, dependencies, changes, decisions, risks. Timer stops when developer can answer "What should I do next?" Record: `confidenceBefore`, `timeToOrientation`, `unansweredQuestions`.

### Intervention
Same developer opens the same workspace with Vestara's orientation. No special assistance, no guided prompts. Record: `confidenceAfter`, `timeToOrientation`, `remainingQuestions`.

### Decision Test
Final question: "Can you confidently take the next engineering action?"

### First Target
- ≥ 50% reduction in orientation time
- ≥ +2 confidence improvement  
- Zero critical trust failures

## Relationship to Architecture

Every capability maps to existing architecture. No new foundation is required for CAP-001 through CAP-005 — only Intent Alignment (CAP-003) needs the Intent Model, which must earn its place through evidence from earlier validations. The likely trigger: repeated recommendation failures despite high understanding accuracy.

---

*This framework defines how capabilities are tested, what evidence is required, what success means, and when a capability is considered mature. It bridges the capability catalog and product improvements.*
