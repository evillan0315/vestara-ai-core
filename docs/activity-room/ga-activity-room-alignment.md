---
title: Global Assistant ↔ Activity Room Alignment — Streams, Participants, Status, Tools, Agents
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-13
next-review: 2026-11-13
---

# Global Assistant ↔ Activity Room Alignment — Streams, Participants, Status, Tools, Agents

**Date:** 2026-10-13
**Scope:** Investigate how the global assistant aligns with and wires into Activity Room streams, participants, status, tools, agents.
**Authority reminder:** Activity Room is an operational projection/control surface, not execution, workflow, routing, Conversation, interaction, agent-registry, or Evidence authority.

## 1. Global Assistant identity

- Canonical agent `agent-assistant` (`Assistant`, `role: assistant`, `runtimeAgent: vestara-assistant`) — 1 of 7 in `packages/workspace/src/agents.registry.ts:395-453`.
- Grant `ASSISTANT_GRANT`: `task/webfetch/websearch: ask`, `doom_loop: deny`, `bash: allow` (bounded by per-turn `maxToolCalls`).
- UI `apps/workspace/src/components/assistant/GlobalAssistant.tsx`: presentation/composition only. Consumes `useAssistantConversation` (GA-2) + `useSurfaceContext` (GA-3). No conversation, execution, governance, or Activity Room authority.
- Durable conversation truth lives in Conversation Runtime (`ConversationService/API`); `useAssistantConversation.ts` is a thin adapter (`StreamState idle|sending|streaming|completed|failed|detached`, optimistic `clientTurnId → clientMessageId`, transient `ToolOperationState`).

## 2. Streams

Authority flow (frozen): `M9 durable truth → M10 projection → M11A HTTP + M11B WS → useM11CActivityRoom → UI`.

- Contract: `packages/activity-room/src/projection-types.ts:50-153` (`StreamItem`: `streamItemId/activityId/sequenceNumber/kind/importance/actor/content/details/workflowRunId/executionId/taskId/runtimeSessionBindingId/originConversationId/originSurface/aggregated/interaction/tool`).
- Transport: `packages/activity-room/src/stream.ts` (`activity.appended | activity.resync-required`, exactly-once in-order, checkpoint + bounded 128 buffer, overflow → resync).
- Client: `apps/workspace/src/lib/m11a-api.ts` (`/api/activity-room/v1/snapshot|activities|participants|attention`), `lib/m11b-client.ts` (`/ws/activity-room/v1`), `hooks/useM11CActivityRoom.ts` (`SNAPSHOT_LIMIT 50`, `MAX_WORKING_SET 500`, `LIVE_BATCH_MS 40`; `M11CActivityStream.tsx RENDER_WINDOW 100`).
- Visual: `M11CStreamItem.tsx:145-170 classifyVisual()` maps authoritative `kind` → `human|agent-note|work|task|workflow|tool|quiet|attention|verification`.

Assistant linkage is provenance-routed, not store-shared:

- `apps/workspace/src/lib/assistant-navigation.ts` (AR-UI-REPLY-001/002): `originConversationId` present with NO `originSurface` → Global Assistant provenance → `routeActivityReply → {kind:'assistant'}` → reused `open-assistant` window event → `GlobalAssistant.tsx:247-258` selects the EXISTING conversation (never creates). `originSurface` present (`workspace-ui`, Telegram, future) or missing id → local Activity Room composer. Fail-safe/closed; never infers from actor/content/icons.
- `contexts/SurfaceContext.tsx` (GA-3 + AR-009): `SurfaceContext {workspace, surface {routeId,path,title,section}, selected}`. Activity Room contributes `SurfaceReference` via `useSetActivitySelection()`; Room selection takes priority over graph inspector but `SurfaceContext` remains canonical owner. Display-only.

## 3. Participants

