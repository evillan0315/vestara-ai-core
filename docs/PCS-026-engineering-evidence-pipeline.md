# PCS-026 — Engineering Evidence Pipeline

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-026 |
| Name | Engineering Evidence Pipeline |
| Status | Design — slice 1 implemented (collectors, pipeline, confidence, verifier integration); slice 2 implemented (visual engine, baseline governance, screenshot/visual collector); browser adapter provisioning + Workspace evidence viewer pending |
| Owner | Chief Architect |
| Prerequisite | PCS-005 Verify, PCS-017 Execution Engine, PCS-025 Multi-Agent Project Management, ADR-104 (Evidence-Based Verification), ADR-121 (change.* projection) |
| Scope | Collect → normalize → content-address → manifest → bundle → replay + confidence across verification, filesystem, command/test, and browser evidence |

> **Canonical reference**: the content-addressed evidence and immutable manifest
> stores are implemented in `packages/engineering-event-store`; the verification
> engines are in `packages/verification`; the durable harness loop invokes a
> `HarnessVerifier`. This spec defines the **orchestration layer** that connects
> those pieces into one evidence protocol, and the contract that governs it.

## 1. Context and Goals

Today a verification run returns a `HarnessVerificationResult` (status, checks,
`EvidenceArtifact[]`, confidence) whose evidence items are detached summaries —
a `uri` and metadata — with no shared protocol for what they are, how they were
produced, how they relate, or how they can be replayed. Different producers
(filesystem runtime, verification runners, change projector) each record
evidence their own way. The result is that verification is *asserted*, not
*observable*: a passing check is trusted on the strength of its status string
rather than the evidence behind it.

PCS-026 makes verification observable by establishing a **stable evidence
protocol**:

- every evidence item is **content-addressed** and **provenanced**;
- a verification run produces one **immutable verification bundle**;
- bundles are **replayable** (artifact replay deterministically, execution
  replay only when its dependencies are captured);
- confidence is **derived** from evidence quality and coverage, not asserted;
- human-reviewed visual baselines are a **governance action**, never silently
  mutated by an agent.

The central contract is a **`VerificationEvidenceBundle`** — not an individual
screenshot, test result, or manifest.

## 2. Pipeline

```text
Verification Request
        │
        ▼
Evidence Collection
        │
        ├── build/test results
        ├── filesystem changes
        ├── command execution
        ├── browser interactions     (slice 2)
        ├── screenshots              (slice 2)
        └── visual diffs             (slice 2)
        │
        ▼
Evidence Normalization
        │
        ▼
ContentAddressedEvidenceStore
        │
        ▼
ImmutableEvidenceManifest
        │
        ▼
Verification Bundle
        │
        ├── replay instructions
        ├── provenance
        ├── integrity hashes
        ├── verification checks
        └── confidence calculation
        │
        ▼
Verifier Result
```

Producers are normalized through a `EvidenceCollector` boundary so the pipeline
never depends directly on Playwright, the filesystem runtime, subprocess
execution, or any other evidence source.

## 3. Core Contract

```ts
export interface VerificationEvidenceBundle {
  readonly id: string;
  readonly executionId: string;
  readonly taskId?: string;
  readonly verifierId: string;
  readonly profileId: string;

  readonly manifestId: string;
  readonly evidence: readonly EvidenceReference[];
  readonly checks: readonly VerificationCheckResult[];

  readonly replay: EvidenceReplayDescriptor;
  readonly confidence: VerificationConfidence;

  readonly createdAt: string;
}
```

Supporting types:

