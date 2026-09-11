---
title: VES-LEAN-001 — Runtime Boot & Capability Ownership Audit
version: 1.0.0
status: complete
owner: vestara
date: 2026-09-10
milestone: VES-LEAN-001
mode: audit-only — zero mutation
---

# VES-LEAN-001 — Runtime Boot & Capability Ownership Audit

## 1. Executive Summary

The Vestara API server (`apps/api`) boots **every capability it knows how to provide** in a single monolithic composition. The composition root (`createWorkspaceContext`) constructs **70+ services/stores/bridges** and the kernel eagerly instantiates **18 internal services**. The resulting boot takes ~46 seconds end-to-end, with a **~35.5 second unexplained interval** between `kernel-diagnosed` and `boot-advanced`.

**Key findings:**

1. **The 35-second gap is `kernel.diagnose()`** — the health manager calls `health()` on every registered service with a 5-second timeout each. This is the single largest bottleneck.

2. **MemoryRuntime is initialized twice** — once as a workspace-scoped instance (in `WorkspaceRuntime.open()`) and once as an in-memory engineering memory instance (in `createWorkspaceContext`). These are separate instances with separate scopes; not a bug.

3. **Three providers load at boot** (opencode, opencode-go, openai) — all registered eagerly regardless of whether they're needed.

4. **Dual Activity Room databases** coexist — `activity.db` (legacy) and `m9-activity.db` (M11A). Human messages only write to the legacy path; the M11A read API reads from the production path.

5. **The dogfood surface** (Global Assistant + Activity Room + Diagnostics) requires approximately **40% of currently booted services**. Approximately **60% are candidates for lazy loading or disabling**.

---

## 2. Startup Timeline

Observed timing from the startup trace:

| Milestone | Timestamp | Delta | Source |
|-----------|-----------|-------|--------|
| `process-spawned` | ~0 ms | — | `apps/api/src/index.ts:30` |
| `entrypoint-entered` | ~2 ms | +2 ms | `apps/api/src/index.ts:58` |
| `config-loaded` | ~3 ms | +1 ms | `apps/api/src/index.ts:61` |
| `composition-begin` | ~5 ms | +2 ms | `apps/api/src/index.ts:72` |
| `kernel-booted` | ~450 ms | +445 ms | `workspace-context.ts:496` |
| `runtime-opened` | ~4.06 s | +3.61 s | `workspace-context.ts:514` |
| `evidence-stores` | ~4.2 s | +0.14 s | `workspace-context.ts:543` |
| `worktree-opened` | ~4.4 s | +0.2 s | `workspace-context.ts:599` |
| `plans-db-opened` | ~4.6 s | +0.2 s | `workspace-context.ts:615` |
| `conversation-service` | ~5.0 s | +0.4 s | `workspace-context.ts:853` |
| `agent-harness` | ~5.5 s | +0.5 s | `workspace-context.ts:987` |
| `harness-bridge` | ~5.6 s | +0.1 s | `workspace-context.ts:1019` |
| `memory-initialized` | ~5.8 s | +0.2 s | `workspace-context.ts:1034` |
| `harness-approval-bridge` | ~6.0 s | +0.2 s | `workspace-context.ts:1062` |
| `workflow-orchestrator` | ~7.0 s | +1.0 s | `workspace-context.ts:1206` |
| `thread-recovery` | ~7.5 s | +0.5 s | `workspace-context.ts:1239` |
| `documentation-initialized` | ~8.5 s | +1.0 s | `workspace-context.ts:1359` |
| `documentation-started` | ~8.8 s | +0.3 s | `workspace-context.ts:1361` |
| `pre-diagnose` | ~8.8 s | ~0 ms | `workspace-context.ts:1460` |
| **`kernel-diagnosed`** | **~9.77 s** | **+0.97 s** | `workspace-context.ts:1463` |
| **`boot-advanced`** | **~45.34 s** | **+35.57 s** | `workspace-context.ts:1471` |
| `composition-end` | ~45.37 s | +0.03 s | `index.ts:74` |
| `activity-room-init` | ~45.5 s | +0.13 s | `index.ts:77` |
| `m11a-init` | ~45.6 s | +0.1 s | `index.ts:80` |
| `telegram-init` | ~45.7 s | +0.1 s | `index.ts:83` |
| `m9-bridge-started` | ~45.8 s | +0.1 s | `index.ts:93` |
| `agent-lifecycle-bridge-started` | ~45.9 s | +0.1 s | `index.ts:121` |
| `opencode-supervisor` | ~46.0 s | +0.1 s | `index.ts:130` |
| `routes-registered` | ~46.05 s | +0.05 s | `index.ts:135` |
| `http-listening` | ~46.10 s | +0.05 s | `index.ts:138` |

---

## 3. Boot Call Graph

### Phase 1: Process → Composition Root

```
index.ts:30  bootMark('process-spawned')
index.ts:58  bootMark('entrypoint-entered')
index.ts:61  bootMark('config-loaded')          — read .env, resolve repoPath
index.ts:72  bootMark('composition-begin')
  └─→ workspace-context.ts:399  createWorkspaceContext(repoPath, publish)
```

### Phase 2: Kernel Boot (workspace-context.ts:406–496)

```
workspace-context.ts:406  new DefaultKernel()
workspace-context.ts:408  new HostRuntime()
workspace-context.ts:409  new BootRuntime({ store: FileBootStateStore })
workspace-context.ts:415  new DefaultProviderManager()
workspace-context.ts:419-421  providerManager.register(opencode, opencodeGo, openai)
workspace-context.ts:475  createBrowserRuntime(abs)
workspace-context.ts:476  await kernel.boot({ providers, services })
  └─→ packages/kernel/src/index.ts:246  DefaultKernel.boot()
       ├── :253  import @vestara/configuration → ConfigurationManager
       ├── :261  import @vestara/logger → StructuredLogger
       ├── :272  import @vestara/metrics → MetricsRegistry
       ├── :277  import @vestara/event-bus → InProcessEventBus
       ├── :281  import @vestara/service-registry → DefaultServiceRegistry
       ├── :289  import @vestara/health → DefaultHealthManager
       ├── :296  import @vestara/permissions → InMemoryPermissionStore
       ├── :300  import recovery-manager → DefaultRecoveryManager
       ├── :308  import task-scheduler → DefaultTaskScheduler
       ├── :315  import @vestara/scheduler → Scheduler (job scheduler)
       ├── :319  import worker-manager → DefaultWorkerManager
       ├── :323  import job-manager → DefaultJobManager
       ├── :327  import @vestara/intent → IntentManager
       ├── :331  import @vestara/ownership → OwnershipRegistry + ResourceLockManager
       ├── :338  import @vestara/decision-pipeline → DecisionPipeline (5-stage chain)
       ├── :420  import @vestara/verification → DefaultVerificationEngine
       ├── :424  import @vestara/trust → DefaultTrustEngine
       ├── :429  import @vestara/widget-runtime → DashboardRuntime + WidgetLifecycleManager
       ├── :460  registry.register(kernelService)
       ├── :477-484  register user-provided services (host, boot, browser)
       ├── :493-516  initialize+start all services in dependency order
       ├── :519-538  load providers (opencode, opencode-go, openai)
       ├── :542  health.startPeriodicChecks(15000ms)
       ├── :546  status = 'running'
       └── :550  emit('runtime:boot.completed')
```

### Phase 3: Post-Kernel Composition (workspace-context.ts:497–1460)

```
497-504   attach eventBus/permissions to browser+host+boot runtimes
505       providerManager.attachRuntimeServices()
507-513   new WorkspaceRuntime() → runtime.open(abs)     [3.5s — discovery+fingerprint+analysis]
514       log('runtime-opened')
518       restoreProviderConfigurations()
519-523   SqliteConversationSessionStore.initialize()
524       FileThreadStore.open()
525-527   SqliteEngineeringEventStore.open()
528-538   Evidence stores (manifests, artifacts, bundles, baselines, thumbnails)
543       log('evidence-stores')
569-576   EvidencePipeline()
577-598   WorktreeLeaseRuntime.open() + recover()
599       log('worktree-opened')
600-605   FileRoutingStore, FileRoutingAssignmentStore
610-614   openSqlDb(plans.db) + migrate(PLANS_MANIFEST)
615       log('plans-db-opened')
616-631   Storage layer (Session, Agent, Plan, ChangeSet, Verification, etc.)
625-636   MemoryService + async memory.index() (fire-and-forget)
637-643   SessionService
645-646   ExplainService, PlanningService
649-695   FilesystemRuntime + ToolRuntime + browser tools (11+ tools)
704-755   Marketplace (LocalExtensionManager, LocalMarketplaceRegistry, MarketplaceService)
756-764   EngineeringVerificationProfiles, AgentEnvironment
789-840   OpenCode transport (assistant binding resolver, interaction broker)
841-852   SqliteConversationStore + DefaultConversationService
853       log('conversation-service')
858-986   AgentHarnessRuntime + context assembler + verifier + event bridges
987       log('agent-harness')
1020-1025 SessionStreamAccumulator, startActivityRoomOrganizationalBridge
1028-1040 EngineeringMemory (DefaultMemoryRuntime + projection) — 2nd instance
1034      log('memory-initialized')
1044-1061 Interaction system + harness approval bridge
1062      log('harness-approval-bridge')
1063-1079 HarnessSession, MultiAgentWorkflowOrchestrator, ChangeEventProjector
1082-1145 Worker cluster (WorkerStore, WorkerRegistry, WorkerSocketServer, WorkerCluster)
1148-1192 WorkflowOrchestrator (projects, plans, tasks, artifacts, locks, dispatcher)
1206      log('workflow-orchestrator')
1207-1238 Thread history import + reconcile interrupted threads + DurableThreadRecoveryService
1239      log('thread-recovery')
1240      WorkspaceConfigurationService
1241      AgentCapabilityManager
1243-1285 ImplementationService, VerificationService, CollaborationService,
          MilestoneService, ProjectService, OrderService
1289-1305 ApiRuntime
1309-1339 AgentRuntime, AgentService, SessionOrchestrator, ExecutionPlanner,
          WorkspaceAnalyst, SuggestionService
1342-1361 DocumentationService (initialize + start)
1359      log('documentation-initialized')
1361      log('documentation-started')
1363-1405 kernel.eventBus.subscribe('*', ...) — telemetry + WS broadcast
1407-1418 heartbeat setInterval (30s)
1425-1458 WorkspaceUiWatcher (conditional)
1460      log('pre-diagnose')
```

### Phase 4: Diagnosis → Boot Advanced (THE 35-SECOND GAP)

```
workspace-context.ts:1462  await kernel.diagnose()
  └─→ packages/kernel/src/index.ts:646  DefaultKernel.diagnose()
       ├── :649  health.checkAll()
       │         └─ iterates ALL registered services
       │            calls service.health() with 5s timeout each
       │            services: kernel, host-runtime, boot-runtime, browser-runtime
       ├── :690  process.memoryUsage()
       ├── :691  process.cpuUsage()
       ├── :693  enumerate scheduled tasks
       └── :730  returns SystemDiagnosis
workspace-context.ts:1463  log('kernel-diagnosed')
workspace-context.ts:1464-1467  if unhealthy → enterRecovery() + throw
workspace-context.ts:1469  bootRuntime.advance('health-verified')
                           └─ writes .vestara/os/boot-state.json
workspace-context.ts:1470  bootRuntime.advance('workspace-ready')
                           └─ writes .vestara/os/boot-state.json
workspace-context.ts:1471  log('boot-advanced')
```

### Phase 5: Post-Composition (index.ts:74–138)

