---
title: VER-GOV-001 — Governed Verification Execution & Participant Activity
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-19
next-review: 2026-10-19
---

# VER-GOV-001 — Governed Verification Execution & Participant Activity

**Status:** Proposed — planning only; no implementation authorized by this document.

**Sequence:** Next formal milestone after the current Activity Room work. The governance substrate must precede any Activity Room status UI for build, test, or verification.

## Objective

Establish a Vestara-owned, globally governed execution lane for build, test, and verification operations with single-flight execution, queue awareness, agent-visible state, duration estimation, evidence reuse, recovery, and authoritative participant activity projected into Activity Room.

The milestone establishes two invariants:

> Development may proceed concurrently. Governed build, test, and verification operations execute with controlled concurrency, defaulting to one active operation at a time.

> Agents report intent; runtimes report execution; Activity Room reports the projection.

## Frozen architectural boundaries

- `VerificationCoordinator` is the authority for governed verification execution.
- The initial local policy is `verification.maxConcurrent = 1`; concurrency is policy, not an architectural constant.
- Activity Room is a read/projection and interaction surface. It does not own verification state, spawn processes, schedule operations, or infer execution from agent prose.
- Presence remains independent from activity: `online | offline | disconnected` is not combined with `working | waiting | building | testing | verifying`.
- `BUILDING`, `TESTING`, and `VERIFYING` are valid only when an authoritative operation is `RUNNING` with the matching kind.
- Every operation retains requester, participant, task, workflow, execution, source revision, profile, command, result, and evidence lineage.
- Unknown or insufficient telemetry must remain explicitly unknown; ETA and execution provenance must not be fabricated.

## Canonical participant activity

```text
WORKING
├── planning · analyzing · reading · researching · updating
├── editing · documenting · reviewing · other normal task execution

WAITING
├── verification lane occupied · dependency · approval
├── another agent · tool/runtime · queued operation

BUILDING  ─ authoritative build operation is running
TESTING   ─ authoritative test operation is running
VERIFYING ─ authoritative verification operation is running
```

The canonical participant contract separates major status from detail and lineage:

```ts
interface ParticipantActivity {
  status: 'working' | 'waiting' | 'building' | 'testing' | 'verifying';
  detail?: ParticipantActivityDetail;
  taskId?: TaskId;
  workflowId?: WorkflowId;
  executionId?: OperationId;
  verificationOperationId?: VerificationOperationId;
  startedAt: number;
}
```

## Verification operation contract

The domain contract introduced before runtime implementation is `VerificationOperation`.

```ts
type VerificationOperationKind =
  | 'build'
  | 'test'
  | 'verify'
  | 'typecheck'
  | 'lint'
  | 'visual-regression';
```

Lifecycle:

```text
REQUESTED → QUEUED → ACQUIRING → RUNNING
                                      ├── SUCCEEDED
                                      ├── FAILED
                                      ├── CANCELLING → CANCELLED
                                      └── TIMED_OUT
```

The operation identity includes `operationId`, kind, lifecycle status, requester principal, participant/agent, task/workflow/execution lineage, source revision, verification profile, command identity, request/queue/start/completion timestamps, estimate, result, and evidence references.

## Delivery sequence

Implementation is gated in the following order. Each phase must be evidenced before the next phase is authorized.

