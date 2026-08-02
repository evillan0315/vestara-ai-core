# PCS-027 — Distributed Worker Cluster

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-027 |
| Name | Distributed Worker Cluster |
| Status | Design — slices 1-2 implemented (contracts, store, node runtime, remote dispatcher, registry, scheduler, leases, idempotency, WebSocket transport, orchestrator integration, Workspace workers view); multi-node hardening + gRPC/K8s transports future |
| Owner | Chief Architect |
| Prerequisite | PCS-025 Multi-Agent Project Management (worker contract, capability assignment), PCS-026 Engineering Evidence Pipeline (executor + evidence), ADR-118 |
| Scope | Physical distribution of task execution: worker nodes register and run tasks over a transport; the orchestrator schedules, load-balances, and recovers across the cluster |

> **Canonical reference**: the worker boundary already exists —
> `TaskDispatcher` (the transport abstraction), `WorkerPool` + `runWithConcurrency`
> (scheduling), `SubprocessTaskDispatcher` + `VESTARA_WORKER_EXECUTOR` (isolated
> execution + pluggable executor) in `packages/workflow-orchestrator/`. PCS-027
> makes that boundary **physical**: a worker node (another laptop, server, VM, or
> Kubernetes pod) executes a task's executor remotely, and the orchestrator treats
> the cluster as a pool.

## 1. Context and Goals

PCS-025 established that execution no longer depends on in-process calls: a
task is dispatched through a `TaskDispatcher` that a `WorkerPool` schedules, and
`SubprocessTaskDispatcher` proved the isolation boundary. What is missing is the
**distributed** leg: workers that live on other machines and execute the same
executor contract over a network transport.

PCS-027 delivers:

- a **remote worker** that implements `TaskDispatcher` over a transport
  (WebSocket, matching the existing API gateway);
- **worker registration** with capability announcements;
- **liveness** via heartbeats;
- **scheduling** that routes a task to a node whose capabilities satisfy it,
  load-balancing across the cluster;
- **failure recovery** — node loss re-leases and re-dispatches tasks
  idempotently (executionId) within the existing bounded retry policy.

The orchestrator, evidence pipeline, approval gateway, and projections stay
unchanged. Only the worker endpoint of the `TaskDispatcher` contract changes.

## 2. Architecture

```text
WorkflowOrchestrator
      │
      ▼
WorkerPool ───────────────────────────────┐
      │                                   │
      ├── TaskDispatcher (in-process)      │
      └── RemoteWorkerDispatcher ─────────┤
                │                          │
          WebSocket / gRPC                 │
                │                          │
          Worker Node ─────────────────────┤
                │                          │
            Executor (VESTARA_WORKER_EXECUTOR)  ◄── PCS-026 executor contract
                │                          │
                ▼                          │
         Evidence → PCS-026 bundle  ◄──────┘
```

Conceptually the earlier `TaskDispatcher → IPC → Worker` diagram becomes
`TaskDispatcher → WebSocket → Worker Node`, and the orchestrator stays untouched.

## 3. Core Contracts

```ts
export interface WorkerNode {
  readonly id: string;                 // node id (registered)
  readonly hostname: string;
  readonly status: 'online' | 'offline' | 'draining' | 'unknown';
  readonly executors: readonly string[];   // executor names it can run
  readonly capabilities: readonly string[]; // task capabilities it satisfies
  readonly resources?: { readonly cpu: number; readonly memoryMb: number };
  readonly lastHeartbeatAt: string;
  readonly registeredAt: string;
}

export interface WorkerHeartbeat {
  readonly nodeId: string;
  readonly at: string;
  readonly status: 'ok' | 'draining' | 'overloaded';
  readonly load: number;               // 0..1 (running / capacity)
}

export interface TaskLease {
  readonly leaseId: string;
  readonly executionId: string;
  readonly nodeId: string;
  readonly task: WorkflowTask;
  readonly expiresAt: string;
}

// The remote worker satisfies the existing TaskDispatcher contract.
// dispatch/review/test map to transport request/response messages.
```

The **remote worker is a `TaskDispatcher`** — nothing in the orchestrator
changes. `WorkerPool` selects among registered workers by capability + load.

## 4. Capability 1 — Worker Registration

A node connects to the orchestrator's worker endpoint and announces:

- its identity (id, hostname, version);
- the **executors** it can run (names resolvable to
  `VESTARA_WORKER_EXECUTOR` modules on the node);
- the **task capabilities** it satisfies (fed through the same
  `DefaultCapabilityResolver` used for assignment in PCS-025).

Registration is durable (`WorkerStore`), so the cluster roster survives
orchestrator restarts. A node may re-register (idempotent by node id).

## 5. Capability 2 — Heartbeats and Liveness

Nodes emit periodic heartbeats (load + status). The orchestrator:

- refreshes `lastHeartbeatAt` and `load`;
- marks a node **offline** when its heartbeat lapses past a TTL (default ~3× the
  heartbeat interval);
- routes around offline/unknown nodes;
- emits `worker.registered` / `worker.heartbeat` / `worker.offline` events into
  the engineering event store.

## 6. Capability 3 — Scheduling

`WorkerPool` schedules a task to the best node:

1. **Capability match** — the node must satisfy `task.requiredCapabilities`
   (via `DefaultCapabilityResolver`), unless the node advertises an executor for
   the task's role.
2. **Least load** — among candidates, pick the lowest `load`.
3. **Lease** — the task is leased to the node with an expiry; the lease is
   recorded so recovery can re-lease it.