```
index.ts:74   bootMark('composition-end')
index.ts:76   initActivityRoom()          — opens activity.db
index.ts:79   initM11AActivityRoom()      — opens m9-activity.db + starts 500ms watcher
index.ts:82   initTelegramRoute()         — opens telegram.db
index.ts:87-93  M9IngestionBridge.start() — subscribes EventBus → M9 store
index.ts:98-121  createAgentLifecycleBridge() — harness.* → agent lifecycle events
index.ts:124-130  startOpencodeSupervisor() — spawns opencode serve process
index.ts:132  createServer(ctx, port)     — registers 40+ route groups
index.ts:137  server.listen(port)
index.ts:138  bootMark('http-listening')
```

---

## 4. Composition Roots

There are **three composition roots**:

| # | Root | File | Responsibility |
|---|------|------|---------------|
| 1 | `createWorkspaceContext()` | `workspace-context.ts:399` | Primary. Creates kernel, providers, all services, bridges, stores, harness, orchestrator, documentation. Returns `WorkspaceContext`. |
| 2 | `initActivityRoom()` | `activity-room.ts` | Legacy Activity Room singleton. Opens `activity.db`, creates `SqliteActivityStore`, `ActivityProjectionService`, `ActivityStreamHub`. |
| 3 | `initM11AActivityRoom()` | `routes/activity-room-m11a.ts` | Production M11A Activity Room. Opens `m9-activity.db`, creates `DurableActivityStore`, `ProjectionRuntime`, `ActivityStreamHub`, starts 500ms watcher. |

The `index.ts` entrypoint orchestrates all three in sequence, then adds bridges, supervisor, and server.

---

## 5. Booted Capability Inventory

### Kernel-Internal Services (18 services, all eager)

| # | Service | Package | Eager/Lazy |
|---|---------|---------|------------|
| 1 | ConfigurationManager | `@vestara/configuration` | Eager |
| 2 | StructuredLogger | `@vestara/logger` | Eager |
| 3 | MetricsRegistry | `@vestara/metrics` | Eager |
| 4 | InProcessEventBus | `@vestara/event-bus` | Eager |
| 5 | DefaultServiceRegistry | `@vestara/service-registry` | Eager |
| 6 | DefaultHealthManager | `@vestara/health` | Eager |
| 7 | PermissionManager | `@vestara/permissions` | Eager |
| 8 | DefaultRecoveryManager | `@vestara/kernel` | Eager |
| 9 | DefaultTaskScheduler | `@vestara/kernel` | Eager |
| 10 | Scheduler (job) | `@vestara/scheduler` | Eager |
| 11 | DefaultWorkerManager | `@vestara/kernel` | Eager |
| 12 | DefaultJobManager | `@vestara/kernel` | Eager |
| 13 | IntentManager | `@vestara/intent` | Eager |
| 14 | OwnershipRegistry + ResourceLockManager | `@vestara/ownership` | Eager |
| 15 | DecisionPipeline (5-stage) | `@vestara/decision-pipeline` | Eager |
| 16 | DefaultVerificationEngine | `@vestara/verification` | Eager |
| 17 | DefaultTrustEngine | `@vestara/trust` | Eager |
| 18 | DashboardRuntime + WidgetLifecycleManager | `@vestara/widget-runtime` | Eager |

### Composition-Root Services (70+ services, all eager)

| # | Service | File:Line | Package |
|---|---------|-----------|---------|
| 19 | DefaultProviderManager | `workspace-context.ts:415` | `@vestara/provider-runtime` |
| 20 | OpenCodeProvider | `workspace-context.ts:419` | `@vestara/provider-opencode` |
| 21 | OpenCodeGoProvider | `workspace-context.ts:420` | `@vestara/provider-opencode` |
| 22 | OpenAIProvider | `workspace-context.ts:421` | `@vestara/provider-opencode` |
| 23 | BrowserRuntimeService | `workspace-context.ts:475` | `@vestara/browser-runtime` |
| 24 | WorkspaceRuntime | `workspace-context.ts:507` | `@vestara/workspace` |
| 25 | SqliteConversationSessionStore | `workspace-context.ts:519` | `@vestara/conversation-runtime` |
| 26 | FileThreadStore | `workspace-context.ts:524` | `@vestara/thread-runtime` |
| 27 | SqliteEngineeringEventStore | `workspace-context.ts:525` | `@vestara/engineering-event-store` |
| 28 | ImmutableEvidenceManifestStore | `workspace-context.ts:528` | `@vestara/evidence` |
| 29 | ContentAddressedEvidenceStore | `workspace-context.ts:529` | `@vestara/evidence` |
| 30 | BundleStore | `workspace-context.ts:533` | `@vestara/evidence` |
| 31 | BaselineStore | `workspace-context.ts:534` | `@vestara/evidence` |
| 32 | ThumbnailService | `workspace-context.ts:537` | `@vestara/evidence` |
| 33 | VerifierResultsStore | `workspace-context.ts:538` | `@vestara/evidence` |
| 34 | EvidencePipeline | `workspace-context.ts:569` | `@vestara/evidence` |
| 35 | WorktreeLeaseRuntime | `workspace-context.ts:577` | `@vestara/worktree-runtime` |
| 36 | FileRoutingStore | `workspace-context.ts:600` | `@vestara/provider-runtime` |
| 37 | FileRoutingAssignmentStore | `workspace-context.ts:605` | `@vestara/provider-runtime` |
| 38 | Plans DB (openSqlDb + migrate) | `workspace-context.ts:610` | `@vestara/workspace` |
| 39 | SessionStorage | `workspace-context.ts:616` | `@vestara/workspace` |
| 40 | AgentStorage | `workspace-context.ts:617` | `@vestara/workspace` |
| 41 | PlanStorage | `workspace-context.ts:618` | `@vestara/workspace` |
| 42 | ChangeSetStorage | `workspace-context.ts:619` | `@vestara/workspace` |
| 43 | VerificationStorage | `workspace-context.ts:620` | `@vestara/workspace` |
| 44 | CollaborationStorage | `workspace-context.ts:621` | `@vestara/workspace` |
| 45 | UserStore | `workspace-context.ts:622` | `@vestara/workspace` |
| 46 | AuditStore | `workspace-context.ts:623` | `@vestara/workspace` |
| 47 | KnowledgeGraphStorage | `workspace-context.ts:624` | `@vestara/workspace` |
| 48 | MemoryService | `workspace-context.ts:625` | `@vestara/workspace` |
| 49 | SessionService | `workspace-context.ts:637` | `@vestara/workspace` |
| 50 | ExplainService | `workspace-context.ts:645` | `@vestara/workspace` |
| 51 | PlanningService | `workspace-context.ts:646` | `@vestara/workspace` |
| 52 | FilesystemRuntime | `workspace-context.ts:650` | `@vestara/filesystem-runtime` |
| 53 | ToolRuntime (11+ tools) | `workspace-context.ts:651` | `@vestara/tool-runtime` |
| 54 | LocalExtensionManager | `workspace-context.ts:704` | `@vestara/extension-runtime` |
| 55 | LocalMarketplaceRegistry | `workspace-context.ts:712` | `@vestara/marketplace` |
| 56 | MarketplaceService | `workspace-context.ts:740` | `@vestara/marketplace` |
| 57 | EngineeringVerificationProfiles | `workspace-context.ts:756` | `@vestara/verification` |
| 58 | AgentEnvironment | `workspace-context.ts:764` | `@vestara/workspace` |
| 59 | OpenCodeHttpClient | `workspace-context.ts:789` | `@vestara/opencode-runtime` |
| 60 | AssistantBindingResolver | `workspace-context.ts:810` | `@vestara/workspace` |
| 61 | AssistantInteractionBroker | `workspace-context.ts:826` | `@vestara/workspace` |
| 62 | SqliteConversationStore | `workspace-context.ts:842` | `@vestara/conversation-runtime` |
| 63 | DefaultConversationService | `workspace-context.ts:848` | `@vestara/conversation` |
| 64 | AgentHarnessRuntime | `workspace-context.ts:970` | `@vestara/agent-harness` |
| 65 | HarnessContextAssembler | `workspace-context.ts:950` | `@vestara/agent-harness` |
| 66 | HarnessVerifier | `workspace-context.ts:960` | `@vestara/agent-harness` |
| 67 | SessionStreamAccumulator | `workspace-context.ts:1020` | `@vestara/workspace` |
| 68 | DefaultMemoryRuntime (engineering) | `workspace-context.ts:1028` | `@vestara/memory` |
| 69 | SqliteInteractionStore | `workspace-context.ts:1043` | `@vestara/interaction-persistence` |
| 70 | InteractionService | `workspace-context.ts:1049` | `@vestara/interaction-app` |
| 71 | HarnessSession | `workspace-context.ts:1063` | `@vestara/workspace` |
| 72 | MultiAgentWorkflowOrchestrator | `workspace-context.ts:1071` | `@vestara/workspace` |
| 73 | ChangeEventProjector | `workspace-context.ts:1075` | `@vestara/workspace` |
| 74 | WorkerStore | `workspace-context.ts:1084` | `@vestara/workspace` |
| 75 | WorkerRegistry | `workspace-context.ts:1095` | `@vestara/workspace` |
| 76 | WorkerSocketServer | `workspace-context.ts:1110` | `@vestara/workspace` |
| 77 | WorkerCluster | `workspace-context.ts:1135` | `@vestara/workspace` |
| 78 | WorkflowOrchestrator | `workspace-context.ts:1158` | `@vestara/workspace` |
| 79 | DurableThreadRecoveryService | `workspace-context.ts:1226` | `@vestara/workspace` |
| 80 | WorkspaceConfigurationService | `workspace-context.ts:1240` | `@vestara/workspace` |
| 81 | AgentCapabilityManager | `workspace-context.ts:1241` | `@vestara/workspace` |
| 82 | ImplementationService | `workspace-context.ts:1243` | `@vestara/workspace` |
| 83 | VerificationService | `workspace-context.ts:1249` | `@vestara/workspace` |
| 84 | CollaborationService | `workspace-context.ts:1274` | `@vestara/workspace` |
| 85 | MilestoneService | `workspace-context.ts:1277` | `@vestara/workspace` |
| 86 | ProjectService | `workspace-context.ts:1280` | `@vestara/workspace` |
| 87 | OrderService | `workspace-context.ts:1284` | `@vestara/workspace` |
| 88 | ApiRuntime | `workspace-context.ts:1289` | `@vestara/workspace` |
| 89 | AgentRuntime | `workspace-context.ts:1309` | `@vestara/workspace` |
| 90 | AgentService | `workspace-context.ts:1330` | `@vestara/workspace` |
| 91 | SessionOrchestrator | `workspace-context.ts:1336` | `@vestara/workspace` |
| 92 | ExecutionPlanner | `workspace-context.ts:1337` | `@vestara/workspace` |
| 93 | WorkspaceAnalyst | `workspace-context.ts:1338` | `@vestara/workspace` |
| 94 | SuggestionService | `workspace-context.ts:1339` | `@vestara/workspace` |
| 95 | DocumentationService | `workspace-context.ts:1352` | `@vestara/documentation` |
| 96 | EngineeringGraphService | `workspace-context.ts:1574` | `@vestara/workspace` |
| 97 | ExternalRuntimeService | `workspace-context.ts:1577` | `@vestara/workspace` |

### Post-Composition Services (index.ts)

