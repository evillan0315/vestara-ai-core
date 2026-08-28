# ARX-015: API Startup Latency Audit

**Date**: 2026-08-28
**Environment**: Linux / Node 22 / systemd `vestara-api.service`
**Binary**: `apps/api/dist/index.js`

## Summary

| Metric | Value |
|--------|-------|
| Cold start (process spawn → HTTP ready) | **~77s** |
| Hot start (cached workspace) | **~77s** (no difference) |
| Shutdown (SIGTERM → process exit) | **~100ms** |
| Restart (stop + start → HTTP ready) | **~90s** (includes 10s stop timeout) |
| HTTP health check latency (once running) | **<6ms** |

## Boot Waterfall (representative run)

```
process-spawned                     0ms  (+    0ms)    — process.argv[0]
entrypoint-entered                  1ms  (+    1ms)    — import('apps/api/src/index.ts')
config-loaded                       1ms  (+    0ms)    — dotenv + env parse
composition-begin                   1ms  (+    0ms)    — createWorkspaceContext()
  kernel-created                    0ms  (+    0ms)    — new DefaultKernel()
  providers-registered              2ms  (+    2ms)    — registerProviders()
  kernel-booted                  1835ms  (+ 1833ms)    — kernel.boot() (load 3 providers)
  runtime-opened                3233ms  (+ 1398ms)    — session.open() (discover + fingerprint + present)
  evidence-stores                3580ms  (+  347ms)    — EvidenceStoreFactory.open()
  worktree-opened                3602ms  (+   22ms)    — GitService.init()
  plans-db-opened                3611ms  (+    9ms)    — PlansDB open
  conversation-service           4349ms  (+  738ms)    — DefaultConversationService
  agent-harness                  4352ms  (+    3ms)    — AgentHarness init
  harness-bridge                 4353ms  (+    1ms)    — HarnessWorkspaceBridge
  memory-initialized             5166ms  (+  813ms)    — memory.initialize()
  workflow-orchestrator          5338ms  (+  172ms)    — WorkflowOrchestrator init
  thread-recovery                6133ms  (+  795ms)    — importThreadHistory + reconcileInterruptedThreads
  documentation-initialized      8594ms  (+ 2461ms)    — DocumentationService.init()
  documentation-started          8756ms  (+  162ms)    — DocumentationService.start()
  pre-diagnose                   8758ms  (+    2ms)    — kernel.diagnose()
  kernel-diagnosed               9368ms  (+  610ms)    — diagnosis complete
  ══════════════════════════════════════════════════════
  ██ EVENT LOOP STARVATION ██        (+67298ms)        — restoreActiveSessions() blocks event loop
  ══════════════════════════════════════════════════════
  boot-advanced                 76666ms  (+    0ms)    — bootRuntime.advance('health-verified')
  context-return                76671ms  (+    5ms)    — WorkspaceContext returned
composition-end                76675ms  (+    4ms)
activity-room-init             76682ms  (+    7ms)    — initM11AActivityRoom()
m11a-init                      76687ms  (+    5ms)
m9-bridge-started              76687ms  (+    0ms)    — M9IngestionBridge.start()
opencode-supervisor            76687ms  (+    0ms)    — OpenCode supervisor
routes-registered              76690ms  (+    3ms)    — registerApiRoutes()
http-listening                 76697ms  (+    7ms)    — http.listen()
```

**TOTAL: 76697ms**

## Contributor Breakdown

| Phase | Duration | % of Total | Bottleneck |
|-------|----------|-----------|------------|
| kernel.boot (providers) | 1833ms | 2.4% | `loadProviders()` — 3 providers ~600ms each |
| runtime.open | 1398ms | 1.8% | workspace discovery + session creation |
| Remaining composition | 6168ms | 8.0% | conversation-service (738ms), memory.init (813ms), thread-recovery (795ms), documentation.init (2461ms) |
| **restoreActiveSessions** | **67298ms** | **87.7%** | **767 threads × listExecutionSessions(1000) = ~590K row scans** |
| Post-composition (room/bridge/routes) | 31ms | 0.04% | Trivial |

## Root Cause: Event Loop Starvation by `restoreActiveSessions()`

### Mechanism

`harnessSession.restoreActiveSessions()` (fire-and-forget at `workspace-context.ts:1091`) iterates **767 task_threads** and for each calls:

1. `sessionForThread(threadId)` → `listExecutionSessions(1_000)` — **full table scan of 775 rows**
2. `snapshot(replay)` or `createForRun(...)` — compute timeline projection
3. `syncFromReplay(replay, session)` — project replay → update session
4. `saveExecutionSession(updated)` — write back to SQLite

Each `listExecutionSessions` loads all 775 rows into memory and finds matching ones. With 767 threads, this produces **~590,000 row reads** in a tight async loop. While each individual operation is fast (~10ms), the accumulated microtask queue prevents the event loop from processing I/O callbacks (including the `setImmediate` scheduled by `bootRuntime.advance()`).

### Evidence

- `kernel-diagnosed` fires at 9368ms
- `boot-advanced` fires at 76666ms
- Delta: **67298ms** of dead time where the event loop is starved
- The `restoreActiveSessions` call is fire-and-forget (line 1091: `.catch(...)`), so the async function runs as background work but monopolizes the event loop via microtask starvation

### Data Scale

| Table | Rows | Size |
|-------|------|------|
| task_threads | 767 | 5.5MB |
| agent_turns | 736 | — |
| thread_items | 3,924 | — |
| execution_sessions | 775 | — |
| engineering_events | 181,887 | **288MB** |
| activity_events (M9) | — | 16MB |
| knowledge_nodes | 126 | — |
| knowledge_relations | 102 | — |

### Synchronous Operations in the Critical Path

| Operation | Location | Impact |
|-----------|----------|--------|
| `walkDir()` sync readdir/stat | `knowledge/indexer/index.ts` | 5506 files, but fast on warm cache |
| `knowledgeDb.export()` | `workspace/workspace-runtime.ts:583` | sync serialization to buffer |
| `fs.mkdirSync()` + `fs.writeFileSync()` | `workspace/workspace-runtime.ts:584-585` | sync I/O for knowledge DB |
| `dbRun/dbGet/dbAll` | `knowledge-graph-storage.ts` | sql.js sync wrappers (via await, but microtask-bound) |
| `listExecutionSessions(1000)` × 767 | `harness-session.ts:139` | **Primary blocker** |

## Shutdown

```
SIGTERM → process.exit
Duration: ~100ms (clean)
Shutdown handler: memory.consolidate() → kernel.shutdown() → scheduler.pause()
```

Note: one earlier measurement showed 9.8s shutdown — this varies based on memory consolidation state and pending service dispositions.

## Recommendations

### Priority 1: Batch or async `restoreActiveSessions()`

Replace the per-thread `listExecutionSessions(1000)` with a single batch query:

```typescript
// Current (O(n²) — 767 queries × 775 rows):
for (const thread of threads) {
  const sessions = await storage.listExecutionSessions(1_000);
  // ... filter for this thread
}

// Proposed (O(1) — 1 query):
const allSessions = await storage.listExecutionSessions(1_000);
const byThread = new Map(allSessions.map(s => [s.threadId, s]));
```

This would reduce the 67s stall to <1s.

### Priority 2: Yield to event loop during iteration

If batch query isn't possible, insert `await new Promise(r => setImmediate(r))` every N threads to allow I/O callbacks to fire:

```typescript
for (let i = 0; i < threads.length; i++) {
  if (i % 50 === 0) await new Promise(r => setImmediate(r));
  // ... process thread
}
```

### Priority 3: Reduce 1000-row limit for session recovery

`listExecutionSessions(1_000)` scans the entire execution_sessions table (775 rows). Only the most recent session per thread is needed for recovery. A `DISTINCT threadId` query with `ORDER BY updatedAt DESC LIMIT 1` would reduce data by ~99%.

## Files Modified (instrumentation — production-safe markers retained)

- `apps/api/src/index.ts` — `bootMark()` monotonic timestamps (retained for ongoing diagnostics)
- `apps/api/src/workspace-context.ts` — `log()` sub-phase markers (retained), `setImmediate` yield (removed)
- `packages/boot-runtime/src/index.ts` — removed debug `console.log` (cleaned)
- `packages/workspace/src/workspace-runtime.ts` — removed debug `console.log` (cleaned)

## Reproduction

```bash
# Cold start measurement
sudo systemctl stop vestara-api
time node apps/api/dist/index.js 2>&1 | grep "\[boot\]"

# Or via systemd
sudo systemctl start vestara-api
journalctl -u vestara-api --since "2 minutes ago" | grep "\[boot\]"
```
