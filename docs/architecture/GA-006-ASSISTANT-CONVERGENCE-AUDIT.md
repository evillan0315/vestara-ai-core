---
title: GA-006 — Global/Floating Assistant Exploration, Audit & Analysis
version: 1.0.0
status: complete
owner: vestara
date: 2026-09-11
mode: audit / analysis / exploration only
---

# GA-006 — Global/Floating Assistant Exploration, Audit & Analysis

## 1. Executive Summary

**Critical finding**: There is **one assistant system** — the Global Assistant. The "Floating Assistant" is a display mode of the same system, not a separate implementation. Both share identical backend infrastructure, conversation service, provider execution, and persistence.

The primary production blocker is **Activity Room human message visibility** — human messages persist only in legacy `activity.db`, invisible to the production M11C UI.

## 2. Global/Floating Assistant Relationship

### Evidence-Based Classification

There is **no separate Floating Assistant implementation**. The architecture is:

```
ShellLayout
  └─ GlobalAssistant (one component, one hook instance)
       ├─ FloatingPanel (floating window chrome)
       │    └─ ConversationPanel (chat UI)
       ├─ FullWindowSurface (fullscreen chrome)
       │    └─ ConversationPanel (chat UI)
       └─ LauncherDock (recent conversations)
```

Both modes share:
- The same `useAssistantConversation` hook instance
- The same `ConversationPanel` component
- The same backend endpoints (`/api/conversations/*`)
- The same `ConversationService` instance
- The same SQLite persistence
- The same `ProviderExecutor` (OpenCode adapter)
- The same session registry and binding resolver

**The only difference is UI chrome** — `FloatingPanel` (draggable 400×500 window) vs `FullWindowSurface` (fullscreen overlay).

### Convergence Matrix (Evidence-Based)

| Capability | Global | Floating | Classification |
|-----------|--------|----------|----------------|
| Conversation | useAssistantConversation | useAssistantConversation | **SHARED** (same hook instance) |
| Message persistence | SqliteConversationStore | SqliteConversationStore | **SHARED** (same store) |
| Provider/model resolution | AssistantBindingResolver | AssistantBindingResolver | **SHARED** (same resolver) |
| Tool execution | OpenCode adapter | OpenCode adapter | **SHARED** (same adapter) |
| Tool observations | GA-CTX-001 (ToolObservation) | GA-CTX-001 (ToolObservation) | **SHARED** (same persistence) |
| Context assembly | DefaultContextAssembler | DefaultContextAssembler | **SHARED** (same assembler) |
| Execution | OpenCode SSE → StreamChunks | OpenCode SSE → StreamChunks | **SHARED** (same path) |
| Permissions | AssistantInteractionBroker | AssistantInteractionBroker | **SHARED** (same broker) |
| Streaming | SSE via /api/conversations/:id/stream | SSE via /api/conversations/:id/stream | **SHARED** (same endpoint) |
| Artifacts | Evidence pipeline | Evidence pipeline | **SHARED** (same pipeline) |
| Evidence | Evidence pipeline | Evidence pipeline | **SHARED** (same pipeline) |
| Session/recovery | AssistantConversationSessionRegistry | AssistantConversationSessionRegistry | **SHARED** (same registry) |
| Activity projection | EventBus → M9 ingestion | EventBus → M9 ingestion | **SHARED** (same bridge) |
| UI state | FloatingPanel state | FullWindowSurface state | **ADAPTED** (same hook, different chrome) |

**Classification: 13 SHARED, 0 GLOBAL-ONLY, 0 FLOATING-ONLY, 0 DUPLICATED, 1 ADAPTED, 0 AMBIGUOUS**

## 3. Current Architecture

### Backend Stack