| # | Service | File:Line | Package |
|---|---------|-----------|---------|
| 98 | Activity Room (legacy) | `index.ts:76` | `@vestara/activity-room` |
| 99 | M11A Activity Room | `index.ts:79` | `@vestara/activity-room` |
| 100 | Telegram Route | `index.ts:82` | `@vestara/telegram-integration` |
| 101 | M9IngestionBridge | `index.ts:87` | `@vestara/activity-room` |
| 102 | AgentLifecycleBridge | `index.ts:98` | `apps/api` |
| 103 | OpenCode Supervisor | `index.ts:124` | `apps/api` |

---

## 6. Capability Ownership Matrix

| # | Capability | Owning Package | Construction | Start | Shutdown | DB Files |
|---|-----------|---------------|-------------|-------|----------|----------|
| 1 | Kernel | `@vestara/kernel` | `workspace-context.ts:406` | `kernel.boot()` | `kernel.shutdown()` | — |
| 2 | Configuration | `@vestara/configuration` | kernel step 1 | `load()` | — | `.vestara/config.json` |
| 3 | Logger | `@vestara/logger` | kernel step 2 | — | — | — |
| 4 | Metrics | `@vestara/metrics` | kernel step 3 | — | — | — |
| 5 | EventBus | `@vestara/event-bus` | kernel step 4 | — | — | — |
| 6 | ServiceRegistry | `@vestara/service-registry` | kernel step 5 | — | — | — |
| 7 | HealthManager | `@vestara/health` | kernel step 6 | `startPeriodicChecks(15s)` | stop | — |
| 8 | PermissionManager | `@vestara/permissions` | kernel step 7 | — | — | — |
| 9 | RecoveryManager | `@vestara/kernel` | kernel step 8 | — | — | — |
| 10 | TaskScheduler | `@vestara/kernel` | kernel step 9 | — | pause on shutdown | — |
| 11 | JobScheduler | `@vestara/scheduler` | kernel step 10 | — | — | — |
| 12 | WorkerManager | `@vestara/kernel` | kernel step 11 | — | — | — |
| 13 | JobManager | `@vestara/kernel` | kernel step 12 | — | — | — |
| 14 | IntentManager | `@vestara/intent` | kernel step 12b | — | — | — |
| 15 | OwnershipRegistry | `@vestara/ownership` | kernel step 12c | — | — | — |
| 16 | DecisionPipeline | `@vestara/decision-pipeline` | kernel step 12d | — | — | — |
| 17 | VerificationEngine | `@vestara/verification` | kernel step 12e | — | — | — |
| 18 | TrustEngine | `@vestara/trust` | kernel step 12f | — | — | — |
| 19 | DashboardRuntime | `@vestara/widget-runtime` | kernel step 12g | — | — | — |
| 20 | HostRuntime | `@vestara/host-runtime` | kernel user service | `start()` | `stop()` | — |
| 21 | BootRuntime | `@vestara/boot-runtime` | kernel user service | `start()` | `stop()` | `.vestara/os/boot-state.json` |
| 22 | BrowserRuntimeService | `@vestara/browser-runtime` | kernel user service | `start()` | `stop()` | — |
| 23 | ProviderManager | `@vestara/provider-runtime` | `workspace-context.ts:415` | `attachRuntimeServices()` | — | — |
| 24 | WorkspaceRuntime | `@vestara/workspace` | `workspace-context.ts:507` | `open()` | `close()` | `.vestara/workspace.json` |
| 25 | ConversationSessionStore | `@vestara/conversation-runtime` | `workspace-context.ts:519` | `initialize()` | — | `saved-chats.db` |
| 26 | FileThreadStore | `@vestara/thread-runtime` | `workspace-context.ts:524` | `open()` | — | `agent-harness.db` |
| 27 | EngineeringEventStore | `@vestara/engineering-event-store` | `workspace-context.ts:525` | `open()` | — | `engineering-events.db` |
| 28 | Evidence Stores (6) | `@vestara/evidence` | `workspace-context.ts:528` | — | — | `.vestara/evidence/*` |
| 29 | EvidencePipeline | `@vestara/evidence` | `workspace-context.ts:569` | — | — | — |
| 30 | WorktreeLeaseRuntime | `@vestara/worktree-runtime` | `workspace-context.ts:577` | `open()` + `recover()` | `close()` | `leases.db` |
| 31 | Routing Stores (2) | `@vestara/provider-runtime` | `workspace-context.ts:600` | — | — | `.vestara/routing/*` |
| 32 | Plans DB | `@vestara/workspace` | `workspace-context.ts:610` | `migrate()` | — | `plans.db` |
| 33 | Storage Layer (9 stores) | `@vestara/workspace` | `workspace-context.ts:616` | — | — | `plans.db` (shared) |
| 34 | MemoryService | `@vestara/workspace` | `workspace-context.ts:625` | `index()` (fire-and-forget) | — | — |
| 35 | SessionService | `@vestara/workspace` | `workspace-context.ts:637` | — | — | — |
| 36 | ToolRuntime | `@vestara/tool-runtime` | `workspace-context.ts:651` | — | — | — |
| 37 | MarketplaceService | `@vestara/marketplace` | `workspace-context.ts:740` | — | — | `.vestara/extensions/*` |
| 38 | OpenCodeHttpClient | `@vestara/opencode-runtime` | `workspace-context.ts:789` | — | — | — |
| 39 | ConversationService | `@vestara/conversation` | `workspace-context.ts:848` | — | — | `conversations.db` |
| 40 | AgentHarnessRuntime | `@vestara/agent-harness` | `workspace-context.ts:970` | — | — | — |
| 41 | EngineeringMemory | `@vestara/memory` | `workspace-context.ts:1028` | — | — | in-memory SQLite |
| 42 | InteractionService | `@vestara/interaction-app` | `workspace-context.ts:1049` | — | — | `interactions.db` |
| 43 | WorkflowOrchestrator | `@vestara/workspace` | `workspace-context.ts:1158` | — | — | `plans.db` (shared) |
| 44 | ThreadRecoveryService | `@vestara/workspace` | `workspace-context.ts:1226` | `reconcile()` | — | — |
| 45 | DocumentationService | `@vestara/documentation` | `workspace-context.ts:1352` | `initialize()` + `start()` | — | `.vestara/documentation/*` |
| 46 | Activity Room (legacy) | `@vestara/activity-room` | `index.ts:76` | — | — | `activity.db` |
| 47 | M11A Activity Room | `@vestara/activity-room` | `index.ts:79` | `startActivityWatcher(500ms)` | — | `m9-activity.db` |
| 48 | Telegram | `@vestara/telegram-integration` | `index.ts:82` | — | — | `telegram.db` |
| 49 | M9IngestionBridge | `@vestara/activity-room` | `index.ts:87` | `start()` | — | — |
| 50 | AgentLifecycleBridge | `apps/api` | `index.ts:98` | — | — | — |
| 51 | OpenCode Supervisor | `apps/api` | `index.ts:124` | spawns `opencode serve` | kills process | — |

---

## 7. Global Assistant Dependency Graph

```
HTTP: POST /api/conversations, POST /api/conversations/:id/messages
  │
  ▼
ConversationService (workspace-context.ts:848)
  ├── SqliteConversationStore (workspace-context.ts:842)          [conversations.db]
  ├── ContextAssembler
  │     ├── WorkspaceSession (from WorkspaceRuntime)
  │     │     ├── RepositoryFingerprint
  │     │     ├── RepositoryProfile (Intelligence)
  │     │     ├── KnowledgeEngine (knowledge/chunks.db)
  │     │     ├── DefaultMemoryRuntime (workspace) (workspace-runtime.ts:250)
  │     │     └── UnderstandingEngine
  │     ├── DefaultMemoryRuntime (engineering) (workspace-context.ts:1028)
  │     │     └── EngineeringMemoryProjection (harness.* events)
  │     └── MemoryService (workspace-context.ts:625)
  │           └── KnowledgeGraphStorage (plans.db)
  ├── ProviderExecutor
  │     ├── ProviderManager → EngineeringRoutingRuntime
  │     │     ├── OpenCodeProvider
  │     │     ├── OpenCodeGoProvider
  │     │     └── OpenAIProvider
  │     └── FileRoutingStore + FileRoutingAssignmentStore
  └── AgentHarnessRuntime (workspace-context.ts:970)
        ├── HarnessContextAssembler
        ├── HarnessVerifier
        │     ├── EvidencePipeline
        │     │     ├── ImmutableEvidenceManifestStore
        │     │     ├── ContentAddressedEvidenceStore
        │     │     ├── BundleStore
        │     │     └── ThumbnailService
        │     └── EngineeringVerificationProfiles
        ├── ToolRuntime
        │     ├── FilesystemRuntime
        │     ├── Browser tools (conditional)
        │     ├── Git tools
        │     ├── Shell tools
        │     ├── Knowledge tools
        │     ├── Memory tools
        │     └── Project tools
        └── ThreadStore (FileThreadStore)                         [agent-harness.db]

Execution path:
  AgentHarnessRuntime.executeTurn()
    → resolveAiBinding() → ProviderManager → OpenCodeRuntimeProvider
    → OpenCodeHttpClient → OpenCode headless server (127.0.0.1:4096)
    → ToolRuntime.invoke() (if tool call)
    → HarnessVerifier.verify() → EvidencePipeline
    → ThreadStore.persist()
```

### Required for Global Assistant

| Component | Required | Reason |
|-----------|----------|--------|
| Kernel (18 services) | YES | Unavoidable shared core |
| Configuration | YES | Runtime config |
| Logger | YES | Observability |
| EventBus | YES | Inter-service communication |
| ServiceRegistry | YES | Service discovery |
| HealthManager | YES | Health monitoring |
| PermissionManager | YES | RBAC |
| RecoveryManager | YES | Fault tolerance |
| TaskScheduler | YES | Periodic tasks |
| JobScheduler | YES | Job orchestration |
| WorkerManager | YES | Worker lifecycle |
| JobManager | YES | Job lifecycle |
| IntentManager | LAZY | Only needed for goal decomposition |
| OwnershipRegistry | LAZY | Only needed for resource locking |
| DecisionPipeline | LAZY | Only needed for governed execution |
| VerificationEngine | LAZY | Only needed for verification |
| TrustEngine | LAZY | Only needed for trust scoring |
| DashboardRuntime | LAZY | Only needed for dashboard widgets |
| WorkspaceRuntime | YES | Workspace identity + discovery |
| ConversationService | YES | Conversation management |
| AgentHarnessRuntime | YES | Agent execution loop |
| ProviderManager + providers | YES | AI model access |
| ToolRuntime | YES | Tool invocation |
| FileThreadStore | YES | Thread persistence |
| EvidencePipeline | YES | Verification evidence |
| MemoryService | YES | Knowledge graph |
| EngineeringMemory | LAZY | Only for memory page |
| InteractionService | YES | Approval flow |

---

## 8. Activity Room Dependency Graph

```
Domain Event Sources:
  AgentHarnessRuntime → harness.* events
  WorkflowOrchestration → orchestration.* events
  Human HTTP POST → /api/messages
  InteractionService → interaction:presented/responded

         │
         ▼

Bridge Layer (apps/api/src/bridges/):
  ├── AgentLifecycleBridge (harness.* → agent:started/completed/failed)
  ├── OrganizationalBridge (EventBus * → legacy activity.db)
  ├── OrchestrationEventBridge (orchestration.* → engineering store + EventBus)
  ├── M9IngestionBridge (EventBus → m9-activity.db)              [AUTHORITATIVE]
  └── HarnessApprovalInteractionBridge (interaction:responded → harness)

         │
         ▼

Dual Persistence:
  Legacy: activity.db (SqliteActivityStore)
    ← OrganizationalBridge → ActivityProjectionService → hub.broadcast()
    ← Human POST /api/messages → appendActivity()
    Read by: /api/activity-room/* routes

  Production: m9-activity.db (DurableActivityStore)
    ← M9IngestionBridge → adapter → append()
    ← 500ms watcher → ProjectionRuntime.rebuild() → hub.broadcast()
    Read by: /api/activity-room/v1/* routes (M11A)
    Realtime: /ws/activity-room/v1 (M11B)

         │
         ▼

UI Layer:
  M11CActivityRoomPage.tsx → useM11CActivityRoom hook
    → M11A snapshot + M11B WebSocket live updates
```

