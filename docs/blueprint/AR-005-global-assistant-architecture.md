# AR-005 — Global Assistant Domain & Execution Architecture

**Author**: Vestara Developer Agent  
**Date**: 2026-09-04  
**Prerequisite**: AR-004 (frozen)

---

## AR-005.1 — Existing Assistant/Conversation Audit

### Infrastructure Inventory

| Package | Location | Role | Classification |
|---------|----------|------|---------------|
| `conversation-runtime` | `packages/conversation-runtime/` | Conversation engine, session store, provider routing | CANONICAL_REUSE |
| `conversation` | `packages/conversation/` | Conversation service, send/receive | CANONICAL_REUSE |
| `thread-runtime` | `packages/thread-runtime/` | Thread persistence for harness execution | CANONICAL_REUSE |
| `agent-harness` | `packages/agent-harness/` | Agent execution, AI invocation, approval | CANONICAL_REUSE |
| `provider-runtime` | `packages/provider-runtime/` | Provider/model routing, health tracking | CANONICAL_REUSE |
| `workspace` (agents) | `packages/workspace/src/agents.registry.ts` | Canonical agent definitions | CANONICAL_REUSE |
| `conversation-runtime` (providers) | `packages/conversation-runtime/src/provider/` | OpenCode, Ollama, Gemini, local providers | CANONICAL_REUSE |

### Existing Agent Definitions

From `agents.registry.ts`:

| Agent ID | Role | Provider | Model |
|----------|------|----------|-------|
| `agent-context` | context | opencode | mimo-v2.5-free |
| `agent-planner` | planner | opencode | mimo-v2.5-free |
| `agent-developer` | developer | opencode | mimo-v2.5-free |
| `agent-reviewer` | reviewer | opencode | mimo-v2.5-free |
| `agent-verifier` | verifier | opencode | mimo-v2.5-free |

**No existing "assistant" agent exists in the canonical registry.**

### Existing Conversation Flow

```
User → ConversationService.send() → ProviderExecutor → Provider → Response
```

The `DefaultConversationService` already implements:
- Message send/receive
- Session management
- Provider routing
- Conversation persistence

### Verdict

**No existing implementation behaves like a Global Assistant.** The closest is the `DefaultConversationService`, which provides conversation infrastructure but lacks agent identity, harness integration, and workspace awareness.

---

## AR-005.2 — Canonical Assistant Identity

### Proposed Agent Definition

```typescript
{
  id: 'agent-assistant',
  name: 'Assistant',
  role: 'assistant',
  agentType: 'workspace',
  description: 'Global conversational assistant for Workspace users.',
  capabilities: ['conversation', 'context-reading', 'question-answering'],
  permissions: [
    { resource: 'repository', action: 'read', approvalRequired: false },
    { resource: 'activity', action: 'read', approvalRequired: false },
    { resource: 'conversation', action: 'create', approvalRequired: false },
    { resource: 'conversation', action: 'read', approvalRequired: false },
  ],
  provider: 'opencode',
  model: 'mimo-v2.5-free',
  color: '#3b82f6',
  status: 'active',
  runtimeAgent: 'vestara-assistant',
  mode: 'primary',
  opencodePermissions: { ...READONLY_GRANT },
}
```

### Identity Invariants

- ✅ Canonical `agent-assistant` ID
- ✅ No provider/model encoded in identity (resolves at execution time)
- ✅ No repository/session/workspace encoded in identity
- ✅ Globally recognizable
- ✅ Dynamically configurable through existing agent infrastructure

---

## AR-005.3 — Assistant Authority Contract

### MAY Own

| Authority | Boundary |
|-----------|----------|
| Conversational reasoning | For its own turn only |
| Response generation | Through configured provider/model |
| Requesting contextual reads | Read-only, no mutation |
| Proposing actions | Proposals only, no execution |
| Interpreting user intent | Conversationally, not programmatically |

### MUST NOT Own

| Authority | Owner |
|-----------|-------|
| WorkflowRun state | Workflow Orchestrator |
| DevelopmentPlan state | Planner agent |
| RepositoryBinding | Workspace/Repository |
| Provider/model authority | Provider Runtime |
| RuntimeSessionBinding | Runtime Session |
| Verification verdict | Verification/VCTRL |
| Evidence truth | Evidence authority |
| Activity projection | Activity Room |
| Permissions/policy | Permission system |

### Critical Boundary

The Assistant may **reference** these authorities but cannot **silently replace** them.

---

## AR-005.4 — Conversation Ownership

### Existing Architecture

