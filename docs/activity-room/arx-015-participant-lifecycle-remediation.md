# ARX-015: Agent Participant Lifecycle Remediation

**Date**: 2026-08-29
**Status**: Implementation Complete
**Author**: Agent (Developer)

## Problem

Zero agent participants appeared in the Activity Room. The M10 projection derived participants from M9 durable records, but M9 contained only human records (10 `human.message` events, 0 agent events).

### Root Cause

Namespace mismatch between harness event emission and M9 ingestion:

| Layer | Events Emitted | Patterns Ingested by M9 |
|-------|---------------|------------------------|
| Agent Harness | `harness.turn.started`, `harness.outcome.completed` | `agent:started`, `agent:completed` |

`InProcessEventBus` pattern matching uses prefix globs (`harness.*` matches `harness.turn.started`), but the canonical `agent:started`/`agent:completed` namespace never receives harness events because harness emits `harness.*` events, not `agent:*` events.

**Zero namespace overlap → zero agent records → zero agent participants.**

## Solution

Created `AgentLifecycleBridge` — an integration/normalization boundary that subscribes to `harness.*` events and re-emits canonical `agent:started`/`agent:completed` events on the EventBus, enriched with model metadata resolved from AgentStorage.

### Identity Separation (Reviewer Constraint)

Activity Room does not define teams, roles, or model bindings. It consumes them from upstream authorities.

```
participantId      stable identity (e.g. "agent-developer")
displayName        canonical identity (e.g. "developer")
modelDisplayName   presentation fallback for unnamed AI (e.g. "Mimo")
role               metadata (e.g. "developer")
modelId            metadata (e.g. "mimo-v2.5-free")
providerId         metadata (e.g. "opencode")
teamId             reference to upstream AgentTeam (future)
teamName           denormalized from AgentTeam (future)
```

UI uses `modelDisplayName ?? displayName` as presentation fallback for unnamed AI participants. Canonical identity is never mutated.

### Chain Diagram

```
AgentHarness.emit('harness.turn.started')
  → AgentLifecycleBridge handler
    → agentModelResolver.resolve(agentId)  // resolves model/role from AgentStorage
    → eventBus.emit('agent:started', {
        agentId,
        displayName: agentId,        // canonical identity
        modelDisplayName: 'Mimo',    // presentation fallback
        role, modelId, providerId
      })
      → M9IngestionBridge.mapToActivityEvent('agent:started')
        → fromAgentLifecycle({ agentId, displayName, modelDisplayName, role, modelId, providerId })
          → DurableActivityStore.append(ActivityRecord)
            → M10ProjectionRuntime.updateParticipantFromRecord()
              → ParticipantProjection { participantId, displayName, modelDisplayName, role, ... }
                → M11A API sanitizeParticipant()
                  → UI: modelDisplayName ?? displayName
```

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `apps/api/src/bridges/agent-lifecycle-bridge.ts` | Bridge: `harness.*` → `agent:started/completed` with model metadata |

### Modified Files
| File | Change |
|------|--------|
| `packages/types/src/projection.ts` | Extended `ParticipantProjection` with `modelDisplayName?`, `role?`, `modelId?`, `providerId?`, `teamId?`, `teamName?` |
| `packages/activity-projection/src/m9-adapter.ts` | Extended `AgentLifecycleInput` with `modelDisplayName?`, `role?`, `modelId?`, `providerId?` |
| `packages/activity-projection/src/m9-ingestion-bridge.ts` | Pass model metadata for `agent:started`/`agent:completed` events |
| `packages/activity-projection/src/m10-projection-runtime.ts` | Extract `modelDisplayName`/`role`/`modelId`/`providerId`/`teamId`/`teamName` from `payload.data` |
| `apps/api/src/routes/activity-room-m11a.ts` | Serialize `modelDisplayName`/`teamId`/`teamName` in API response |
| `apps/workspace/src/pages/activity/M11CParticipantRail.tsx` | Generic "Participants" header; `modelDisplayName ?? displayName` presentation fallback |
| `apps/api/src/index.ts` | Wired bridge in composition root with `AgentModelResolver` |

## Verification

### Unit Tests
- 32/32 M9IngestionBridge tests pass
- 31/31 M10 projection evidence tests pass
- 14/14 M9 final durability evidence tests pass
- 85/85 total activity-projection tests pass
- Build clean, lint clean, dependency boundaries valid

### Integration Verification (Simulation)
```
EventBus.emit('harness.turn.started', { agentId: 'developer' })
  → AgentLifecycleBridge resolves: { modelId: 'mimo-v2.5-free', role: 'developer', displayName: 'developer', modelDisplayName: 'Mimo' }
  → EventBus.emit('agent:started', { agentId: 'developer', displayName: 'developer', modelDisplayName: 'Mimo', ... })
  → M9 stores: actor_type='agent', actor_id='developer', actor_display_name='developer', payload.data={modelDisplayName:'Mimo',...}
  → M10 Projection: displayName='developer', modelDisplayName='Mimo'
  → UI renders: 'Mimo' (modelDisplayName ?? displayName)
```

### Production Deployment
- Bridge wired in composition root (`apps/api/src/index.ts`)
- Boot mark: `[boot] agent-lifecycle-bridge-started`

## Upstream Capability Gap (Reported to Director)

**`AgentTeam` authority exists** but is not wired to Activity Room:
- Type: `packages/workspace/src/types.ts` — `AgentTeam { id, name, description, memberIds, ... }`
- Storage: `packages/workspace/src/agent-storage.ts` — CRUD on `agent_teams` table
- API: `apps/api/src/routes/teams.ts` — full REST (`GET /api/teams`, `POST /api/teams`, etc.)
- UI: `apps/workspace/src/pages/Agents/TeamsPanel.tsx` — team management panel

**Gap**: Activity Room M10 projection does not consume `AgentTeam` records. `teamId`/`teamName` fields are on `ParticipantProjection` but always `undefined` until wired.

**Recommended next step**: Wire `AgentTeam` → M10 projection so Activity Room renders teams from authoritative configuration, not hardcoded strings.

## Authorization Constraints Honored

| Constraint | Status |
|-----------|--------|
| Activity Room does NOT define teams | ✅ Generic "Participants" header |
| Activity Room does NOT hardcode roles/models | ✅ All from upstream data |
| Identity is never mutated | ✅ `displayName` = canonical, `modelDisplayName` = presentation |
| Bridge is integration/normalization boundary | ✅ |
| Did NOT modify harness event contract | ✅ |
| Did NOT implement UD decisions | ✅ |
| Did NOT create a second participant authority | ✅ |
| Preserves M9 as durable activity authority | ✅ |
| Preserves M10 as participant projection | ✅ |
| Human and agent participants coexist | ✅ |
| Can create different team without changing Activity Room code | ✅ Team data comes from AgentTeam authority |

## Adjacent Findings (Not Modified)

1. **Pre-existing flaky tests**: `activity-hardening` pagination, `activity-messaging` under parallel load
2. **Remaining ~32s O(n) startup recovery**: `replay → project → saveExecutionSession` × 767 threads
3. **`conversation:response.completed` hardcodes `agentId: 'vestara'`** — pre-existing, not in scope
