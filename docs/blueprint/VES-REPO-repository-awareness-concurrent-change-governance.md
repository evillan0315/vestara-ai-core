---
title: VES-REPO — Repository Awareness & Concurrent Change Governance
version: 0.1.0
status: proposed
owner: vestara
last-reviewed: 2026-09-13
next-review: 2026-10-13
---

# VES-REPO — Repository Awareness & Concurrent Change Governance

**Author**: Vestara Director (foundational program, approved for blueprint)
**Date**: 2026-09-13
**Prerequisite**: VES-AUDIT-001 findings (Activity Room/OpenCode session-lifecycle gaps); existing Git adapters, Engineering Graph, workspace/project registry, OpenCode sessions, execution/workflow context, file tools, verification, event system, Activity Room, persistence
**Program**: Foundational — sits below Developer orchestration, Activity Room, Global Assistant, and any coding runtime. OpenCode is one runtime underneath this architecture, not its owner.

## 1. Problem

> **Vestara cannot safely coordinate multiple engineering sessions until it can distinguish repository truth, pre-existing changes, session-owned changes, overlapping authority, dependencies, and concurrent mutation.**

## 2. Objective

Build a canonical Repository Awareness capability that lets Vestara answer, at any moment:

```text
What repository is this?
What revision did work begin from?
What is currently different?
Who/what is currently working here?
What does each execution intend to change?
What actually changed during each execution?
What else changed concurrently?
Do two changes overlap?
Does one depend on another unstable change?
Who has mutation authority?
Is it safe to continue?
What verification is required afterward?
```

Target shape:

```text
                     VESTARA
                        │
              Repository Awareness
                        │
       ┌────────────────┼─────────────────┐
       │                │                 │
   Workflow A       Workflow B        Human Work
       │                │                 │
   Execution A      Execution B            │
       │                │                 │
 OpenCode A        OpenCode B            IDE
       │                │                 │
       └────────── Repository ────────────┘
                        │
                 Change Governance
                        │
          ALLOW / HOLD / CONFLICT
                        │
                   Verification
```

## 3. Governing invariants (frozen before implementation)

### REPO-INV-001 — Repository state is not session ownership

```text
git status
≠
changes made by current session
```

A dirty file existing before an execution cannot automatically be attributed to that execution.

### REPO-INV-002 — Session identity is not change identity

```text
OpenCodeSessionId
≠
ExecutionId
≠
ChangeSetId
```

They correlate through explicit lineage.

### REPO-INV-003 — Concurrent reasoning is allowed

Multiple agents may inspect, analyze, plan, review, or reason over the same repository concurrently.

### REPO-INV-004 — Concurrent mutation requires proven compatibility

> Concurrent mutation is permitted only when Vestara can establish non-conflicting change authority.

### REPO-INV-005 — UNKNOWN overlap does not grant mutation authority

```text
PROVEN SAFE       → may proceed
PROVEN CONFLICT   → block/hold
UNKNOWN           → hold mutation
```

Directly applies Vestara's existing UNKNOWN principle.

### REPO-INV-006 — File separation does not prove semantic separation

These can conflict:

```text
packages/conversation/types.ts
apps/api/conversation-adapter.ts
```

even though they are different files.

### REPO-INV-007 — Repository observation is not mutation authority

Being able to inspect Git does not confer permission to modify it.

### REPO-INV-008 — Baseline must precede attribution

Vestara cannot truthfully claim an execution introduced a change unless it has sufficient evidence establishing the relevant baseline/provenance.

### REPO-INV-009 — Verification operates on an identified repository state

A verification result must identify what state it actually verified.

### REPO-INV-010 — Human changes remain first-class

Changes made outside Vestara must never silently be attributed to an AI session.

### REPO-INV-011 — Runtime session termination does not imply repository rollback

Stopping OpenCode does not mean its filesystem effects disappeared.

### REPO-INV-012 — Git conflict is only one conflict class

No merge conflict does **not** mean two concurrent changes were compatible.

## 4. Canonical architecture

```text
┌──────────────────────────────────────────────┐
│                 WORKFLOWS                    │
└─────────────────────┬────────────────────────┘
                      │
                 Executions
                      │
            Mutation Intention
                      │
                      ▼
┌──────────────────────────────────────────────┐
│       REPOSITORY AWARENESS / GOVERNANCE      │
│                                              │
│ Repository Registry                         │
│ Repository State                            │
│ Baseline/Snapshot                           │
│ Change Scope                                │
│ Change Set                                  │
│ Active Work Registry                        │
│ Dependency/Impact Analysis                  │
│ Conflict Detection                         │
│ Mutation Coordination                      │
│ Verification Correlation                    │
└─────────────────────┬────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
       OpenCode     Human IDE    Future
       Runtime                  Runtime
```

