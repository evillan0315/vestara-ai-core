---
title: AR-001R — Activity Room Package Identity Migration
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# AR-001R — Activity Room Package Identity Migration

**Author**: Vestara Developer Agent  
**Date**: 2026-09-04  
**Prerequisite**: AR-000 (Decision B), AR-001 (frozen)

---

## Migration Summary

**Package rename**: `@vestara/activity-projection` → `@vestara/activity-room`  
**Directory rename**: `packages/activity-projection/` → `packages/activity-room/`  
**Behavioral delta**: ZERO (mechanical identity migration only)

---

## Before Package Graph

```
@vestara/activity-projection
  depends on: event-bus, shared, sqlite-migrations, types, sql.js

consumed by:
  apps/api (10 production files)
  apps/workspace (3 production files)
  packages/interaction-app (comment only)
  packages/engineering-event-store (__tests__)
  packages/activity-projection (__tests__, 24 files)
```

## After Package Graph

```
@vestara/activity-room
  depends on: event-bus, shared, sqlite-migrations, types, sql.js

consumed by:
  apps/api (10 production files)
  apps/workspace (3 production files)
  packages/interaction-app (comment only)
  packages/engineering-event-store (__tests__)
  packages/activity-room (__tests__, 24 files)
```

**No dependency changes** — only the package identity changed.

---

## Migrated Production Consumers

| File | Import Change |
|------|--------------|
| `apps/api/src/activity-room.ts` | `@vestara/activity-projection` → `@vestara/activity-room` |
| `apps/api/src/bridges/activity-room-organizational-bridge.ts` | Same |
| `apps/api/src/index.ts` | Same |
| `apps/api/src/message-receipts.ts` | Same |
| `apps/api/src/participants.ts` | Same |
| `apps/api/src/routes/activity-room-m11a.ts` | Same |
| `apps/api/src/routes/activity-room-m11b.ts` | Same |
| `apps/api/src/routes/activity-room.ts` | Same |
| `apps/api/src/routes/interactions.ts` | Same |
| `apps/api/src/workspace-context.ts` | Same |
| `apps/workspace/src/hooks/useActivityStream.ts` | Same |
| `apps/workspace/src/lib/activity.ts` | Same |
| `apps/workspace/src/pages/activity/activity-types.ts` | Same |
| `packages/interaction-app/src/index.ts` | Comment only |

## Migrated Test Consumers

| File | Import Change |
|------|--------------|
| `packages/activity-room/__tests__/adapters.test.ts` | `@vestara/activity-projection` → `@vestara/activity-room` |
| `packages/activity-room/__tests__/batch.test.ts` | Same |
| `packages/activity-room/__tests__/contracts.test.ts` | Same |
| `packages/activity-room/__tests__/helpers.ts` | Same |
| `packages/activity-room/__tests__/interaction-publication-delivery.test.ts` | Same |
| `packages/activity-room/__tests__/redactor.test.ts` | Same |
| `packages/activity-room/__tests__/sequence.test.ts` | Same |
| `packages/activity-room/__tests__/service.test.ts` | Same |
| `packages/activity-room/__tests__/severity.test.ts` | Same |
| `packages/activity-room/__tests__/store.test.ts` | Same |
| `packages/activity-room/__tests__/stream.test.ts` | Same |
| `packages/activity-room/__tests__/projectors/*.test.ts` | Same (5 files) |
| `apps/api/__tests__/activity-room-delivery.test.ts` | Same |
| `apps/api/__tests__/activity-room-ws.test.ts` | Same |
| `apps/api/__tests__/message-receipts.test.ts` | Same |
| `apps/api/__tests__/participants.test.ts` | Same |
| `apps/workspace/__tests__/r4-stream-integration.test.tsx` | Same |
| `packages/engineering-event-store/__tests__/m2-canonical-event-contract.test.ts` | Same |

## Migrated Configuration

| File | Change |
|------|--------|
| `packages/activity-room/package.json` | name: `@vestara/activity-room` |
| `apps/api/package.json` | dep: `@vestara/activity-room` |
| `apps/workspace/package.json` | dep: `@vestara/activity-room` |
| `apps/api/tsconfig.reference.json` | path: `../../packages/activity-room/tsconfig.reference.json` |

## Migrated Documentation

| File | Change |
|------|--------|
| `packages/activity-room/README.md` | Updated package name and build command |
| `docs/engineering/TEST-SUITE-PERFORMANCE-AUDIT.md` | Updated package references |
| `docs/AR-P1.5-AUTHORITY-CONTRACTS.md` | Updated package references |
| `docs/Architecture/Activity-Room-Redesign-SLICE-PLAN.md` | Updated package references |
| `docs/api/PACKAGE_CATALOG.md` | Updated package references |
| `docs/CHANGELOG.md` | Updated package references |
| `docs/UI/activity-room-visual-design-spec.md` | Updated package references |
| `docs/blueprint/VESTARA-INTELLIGENCE-GA2-PREFLIGHT.md` | Updated package references |
| `docs/blueprint/VESTARA-INTELLIGENCE-MB1-PREFLIGHT.md` | Updated package references |
| `docs/generated/drift.json` | Updated package references |
| `apps/workspace/docs/agent-control-testing/*.md` | Updated package references |