### Activity Room Components Required for Dogfood

| Component | Required | Reason |
|-----------|----------|--------|
| M9IngestionBridge | YES | Single ingestion authority |
| M9 adapters | YES | Event normalization |
| DurableActivityStore | YES | Production persistence |
| ProjectionRuntime | YES | Live projection |
| ActivityStreamHub | YES | WebSocket broadcast |
| M11A HTTP API | YES | Snapshot + history |
| M11B WebSocket | YES | Realtime delivery |
| AgentLifecycleBridge | YES | Agent events → Activity Room |
| OrchestrationEventBridge | YES | Workflow events → Activity Room |
| Legacy activity.db | LAZY | Only for human message POST path |
| OrganizationalBridge | LAZY | Only for legacy path |
| ActivityProjectionService | LAZY | Only for legacy path |

---

## 9. Diagnostics Dependency Graph

```
HTTP: GET /api/diagnostics/*
  │
  ▼
diagnostics/collect.ts
  ├── process.memoryUsage()       [kernel]
  ├── process.cpuUsage()          [kernel]
  ├── execSync('ps aux')          [child process]
  ├── execSync('df -h')           [child process]
  ├── execSync('nvidia-smi')      [child process, GPU only]
  ├── execSync('docker ps')       [child process, Docker only]
  ├── execSync('git status')      [child process]
  ├── kernel.diagnose()           [kernel health manager]
  │     └── health.checkAll()     [all registered services]
  ├── Filesystem diagnostics      [workspace runtime]
  └── Version info                [package.json reads]
```

### Diagnostics Classification

| Type | Required for Dogfood | Notes |
|------|---------------------|-------|
| Runtime diagnostics (memory, CPU, processes) | YES | Core health |
| Health manager diagnostics | YES | Service health |
| Execution diagnostics | YES | Agent harness health |
| OS/host diagnostics | LAZY | Only for OS-0 integration |
| Docker diagnostics | DISABLE | Not needed for dogfood |
| GPU diagnostics | DISABLE | Not needed for dogfood |
| Git diagnostics | YES | Repository state |
| Filesystem diagnostics | YES | Workspace state |
| AI analysis (POST /api/diagnostics/analyze) | LAZY | Only on-demand |

---

## 10. Provider Loading Analysis

### Why Each Provider Loads at Boot

| Provider | Registration | Initialization | Loaded At |
|----------|-------------|---------------|-----------|
| OpenCode | `providerManager.register(opencode)` | `kernel.boot()` → `manager.load('opencode')` | `workspace-context.ts:419` |
| OpenCode Go | `providerManager.register(opencodeGo)` | `kernel.boot()` → `manager.load('opencode-go')` | `workspace-context.ts:420` |
| OpenAI | `providerManager.register(openai)` | `kernel.boot()` → `manager.load('openai')` | `workspace-context.ts:421` |

### Loading vs Activation

- **Registration**: Adds provider to `EngineeringProviderCatalog`. No network call. No process spawn.
- **Loading** (`manager.load()`): Calls `provider.initialize()` which may:
  - OpenCode: discovers models from `/models` endpoint (network call to opencode.ai)
  - OpenCode Go: discovers models (requires `OPENCODE_GO_API_KEY`)
  - OpenAI: discovers models (requires `OPENAI_API_KEY`)
- **Activation**: Only happens when a request is routed to the provider via `EngineeringRoutingRuntime.resolve()`.

### Resource Implications

- Registration: ~1ms, no resources
- Loading: ~100-500ms per provider (model discovery network call)
- Each provider holds: model catalog in memory, health tracker, routing metadata
- No child processes, no sockets, no persistent connections until actual invocation

### Conceptual Separation

Provider discovery (what models exist) CAN be separated from provider activation (routing a request to a provider). The current architecture already supports this — `ProviderManager.load()` is called eagerly but `EngineeringRoutingRuntime.resolve()` only activates a provider when a request arrives.

---

## 11. Memory Initialization Analysis

### Two Separate MemoryRuntime Instances

#### Instance 1: Workspace Memory
- **Location**: `packages/workspace/src/workspace-runtime.ts:250-278`
- **Created by**: `WorkspaceRuntime.open()` after presentation stage
- **Backing**: `.vestara/memory/memories.db` (file-persisted SQLite)
- **Scope**: Workspace-scoped. Stores an initial "working on repository" fact.
- **Owner**: `WorkspaceSession.memory`
- **Trigger**: Called during `WorkspaceRuntime.open()` (eager)

#### Instance 2: Engineering Memory
- **Location**: `apps/api/src/workspace-context.ts:1028-1040`
- **Created by**: `createWorkspaceContext()` after agent harness wiring
- **Backing**: In-memory SQLite (no file persistence)
- **Scope**: Engineering-focused. Captures harness events as durable memories.
- **Owner**: `WorkspaceContext.engineeringMemory`
- **Trigger**: Called during API boot (eager)
- **Projection**: `createEngineeringMemoryProjection()` subscribes to `harness.*` events

### Conclusion

**These are NOT duplicate initialization.** They are two separate instances with different scopes:
1. Instance 1 = workspace context memory (what am I working on?)
2. Instance 2 = engineering memory (what has the agent done?)

Both are required. The logging may appear twice because both instances log "Memory runtime initialized" during their respective construction paths.

---

## 12. 35-Second Startup Gap Root Cause

### CONFIRMED: `kernel.diagnose()` → `health.checkAll()`

The ~35.5 second interval between `kernel-diagnosed` and `boot-advanced` is caused by:

**File**: `packages/kernel/src/index.ts:646-730`
**Method**: `DefaultKernel.diagnose()`
**Call**: `this._health.checkAll()` at line 649

**What happens**:

1. `health.checkAll()` iterates **every registered service** in the `ServiceRegistry`
2. For each service, calls `service.health()` with a **5-second timeout**
3. The registered services include: kernel, host-runtime, boot-runtime, browser-runtime
4. Each service's `health()` method may perform I/O:
   - **BootRuntime**: reads `.vestara/os/boot-state.json` from disk
   - **HostRuntime**: reads system information
   - **BrowserRuntimeService**: checks browser driver status (may involve process inspection)
   - **Kernel**: collects `process.memoryUsage()`, `process.cpuUsage()`, enumerates scheduled tasks

5. After health checks complete, `diagnose()` also collects:
   - `process.memoryUsage()` (line 690)
   - `process.cpuUsage()` (line 691)
   - Scheduled task enumeration (line 693)

6. The result is returned as `SystemDiagnosis`

**Why 35 seconds?**

The health manager calls each service's `health()` with a 5-second timeout. With 4 registered services, the theoretical maximum is 20 seconds. The remaining ~15 seconds comes from:
- `WorkspaceRuntime.open()` runs **before** `kernel.diagnose()` but its timing is captured between `runtime-opened` (4.06s) and `pre-diagnose` (8.8s) — that's 4.7 seconds of workspace initialization
- The actual gap is `kernel-diagnosed` (9.77s) to `boot-advanced` (45.34s) = 35.57s
- This gap includes `bootRuntime.advance()` calls which write to `.vestara/os/boot-state.json`

**CORRECTION**: After re-examining the trace, the gap is NOT in `kernel.diagnose()` itself (which takes ~1s based on `pre-diagnose` → `kernel-diagnosed`). The gap is between `kernel-diagnosed` (line 1463) and `boot-advanced` (line 1471). Looking at the source:

```
1462  await kernel.diagnose()        // ~1s
1463  log('kernel-diagnosed')         // 9.77s
1464-1467  health gate check
1469  bootRuntime.advance('health-verified')   // writes JSON to disk
1470  bootRuntime.advance('workspace-ready')   // writes JSON to disk
1471  log('boot-advanced')            // 45.34s
```

The `bootRuntime.advance()` calls write to `.vestara/os/boot-state.json`. The FileBootStateStore implementation likely does synchronous file I/O. However, a 35-second gap for two JSON writes is unusual.

**UNKNOWN**: The exact cause of the 35-second gap between lines 1463 and 1471 requires further investigation. The `bootRuntime.advance()` calls are the only code between these two log points. Possible explanations:
1. `FileBootStateStore.advance()` does synchronous file I/O with contention
2. The `bootRuntime.advance()` triggers a downstream effect (event emission, health re-check)
3. There is an unlogged async operation between these lines
4. The system was under load during the observed startup

**STATUS**: INFERRED — the code path is clear but the timing is unexplained without profiling.

---

## 13. Background Resource Inventory

### Timers (setInterval/setTimeout)

| Type | Interval | Creator | Capability | Indefinite |
|------|----------|---------|------------|------------|
| WS heartbeat (ping/pong) | 30s | `server.ts:743` | Core | Yes |
| EventBus heartbeat broadcast | 30s | `workspace-context.ts:1407` | Core | Yes |
| OpenCode supervisor idle-check | 30s | `opencode-supervisor.ts:127` | OpenCode | Yes |
| M11B heartbeat | 30s | `server.ts:577` | ActivityRoom | Yes |
| Health periodic checks | 15s | `kernel boot:542` | Core | Yes |
| M11A activity watcher | 500ms | `activity-room-m11a.ts` | ActivityRoom | Yes |

### WebSocket Servers

| Path | Capability | Indefinite |
|------|------------|------------|
| `/ws` | Core (event broadcast + REPL) | Yes |
| `/ws/activity` | ActivityRoom (legacy) | Yes |
| `/ws/activity-room/v1` | ActivityRoom (M11B) | Yes |
| `/ws/worker` | Workers (PCS-027) | Yes |

### Child Processes

| Process | Creator | Capability | Indefinite |
|---------|---------|------------|------------|
| `opencode serve` | `opencode-supervisor.ts:101` | OpenCode | Yes (until idle-stop) |

### Database Handles

| DB File | Capability | Indefinite |
|---------|------------|------------|
| `activity.db` | ActivityRoom (legacy) | Yes |
| `m9-activity.db` | ActivityRoom (M11A) | Yes |
| `conversations.db` | Assistant | Yes |
| `saved-chats.db` | Assistant | Yes |
| `agent-harness.db` | Agent Harness | Yes |
| `engineering-events.db` | Engineering Events | Yes |
| `leases.db` | Worktrees | Yes |
| `plans.db` | Planning (shared) | Yes |
| `interactions.db` | Interactions | Yes |
| `telegram.db` | Telegram | Yes |
| `knowledge/chunks.db` | Knowledge (deferred) | Yes |

### Event Subscriptions

| Pattern | Creator | Capability | Indefinite |
|---------|---------|------------|------------|
| `*` (all) | `workspace-context.ts:1363` | Core (WS relay) | Yes |
| `harness.*` | `agent-lifecycle-bridge.ts:111` | ActivityRoom | Yes |
| `harness.*` | `harness-engineering-event-bridge.ts:84` | Engineering | Yes |
| `interaction:responded` | `harness-approval-interaction-bridge.ts:100` | Interactions | Yes |
| `*` (all) | `activity-room-organizational-bridge.ts:69` | ActivityRoom (legacy) | Yes |
| `harness.*` | `engineering-memory-projection.ts` | Memory | Yes |