- Authority: `GET /api/activity-room/v1/participants` → `ParticipantProjection` (`projection-types.ts:161-229`): `participantId, type, displayName, modelDisplayName?, role?, modelId?, providerId?, teamId?/teamName? (upstream AgentTeam only — Room does not own), membership, presence, workState, currentAssignment, pendingInteractionId, joinedAt/lastActivityAt`.
- UI: `pages/activity/M11CParticipantRail.tsx` — zero hardcoded teams/roles/models; search + `all|human|agent` filter; severity sort (blocked/attention-required → working → waiting → idle); census `total · at work · blocked`.
- Identity honesty: `displayName == modelId` demoted to meta; primary becomes `modelDisplayName ?? 'Unknown agent'`. Upstream M9-adapter model-id-as-displayName recorded as FIRST BROKEN BOUNDARY (not repaired in M11C).
- Presence honesty: M10 never resolves presence today (uniform `offline` default, "resolved independently" path unwired). Lamps render only for positively-resolved `online|active|busy|away`; never inferred from `workState`.
- Assistant wiring: `ContextualCapabilities.mentionableParticipants` feeds composer `@` mentions; `participantNames/participantModels` enrich stream rows; `AgentProjectionDrawer.resolveAgentIdFromParticipantId()` + `onOpenAgentControl`; `correlated-session.ts deriveCorrelatedSessions()` links `runtimeSessionBindingId`.

## 4. Status

Single source `pages/activity/status-config.ts` (GA-STATE-001) → `StatusIndicator`:

- `M11CConnectionState connecting|live|reconnecting|offline|paused|error` (M11B + local pause) → `CONNECTION_STATUS_CONFIG`.
- `ActivityDataStatus available|incomplete|unavailable` (`available && snapshotComplete`, M11A) → `ACTIVITY_DATA_STATUS_CONFIG`.
- `WorkflowSummary.status` → `WORKFLOW_STATUS_CONFIG` (`running: live+pulse`).
- `PresenceState` → `PRESENCE_VARIANT_CONFIG`; `WorkState` → `WORK_STATE_CONFIG` (`available/idle → Idle`, never a presence claim).
- Assistant `StreamState` (`idle/sending/streaming/completed/failed/detached`) is a DISTINCT lifecycle — never merged with Room `live/reconnecting`. `detached` = SSE disconnect ≠ cancellation (server execution continues).

Freshness honesty: `ActivityFreshness` (`Updated just now / Ns ago`); rail header "Roster snapshot · Refreshes on reconnect" (AR-LIVE-001).

## 5. Tools

- Assistant (transient): SSE `tool` → `running` upsert, `tool_result` → `completed` (≤200ch preview) / `failed` (content==`failed` encoding — M3 gap: no `ok/error` flag, no operation id). Rendered by `AssistantToolCard.tsx + AssistantExecutionTimeline`; never persisted; unmounts with active turn. Defines `normalizeToolCategory/toolDisplayLabel`.
- Activity Room (durable): M9 `payload.tool {toolName, callID, status: started|completed|failed, agentId?, sessionId?, output?}` → `StreamItem.tool` (only `tool-call|tool-result`) → `M11CStreamItem` agent-attributed rows + `callID` pairing without merging append-only records. Reuses Assistant `normalizeToolCategory` for consistent icons. `details {reasoning,providerId,modelId,latencyMs,tokens,conversationId}` projected from durable payload only (`REASONING-BOUNDARY-001`).
- Historic gap noted in comments (start vs completion / succeeded vs failed indistinguishable pre-Phase-1) is now closed by `tool` passthrough; drill-down via `ActivityDetailDrawer` + `edit-observation.ts fetchFileMutationObservation()` → Files drawer read-only historic diff (`activity-edit-inspection.ts`), `Open file` fallback.

## 6. Agents

- Platform: 7 canonical agents (`agents.registry.ts`); `agent-assistant` is conversational surface; `context/planner/developer/reviewer/verifier/browser` appear in Room as `type: agent` participants with `role/modelId/providerId`.
- Room never defines agents — consumes denormalized upstream fields. `M11CWorkflowBrowser.deriveWorkflowUnits/hasActiveWork`, `ActivityRoomOperationalLane`, `ExecutionPulse`, `use-realtime-*` all derive from M11A/B; no UI-owned workflow state, no polling.

## 7. Adjacent observations (not blockers for this investigation)

- Presence resolution still unwired (uniform `offline`); roster refreshes only on snapshot/reconnect.
- `M11CStreamItem.tsx:106-127` taxonomy comment still says "No callID exists in the projection chain" — stale relative to Phase-1 `tool.callID` passthrough; comment-only drift.
- No action taken; recorded for the owning milestone.
