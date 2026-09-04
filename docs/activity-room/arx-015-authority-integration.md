---
title: "ARX-015: Activity Room Agent/Team Authority Integration"
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015: Activity Room Agent/Team Authority Integration

**Date**: 2026-08-29
**Status**: Implementation Complete
**Author**: Agent (Developer)

## Problem

After `31a3995` removed hardcoded team/model assumptions, Activity Room only rendered participants from M9/M10 lifecycle events. Configured agents that had not executed since restart were invisible. Activity Room depended solely on lifecycle events as the participant discovery mechanism.

## Solution

Composed two authoritative sources at the API boundary:

1. **Agent/Team authority** (AgentStorage): agent identity, team membership, AI binding
2. **M10 projection** (lifecycle-derived): runtime presence, work state, current assignment

### Semantic Separation

```
Agent/Team authority → "who belongs in the room/team"
M10/lifecycle state  → "what is happening to/with that participant"
```

Activity Room composes these sources. It does NOT define teams, roles, or model bindings.

### Data Flow

```
AgentStorage.listTeams()    → team membership (teamId, teamName)
AgentStorage.listAgents()   → agent identity (id, name, role, model, provider)
  ↓
composeParticipants(ctx, room)
  ↓
  ├── For each agent in AgentStorage:
  │     ├── Has lifecycle history → enrich with team/agent metadata
  │     └── No lifecycle history → create with idle state (presence=offline, workState=available)
  ├── Human participants from M10 → preserve as-is
  └── Return composed list
  ↓
GET /api/activity-room/v1/participants → Workspace UI
```

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/routes/activity-room-m11a.ts` | Added `composeParticipants()` function; updated participants + snapshot endpoints to use composition |

## Verification

### Real API Response (no harness execution required)

```
GET /api/activity-room/v1/participants → 13 participants:
  agent-agent-planner       model=deepseek-v4-flash-free  role=planning    team=-
  agent-agent-verifier      model=deepseek-v4-flash-free  role=verifier    team=-
  agent-agent-context       model=mimo-v2.5-free          role=context     team=-
  agent-agent-reviewer      model=nemotron-3-ultra-free   role=reviewer    team=-
  agent-agent-developer     model=mimo-v2.5-free          role=developer   team=Engineering
  agent-agent-1787...       model=mimo-v2.5-free          role=planner     team=-
  agent-agent-1787...       model=mimo-v2.5-free          role=analyst     team=-
  agent-agent-1787...       model=nemotron-3-ultra-free   role=security    team=-
  agent-agent-1787...       model=nemotron-3-ultra-free   role=architect   team=-
  agent-agent-1787...       model=deepseek-v4-flash-free  role=perf-agent  team=-
  agent-agent-1787...       model=mimo-v2.5-free          role=reviewer    team=-
  agent-agent-1787...       model=mimo-v2.5-free          role=developer   team=Engineering
  human-local                                              name=local      team=-
```

### Checklist

| Criterion | Status |
|-----------|--------|
| Configured agents visible without harness execution | ✅ 12 agents + 1 human |
| Team names originate from Team authority | ✅ "Engineering" from `agent_teams` table |
| Agent membership originates from Team authority | ✅ `team.memberIds` + `agent.teamId` back-reference |
| Agent config originates from Agent authority | ✅ `AgentStorage.listAgents()` |
| Model display from configured model | ✅ `agent.model` → `modelDisplayName` |
| Lifecycle enriches existing participants | ✅ M10 projection merged when available |
| Refresh/reconnect preserves team members | ✅ Composition runs on every request |
| Duplicate events don't duplicate participants | ✅ Stable at 13 across 3 requests |
| Legacy ActivityLogStore unaffected | ✅ Separate endpoint, no changes |
| No hardcoded teams/roles/models in Activity Room | ✅ All from upstream authorities |
| New team without changing Activity Room code | ✅ Composition is generic |
| Human preserved without false team membership | ✅ human-local has no teamId |
| Identity invariant preserved | ✅ displayName ≠ modelDisplayName ≠ teamId ≠ role |

### Tests
- 63/63 activity-projection tests pass
- Build clean, lint clean, dependency boundaries valid

## Upstream Capability Gap

**Team membership is agent-only.** The `AgentTeam.memberIds` array stores agent IDs. The team route handler validates members via `ctx.agents.getAgent(memberId)` — human IDs silently ignored. There is no concept of human team membership in the current AgentTeam system.

**Impact**: Human-local appears as a non-team participant. This is the correct representation given the current authority model.

**If human team membership is needed**: Extend `AgentTeam` to accept human IDs and add a `UserStorage` lookup in the teams route handler.

## Authorization Constraints Honored

| Constraint | Status |
|-----------|--------|
| Activity Room does NOT define teams | ✅ |
| Activity Room does NOT hardcode roles/models | ✅ |
| Identity never mutated | ✅ `displayName` = agentId |
| Composition at API boundary, not React | ✅ `composeParticipants()` |
| Agent/Team authority is sole source of membership | ✅ |
| Lifecycle events enrich, don't establish membership | ✅ |
| No UD decisions | ✅ |
| No AR-P2 | ✅ |