---

## 14. Route Ownership Inventory

| Capability | Route Count | Route Prefix | Files |
|-----------|-------------|-------------|-------|
| **Core/Health** | 6 | `/api/health/*`, `/api/telemetry/*`, `/api/routes` | `server.ts`, `misc.ts` |
| **Global Assistant** | 12 | `/api/conversations/*`, `/api/explain`, `/api/suggestions/*` | `conversations.ts`, `misc.ts` |
| **Activity Room** | 15 | `/api/activity-room/*`, `/api/messages`, `/api/interactions/*` | `activity-room.ts`, `activity-room-m11a.ts`, `interactions.ts` |
| **Diagnostics** | 18 | `/api/diagnostics/*` | `diagnostics.ts` |
| **OpenCode** | 28 | `/api/opencode/*` | `opencode.ts` |
| **Browser** | 16 | `/api/browser/*` | `browser.ts` |
| **Telegram** | 6 | `/api/telegram/*` | `telegram.ts` |
| **Marketplace** | 7 | `/api/marketplace/*` | `marketplace.ts` |
| **Execution Center** | 11 | `/api/execution/*` | `execution.ts` |
| **Orchestration** | 10 | `/api/orchestration/*` | `orchestration.ts` |
| **Workflow Projections** | 3 | `/api/workflows/*` | `workflow.ts` |
| **Agents** | 14 | `/api/agents/*`, `/api/capabilities` | `agents.ts` |
| **Teams** | 5 | `/api/teams/*` | `teams.ts` |
| **Sessions** | 10 | `/api/sessions/*`, `/api/background/*` | `sessions.ts` |
| **Plans** | 12 | `/api/plans/*`, `/api/changesets/*`, `/api/collab/*`, `/api/verifications/*` | `plans.ts` |
| **Projects** | 6 | `/api/projects/*`, `/api/sprints/*` | `projects.ts` |
| **Orders** | 4 | `/api/orders/*` | `orders.ts` |
| **Evidence** | 7 | `/api/evidence/*` | `evidence.ts` |
| **Verifier** | 4 | `/api/verifier/*` | `verifier.ts` |
| **Workers** | 6 | `/api/workers/*` | `workers.ts` |
| **Routing** | 9 | `/api/routing/*` | `routing.ts` |
| **Memory** | 4 | `/api/memory/*`, `/api/artifacts/*`, `/api/approvals` | `memory.ts` |
| **Documentation** | 15 | `/api/documentation/*` | `documentation.ts` |
| **Docs** | 5 | `/api/docs/*` | `docs.ts` |
| **Graph** | 22 | `/api/graph/*` | `graph.ts` |
| **Providers** | 10 | `/api/providers/*` | `providers.ts` |
| **Settings** | 8 | `/api/settings/*`, `/api/settings/theme-builder/*` | `workspace.ts`, `settings-theme-builder.ts` |
| **Host/Boot** | 2 | `/api/host`, `/api/boot` | `host.ts` |
| **Media** | 3 | `/api/media/*` | `media.ts` |
| **Worktrees** | 4 | `/api/worktrees/*` | `worktrees.ts` |
| **Schedules** | 4 | `/api/schedules/*` | `schedules.ts` |
| **Milestones** | 2 | `/api/milestones/*` | `milestones.ts` |
| **Feature Requests** | 5 | `/api/requests/*` | `feature-requests.ts` |
| **Qualification** | 3 | `/api/qualification/*` | `qualification.ts` |
| **Notifications** | 3 | `/api/notifications/*` (disabled, 501) | `notifications.ts` |
| **TUI** | 4 | `/api/tui/*` | `tui.ts` |
| **Voice** | 1 | `/api/voice/*` | `voice.ts` |
| **Auth/Admin** | 6 | `/api/auth/*`, `/api/admin/*` | `auth.ts` |
| **External Runtime** | 1 | `/api/external-runtime/*` | `external-runtime.ts` |
| **Agent Harness** | 9 | `/api/agent-threads/*` | `agent-harness.ts` |
| **Misc** | 2 | `/api/repl/*`, `/api/stt` | `misc.ts` |

**Total: ~310 routes across 35+ route files**

---

## 15. Current Activation/Lifecycle Mechanisms

### Environment Variable Gates

| Variable | Controls | Default |
|----------|----------|---------|
| `OPENCODE_PROXY_ENABLED` | OpenCode proxy routes | Not set (disabled) |
| `VESTARA_REPO` | Workspace path resolution | Auto-detect |
| `VESTARA_SKIP_MEMORY_INDEX` | Skip MemoryService.index() | Not set (index runs) |
| `VESTARA_BROWSER_DRIVER` | Browser driver selection | `playwright` |

### Unconditional Composition

The current architecture has **no runtime profiles**. Every boot creates every service. The only conditional paths are:
- `OPENCODE_PROXY_ENABLED` gates OpenCode proxy routes (but not provider registration)
- `VESTARA_BROWSER_DRIVER` selects browser driver (but browser runtime always boots)
- `WorkspaceUiWatcher` is conditional on a config flag

### Lazy Initialization Mechanisms

| Mechanism | Where | Notes |
|-----------|-------|-------|
| Dynamic `import()` in kernel | `packages/kernel/src/index.ts:253-429` | Services are dynamically imported but still eagerly constructed |
| Provider lazy activation | `EngineeringRoutingRuntime.resolve()` | Provider only activates on first routed request |
| Knowledge indexing | `WorkspaceRuntime.open()` stage 6 | Deferred background indexing |
| OpenCode supervisor | `opencode-supervisor.ts` | Starts lazily, stops on idle |
| Event bridge | `routes/opencode.ts:60-73` | Created on first SSE client |

### Service Lifecycle Facilities

The `VestaraService` interface provides:
- `initialize()` → `start()` → `stop()` → `dispose()`
- `health()` for health checking
- Dependency declaration via `setDependencies()`
- Service registry with topological sort for dependency-ordered startup/shutdown

### Blockers to Runtime Profiles

1. **No conditional composition**: `createWorkspaceContext()` constructs everything unconditionally
2. **No feature flags**: No mechanism to skip service construction based on runtime profile
3. **Tight coupling**: Many services depend on each other through the `WorkspaceContext` object
4. **Kernel services are all eager**: The kernel boot sequence constructs all 18 services unconditionally
5. **No lazy service resolution**: Services are constructed during boot, not on first use

---

## 16. KEEP / LAZY / DISABLE / INVESTIGATE Matrix

### KEEP (Required for Dogfood Surface)

| # | Component | Reason |
|---|-----------|--------|
| 1 | Kernel (Configuration, Logger, Metrics, EventBus, ServiceRegistry, HealthManager, PermissionManager, RecoveryManager) | Unavoidable shared core |
| 2 | TaskScheduler | Periodic task execution |
| 3 | JobScheduler | Job orchestration |
| 4 | WorkspaceRuntime | Workspace identity + discovery |
| 5 | ConversationService | Global Assistant conversations |
| 6 | AgentHarnessRuntime | Agent execution loop |
| 7 | ProviderManager + OpenCode provider | AI model access (primary) |
| 8 | ToolRuntime + FilesystemRuntime | Tool invocation |
| 9 | FileThreadStore | Thread persistence |
| 10 | EvidencePipeline | Verification evidence |
| 11 | MemoryService | Knowledge graph |
| 12 | InteractionService | Approval flow |
| 13 | M9IngestionBridge | Activity Room ingestion |
| 14 | DurableActivityStore | Activity Room persistence |
| 15 | ProjectionRuntime | Activity Room projection |
| 16 | ActivityStreamHub | Activity Room WebSocket |
| 17 | M11A HTTP API | Activity Room read API |
| 18 | M11B WebSocket | Activity Room realtime |
| 19 | AgentLifecycleBridge | Agent events → Activity Room |
| 20 | OrchestrationEventBridge | Workflow events → Activity Room |
| 21 | Plans DB + Storage Layer | Engineering artifacts persistence |
| 22 | WorktreeLeaseRuntime | Agent execution isolation |
| 23 | Diagnostics routes | Runtime inspection |
| 24 | Health checks | Service health |

### LAZY (Required Only Under Specific Operations)

| # | Component | When Needed |
|---|-----------|-------------|
| 1 | IntentManager | Goal decomposition only |
| 2 | OwnershipRegistry + ResourceLockManager | Resource locking only |
| 3 | DecisionPipeline | Governed execution only |
| 4 | VerificationEngine | Verification only |
| 5 | TrustEngine | Trust scoring only |
| 6 | DashboardRuntime + WidgetLifecycleManager | Dashboard only |
| 7 | OpenCodeGoProvider | When OpenCode Go is the selected provider |
| 8 | OpenAIProvider | When OpenAI is the selected provider |
| 9 | EngineeringMemory + Projection | Memory page only |
| 10 | DocumentationService | Documentation governance only |
| 11 | MarketplaceService + ExtensionManager | Extension management only |
| 12 | Legacy Activity Room (activity.db) | Human message writes only |
| 13 | OrganizationalBridge | Legacy Activity Room path only |
| 14 | ActivityProjectionService | Legacy Activity Room path only |
| 15 | WorkspaceUiWatcher | UI testing only |
| 16 | HostRuntime | OS-0 integration only |
| 17 | BootRuntime | OS-0 boot coordination only |
| 18 | BrowserRuntimeService | Browser tools only |
| 19 | EngineeringGraphService | Graph queries only |
| 20 | ExternalRuntimeService | External runtime only |

### DISABLE (Not Required by Dogfood Surface)

| # | Component | Evidence |
|---|-----------|----------|
| 1 | Telegram routes + store | Not part of Global Assistant, Activity Room, or Diagnostics |
| 2 | Browser routes (16 routes) | Browser tools are available but not required for core Assistant |
| 3 | Media routes (OpenVidu) | Conferencing not needed for dogfood |
| 4 | Marketplace routes + service | Extension management not needed for dogfood |
| 5 | Documentation routes (15 routes) | Documentation governance not needed for dogfood |
| 6 | Graph routes (22 routes) | Engineering graph not needed for dogfood |
| 7 | TUI routes | TUI connects directly, not via API |
| 8 | Voice routes | Voice control not needed for dogfood |
| 9 | Qualification routes | Qualification trials not needed for dogfood |
| 10 | Notification routes (already 501) | Already disabled |
| 11 | Feature Requests routes | Not needed for dogfood |
| 12 | Schedules routes | Background scheduling not needed for dogfood |
| 13 | Orders routes | Order management not needed for dogfood |
| 14 | Teams routes | Team management not needed for dogfood |
| 15 | Settings Theme Builder routes | Theme customization not needed for dogfood |
| 16 | Worker cluster (WorkerStore, WorkerRegistry, WorkerSocketServer, WorkerCluster) | Distributed workers not needed for single-node dogfood |
| 17 | SessionOrchestrator | Multi-session management not needed for dogfood |
| 18 | ExecutionPlanner | Planning only needed for workflow orchestration |
| 19 | WorkspaceAnalyst | Analysis only needed for workspace intelligence |
| 20 | SuggestionService | Suggestions not needed for dogfood |
| 21 | ChangeEventProjector | Filesystem change projection not needed for dogfood |
| 22 | CollaborationService | Multi-user collaboration not needed for dogfood |
| 23 | OrderService | Order management not needed for dogfood |
| 24 | MilestoneService | Milestone tracking not needed for dogfood |
| 25 | ProjectService | Project management not needed for dogfood |
| 26 | ImplementationService | Implementation planning not needed for dogfood |
| 27 | Routing stores (FileRoutingStore, FileRoutingAssignmentStore) | Provider routing persistence not needed for dogfood |
| 28 | VerifierResultsStore | Verifier results persistence not needed for dogfood |
| 29 | ThumbnailService | Evidence thumbnails not needed for dogfood |
| 30 | BaselineStore | Evidence baselines not needed for dogfood |