| System | Owner | Role |
|--------|-------|------|
| `conversation-runtime` | Conversation authority | Session management, provider routing |
| `thread-runtime` | Thread persistence | Harness execution threads |
| Activity Room messaging | Activity Room | MESSAGE_INGRESS + MESSAGE_PROJECTION |
| `interaction` | Interaction system | Structured interactions |

### Desired Boundary

```
Conversation
     │
     ├── Human message
     │
     └── Assistant message

Activity Room
     └── projects relevant conversation/activity facts
```

### Decision

- **Reuse `conversation-runtime`** for Assistant conversations
- **Reuse `thread-runtime`** for harness execution threads
- **Do NOT create** `AssistantConversationStore`, `FloatingAssistantConversation`, or `AssistantThreadRuntime`
- **Conversation truth** and **Activity projection** remain distinct

---

## AR-005.5 — Execution Path

### Canonical Execution Path

```
Assistant AgentDefinition
         ↓
Agent Harness (existing)
         ↓
Execution Binding (existing)
         ↓
Provider Runtime (existing)
         ↓
configured provider/model/runtime
```

### Infrastructure Reuse

| Component | Existing Package | Reuse? |
|-----------|-----------------|--------|
| Agent Definition | `workspace/agents.registry.ts` | ✅ Add `agent-assistant` |
| Agent Harness | `agent-harness` | ✅ Existing |
| Execution Binding | `agent-harness/execution-policy.ts` | ✅ Existing |
| Provider Runtime | `provider-runtime` | ✅ Existing |
| Provider Model | `conversation-runtime/provider/` | ✅ Existing |

### No New Packages

- ❌ `AssistantOpenCodeClient`
- ❌ `AssistantProvider`
- ❌ `AssistantModelResolver`
- ❌ `AssistantExecutionService`

---

## AR-005.6 — Provider/Model Policy

### Configuration-Driven Resolution

```typescript
// From agents.registry.ts
{
  provider: 'opencode',      // Configurable
  model: 'mimo-v2.5-free',   // Configurable
}
```

### Resolution Chain

```
Assistant AgentDefinition
    ↓
provider: 'opencode' (from definition)
    ↓
ProviderManager.resolve('opencode')
    ↓
OpenCodeProvider (or fallback)
    ↓
model: 'mimo-v2.5-free' (from definition)
```

### Policy Benefits

- ✅ Model can change without identity change
- ✅ Provider fallback according to policy
- ✅ No hardcoded permanent model

---

## AR-005.7 — Assistant Runtime Session Ownership

### Conceptual Architecture

```
Assistant Conversation
        ↓
Assistant RuntimeSessionBinding
        ↓
runtime session (assistant-specific)
```

### Critical Boundary

```
Workflow ABC
    └── engineering OpenCode session S1

Assistant conversation
    └── assistant OpenCode session S2
```

Inspecting Workflow ABC does **not** authorize reuse of S1.

### Current Limitation

If current infrastructure cannot yet provide durable Assistant session continuity, **document the limitation** and preserve safe ephemeral behavior rather than inventing a competing session manager.

### M7 Compatibility

Do not implement deferred M7 milestone as part of AR-005.

---

## AR-005.8 — Initial Assistant Capability

### Bounded Scope

| Capability | Status |
|-----------|--------|
| Receive human text | ✅ |
| Execute one conversational turn | ✅ |
| Return assistant text | ✅ |
| Preserve conversation/thread correlation | ✅ |
| Identify through canonical AgentDefinition | ✅ |
| Use configured provider/model resolution | ✅ |
| Broad engineering mutation tools | ❌ Not yet (AR-010, AR-011) |

### Safety Boundary

A message like "Fix the failing authentication test" must **not** cause the Assistant to directly invoke `Developer.execute()`, filesystem mutation, or git mutation.

Until AR-011:
- ✅ Assistant → explain / reason / propose
- ❌ Assistant → mutate engineering state

---

## AR-005.9 — No Implicit Engineering Execution

### Prohibited Patterns

| Pattern | Status | Owner |
|---------|--------|-------|
| `Developer.execute()` | ❌ Prohibited | Agent Harness |
| `OpenCode coding task` | ❌ Prohibited | Agent Harness |
| Filesystem mutation | ❌ Prohibited | Agent Harness |
| Git mutation | ❌ Prohibited | Agent Harness |

### Safe Pattern

```
User: "Fix the failing authentication test."
    ↓
Assistant: "I can help you understand the test failure. Let me read the test file and the related code."
    ↓
Assistant: "The test expects X but the implementation returns Y. Here's what I recommend..."
```