| Phase | Deliverable | Gate |
|---|---|---|
| **VER-GOV-001A** | Execution ownership audit; zero mutation | Every build/test/typecheck/lint/verify/visual/package/workspace path is mapped with requester, spawn authority, owner, state, persistence, events, result, evidence, cancellation, timeout, and bypass risk |
| **VER-GOV-001B** | Canonical verification contracts | Operation kinds, lifecycle, lineage, result, evidence, and policy contracts compile without runtime behavior changes |
| **VER-GOV-001C** | `VerificationCoordinator` | Request, queue, acquire, execute, observe, cancel, complete, fail, timeout, and recover have one authoritative path |
| **VER-GOV-001D** | Lease and queue governance | Global lease, identity-bearing queue entries, owner/task visibility, queue position, and deterministic progression work under contention |
| **VER-GOV-001E** | Single-flight/coalescing | Equivalent requests for the same repository/source/profile/scope share one active operation and result |
| **VER-GOV-001F** | Evidence reuse | Valid source/profile-matched evidence is reused before queueing; invalid or stale evidence cannot satisfy a request |
| **VER-GOV-001G** | Execution telemetry | Queue, execution, and total durations plus result, exit code, source, profile, runtime, and applicable scope are persisted |
| **VER-GOV-001H** | Historical duration estimator | ETA is based on comparable observations and exposes confidence or insufficient history without false precision |
| **VER-GOV-001I** | Participant activity authority | `working`, `waiting`, `building`, `testing`, and `verifying` are canonical; execution states derive only from authoritative operations |
| **VER-GOV-001J** | Agent execution awareness | Governed context exposes lane state, active owner/task, elapsed/ETA, queue depth, request identity, and queue position |
| **VER-GOV-001K** | Activity Room participant projection | Participant state is projection-only, with primary status and secondary detail/lineage presentation |
| **VER-GOV-001L** | Verification lane projection | Activity Room exposes active operation, queue, recent operations, logs, evidence, and duration history without becoming an owner |
| **VER-GOV-001M** | Recovery and stale-lease reconciliation | Restart reconciles live, dead, completed, and orphaned processes; no operation remains falsely `RUNNING` |
| **VER-GOV-001N** | Cancellation/failure semantics | Failed, cancelled, timed-out, crashed, disappeared, and manually cancelled operations release the lane deterministically |
| **VER-GOV-001O** | Policy enforcement | All bypass paths found in 001A are closed so governed execution is authoritative rather than advisory |
| **VER-GOV-001P** | Dogfood, evidence, and freeze | Contention, coalescing, reuse, ETA, failure, cancellation, timeout, process kill, restart, queue progression, and projection agreement are evidenced |

## Required dogfood scenario

```text
Developer A → build
Developer B → test
Reviewer    → verify V3
Developer C → build same source
```

Expected:

```text
ACTIVE
build — Developer A

COALESCED
Developer C → existing build

QUEUE
#1 test — Developer B
#2 verify V3 — Reviewer
```

Activity Room must simultaneously project Developer A as `Building`, Developer B and Reviewer as `Waiting` with explicit reasons, and Developer C as subscribed to the active operation rather than as a second builder.

## Acceptance gates

- Only `VerificationCoordinator` owns governed build/test/verify execution.
- Default local concurrency is exactly one while development remains concurrent.
- Occupied-lane requests are queued or coalesced, with observable identity and position.
- Active owner, task, operation, execution lineage, and explicit waiting reason are observable.
- Canonical activity is `working`, `waiting`, `building`, `testing`, or `verifying`; execution-specific states derive from authoritative runtime state.
- Activity Room owns no authoritative participant or verification state.
- Telemetry is persisted; ETA uses historical observations and exposes uncertainty.
- Identical active work is single-flighted; valid completed evidence is reusable by source/profile.
- Failed, cancelled, timed-out, crashed, and stale operations release or reconcile the lane.
- Agent awareness, participant projection, and verification-lane projection agree with runtime state.
- Tests cover contention, queueing, coalescing, evidence reuse, cancellation, timeout, failure, process loss, and restart recovery.
- Dogfood evidence demonstrates the complete lifecycle before freeze.

## Non-goals and sequencing rule

This milestone does not begin by adding simulated `Building`, `Testing`, or `Verifying` badges to Activity Room. It does not authorize UI-only status stores, direct shell spawning from agents, or a second execution dispatcher. The first authorized work is **VER-GOV-001A — Execution Ownership Audit**, and it is strictly zero mutation.

## Planned artifacts

- This milestone plan.
- `docs/architecture/VER-GOV-001A-EXECUTION-OWNERSHIP-AUDIT.md` — produced during the zero-mutation audit phase.
- Canonical verification contracts, coordinator design, evidence/recovery records, tests, and dogfood evidence — produced only after their respective phases are authorized.

## Dependencies

- Current Activity Room work and its projection-only boundary.
- Existing workflow, task, agent, runtime, evidence, and event ownership maps.
- Repository/source identity and execution lineage sufficient to define evidence validity.
- Roadmap governance requirement: PCS → UX → ATS and architecture review before implementation.