Governance belongs to Vestara. Not `OpenCode → locks repository` but `Vestara → grants bounded mutation authority → OpenCode`.

## 5. Core domain model (design around; do not build all at once)

### 5.1 RepositoryIdentity

```ts
interface RepositoryIdentity {
  repositoryId: RepositoryId;
  root: RepositoryRoot;
  vcs: "git";
  remote?: RepositoryRemote;
}
```

Do not make the filesystem path itself the durable identity.

### 5.2 RepositoryState (observation, not attribution)

```ts
interface RepositoryState {
  repositoryId: RepositoryId;
  branch?: string;
  head?: CommitId;
  upstream?: { remote: string; branch: string; ahead: number; behind: number };
  workingTree: {
    clean: boolean;
    staged: ChangedPath[];
    unstaged: ChangedPath[];
    untracked: ChangedPath[];
  };
  observedAt: Timestamp;
}
```

### 5.3 RepositorySnapshot (bounded baseline at lifecycle boundaries)

```text
Execution requested → RepositorySnapshot S0 → Mutation authorized → Execution → RepositorySnapshot S1
```

```ts
interface RepositorySnapshot {
  snapshotId: RepositorySnapshotId;
  repositoryId: RepositoryId;
  head?: CommitId;
  branch?: string;
  changedPaths: PathState[];
  capturedAt: Timestamp;
  reason: "execution-start" | "verification-start" | "execution-end" | "manual";
}
```

Start with Git/file metadata sufficient for comparison. Do not initially copy the entire repository.

### 5.4 ChangeIntent (declared before mutation)

```ts
interface ChangeIntent {
  executionId: ExecutionId;
  repositoryId: RepositoryId;
  purpose: "Implement structured Read observation persistence";
  scopes: ["conversation-observation", "assistant-execution-projection", "conversation-persistence"];
  expectedPaths?: ["packages/conversation/**", "apps/api/**", "apps/workspace/src/components/assistant/**"];
  mutationKind: "source" | "configuration" | "schema" | "migration" | "generated" | "documentation";
}
```

Paths are hints/bounds. Semantic scopes matter more.

### 5.5 ChangeScope (hierarchical)

```text
Repository → Application → Package → Domain → Authority → Path
vestara-ai-core → conversation → {contract, persistence, projection}
vestara-ai-core → activity-room → {ingestion, M9, M10, M11}
```

Lets Vestara recognize `packages/conversation/src/...` vs `apps/api/src/assistant-execution-projection.ts` may still overlap semantically.

### 5.6 RepositoryChangeSet (observed, not overclaimed)

```ts
interface RepositoryChangeSet {
  changeSetId: ChangeSetId;
  repositoryId: RepositoryId;
  executionId?: ExecutionId;
  runtimeSessionId?: RuntimeSessionId;
  baselineSnapshotId: RepositorySnapshotId;
  files: FileChange[];
  declaredScope: ChangeScope[];
  observedScope: ChangeScope[];
  startedAt: Timestamp;
  observedAt: Timestamp;
  attribution: "vestara-execution" | "human" | "external" | "mixed" | "unknown";
}
```

### 5.7 ActiveWork registry

```text
Repository
├── Execution A (Developer, OpenCode session A, scope: conversation persistence, MUTATING)
├── Execution B (Reviewer, OpenCode session B, scope: conversation package, READ_ONLY)
└── Execution C (Developer, OpenCode session C, scope: Activity Room projection, WAITING)
```

Later surfaced in Activity Room.

### 5.8 Access modes

```text
OBSERVE, ANALYZE, VERIFY, MUTATE (later: GENERATE, MIGRATE, RELEASE)
```

Example: Reviewer A/B ANALYZE + Auditor OBSERVE + Developer MUTATE concurrently with no unnecessary blocking.

## 6. Conflict model (heart of the system)