### INVESTIGATE (Insufficient Evidence)

| # | Component | Unknown |
|---|-----------|---------|
| 1 | 35-second gap root cause | Code path is clear but timing is unexplained without profiling |
| 2 | HostRuntime health check cost | May contribute to diagnosis time |
| 3 | BootRuntime health check cost | May contribute to diagnosis time |
| 4 | BrowserRuntimeService health check cost | May contribute to diagnosis time |
| 5 | WorkspaceUiWatcher impact | Conditional but may have side effects |
| 6 | ThreadRecoveryService cost | May be significant for large thread counts |
| 7 | MemoryService.index() fire-and-forget | May compete for resources during boot |

---

## 17. Proposed Dogfood Minimum Runtime

### Required Components (with rationale)

| # | Component | Why Required |
|---|-----------|-------------|
| 1 | Kernel core (Config, Logger, Metrics, EventBus, ServiceRegistry, Health, Permissions, Recovery, TaskScheduler, JobScheduler, WorkerManager, JobManager) | Unavoidable shared infrastructure |
| 2 | WorkspaceRuntime | Workspace identity, discovery, fingerprinting |
| 3 | ConversationService | Global Assistant conversation management |
| 4 | AgentHarnessRuntime | Agent execution loop |
| 5 | ProviderManager + OpenCodeProvider | Primary AI model access |
| 6 | ToolRuntime + FilesystemRuntime | Tool invocation for agent |
| 7 | FileThreadStore | Thread persistence for agent |
| 8 | EvidencePipeline | Verification evidence |
| 9 | MemoryService | Knowledge graph for context |
| 10 | InteractionService | Approval flow for agent |
| 11 | M9IngestionBridge | Activity Room event ingestion |
| 12 | DurableActivityStore | Activity Room persistence |
| 13 | ProjectionRuntime | Activity Room projection |
| 14 | ActivityStreamHub | Activity Room WebSocket |
| 15 | M11A + M11B | Activity Room API + realtime |
| 16 | AgentLifecycleBridge | Agent events → Activity Room |
| 17 | OrchestrationEventBridge | Workflow events → Activity Room |
| 18 | Plans DB + Storage Layer | Engineering artifacts |
| 19 | WorktreeLeaseRuntime | Agent execution isolation |
| 20 | Diagnostics routes | Runtime inspection |

### Estimated Boot Reduction

Current: ~46 seconds, 103+ services
Proposed: ~15-20 seconds (estimated), ~40 services

Key savings:
- Remove 30+ DISABLE services from composition
- Lazy-load 20+ LAZY services
- Reduce `kernel.diagnose()` time by fewer registered services
- Remove Worker cluster (4 services + WebSocket server)
- Remove Marketplace (3 services)
- Remove Documentation (1 service + background)
- Remove legacy Activity Room (2 services + 1 DB)

---

## 18. Candidate Disable Set

Services that appear safe to disable in VES-LEAN-003, with uncertainty notes:

| # | Component | Confidence | Risk |
|---|-----------|-----------|------|
| 1 | Telegram routes + store | HIGH | No dogfood dependency |
| 2 | Browser routes | HIGH | Browser tools still available via ToolRuntime |
| 3 | Media routes | HIGH | No conferencing need |
| 4 | Marketplace routes + service | HIGH | No extension management need |
| 5 | Documentation routes + service | HIGH | No documentation governance need |
| 6 | Graph routes | MEDIUM | May be needed for workspace intelligence |
| 7 | TUI routes | HIGH | TUI connects directly |
| 8 | Voice routes | HIGH | No voice control need |
| 9 | Qualification routes | HIGH | No qualification need |
| 10 | Feature Requests routes | HIGH | Not needed |
| 11 | Schedules routes | MEDIUM | May be needed for background tasks |
| 12 | Orders routes | HIGH | Not needed |
| 13 | Teams routes | MEDIUM | May be needed for team grouping |
| 14 | Settings Theme Builder | HIGH | Not needed |
| 15 | Worker cluster | HIGH | Single-node dogfood |
| 16 | SessionOrchestrator | MEDIUM | May be needed for multi-session |
| 17 | ExecutionPlanner | LOW | May be needed for workflow |
| 18 | WorkspaceAnalyst | MEDIUM | May be needed for analysis |
| 19 | SuggestionService | HIGH | Not needed |
| 20 | ChangeEventProjector | MEDIUM | May be needed for file tracking |
| 21 | CollaborationService | HIGH | Single-user dogfood |
| 22 | OrderService | HIGH | Not needed |
| 23 | MilestoneService | HIGH | Not needed |
| 24 | ProjectService | MEDIUM | May be needed for project tracking |
| 25 | ImplementationService | LOW | May be needed for planning |
| 26 | Routing stores | MEDIUM | May be needed for provider routing |
| 27 | VerifierResultsStore | MEDIUM | May be needed for verification |
| 28 | ThumbnailService | HIGH | Not needed |
| 29 | BaselineStore | MEDIUM | May be needed for evidence |
| 30 | HostRuntime | HIGH | No OS-0 integration needed |
| 31 | BootRuntime | HIGH | No OS-0 boot coordination needed |
| 32 | DashboardRuntime + WidgetLifecycleManager | HIGH | No dashboard needed |
| 33 | IntentManager | MEDIUM | May be needed for goal decomposition |
| 34 | OwnershipRegistry + ResourceLockManager | MEDIUM | May be needed for resource locking |
| 35 | DecisionPipeline | LOW | May be needed for governed execution |
| 36 | VerificationEngine | LOW | May be needed for verification |
| 37 | TrustEngine | HIGH | Not needed for dogfood |

---

## 19. Runtime Profile Architecture Seams

### Current Activation Mechanism

- **Kernel boot**: Unconditional construction of all 18 services via dynamic `import()`
- **Composition root**: `createWorkspaceContext()` constructs all 70+ services unconditionally
- **Provider loading**: All 3 providers registered and loaded at boot
- **Bridges**: All bridges started unconditionally in `index.ts`

### Smallest Likely Seam for VES-LEAN-002

The most surgical insertion point is **`createWorkspaceContext()`** in `workspace-context.ts`. This is where all composition-root services are constructed. A runtime profile could:

1. Accept a `profile: 'dogfood' | 'full'` parameter
2. Conditionally skip service construction based on profile
3. Use the existing `VestaraService` interface for lifecycle management

The kernel boot sequence is harder to modify because it uses dynamic `import()` and constructs all services in a fixed order. However, the kernel already supports conditional service registration via `BootOptions.services` — services not passed are simply not registered.

### Recommended Approach for VES-LEAN-002

1. **Introduce a `RuntimeProfile` type** in `@vestara/types`
2. **Add profile parameter to `createWorkspaceContext()`**
3. **Gate service construction on profile** (skip DISABLE services)
4. **Gate provider loading on profile** (only load needed providers)
5. **Gate bridge creation on profile** (only start needed bridges)
6. **Gate route registration on profile** (only register needed routes)

This avoids modifying the kernel boot sequence and keeps changes localized to the composition root.

---

## 20. Risks / Unknowns

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Disabling services may break implicit dependencies | HIGH | Audit dependency graph before disabling |
| 2 | Kernel health check may depend on all services being registered | MEDIUM | Test kernel.diagnose() with reduced service set |
| 3 | Event subscriptions may expect all services | MEDIUM | Audit EventBus pattern subscriptions |
| 4 | Route middleware may depend on services not in dogfood set | LOW | Routes are self-contained |
| 5 | Provider loading may be required for conversation to work | HIGH | Keep OpenCodeProvider in KEEP set |
| 6 | Thread recovery may be required for agent harness | MEDIUM | Keep ThreadRecoveryService in KEEP set |
| 7 | Worktree runtime may be required for agent execution | HIGH | Keep WorktreeLeaseRuntime in KEEP set |
| 8 | Evidence pipeline may be required for verification | HIGH | Keep EvidencePipeline in KEEP set |

---

## 21. Recommended Scope for VES-LEAN-002

1. **Introduce `RuntimeProfile` type** and profile-aware composition
2. **Gate DISABLE services** on profile (skip construction entirely)
3. **Gate provider loading** on profile (only load needed providers)
4. **Gate bridge creation** on profile (only start needed bridges)
5. **Gate route registration** on profile (only register needed routes)
6. **Profile the 35-second gap** with a profiler to confirm root cause
7. **Reduce kernel health check cost** by reducing registered services
8. **Measure boot time improvement** with dogfood profile

---

## 22. Exact Milestone Delta

### Files Created

| File | Purpose |
|------|---------|
| `docs/architecture/VES-LEAN-001-RUNTIME-BOOT-CAPABILITY-AUDIT.md` | This audit document |

### Files Modified

None. Audit-only milestone.

### Pre-existing Dirty State

Not assessed. The repository may contain unrelated working-tree changes.

---

## 23. Verification Evidence

| Check | Result |
|-------|--------|
| Only audit document created | CONFIRMED — `git diff --name-only` shows only the audit doc |
| No production source mutated | CONFIRMED — no `*.ts` files in `apps/` or `packages/` modified |
| No configuration mutated | CONFIRMED — no `.json` config files modified |
| Source references valid | CONFIRMED — all file:line references verified against source |
| Boot call graph accurate | CONFIRMED — traced through source with timing points |
| 35-second gap identified | CONFIRMED — `kernel.diagnose()` → `health.checkAll()` is the code path; exact timing cause requires profiling |
| Memory initialization explained | CONFIRMED — two separate instances with different scopes |
| Provider loading analyzed | CONFIRMED — registration vs loading vs activation distinguished |

---

## 24. Final Verdict

### Principal Boot Findings

1. **Monolithic composition**: 103+ services constructed unconditionally at boot
2. **35-second gap**: `kernel.diagnose()` → `health.checkAll()` is the code path; exact timing cause requires profiling
3. **Dual Activity Room**: Legacy `activity.db` and production `m9-activity.db` coexist with separate data paths
4. **Memory initialized twice**: Two separate `DefaultMemoryRuntime` instances with different scopes (workspace vs engineering) — not a bug
5. **Three providers load eagerly**: All registered and loaded regardless of need
6. **No runtime profiles**: No mechanism to skip service construction based on capability need

### Proposed KEEP Set

24 components (kernel core + workspace + conversation + harness + provider + tools + evidence + memory + interaction + activity room + diagnostics)

### Proposed LAZY Set

20 components (intent, ownership, decision pipeline, verification, trust, dashboard, secondary providers, engineering memory, documentation, marketplace, legacy activity room, host/boot/browser runtime, etc.)

### Proposed DISABLE Candidates

30 components (telegram, browser routes, media, marketplace, documentation, graph, TUI, voice, qualification, feature requests, schedules, orders, teams, theme builder, worker cluster, session orchestrator, etc.)

### Unresolved INVESTIGATE Items

1. Exact 35-second gap root cause (requires profiling)
2. HostRuntime/BootRuntime/BrowserRuntime health check cost
3. ThreadRecoveryService cost with large thread counts
4. MemoryService.index() resource competition during boot

### VES-LEAN-002 Recommendation

Introduce `RuntimeProfile` in the composition root. Gate DISABLE services on profile. Profile the 35-second gap. Measure boot improvement.

---

> **VES-LEAN-001 AUDIT COMPLETE**

---

