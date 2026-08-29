# ARX-015: Agent Participant Lifecycle Remediation

**Date**: 2026-08-29
**Status**: Implementation Complete, Awaiting Production Verification
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

### Chain Diagram

```
AgentHarness.emit('harness.turn.started')
  → AgentLifecycleBridge handler
    → agentModelResolver.resolve(agentId)  // resolves model/role from AgentStorage
    → eventBus.emit('agent:started', { agentId, agentName, role, modelId, providerId })
      → M9IngestionBridge.mapToActivityEvent('agent:started')
        → fromAgentLifecycle({ agentId, displayName, role, modelId, providerId })
          → DurableActivityStore.append(ActivityRecord)
            → M10ProjectionRuntime.updateParticipantFromRecord()
              → ParticipantProjection { participantId, displayName, role, modelId, providerId }
                → M11A API /api/activity-room/v1/participants
                  → UI: Engineering Team panel
```

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `apps/api/src/bridges/agent-lifecycle-bridge.ts` | Bridge: `harness.*` → `agent:started/completed` with model metadata |

### Modified Files
| File | Change |
|------|--------|
| `packages/types/src/projection.ts` | Extended `ParticipantProjection` with `role?`, `modelId?`, `providerId?` |
| `packages/activity-projection/src/m9-adapter.ts` | Extended `AgentLifecycleInput` with `role?`, `modelId?`, `providerId?`; `fromAgentLifecycle()` stores metadata in `payload.data` |
| `packages/activity-projection/src/m9-ingestion-bridge.ts` | Updated `mapToActivityEvent()` for `agent:started`/`agent:completed` to pass model metadata through `fromAgentLifecycle` |
| `packages/activity-projection/src/m10-projection-runtime.ts` | Updated `updateParticipantFromRecord()` to extract `role`/`modelId`/`providerId` from `record.payload.data` into `ParticipantProjection` |
| `apps/api/src/routes/activity-room-m11a.ts` | Updated `sanitizeParticipant()` to expose `role`/`modelId`/`providerId` in API response |
| `apps/workspace/src/pages/activity/M11CParticipantRail.tsx` | Replaced "Participants" header with "Engineering Team"; AI participants display model name as displayName, role as badge |

## Verification

### Unit Tests (Existing)
- 32/32 M9IngestionBridge tests pass
- 31/31 M10 projection evidence tests pass
- 4/4 adapters tests pass
- Build clean (`bash build-order.sh`)

### Integration Verification (Simulation)
```
EventBus.emit('harness.turn.started', { agentId: 'developer' })
  → AgentLifecycleBridge resolves: { modelId: 'mimo-v2.5-free', role: 'developer', displayName: 'Mimo' }
  → EventBus.emit('agent:started', { agentId: 'developer', agentName: 'Mimo', role: 'developer', modelId: 'mimo-v2.5-free' })
  → M9IngestionBridge stores: actor_type='agent', actor_id='developer', actor_display_name='Mimo', payload.data={role:'developer',modelId:'mimo-v2.5-free',providerId:'opencode'}
  → M10 Projection: participantId='agent-developer', displayName='Mimo', role='developer', modelId='mimo-v2.5-free'
```

### Production Deployment
- Bridge wired in composition root (`apps/api/src/index.ts`)
- Boot mark: `[boot] agent-lifecycle-bridge-started`
- **Pending**: Real harness event trigger to populate M9 with agent records

## Authorization Constraints Honored

| Constraint | Status |
|-----------|--------|
| Bridge is integration/normalization boundary | ✅ |
| Did NOT modify harness event contract | ✅ |
| Did NOT implement UD-3 | ✅ |
| Did NOT create a second participant authority | ✅ |
| Preserves M9 as durable activity authority | ✅ |
| Preserves M10 as participant projection | ✅ |
| Stable agent/actor identity preserved | ✅ |
| Model display name not used as durable ID | ✅ |
| Human and agent participants coexist | ✅ |

## Adjacent Findings (Not Modified)

1. **Pre-existing flaky tests**: `activity-hardening` pagination, `activity-messaging` under parallel load
2. **Remaining ~32s O(n) startup recovery**: `replay → project → saveExecutionSession` × 767 threads

## Next Steps

1. Trigger a real conversation through the harness to verify end-to-end production chain
2. Confirm agent records appear in M9 database
3. Confirm agent participants render in the UI "Engineering Team" panel