* **C1 — Exact path collision:** `A → apps/api/src/foo.ts`, `B → apps/api/src/foo.ts`.
* **C2 — Directory/package overlap:** `A → packages/conversation/**` vs `B → packages/conversation/src/persistence/**`.
* **C3 — Contract conflict:** A changes `ToolObservation` contract, B changes its consumer (different files, semantic collision).
* **C4 — Dependency conflict:** A changes package X, B changes package Y, Y depends on X.
* **C5 — Schema/migration conflict:** treated strictly (`A → DB migration`, `B → persistence implementation`).
* **C6 — Generated artifact conflict:** A modifies source tokens, B modifies generated output.
* **C7 — Verification collision:** verifier starts at S5, developer mutates to S6 — result is STALE for S6, never silently PASS.
* **C8 — Branch/HEAD drift:** `HEAD = abc123` → `def456` mid-execution must be detected.
* **C9 — External/human mutation:** Eddie edits while MiMo works — detect `unexpected repository change`, never claim `MiMo caused it`.

## 7. Conflict decision (not Boolean locked)

```ts
type RepositoryCoordinationDecision =
  | { decision: "allow"; reason: string }
  | { decision: "hold"; conflicts: RepositoryConflict[] }
  | { decision: "deny"; conflicts: RepositoryConflict[] }
  | { decision: "unknown"; reason: string };
```

For mutation: `UNKNOWN → HOLD`.

## 8. Do not start with file locking

`.lock` / `session A owns src/foo.ts` creates illusion of safety without understanding contracts, dependencies, generated outputs, migrations, package ownership, verification drift. Awareness first, coordination afterward.

## 9. Milestone program

### VES-REPO-001 — Repository Awareness Baseline (audit only, no mutation)

Audit: Git adapters, repository discovery, Engineering Graph, workspace/project registry, OpenCode sessions, execution/workflow context, file tools, verification, Git status/diff tools, event system, Activity Room, persistence.
Deliver: Repository Awareness Capability Matrix, Existing Authority Map, Missing Data Map, Session/Execution/Repository lineage map, risk analysis, REUSE / ADAPT / CREATE recommendations.

### VES-REPO-002 — Canonical Repository Contracts

Leaf concepts: `RepositoryId/Identity/State/SnapshotId/Snapshot`, `ChangeScope/Intent`, `ChangeSetId/RepositoryChangeSet`, `RepositoryAccessMode/Conflict/CoordinationDecision`. No Git, no OpenCode, no UI. Layer-zero/leaf if possible.

### VES-REPO-003 — Repository Discovery Adapter (read-only)

Find root, identify Git repo, branch, HEAD, remote, working-tree status, upstream. Establishes repository truth.

### VES-REPO-004 — Snapshot Runtime

`capture()` / `compare(A, B)` over HEAD, branch, status, path fingerprints, timestamps. No full file contents initially.

### VES-REPO-005 — Execution Repository Context

Every repository-bound execution gets `repositoryId`, `baselineSnapshotId`, `accessMode`, `changeIntent`. Vestara now knows what repository an execution operates against.

### VES-REPO-006 — Runtime Session Correlation

`WorkflowRun → Execution → RepositoryContext → OpenCode Session`. OpenCode is not the authority; store lineage. Addresses the VES-AUDIT-001 Activity Room session-lifecycle gap.

### VES-REPO-007 — Change Detection

At execution boundaries: `Baseline S0 → execution → Snapshot S1 → Diff → Observed ChangeSet` (`added/modified/deleted/renamed/untracked`). No overclaimed attribution.

### VES-REPO-008 — Change Attribution

Correlate tool operations, execution, runtime session, observations, timestamps, baseline (e.g. `operationId op123 → packages/conversation/src/index.ts → exec456 → ses789`). Levels: `PROVEN / CORRELATED / AMBIGUOUS / UNKNOWN`.

### VES-REPO-009 — Active Repository Work Registry

Track `registered/waiting/active/verifying/completed/failed/cancelled` per `executionId/repositoryId/actorId/runtimeSessionId/accessMode/changeIntent`. Foundation for multi-session awareness.

### VES-REPO-010 — Conflict Detection v1 (conservative)

Only provable conflicts: same repository, same path, parent/child overlap, declared scope overlap, dirty-baseline, HEAD drift, verification drift. No premature semantic claims.

### VES-REPO-011 — Dependency-Aware Conflict Detection

Integrate Engineering Graph / package dependencies (e.g. `@vestara/conversation → apps/api → apps/workspace`). `DEPENDENCY_OVERLAP` means coordination required, not automatic deny.

### VES-REPO-012 — Mutation Coordination

`requestMutationAuthority({ executionId, repositoryId, changeIntent })` over active work + intent + state + dependency graph + governance → `ALLOW / HOLD / DENY` (e.g. HOLD: “E17 modifies conversation contract your target depends on”).

### VES-REPO-013 — Mutation Lease (not permanent lock)