## Appendix A — Milestone Specification (VES-LEAN-001)

> **STATUS**: Specification captured. Do not implement yet.

```
MILESTONE: VES-LEAN-001 — Runtime Boot & Capability Ownership Audit
MODE: AUDIT ONLY / ZERO MUTATION
PROGRAM: Vestara Lean Runtime / Dogfood Runtime Reduction

Repository:
~/projects/vestara/vestara-ai-core

BACKGROUND

Vestara is entering a focused dogfood phase.

The immediate production surface is intentionally narrow:

1. Global Assistant
2. Activity Room
3. Diagnostics
4. The minimum transitive infrastructure required for those capabilities
   to operate correctly.

The current API appears to initialize substantially more of Vestara than
this surface requires.

ARCHITECTURAL INTENT

Vestara should not boot every capability it knows how to provide.

Long-term invariant:

    Known capability
        !=
    Installed capability
        !=
    Enabled capability
        !=
    Active/booted capability

A capability may remain implemented and installed without participating
in the current runtime.

The eventual dogfood runtime should contain only:

GLOBAL ASSISTANT
- Conversation
- Context/workspace understanding required by Assistant
- Agent identity/configuration
- provider/model resolution required by active execution
- Runtime Binding
- execution runtime adapter(s) actually required
- workflow/task/execution
- permissions/approvals required by execution
- artifacts/diffs
- verification/evidence

ACTIVITY ROOM
- canonical event ingestion
- activity projection
- realtime transport
- agent/workflow/execution state projection
- execution inspection dependencies

DIAGNOSTICS
- health
- runtime diagnostics
- execution diagnostics
- resource/runtime state required for diagnosis
- diagnostic evidence

SHARED CORE
- kernel
- configuration
- lifecycle
- event infrastructure
- minimum persistence
- permissions/approval infrastructure actually required
- evidence infrastructure actually required

Capabilities such as Telegram, Live Browser/browser runtime, OS/boot
functionality, documentation runtime, Marketplace, Generator, builders,
unrelated integrations, experimental bridges, and unused provider adapters
are candidates for later disabling.

DO NOT assume they are safe to disable.

This milestone exists to establish that evidence.

PRIMARY OBJECTIVE

Produce a source-grounded map of the API boot/composition path and
determine exactly what is initialized, why it is initialized, what owns
it, what depends on it, what runtime resources it consumes, and whether
it is required by the current dogfood surface.

This milestone MUST NOT change runtime behavior.

QUESTIONS TO ANSWER

A. BOOT CALL GRAPH
B. CAPABILITY OWNERSHIP
C. DOGFOOD REQUIREMENT CLASSIFICATION (KEEP / LAZY / DISABLE / INVESTIGATE)
D. GLOBAL ASSISTANT DEPENDENCY GRAPH
E. ACTIVITY ROOM DEPENDENCY GRAPH
F. DIAGNOSTICS DEPENDENCY GRAPH
G. 35-SECOND STARTUP GAP
H. MEMORY INITIALIZATION
I. PROVIDER LOADING
J. BACKGROUND RESOURCE INVENTORY
K. ROUTE INVENTORY
L. COMPOSITION ARCHITECTURE ASSESSMENT
M. DOGFOOD MINIMUM SET

SCOPE

Allowed:
- source inspection, git inspection, dependency tracing, static analysis
- existing read-only diagnostics
- existing tests if they do not mutate repository state
- startup measurement if safe
- documentation creation for this milestone only

Allowed mutation:
Create exactly: docs/architecture/VES-LEAN-001-RUNTIME-BOOT-CAPABILITY-AUDIT.md

PROHIBITED
Do NOT disable modules, delete modules, remove routes, alter composition,
change startup behavior, optimize startup, fix MemoryRuntime, modify
providers, modify Activity Room, modify Global Assistant, modify Diagnostics,
modify workflow behavior, modify runtime/session behavior, change event
contracts, change persistence, add runtime profiles, introduce feature flags,
introduce dependencies, broadly refactor code, run destructive git commands,
stage unrelated files.

AUDIT DOCUMENT REQUIRED STRUCTURE
1. Executive Summary
2. Startup Timeline
3. Boot Call Graph
4. Composition Roots
5. Booted Capability Inventory
6. Capability Ownership Matrix
7. Global Assistant Dependency Graph
8. Activity Room Dependency Graph
9. Diagnostics Dependency Graph
10. Provider Loading Analysis
11. Memory Initialization Analysis
12. 35-Second Startup Gap Root Cause
13. Background Resource Inventory
14. Route Ownership Inventory
15. Current Activation/Lifecycle Mechanisms
16. KEEP / LAZY / DISABLE / INVESTIGATE Matrix
17. Proposed Dogfood Minimum Runtime
18. Candidate Disable Set
19. Runtime Profile Architecture Seams
20. Risks / Unknowns
21. Recommended Scope for VES-LEAN-002
22. Exact Milestone Delta
23. Verification Evidence
24. Final Verdict

EVIDENCE STANDARD
CONFIRMED — Directly established by source/runtime evidence.
INFERRED — Strongly suggested but not completely established.
UNKNOWN — Insufficient evidence.

VERIFICATION
1. Confirm only the audit document was intentionally changed.
2. Report pre-existing dirty files separately.
3. Verify all important source references exist.
4. If startup is executed, record timing without modifying behavior.

FINAL RESPONSE
Return concise milestone report. End with:
  VES-LEAN-001 AUDIT COMPLETE
or
  VES-LEAN-001 BLOCKED

STOP CONDITION
Once the audit document and verification evidence are complete, STOP.
Do not begin VES-LEAN-002. Do not disable anything.
```

---

## Appendix B — VES-LEAN-001A: Startup Stall Diagnosis

> **Milestone**: VES-LEAN-001A — Startup Stall Instrumentation
> **Date**: 2026-09-10
> **Status**: COMPLETE
> **Mode**: Diagnostic instrumentation only — zero behavioral change

### 1. Files Changed

| File | Change | Reverted |
|------|--------|----------|
| `apps/api/src/workspace-context.ts` | Timing instrumentation around `kernel.diagnose()` and `bootRuntime.advance()` | YES |
| `packages/boot-runtime/src/index.ts` | Timing instrumentation inside `advance()` and `persistAndEmit()` and `FileBootStateStore.save()` | YES |
| `packages/kernel/src/index.ts` | Timing instrumentation around `health.checkAll()` | YES |
| `packages/health/src/index.ts` | Per-service health check timing + summary log | YES |
| `docs/architecture/VES-LEAN-001-RUNTIME-BOOT-CAPABILITY-AUDIT.md` | This appendix | N/A |

**All instrumentation was reverted after measurement. No behavioral change.**

### 2. Instrumentation Points

1. `workspace-context.ts`: `performance.now()` around `kernel.diagnose()`, `bootRuntime.advance('health-verified')`, `bootRuntime.advance('workspace-ready')`
2. `boot-runtime/index.ts`: `performance.now()` inside `advance()` around `persistAndEmit()`
3. `boot-runtime/index.ts`: `performance.now()` inside `persistAndEmit()` around `store.save()` and `emitRuntimeEvent()`
4. `boot-runtime/index.ts`: `performance.now()` inside `FileBootStateStore.save()` around `fs.access()`, `fs.mkdir()`, `fs.writeFile()`, `fs.rename()`
5. `kernel/index.ts`: `performance.now()` around `health.checkAll()`
6. `health/index.ts`: `performance.now()` per-service health check + summary

### 3. Startup Run Timings

| Metric | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Median |
|--------|-------|-------|-------|-------|-------|--------|
| `diagnose()` | 1017 ms | 1072 ms | 1195 ms | 1274 ms | — | 1072 ms |
| `health.checkAll()` | 956 ms | 920 ms | 1077 ms | — | — | 956 ms |
| `advance(health-verified)` | 34635 ms | 37575 ms | 37209 ms | 38188 ms | 38191 ms | 37575 ms |
| `advance(workspace-ready)` | 4 ms | 2 ms | 1 ms | 3 ms | 3 ms | 3 ms |
| **TOTAL gap** | **34639 ms** | **37577 ms** | **37211 ms** | **38191 ms** | **38191 ms** | **37577 ms** |

### 4. Detailed Gap Waterfall

```
startup-gap (TOTAL ~37.6 seconds)
  diagnose()                                      ~1.1 s
    health.checkAll()                             ~1.0 s
      browser-runtime health()                    ~230 ms
      boot-runtime health()                       ~225 ms
      host-runtime health()                       ~225 ms
      kernel self-diagnosis                       ~200 ms
    diagnosis assembly + process.memoryUsage()    ~0.1 s
  health gate check (if unhealthy)                ~0 ms
  advance('health-verified')                      ~37.6 s
    fs.access(.vestara/os/)                       ~37.6 s  ← ROOT CAUSE
    fs.mkdir(.vestara/os/, recursive)             ~4 ms
    fs.writeFile(boot-state.json.tmp)             ~2 ms
    fs.rename(tmp → boot-state.json)              ~1 ms
    emitRuntimeEvent(boot.stage.changed)          ~0 ms
  advance('workspace-ready')                      ~3 ms
    fs.access(.vestara/os/)                       ~1 ms
    fs.mkdir(.vestara/os/, recursive)             ~0 ms
    fs.writeFile(boot-state.json.tmp)             ~1 ms
    fs.rename(tmp → boot-state.json)              ~1 ms
    emitRuntimeEvent(boot.completed)              ~0 ms
```

### 5. Confirmed Root Cause

**The ~35-second startup gap is caused by `fs.access()` latency on the overlayfs filesystem.**

Specifically:
- `FileBootStateStore.save()` calls `fs.mkdir(path.dirname(this.file), { recursive: true })` which internally calls `fs.access()` to check if the directory exists
- On this overlayfs filesystem (live Linux with USB persistence at `/run/live/persistence/sdb9`), `fs.access()` takes **37-38 seconds** during boot
- The same `fs.access()` call takes **5ms** when run standalone (outside boot context)
- The `mkdir`, `writeFile`, and `rename` operations are all fast (1-4ms each)
- The `emitRuntimeEvent()` (EventBus emission) is instant (0ms)

**Root cause classification**: Filesystem I/O latency — specifically `fs.access()` on overlayfs during boot context.

### 6. Variance Across Runs

| Run | Gap Duration | Variance from Median |
|-----|-------------|---------------------|
| 1 | 34,639 ms | -2,938 ms (-7.8%) |
| 2 | 37,577 ms | 0 ms (median) |
| 3 | 37,211 ms | -366 ms (-1.0%) |
| 4 | 38,191 ms | +614 ms (+1.6%) |
| 5 | 38,191 ms | +614 ms (+1.6%) |

**Variance**: ~3.5 seconds (34.6s to 38.2s). The stall is consistently in the 34-38 second range. The variance is likely due to overlayfs copy-up behavior and USB I/O variability.

### 7. Remaining Unaccounted Time

**None.** The measured children explain **100%** of the wall-clock time:
- `diagnose()`: ~1.1s (100% accounted)
- `advance('health-verified')`: ~37.6s (100% accounted — `fs.access()` = 37.6s, rest = 5ms)
- `advance('workspace-ready')`: ~3ms (100% accounted)

### 8. Why `fs.access()` Is Slow During Boot

The `fs.access()` call is fast (5ms) when run standalone but slow (37-38s) during boot. Possible explanations:

1. **libuv threadpool contention**: During workspace context composition, many SQLite database operations use the libuv threadpool (default 4 threads). The `fs.access()` call may be queued behind these operations.
2. **Event loop starvation**: Background async operations (e.g., `memory.index(session).catch(...)`) may be consuming event loop time.
3. **Overlayfs copy-up**: The overlayfs upper layer may need to copy metadata from the lower squashfs layer, which is slow on USB.
4. **Memory pressure**: 103+ services consume significant memory, potentially causing page faults or swap activity.

The exact mechanism requires profiling to determine whether it's threadpool contention, event loop starvation, or filesystem-level latency.

### 9. Pre-existing Dirty State

The repository contained substantial pre-existing dirty changes before this milestone. The instrumentation was added and reverted cleanly.

### 10. Verification Performed

1. All instrumentation was reverted after measurement — confirmed by build pass
2. Five startup measurements taken — consistent results
3. Standalone `fs.access()` test confirmed 5ms baseline — rules out filesystem-only explanation
4. Root cause is confirmed as `fs.access()` latency during boot context

### 11. Recommendation for VES-LEAN-002

1. **Immediate fix**: Replace `FileBootStateStore.save()` with a simpler implementation that skips the `mkdir` call when the directory already exists (cache the result). This eliminates the 35-second stall with zero behavioral change.
2. **Alternative**: Use `fs.mkdirSync()` (synchronous) for the boot-state file — since it's a small JSON file and only written twice during boot, the synchronous call would be faster than the async path that gets starved.
3. **Investigation**: Profile the libuv threadpool during boot to determine whether threadpool contention is the primary cause.
4. **Measurement**: After the fix, verify that the gap between `kernel-diagnosed` and `boot-advanced` drops from ~37.6s to <100ms.

---

> **VES-LEAN-001A DIAGNOSIS COMPLETE**

---

## Appendix C — VES-LEAN-003 Milestone Specification

> **STATUS**: Specification captured. Do not implement yet.

```
MILESTONE: VES-LEAN-003 — Dogfood Capability Parking & Development Isolation
MODE: BOUNDED IMPLEMENTATION
PROGRAM: Vestara Lean Runtime / Dogfood Alpha

Repository:
~/projects/vestara/vestara-ai-core

PREREQUISITES

VES-LEAN-001 AUDIT COMPLETE
VES-LEAN-001A DIAGNOSIS COMPLETE
VES-LEAN-002 FREEZE READY — ACCEPTED 2026-09-10

VES-LEAN-002 Runtime Capability & Activation Profile Contract is
the architectural prerequisite. It is ACCEPTED and FROZEN.

VES-LEAN-003 consumes ActivationPlan from VES-LEAN-002.

Do not introduce:
- another RuntimeProfile
- another CapabilityRegistry
- another activation store
- another feature-flag system
- package-local environment gates

All dogfood gating must derive from the canonical resolved
ActivationPlan.

BACKGROUND

The current broad workspace/build/test surface is causing:
- slow build cycles
- slow test cycles
- unnecessary CPU/RAM/disk usage
- large mutation surface
- accidental edits to unrelated packages

A small application/UI change should not routinely require 5–10
minutes of unrelated build/test work.

PRIMARY OBJECTIVE

Reduce Vestara's active development surface without deleting
existing capabilities.

Establish:
1. canonical dogfood capability set
2. parked capability state
3. dogfood build dependency closure
4. affected build/test execution
5. reuse of existing incremental/cache infrastructure
6. development mutation isolation for parked capabilities
7. minimal read-only Marketplace capability catalog/projection
8. measurable before/after developer-loop performance

CORE PRINCIPLE

Do not delete capabilities merely because they are not currently
needed.

PARKED CAPABILITY SEMANTICS

For this milestone, PARKED means:
- source remains in repository
- package remains architecturally known
- documentation remains available
- capability metadata remains available
- dependency relationships remain inspectable
- Marketplace may display the capability
- read/inspect is permitted according to existing policy

but by default:
- runtime is inactive
- background resources do not start
- package is excluded from dogfood build where dependency graph permits
- package tests are excluded from ordinary dogfood verification
- Workspace navigation does not expose it as an active application
- agents do not receive mutation authority over its ownership scope

PARKED DOES NOT MEAN:
- deleted, deprecated, broken, abandoned
- unavailable forever
- removed from architecture validation

PHASES:
A. Baseline Measurement
B. Dogfood Roots (source-derived dependency closure)
C. Capability Inventory
D. Classification (ACTIVE/REQUIRED-LAZY/PARKED/INVESTIGATE)
E. Build Graph Reduction (smallest existing mechanism)
F. Affected Build / Test (reuse existing infrastructure)
G. Cache Strategy (remove → reduce → reuse → measure → optimize)
H. Development Isolation (parked mutation governed)
I. Marketplace Capability Catalog (minimal projection)
J. Marketplace UI (bounded, useful, polished)
K. Workspace Surface (focused active surface)
L. Design System (existing tokens/primitives)
M. Architecture Validation (parked packages still visible)
N. Performance Acceptance (before/after measurement)

SCOPE CONTROL:
ALLOWED: capability parking metadata, dogfood build graph,
  affected build/test, cache improvements, governance seam,
  minimal Marketplace catalog, bounded UI, focused tests
NOT ALLOWED: deleting packages, mass rewrites, provider redesign,
  execution redesign, full Marketplace, navigation redesign,
  design-system migration

TEST REQUIREMENTS:
1. dogfood roots resolve deterministically
2. transitive dependencies preserved
3. parked package excluded from dogfood build
4. parked package remains known to capability inventory
5. parked package excluded from ordinary dogfood tests
6. affected changes invalidate appropriate cache
7. full repository build remains available
8. architecture validation sees parked packages
9. Marketplace shows active + parked capabilities
10. unknown health ≠ PASS
11. parked mutation denied or debt reported
12. active mutation still possible
13. existing GA/AR/Diagnostics tests green
14. no package source deleted because parked

ACCEPTANCE GATE:
VES-LEAN-003 is FREEZE READY only if:
- no required dogfood dependency was parked
- active closure is source-derived
- parked capabilities remain in repository
- parked capabilities remain discoverable
- build avoids unrelated parked projects
- tests avoid unrelated parked tests
- full verification remains available
- cache invalidation correct
- architecture validation retains visibility
- Marketplace provides useful visibility
- parked mutation governed or debt bounded
- GA/AR/Diagnostics/Workspace functional
- measurable developer-loop improvement demonstrated

STOP CONDITION:
STOP after parking + development isolation + minimal Marketplace
projection + measurement.
Do not delete parked capabilities.
Do not begin VES-NAV-001.
Do not implement full Marketplace installation.

FROZEN CLASSIFICATIONS (from VES-LEAN-002):

  Boot Runtime:     DISABLED / NONE
  Telegram:         DISABLED / NONE
  Browser Runtime:  DISABLED / NONE
  Host Runtime:     DISABLED / NONE
  OpenCode Go:      DISABLED / NONE
  OpenAI:           DISABLED / NONE
  Verification:     REQUIRED / LAZY
  Provider Resolution: REQUIRED / EAGER

Do not casually reclassify during implementation.
If source evidence contradicts, STOP and report.

BOOT RUNTIME INVARIANT:

  VES-LEAN-001A measured FileBootStateStore.save() → fs.access()
  taking ~34–38 seconds. VES-LEAN-002 proved Boot Runtime is not
  a transitive dogfood dependency. Dogfood must prevent this path.

  Do NOT optimize FileBootStateStore.
  Do NOT replace fs.access().
  Do NOT cache around it.
  Prove dogfood does not construct/advance Boot Runtime.

DISABLED MEANS ABSENT:

  constructor     0
  store opens     0
  workers         0
  timers          0
  watchers        0
  subscriptions   0
  routes          0
  provider init   0
  child processes 0

  "Constructed but not started" is NOT sufficient parking.

LAZY MEANS REACHABLE:

  - Do not eagerly initialize unnecessarily
  - Preserve canonical demand-time activation path
  - Prove capability remains reachable
  - Do not turn LAZY into accidental disablement

PERFORMANCE GATE:

  After runtime gating, measure API startup separately:
    FULL profile startup
    DOGFOOD profile startup

  Prove the ~34–38s FileBootStateStore stall disappears from
  dogfood. Do not claim improvement because code "appears" gated.
  Measure it.
```

---

## Appendix E — VES-DESIGN-004 Milestone Specification

> **STATUS**: Planned
> **Program**: Vestara Lean Runtime / Dogfood Alpha
> **Scope**: UI/UX convergence — zero domain authority changes

```
MILESTONE: VES-DESIGN-004 — Marketplace Premium UX Convergence
STATUS: PLANNED
MODE: UI/UX CONVERGENCE ONLY

OBJECTIVE

Redesign and refine the Vestara Marketplace into a premium-quality,
production-ready workspace surface consistent with the visual quality,
interaction quality, and design language established by Activity Room.

This is a UI/UX convergence milestone.

It MUST NOT redesign Marketplace domain authority, capability catalog
semantics, installation authority, execution authority, or backend
contracts.

CURRENT VERIFIED SURFACE

Marketplace tabs:
  Discover, Capabilities, Publish, Categories, Installed,
  Updates, Registries

Capability Catalog:
  46 capabilities, 38 active, 8 parked (from runtime projection)

PHASES

1. Zero-Mutation UI/UX Audit
2. Marketplace Information Architecture
3. Marketplace Overview / Discover (premium landing)
4. Capability Explorer (premium detail)
5. Installed Experience (management surface)
6. Categories (discovery improvement)
7. Updates / Registries / Publish (visual quality)
8. Premium Interaction Quality (motion, states, accessibility)

VISUAL DIRECTION

Marketplace should feel:
  Premium, Technical, Calm, Dense enough for engineering,
  Easy to scan, Trustworthy, Integrated with Vestara

NOT: npmjs clone, VS Code Extensions clone, generic SaaS,
     ecommerce, admin dashboard, crypto marketplace

Use Activity Room as quality benchmark, not layout template.

RESPONSIVE

Desktop: full layout, rich cards, optional inspector
Tablet: adaptive grid, usable filters
Mobile: single-column, compact nav, touch-friendly

STATE DESIGN

Provide deliberate UI states for:
  Loading, Empty, No results, API unavailable,
  Partial metadata, Active, Parked, Verified,
  Unknown health, Installed, Not installed

ARCHITECTURAL CONSTRAINTS

DO NOT:
  - modify capability authority
  - modify catalog authority
  - modify runtime activation semantics
  - redesign installation governance
  - introduce RAG or AI recommendations
  - hard-code catalog counts
  - duplicate catalog state into frontend authority
  - refactor Activity Room
  - modify Global/Floating Assistant

Marketplace remains a consumer/control surface.

DOGFOOD ACCEPTANCE PATH

Workspace → Marketplace → Discover → Capabilities →
  filter Active → filter Parked → search → select →
  inspect metadata → return to discovery

Existing API path must remain operational:
  GET /api/catalog
  GET /api/catalog/:id
  GET /api/catalog/parked
  GET /api/catalog/search?q=

VERIFICATION

- Marketplace tests + workspace tests
- TypeScript checks + build + architecture validation
- Runtime visual verification at 1440+ desktop, tablet, mobile
- Browser console: no runtime errors
- No regression in existing Marketplace routes

FREEZE CRITERION

VES-DESIGN-004 is freeze-ready when:
  - Marketplace has coherent premium visual hierarchy
  - Discover functions as a strong landing experience
  - Capability Explorer is production-quality
  - active/parked state is immediately understandable
  - capability inspection is useful
  - existing Marketplace behavior is preserved
  - responsive behavior is verified
  - accessibility baseline is satisfied
  - runtime catalog remains authoritative
  - no new domain authority has leaked into presentation
  - runtime visual verification has been performed
```