Scheduling is bounded by `runWithConcurrency` (the existing pool cap).

## 7. Capability 4 — Failure Recovery

- **Node loss mid-task**: the lease expires → the task transitions
  `assigned → retrying` (existing task machine) and is re-dispatched to another
  candidate node, within the existing `RetryPolicy.maxAttempts`.
- **Idempotency**: every dispatch carries the immutable `executionId`. A node
  that already ran the task returns its cached result for that `executionId`
  instead of re-executing — no duplicate side effects.
- **Orchestrator restart**: registered nodes + leases are re-read from
  `WorkerStore`; in-flight leases are reconciled by heartbeat.

## 8. Capability 5 — Evidence and Telemetry

A remote node's executor returns results and **evidence** (PCS-026
`EvidenceItem`-shaped output); the orchestrator runs the `EvidencePipeline` on
results regardless of where the task ran, so remote bundles are
indistinguishable from local ones. Worker telemetry (dispatch latency, node
load) flows through `onTelemetry`.

## 9. Security

- **Transport auth**: the worker endpoint requires a shared token (WS
  subprotocol/header), matching the existing auth model.
- **Secrets**: secrets never ship to a node as plaintext. Executors receive a
  **secret reference** (a key the node can resolve locally or via a configured
  vault); the task payload carries no credentials.
- **Environment metadata**: nodes advertise capabilities, not credentials.

## 10. Sequencing

```text
PCS-027 Spec
    ↓
Worker contracts + WorkerStore (nodes, leases, heartbeats)
    ↓
RemoteWorkerDispatcher (WebSocket transport, TaskDispatcher contract)
    ↓
Worker node runtime (executor adapter over VESTARA_WORKER_EXECUTOR)
    ↓
Registration + heartbeat loop
    ↓
Scheduler (capability match + least-load) into WorkerPool
    ↓
Lease + idempotent failure recovery (executionId, RetryPolicy)
    ↓
Evidence pipeline on remote results
    ↓
Workspace worker cluster view (optional)
```

**Slice 1** — vertical slice before multi-node hardening:

```text
WorkerStore (nodes + leases)
    ↓
RemoteWorkerDispatcher (WS client/server implementing TaskDispatcher)
    ↓
Registration + heartbeats
    ↓
Capability + load scheduling in WorkerPool
    ↓
Lease expiry → idempotent re-dispatch
    ↓
Evidence pipeline on remote results
```

## 11. Acceptance Criteria (Slice 1)

- A `RemoteWorkerDispatcher` implements `TaskDispatcher`; dispatching a task to
  a connected worker node executes the node's executor and returns a result.
- Capability-based scheduling routes a task to a node that satisfies its
  required capabilities; least-load breaks ties.
- A node that stops heartbeating is marked offline and excluded from
  scheduling.
- Node loss mid-task re-leases and re-dispatches within
  `RetryPolicy.maxAttempts`; the same `executionId` is never executed twice on
  the same node (cached-result idempotency).
- Remote results flow through the PCS-026 `EvidencePipeline` into a bundle.
- `worker.*` events project into the engineering event store.
- `pnpm lint && pnpm build && pnpm test` green; source-artifacts check clean.

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Duplicate execution on re-lease | lease + `executionId` idempotency (cached results) |
| Secrets leaking to nodes | secret references, never plaintext task credentials |
| Network partition | heartbeat TTL → offline → reroute |
| Scheduling staleness | capability/load TTL refreshed per heartbeat |
| Node heterogeneity | capability announcements + capability resolver |
| Scope creep (gRPC/K8s) | WebSocket first; gRPC/K8s as alternative transports behind the same contract |

### Slice 1 Delivery Record (2026-08-03)

- `packages/workflow-orchestrator/src/distributed/` — worker contracts
  (`WorkerNode`, `WorkerHeartbeat`, `TaskLease`, `WorkerRequest`/`Response`,
  `WorkerTransport`, `WorkerExecutor`), `WorkerStore` (nodes + leases, sql.js),
  `WorkerNodeRuntime` (pluggable executor + executionId result cache),
  `RemoteWorkerDispatcher` (a `TaskDispatcher` over a transport),
  `WorkerRegistry` (registration + heartbeats + reap), `WorkerScheduler`
  (capability match + least-load), `WorkerCluster` (schedule → lease →
  dispatch → release), and `MemoryWorkerTransport` (in-memory pairing).
- 7 cluster tests (registration/reap, capability routing, least-load,
  remote dispatch, executionId idempotency, review/test over the cluster, no-
  online-node). A WebSocket transport and orchestrator integration are the
  follow-ons.

### Slice 2 Delivery Record (2026-08-03)

- `WorkerSocketServer` (API, `/ws/worker`) + `WorkerSocketClient` (node side) +
  `worker-node-bootstrap` (node process loading `VESTARA_WORKER_EXECUTOR`) —
  a real WebSocket transport behind the `WorkerTransport` contract.
- Orchestrator integration: `WorkerCluster` wired in the API, `worker.*` events
  projected into the engineering event store, `/api/workers/nodes|leases|dispatch`,
  and the Workspace **Workers** page.
- 4 WS round-trip tests (register, dispatch, executionId idempotency,
  unknown-node rejection). Multi-node hardening and gRPC/K8s transports remain
  future.

---

*End of blueprint. All slice-1 components are additive to the existing runtime;
the orchestrator, task machine, evidence pipeline, and projection invariants are
unchanged. Only the worker endpoint of the `TaskDispatcher` contract changes.*