`MutationLease { leaseId, executionId, repositoryId, scopes, issuedAt, expiresAt, status }`. AI sessions crash; leases allow recovery.

### VES-REPO-014 — Verification Binding

`Verification { snapshotId, head, changeSetIds, tests, result, evidence }`. State change mid-verification → `VERIFICATION STALE`, never PASS for the new state. Strengthens “Completion ≠ Verification”.

### VES-REPO-015 — Activity Room Projection (after runtime works)

Show repository (`vestara-ai-core main · 95f8acc`), active work (MiMo/Developer MUTATING GA-TOOL-UX-001B, 6 files, 14m; Reviewer ANALYZING read-only, 3m), session lineage (`Workflow → Execution → OpenCode session → Read/Edit/Bash/Verify`), and conflicts (“Developer B waiting: conversation contract held by Developer A”).

### VES-REPO-016 — Global Assistant Awareness

Bounded repository context answers “Why is MiMo waiting?” from coordination evidence (“E42 holds: E38 has mutation authority over the conversation contract”), never guesses.

### VES-REPO-017 — Human/External Change Detection

Report `External repository mutation observed (apps/api/src/foo.ts, Attribution: UNKNOWN)` without guessing Human vs Git vs automation.

### VES-REPO-018 — Crash/Restart Recovery

Reconcile `lease A exists, session A gone, repository dirty` → `Execution interrupted; unverified changes; lease expired; recovery required`.

### VES-REPO-019 — Multi-Session Dogfood

A: two read-only analyzes → PASS. B: unrelated UI mutations → ALLOW if proven independent. C: contract vs persistence mutation → HOLD unless coordinated. D: mutation + reviewer inspection → ALLOW. E: mutate-during-verify → STALE. F: MiMo + Eddie manual edit in same scope → detect external change → HOLD/reconcile.

### VES-REPO-020 — Evidence & Freeze

Freeze after dogfood proves: concurrent reads, independent concurrent mutation, exact collision blocked, semantic collision detected, dirty baseline preserved, pre-existing/human changes unattributed to session, HEAD + verification drift detected, lease recovery, execution→session→change lineage, Activity Room projection, Assistant explanation.

## 10. Non-goals

Not a Git/GitHub replacement, distributed source control, filesystem transaction engine, AI merge engine, auto-conflict resolver, branch-per-agent architecture, or full semantic analyzer. First goal: **know enough about repository state and active work to stop Vestara agents unknowingly damaging each other's work.**

## 11. Branching / worktrees position

Do not start with branches-per-agent (moves rather than solves conflicts). Git worktrees are a later `VES-REPO-WORKTREE` isolation strategy under coordination: isolation ≠ compatibility.

## 12. Connections

* **Engineering Graph:** `file → package → contract → service → application → tests`; `ChangeIntent → Impact Resolver → Affected Graph → Conflict Detector`.
* **Declarative Application platform:** `ApplicationDefinition → DevelopmentPlan → Tasks → Executions → ChangeIntents → Repository Coordinator → Mutation → ChangeSets → Verification → Evidence` — safe multi-task spawning.
* **OpenCode session lifecycle (VES-AUDIT-001):** `WorkflowRun → Execution → Repository Context → Mutation Lease → OpenCode Session → Operations → ChangeSet → Verification → Evidence`.
* **Browser development:** `Browser observation → findings → bounded change intent → repository check → governance approval → Developer/OpenCode session → tracked ChangeSet → after screenshot → tests + visual evidence`.

## 13. Implementation gates

```text
PHASE I — UNDERSTAND: VES-REPO-001 (audit) → FREEZE
PHASE II — OBSERVE: VES-REPO-002 → 008 (contracts, discovery, snapshots, execution context, session correlation, detection, attribution) → DOGFOOD
PHASE III — COORDINATE: VES-REPO-009 → 014 (active work, conflicts, dependencies, coordination, leases, verification binding) → DOGFOOD
PHASE IV — EXPERIENCE: VES-REPO-015 → 020 (Activity Room, Assistant, external changes, recovery, multi-session testing, freeze)
```

Immediate next move: only `VES-REPO-001 — Repository Awareness Baseline Audit` (no mutation). Reuse/adapt existing infrastructure where authoritative.

## 14. Enduring rule (near core execution/governance contracts)

> **Many actors may observe and reason concurrently. Mutation requires explicit repository context, a known baseline, declared change scope, and governed authority. Concurrent mutation is permitted only when compatibility is established. Unknown overlap holds mutation. Every resulting change remains attributable, verifiable, and recoverable.**