```ts
export type EvidenceKind =
  | 'command' | 'test' | 'build'
  | 'filesystem-change' | 'source-diff'
  | 'browser-navigation' | 'screenshot' | 'visual-comparison';

export interface EvidenceReference {
  readonly ref: string;            // content-addressed digest (sha256)
  readonly kind: EvidenceKind;
  readonly mediaType: string;
  readonly size: number;
  readonly summary: string;
  readonly provenance: EvidenceProvenance;
  readonly relatedTo?: readonly string[];
}

export interface EvidenceProvenance {
  readonly producer: string;       // which component produced it
  readonly executionId: string;    // which execution produced it
  readonly operation?: string;     // which command/operation created it
  readonly createdAt: string;
  readonly environment: string;    // environment snapshot id/description
  readonly contentHash: string;
  readonly relatedTo?: readonly string[];
}

export interface VerificationCheckResult {
  readonly checkId: string;
  readonly name: string;
  readonly status: 'passed' | 'failed' | 'skipped' | 'blocked';
  readonly summary: string;
  readonly evidenceRefs: readonly string[];
  readonly durationMs?: number;
}

export interface EvidenceReplayDescriptor {
  readonly mode: 'artifact' | 'execution';
  readonly steps: readonly ReplayStep[];
  readonly requires: ReplayRequirements;
}

export interface ReplayStep {
  readonly type: 'open-log' | 'open-artifact' | 'run-command' | 'run-scenario';
  readonly target: string;
  readonly command?: string;
}

export interface ReplayRequirements {
  readonly repositoryCommit?: string;
  readonly environmentImage?: string;
  readonly dependencies?: readonly string[];
  readonly secrets?: readonly string[];
  readonly externalServices?: readonly string[];
  readonly runtime?: string;
}

export interface VerificationConfidence {
  readonly score: number;                       // 0..1
  readonly level: 'low' | 'moderate' | 'high' | 'very-high';
  readonly factors: readonly ConfidenceFactor[];
  readonly limitations: readonly string[];
}

export interface ConfidenceFactor {
  readonly dimension: ConfidenceDimension;
  readonly score: number;                       // 0..1
  readonly weight: number;                      // 0..1
  readonly rationale: string;
}

export type ConfidenceDimension =
  | 'profile-coverage' | 'check-success' | 'evidence-integrity'
  | 'evidence-independence' | 'replayability' | 'freshness';
```

## 4. Capability 1 — Evidence Collection

A normalized collector boundary:

```ts
export interface EvidenceCollectionRequest {
  readonly executionId: string;
  readonly taskId?: string;
  readonly workspaceRoot: string;
  readonly changedFiles?: readonly string[];
  readonly profile?: string;
}

export interface EvidenceCollectionResult {
  readonly items: readonly EvidenceItem[];
}

export interface EvidenceItem {
  readonly kind: EvidenceKind;
  readonly mediaType: string;
  readonly content: string | Uint8Array;
  readonly summary: string;
  readonly operation?: string;
  readonly relatedTo?: readonly string[];
}

export interface EvidenceCollector<TRequest = EvidenceCollectionRequest> {
  readonly kind: EvidenceKind;
  collect(request: TRequest): Promise<EvidenceCollectionResult>;
}
```

Initial collectors (slice 1): **command output**, **test execution**, **build
execution**, **filesystem change set**, **source diff**. Slice 2 adds **browser
navigation**, **screenshot**, **visual comparison**.

The verifier composes collectors; it does not reach into their implementations.

## 5. Capability 2 — Evidence Provenance

Every evidence item records **who** produced it, **which execution** produced
it, **which command/operation** created it, **when**, **in which environment**,
its **content hash**, and its **relationship to other evidence**. This prevents
a screenshot or test result from becoming an unexplained detached artifact.
Provenance is written into the store as artifact metadata and surfaced on every
`EvidenceReference` in the bundle.

## 6. Capability 3 — Immutable Bundle Manifests

The existing stores remain the persistence primitives:

```text
Evidence bytes        → ContentAddressedEvidenceStore (artifact ref)
Evidence metadata     → ImmutableEvidenceManifestStore (manifest entry)
Verification session  → VerificationEvidenceBundle (manifest id + refs)
```

A bundle is **append-free after finalization**. Corrections create a **new
bundle** linked through `supersedes` or `derivedFrom`; the original bundle is
never mutated.

## 7. Capability 4 — Replay

Two levels, never conflated:

```text
Artifact replay   Re-open stored logs, screenshots, diffs, and manifests.
Execution replay  Re-run the original commands and browser scenario.
```

- **Artifact replay is deterministic and immediately available** — it reads only
  content-addressed bytes plus the manifest.
- **Execution replay is only claimed deterministic when its dependencies are
  captured**: repository state (commit), environment image, dependency versions,
  secrets, external services, and runtime availability. `ReplayRequirements`
  lists exactly which are captured; anything not listed is a limitation.

## 8. Capability 5 — Confidence Scoring

Confidence is **derived** from evidence quality and coverage — never assigned
directly by an agent. A verifier cannot return `0.98` without exposing why.

Dimensions (replaceable formula, fixed dimensions):