| Component | Owner | File | Status |
|-----------|-------|------|--------|
| ConversationService | `@vestara/conversation` | `packages/conversation/src/index.ts` | Production |
| SqliteConversationStore | `@vestara/conversation-runtime` | `packages/conversation-runtime/src/conversation-store.ts` | Production |
| DefaultContextAssembler | `@vestara/context` | `packages/context/src/index.ts` | Production (GA-CTX-001 fixed) |
| OpenCode Adapter | `apps/api` | `apps/api/src/assistant-opencode-adapter.ts` | Production |
| Binding Resolver | `apps/api` | `apps/api/src/assistant-binding-resolver.ts` | Production |
| Capability Policy | `apps/api` | `apps/api/src/assistant-capability-policy.ts` | Production |
| Interaction Broker | `apps/api` | `apps/api/src/assistant-interaction-broker.ts` | Production |
| Session Registry | `apps/api` | `apps/api/src/assistant-conversation-sessions.ts` | Production |
| Conversation Routes | `apps/api` | `apps/api/src/routes/conversations.ts` | Production |

### Frontend Stack

| Component | Owner | File | Status |
|-----------|-------|------|--------|
| GlobalAssistant | `apps/workspace` | `apps/workspace/src/components/assistant/GlobalAssistant.tsx` | Production |
| FloatingPanel | `apps/workspace` | `apps/workspace/src/components/assistant/FloatingPanel.tsx` | Production |
| FullWindowSurface | `apps/workspace` | `apps/workspace/src/components/assistant/FullWindowSurface.tsx` | Production |
| ConversationPanel | `apps/workspace` | `apps/workspace/src/components/assistant/ConversationPanel.tsx` | Production |
| useAssistantConversation | `apps/workspace` | `apps/workspace/src/hooks/useAssistantConversation.ts` | Production |
| LauncherDock | `apps/workspace` | `apps/workspace/src/components/assistant/LauncherDock.tsx` | Production |

## 4. Conversation Authority

**Single authority**: `DefaultConversationService` (one instance, created at `workspace-context.ts:884`).

| Aspect | Authority |
|--------|-----------|
| Create conversation | ConversationService |
| Send message | ConversationService |
| Stream response | ConversationService → ProviderExecutor |
| Persist messages | SqliteConversationStore (SQLite) |
| Context assembly | DefaultContextAssembler |
| Provider execution | OpenCode adapter (via ProviderExecutor) |
| Session binding | AssistantConversationSessionRegistry |
| Permission governance | AssistantInteractionBroker |

**No duplication**. Both surfaces call the same REST endpoints.

## 5. Execution Path

```
Browser → POST /api/conversations/:id/stream
  → ConversationService.sendMessageStream()
    → DefaultContextAssembler.buildContext()
    → ProviderExecutor.stream() [OpenCode adapter]
      → POST /session/:id/prompt_async
      → Consume SSE events → StreamChunks
    → Persist assistant message (text + toolObservations)
    → Yield SSE chunks to browser
```

**Single execution path**. No separate execution for Global vs Floating.

## 6. Tool Path

**Shared via OpenCode adapter**:
- `buildToolsMap()` controls per-turn tool availability from `GA-CAP-003` policy
- Tool calls produce `tool_call` and `tool_result` StreamChunks
- GA-CTX-001 persists `ToolObservation[]` on assistant messages
- Context assembler includes observations in subsequent turns

## 7. Context Assembly

**Shared**: `DefaultContextAssembler` (one instance at `workspace-context.ts:885`).

After GA-CTX-001 fix:
- System prompt
- Last 20 messages
- For assistant messages with tool observations:
  - Tool observations FIRST (what happened)
  - Assistant text SECOND (interpretation)
- Current user message

## 8. Provider/Model Routing

**Shared**: `AssistantBindingResolver` (one instance at `workspace-context.ts:843`).

- Server-authoritative validation
- Browser requests validated, not trusted
- Unresolvable bindings fail deterministically (400)

## 9. Permissions

**Shared**: `AssistantInteractionBroker` (one instance at `workspace-context.ts:825`).

- Permission allow/deny + question answer decisions
- Bridges OpenCode permission/question requests with browser HTTP decisions
- Single instance shared across all surfaces

## 10. Artifacts/Evidence

**Shared**: Evidence pipeline (same pipeline for both surfaces).

- Tool executions produce evidence via the evidence pipeline
- Verification results projected into Activity Room
- No separate artifact system per surface

## 11. Streaming

**Shared**: Same SSE endpoint (`POST /api/conversations/:id/stream`).