---

## AR-005.10 — Activity Room Relationship

### Event Flow

```
Assistant/conversation event
         ↓
existing EventBus/adapter
         ↓
Activity Room projection
```

### Source Classification

The existing `M9IngestionBridge` classifies these as INGEST:
- `conversation:created`
- `conversation:response.completed`
- `conversation:session.started`

These already flow into Activity Room projection.

### No New Pipeline

- ❌ Do NOT add an Assistant-specific Activity pipeline
- ✅ Use existing EventBus/adapter infrastructure

---

## AR-005.11 — Assistant Result Contract

### Minimal Domain Result

```typescript
interface AssistantTurnResult {
  readonly conversationId: string;
  readonly humanMessageId: string;
  readonly assistantMessageId: string;
  readonly agentId: string;
  readonly executionCorrelation: string;
  readonly responseContent: string;
  readonly completedAt: string;
  readonly success: boolean;
  readonly error?: string;
}
```

### Invariants

- ✅ Carries enough identity/correlation for UI integration
- ✅ Does NOT expose provider-specific response objects
- ✅ Conversation/thread identity preserved
- ✅ Human/assistant message correlation preserved

---

## AR-005.12 — Failure Semantics

### Failure Matrix

| Failure | Behavior | Observable? |
|---------|----------|------------|
| Assistant agent unavailable | Return error message | ✅ |
| Provider unavailable | Fallback per policy | ✅ |
| Model unavailable | Fallback per policy | ✅ |
| Execution failure | Return error message | ✅ |
| Timeout | Return timeout message | ✅ |
| Conversation persistence failure | Log error, return partial | ✅ |
| Malformed model response | Return error message | ✅ |
| Runtime unavailable | Return error message | ✅ |

### Critical Invariant

```
Assistant failure ≠ Workflow failure ≠ Activity Room failure ≠ Conversation corruption
```

Preserve the user's submitted message where possible and represent Assistant failure explicitly.

---

## AR-005.13 — Concurrency

### Behavior

- Multiple Assistant messages against the same conversation are serialized
- Each turn completes before the next begins
- No accidental concurrent turns corrupt ordering or conversation context

### Implementation

Use existing thread/conversation serialization behavior from `conversation-runtime`.

---

## AR-005.14 — Verification

### Deterministic Tests Required

| Test | Coverage |
|------|----------|
| Assistant identity | Canonical `agent-assistant` exists |
| AgentDefinition resolution | Resolves through agent infrastructure |
| Configured provider/model resolution | Provider/model from definition |
| One successful turn | Human → Assistant response |
| Human/assistant message correlation | Messages linked by conversation |
| Conversation/thread ownership | Conversation runtime owns truth |
| Execution binding | Harness executes turn |
| Failure behavior | Error messages returned |
| Sequential turn ordering | Turns serialized |
| Absence of engineering mutation | No filesystem/git changes |

### Test Requirements

- Stub/deterministic provider execution
- No OpenCode server required
- No internet required
- No provider quota required
- No live model required

---

## AR-005.15 — Bounded Live Characterization

### Live Turn Capture

| Field | Value |
|-------|-------|
| Assistant agentId | `agent-assistant` |
| runtimeAgent | `vestara-assistant` |
| provider | (from configuration) |
| model | (from configuration) |
| conversation/thread ID | (generated) |
| execution correlation | (generated) |
| runtime session ID | (if applicable) |
| response | (assistant text) |
| Activity projection | (if produced) |

### Gate

Live characterization must be **explicitly gated** and must not run under ordinary `pnpm test`.

---

## Summary

### Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Canonical Assistant identity | ✅ `agent-assistant` |
| No provider/model in identity | ✅ Resolves at execution |
| Existing conversation authority reused | ✅ `conversation-runtime` |
| Existing Harness reused | ✅ `agent-harness` |
| Existing provider/runtime authority reused | ✅ `provider-runtime` |
| Safe runtime-session boundary | ✅ Separate sessions |
| Deterministic turn correlation | ✅ `AssistantTurnResult` |
| Explicit failure semantics | ✅ Failure matrix |
| No engineering mutation authority | ✅ Read-only initially |
| No duplicate Activity pipeline | ✅ Existing EventBus |

### No Mutations Required

AR-005 is an architecture/audit milestone. The existing infrastructure provides all required components. No code changes were made during AR-005.

### Stopping for Director Review

Per directive: "Stop for Director review. Do not proceed automatically to AR-006."