```text
confidence =
    profile coverage      (fraction of the profile's checks that ran)
  × check success         (fraction of run checks that passed)
  × evidence integrity    (fraction of expected evidence present + content-addressed)
  × evidence independence (fraction of checks backed by distinct evidence sources)
  × replayability         (fraction of steps replayable as artifacts)
  × freshness             (age discount against a policy window)
```

Each factor carries a `rationale`; `limitations` surface what was not captured
(e.g., "no browser evidence", "execution replay not guaranteed — repository
state not pinned").

## 9. Capability 6 — Human-Reviewed Visual Baselines

Visual comparison explicitly supports three states:

```text
No baseline    → candidate generated → human review required
Approved       → comparison performed → pass/fail/needs-review
Rejected       → candidate retained as evidence → not promoted
```

Baseline approval is a **governance action**, never something an agent silently
performs. This is slice 2; the state model and governance boundary are defined
now, the browser capture is implemented later.

## 10. Sequencing

```text
PCS-026 Spec
    ↓
Evidence domain contracts
    ↓
Existing store adapters
    ↓
Verifier integration
    ↓
Filesystem/diff collector
    ↓
Command/test collector
    ↓
Browser/screenshot collector    (slice 2)
    ↓
Visual comparison               (slice 2)
    ↓
Bundle replay
    ↓
Confidence engine
    ↓
Workspace evidence viewer
```

**Slice 1 (this milestone)** — vertical slice before browser automation:

```text
Harness Verifier
      │
      ▼
EvidencePipeline
      │
      ├── existing verification checks
      ├── change.* projection
      └── command/test evidence
      │
      ▼
ContentAddressedEvidenceStore
      │
      ▼
ImmutableEvidenceManifestStore
      │
      ▼
VerificationEvidenceBundle
```

**Slice 2 (next)** — browser/screenshot leg: browser lifecycle, viewport
matrices, timing stability, animation suppression, masking, baseline
governance, and visual-diff tolerances.

### Slice 1 Delivery Record (2026-08-03)

- `packages/evidence/` — `EvidencePipeline`, slice-1 collectors (`CommandEvidenceCollector`,
  `FilesystemChangeCollector`, `SourceDiffCollector`), `ConfidenceEngine`
  (six derived dimensions), and the PCS-026 contracts
  (`VerificationEvidenceBundle`, `EvidenceReference`, `EvidenceProvenance`,
  `VerificationCheckResult`, `EvidenceReplayDescriptor`, `VerificationConfidence`).
- The harness verifier in the API composition root now builds + persists a
  bundle after every verification (content-addressed artifacts + immutable
  manifest) and emits `harness.verification-bundle` with the bundle id and
  confidence.
- 6 evidence tests; `pnpm lint && pnpm build && pnpm test` green.

### Slice 2 Delivery Record (2026-08-03)

- `VisualComparisonEngine` (pngjs pixel diff with per-channel tolerance and diff
  ratio/mask) and `BaselineStore` (governance: candidates recorded, only
  `approve`/`reject` promote — never a collector).
- `VisualEvidenceCollector` captures a screenshot through an injected
  `ScreenshotSource` (browser adapter such as Playwright), content-addresses it,
  and compares against the approved baseline → `pass`/`fail`/`needs-review`.
- 7 visual tests. Browser adapter provisioning (Playwright in the API) and the
  Workspace evidence viewer remain the integration follow-ups.

## 11. Acceptance Criteria (Slice 1)

- A harness verification run produces a `VerificationEvidenceBundle` persisted
  through the content-addressed + manifest stores, with:
  - every `EvidenceReference` resolving to a stored content-addressed artifact;
  - checks mirroring the `HarnessVerificationResult.checks` with evidence refs;
  - provenance on every reference (producer, execution, operation, hash);
  - a confidence value derived from the six dimensions (not agent-assigned);
  - an artifact-replay descriptor that references only stored bytes.
- Command/test and filesystem/source-diff collectors produce normalizable
  evidence items.
- `pnpm lint && pnpm build && pnpm test` green; source-artifacts check clean.

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Detached evidence summaries | content-addressing + provenance on every reference |
| Confidence as assertion | derived six-factor scoring with rationale + limitations |
| Overclaimed execution replay | replay descriptor lists exactly which requirements are captured |
| Baseline mutation by agents | baseline approval is a governance action (human only) |
| Slice-2 scope creep (browser) | browser/screenshot/visual deferred to slice 2 |

---

*End of blueprint. All slice-1 components are additive to the existing runtime;
the harness, verification, event-store, and change.* projection invariants are
unchanged.*