---

## @vestara/types Migration Status

### Decision: DEFERRED

The M9 duplicate contracts in `@vestara/types` (`ActivityRecord`, `ActivityStore`, `ActivityQuery`, `ActivityCursor`, `ActivityEvent`) were **not migrated** during AR-001R. This is the correct decision because:

1. **Consumer count is high** — 30+ files import from `@vestara/types` for Activity types
2. **M11A route bridges both families** — it imports from both `@vestara/activity-room` and `@vestara/types`
3. **Risk exceeds bounded scope** — changing type origins across 30+ files during a package rename is not mechanical
4. **AR-001 instructed careful migration** — "do not blindly delete a type until every production and test consumer has been migrated"

### Target State (AR-002+ scope)

```
@vestara/activity-room (canonical)
  ActivityRecord (6-kind union)
  ActivityStore (append, get, list, lastSequence)
  ActivityQuery (workflowId, sessionId, taskId, agentId, kind, severity, ...)
  ActivityCursor (from types — when needed)
  ActivitySourceEvent (input normalization)

@vestara/types (shared primitives only)
  ActivityActorType ('human' | 'agent' | 'system')
  MembershipState, PresenceState, WorkState
  StreamItem, ParticipantProjection, AttentionEntry, WorkflowSummary
  ActivityRoomProjection
```

### Migration Steps (future)

1. Locate all `@vestara/types` Activity contract consumers
2. Migrate each consumer to import from `@vestara/activity-room`
3. Prove build/typecheck passes
4. Remove duplicate from `@vestara/types`

---

## Compatibility Decisions

| Decision | Rationale |
|----------|-----------|
| No compatibility re-export package | `@vestara/activity-projection` is internal-only, no external consumers |
| No `activity-projection` shim | Would become permanent architecture debt |
| Internal comments updated | Source comments referencing old package name updated |
| Legacy `activity-log` untouched | Per AR-001 directive — separate bounded migration |
| API routes untouched | Per AR-001 directive — no endpoint/protocol changes |
| Messaging boundary untouched | Per AR-001 directive — Activity Room ≠ conversation authority |

---

## Verification Commands & Results

### Build

```
$ pnpm build
Dependency boundaries valid across 98 workspace projects.
Generated project references for 97 buildable projects.
```

### Lint

```
$ pnpm lint:check
Checked 1349 files in 10s. No fixes applied.
```

### Source Artifacts

```
$ pnpm check:source-artifacts
Source directories clean: no generated .js/.js.map/.d.ts artifacts under src/ or __tests__/.
```

### Focused Tests

| Suite | Files | Tests | Duration | Status |
|-------|------:|------:|----------|--------|
| activity-room package | 16 | 91 | 7.85s | ✅ PASS |
| API activity-room | 4 | 21 | 3.07s | ✅ PASS |
| workspace activity-room | 1 | 26 | 7.44s | ✅ PASS |
| engineering-event-store | 1 | 23 | 2.19s | ✅ PASS |
| **Total** | **22** | **161** | **20.55s** | **✅ ALL PASS** |

---

## Remaining Legacy activity-log Consumers

| Consumer | File | Usage | Migration Target |
|----------|------|-------|-----------------|
| `apps/api` | `workspace-context.ts` | Creates `ActivityLogStore` + `ActivityService` | Remove after AR-001L |
| `apps/api` | `routes/activity.ts` | Serves `/api/activity-log` and `/api/activity` | Deprecate/redirect to M11A |
| `apps/api` | `routes/execution.ts` | `ctx.activityStore.query({ limit })` | Migrate to Activity Room query |
| `apps/api` | `index.ts` | Passes `activityService` to server | Remove after AR-001L |
| `apps/cli` | `context/cli-context.ts` | Creates `ActivityLogStore` + `ActivityService` | Remove after AR-001L |

**Schedule**: AR-001L (Legacy Activity Migration & Removal) after AR-001R.

---

## Behavioral Equivalence Evidence

The intended behavioral delta for AR-001R is **ZERO**.

| Behavior | Before | After | Delta |
|----------|--------|-------|-------|
| Append | `ActivityProjectionService.project()` | Same (no code change) | None |
| Persistence | `SqliteActivityStore` | Same (no code change) | None |
| Query | `ActivityStore.list()` | Same (no code change) | None |
| Projection | `ActivityProjectorRegistry` | Same (no code change) | None |
| Ordering | `MonotonicSequence` | Same (no code change) | None |
| Redaction | `ActivityRedactor` | Same (no code change) | None |
| Stream delivery | `ActivityStreamHub.broadcast()` | Same (no code change) | None |
| API (M9) | `GET /api/activity-room` | Same endpoints, same schemas | None |
| API (M11A) | `GET /api/activity-room/v1/*` | Same endpoints, same schemas | None |
| WebSocket | M11B protocol | Same protocol, same messages | None |

**Proof**: 161 focused tests pass with identical assertions. No test was modified, rewritten, or had its timeout changed.