- Same `ConversationChunk` events
- Same `AssistantToolCard` rendering
- Same `AssistantExecutionTimeline`

## 12. Persistence/Recovery

**Shared**: `SqliteConversationStore` (one instance at `workspace-context.ts:879`).

- Conversations survive page reload
- Messages persist to SQLite
- Runtime session IDs persist for session reuse
- Tool observations persist (GA-CTX-001)

## 13. Activity Room Integration

**Separate system** with shared execution lineage:

| Aspect | Assistant | Activity Room |
|--------|----------|---------------|
| Conversation authority | ConversationService | No conversation — Activity Records |
| Message model | Message (text + toolObservations) | ActivityRecord (6 kinds, append-only) |
| Execution observation | EventBus → M9 ingestion | M9 ingestion → ProjectionRuntime |
| Tool observations | ToolObservation on Message | AgentMessageKind in ActivityRecord |
| Identity | userId + conversationId | participantId + actor |

**Integration point**: EventBus → M9IngestionBridge. Assistant executions emit events that Activity Room ingests.

## 14. Production Readiness

| Area | Status |
|------|--------|
| Conversation authority | READY |
| Message persistence | READY |
| Provider/model resolution | READY |
| Tool execution | READY |
| Tool observations | READY (GA-CTX-001, runtime HOLD) |
| Context assembly | READY (GA-CTX-001 chronology fixed) |
| Execution | READY |
| Permissions | READY |
| Streaming | READY |
| Artifacts | READY |
| Evidence | READY |
| Session/recovery | READY |
| Activity projection | READY |
| UI state | READY |

**Overall**: The assistant system is production-ready for its core function. The primary gap is Activity Room integration (human message visibility, context sharing).

## 15. Dogfood Scenario

| Step | Status | Evidence |
|------|--------|----------|
| 1. User opens Workspace | ✅ PASS | ShellLayout renders |
| 2. User invokes assistant | ✅ PASS | Ctrl+J toggle, launcher button |
| 3. User discusses task | ✅ PASS | Conversation service works |
| 4. Assistant uses tools | ✅ PASS | OpenCode adapter, tool execution |
| 5. Tool observations survive | ⚠️ PARTIAL | GA-CTX-001 implemented, runtime HOLD |
| 6. User opens Activity Room | ✅ PASS | M11C renders |
| 7. Context available in AR | ⚠️ PARTIAL | Execution events projected, conversation not shared |
| 8. @mention agent | ⚠️ PARTIAL | UI parses, no execution dispatch |
| 9. Governed execution | ⚠️ PARTIAL | Harness works, not wired from AR |
| 10. AR displays progress | ✅ PASS | M9 ingestion + projection |
| 11. Permission requests | ✅ PASS | Interaction system works |
| 12. Artifacts produced | ✅ PASS | Evidence pipeline works |
| 13. Verification projected | ✅ PASS | Verification projector works |
| 14. Discuss result | ⚠️ PARTIAL | Assistant works, AR conversation separate |
| 15. Survives reload | ⚠️ PARTIAL | M9 durable, human messages only in legacy DB |
| 16. Build Vestara | ⚠️ PARTIAL | Core path works, continuity gaps |

## 16. Blockers

1. **Human message visibility in Activity Room** (AR-GA-006)
2. **Context continuity** — Activity Room has no context assembly (AR-GA-007)
3. **Cross-surface continuity** — Assistant ↔ Activity Room bridge (AR-GA-008)
4. **Runtime verification of GA-CTX-001** — needs live session

## 17. Recommended Milestones

### Immediate (unblock dogfood)

| Milestone | Objective | Dependencies |
|-----------|-----------|-------------|
| AR-GA-006 | Human Message → M9 Production Ingestion | None |
| AR-GA-007 | Activity Room Context Assembly | AR-GA-006, GA-CTX-001 |
| AR-GA-008 | Assistant ↔ Activity Room Bridge | AR-GA-006, AR-GA-007 |

### Parallel

| Milestone | Objective |
|-----------|-----------|
| VES-DESIGN-004 | Marketplace Premium UX |
| GA-CTX-001 runtime verification | Live Floating Assistant test |

### Later

| Milestone | Objective |
|-----------|-----------|
| M12 Contextual Assistant | Activity Room contextual assistant |
| R10 Attention UI | Interaction attention display |

## 18. What NOT to Rebuild

- Conversation service — production quality
- OpenCode adapter — production quality
- Binding resolver — production quality
- Capability policy — production quality
- Interaction broker — production quality
- Session registry — production quality
- ConversationPanel — production quality
- useAssistantConversation hook — production quality
- FloatingPanel / FullWindowSurface — production quality
- Activity Room M9→M10→M11 pipeline — production quality
- M11B WebSocket protocol — frozen and working
- Evidence pipeline — production quality
- Tool governance — production quality

## 19. HOLDs

1. **GA-CTX-001 runtime verification** — requires live Floating Assistant session
2. **Presence model convergence** — 3 competing models need architectural decision
3. **Activity Room conversation semantics** — whether AR should have its own conversation model

---

## 20. Frozen Conclusions (Accepted 2026-09-11)

### 1. Global Assistant Architecture

**There is one Global Assistant system.**

"Floating Assistant" is not a separate assistant runtime. It is a presentation mode of the Global Assistant.

Current presentation modes:
- `FloatingPanel` — floating window chrome
- `FullWindowSurface` — full-window chrome

Both use the same underlying assistant infrastructure.

### 2. Convergence Result (Evidence-Based)

| Capability | Classification |
|-----------|----------------|
| Conversation | SHARED |
| Message persistence | SHARED |
| Provider/model resolution | SHARED |
| Tool execution | SHARED |
| Tool observations | SHARED |
| Context assembly | SHARED |
| Execution | SHARED |
| Permissions | SHARED |
| Streaming | SHARED |
| Artifacts | SHARED |
| Evidence | SHARED |
| Session/recovery | SHARED |
| Activity projection | SHARED |
| UI state | ADAPTED |

**Summary**: 13 SHARED, 0 GLOBAL-ONLY, 0 FLOATING-ONLY, 0 DUPLICATED, 1 ADAPTED

Do not preserve earlier architectural speculation that Global and Floating may be separate runtimes. The audit evidence supersedes that hypothesis.

### 3. Terminology

For architecture and future milestones:

- **"Global Assistant"** = the assistant system
- **"Floating Assistant" / "FloatingPanel"** = floating presentation mode
- **"Full Window" / "FullWindowSurface"** = full presentation mode

Where historical milestone names use "Global/Floating Assistant", retain them for traceability but document the clarified architecture.

### 4. GA-CTX-001 Status

```
IMPLEMENTATION FROZEN
STATIC/TEST VERIFICATION PASS
LIVE RUNTIME DOGFOOD HOLD
```

The remaining HOLD is verification, not a new implementation milestone. Do not mark live tool-observation continuity runtime-verified until actual dogfood evidence exists.

### 5. Activity Room Boundary

**Primary integration blocker**: Human messages currently persist through the legacy activity path and are not visible through the production M9/M11C Activity Room path.

Recorded milestones (ON HOLD):

- AR-GA-006 — Human Message → M9 Production Ingestion
- AR-GA-007 — Activity Room Context Assembly
- AR-GA-008 — Global Assistant ↔ Activity Room Bridge

Do NOT implement these yet.

### 6. Current Architectural Relationship

```
                    Global Assistant
                           |
                 +---------+---------+
                 |                   |
           FloatingPanel       FullWindowSurface
                 |                   |
                 +---------+---------+
                           |
                Shared Assistant Substrate
                           |
              Conversation / Execution
               Tools / Context / Evidence
                           |
                  Governed Integration
                           |
                     Activity Room
```

Activity Room remains a separate operational surface and must not become a second Global Assistant runtime or execution authority.

### 7. Next Active Milestone

After recording GA-006, proceed to:

**VES-DESIGN-004 — Marketplace Premium UX Convergence**

The Activity Room convergence chain remains on HOLD.

---

> **GA-006 AUDIT COMPLETE — ACCEPTED 2026-09-11**
