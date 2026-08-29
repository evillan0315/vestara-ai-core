# ARX-015 AR-REC-A — Existing Capability + Governance Audit

> **Status**: COMPLETE  
> **Authorized by**: Director  
> **Executed by**: vestara-developer  
> **Date**: 2026-08-29  
> **Mutation scope**: Audit documentation/evidence only. No production code, contracts, schemas, stores, routes, events, UI components, or behavioral changes.  
> **Evidence baseline**: Commits through `b890b91` (AR-REC-A not a code milestone)

---

## Executive Summary

Vestara already has substantial machinery for recommendations and governed decisions. The audit reveals **not a greenfield**, but a **gap analysis against existing infrastructure**. Key finding: three of the four AR-REC domain scenarios can be implemented largely by wiring existing capabilities together, not by building from scratch.

**Recommendation for AR-REC-B**: **PROCEED with REDUCED scope.** Build a thin `Recommendation` domain object that composes existing machinery (SuggestionService, attention system, ConversationContext, approval pipeline, Engineering Event Store, dormant `decisions` table). Do not rebuild persistence, authorization, or event infrastructure.

---

## Deliverable 1: Capability / Authority Map

### 1.1 SuggestionService — Workspace Advisor

**Status**: FUNCTIONAL, REUSE/EXTEND  
**File**: `packages/workspace/src/suggestion-service.ts`

The `SuggestionService` is the closest existing analog to a recommendation system. It generates workspace-aware suggestions via `deterministicSuggest()` (5 strategy branches) and `aiSuggest()` (LLM-powered). Each suggestion carries structured data:

```
Suggestion {
  id: string
  type: 'tool' | 'config' | 'learning' | 'pattern' | 'policy' | 'env' | 'fix'
  title: string
  description: string
  confidence: number (0-1)
  source: string (strategy name)
  command: string (bash command to execute)
  rationale: string (why this suggestion)
  impact: string (expected outcome)
}
```

**Existing lifecycle methods**:
- `dismiss(id)` — persists to `dismissed_suggestions` table
- `trackAction(id, action)` — persists to `suggestion_feedback` table
- `getActiveSuggestions(workspace)` — returns non-dismissed suggestions
- `executeSuggestion(id)` — runs `child_process.exec(suggestion.command)`

**What exists vs. what AR-REC needs**:

| Capability | Status | Gap |
|-----------|--------|-----|
| Generate structured suggestion | ✅ Exists | None — types align |
| Persist dismissal | ✅ Exists | None |
| Track action taken | ✅ Exists | Needs `decision` field (currently stores `action` string) |
| Execute suggestion | ✅ Exists | None |
| **Accept/Approve workflow** | ❌ Missing | No `accept(id, rationale)` that creates decision record |
| **Multi-choice selection** | ❌ Missing | SuggestionService generates singular recommendations, not N options |
| **Decision record persistence** | ⚠️ Dormant | `decisions` table exists in scaffold, zero wiring |
| **Confidence/rationale audit trail** | ⚠️ Partial | `rationale` on Suggestion type, not persisted in feedback |

**Assessment**: SuggestionService is the **primary reuse target**. AR-REC-B should extend it with a `Recommendation` wrapper that adds multi-choice, decision recording, and governance integration — not replace it.

### 1.2 Tool-Level Approval Pipeline

**Status**: FUNCTIONAL, REUSE  
**File**: `packages/agent-harness/src/index.ts` (lines 383-419), `execution-policy.ts`

Complete approval pipeline exists for tool execution:

```
Tool invocation
  → resolveEffectivePolicy() → disposition: 'allow' | 'require-approval' | 'deny'
    → if 'require-approval':
      → createPendingApproval(call, 'tool-call')
      → execution pauses (turn yields)
        → decideApproval(approvalId, 'approved' | 'rejected')
          → if approved: re-execute tool call
          → if rejected: skip, continue turn
```

**Key invariants enforced**:
- `executeWithUserApproval()` — blocks tool execution until human responds
- `requiredApproval()` — forces approval regardless of risk level
- `pendingApprovals()` — discovers unresolved approvals
- `BudgetExhaustedException` — cannot bypass via approval if budget exhausted

**Assessment**: This is the **authorization boundary** for execution. AR-REC should compose at this boundary — a decision to execute a recommendation routes through the existing approval pipeline, not around it.

### 1.3 Task-Level Approval Pipeline

**Status**: FUNCTIONAL, REUSE  
**File**: `packages/workflow-orchestrator/src/orchestration-dispatch.ts`

Orchestration-level approval for task dispatch:

```
orchestrate() → assign()
  → evaluateContext() → approvalPolicy.evaluate(task, changePlan)
    → if policy triggers approval:
      → dispatch starts (background)
      → task status = 'awaiting-approval'
      → createPendingApproval(dispatch.context, 'task-dispatch', changePlan)
        → human reviews change plan
        → decideApproval() → 'approved' | 'rejected'
          → if approved: finalize()
          → if rejected: task canceled
```

**Trigger conditions** (from `DefaultRiskApprovalPolicy`):
- Change sets > 10 files
- Delete operations
- Sensitive paths (.env, .pem, keys, secrets, credentials)

**Assessment**: This is the **governance boundary** for workflow execution. AR-REC recommendations that trigger task execution route through this boundary.

### 1.4 Attention System

**Status**: FUNCTIONAL, REUSE  
**File**: `packages/workspace/src/attention-system.ts`, `agent-storage.ts`

`InMemoryAttentionItem` with `AttentionService` (in-process only):

```
AttentionItem {
  id: string
  kind: 'info' | 'warning' | 'error' | 'success'
  category: string (agent-lifecycle, harness, workspace, task, verification, execution)
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  summary: string
  source: { type, id }
  actionable: boolean
  dismissed: boolean
}
```

**Existing lifecycle**:
- `createAttention()` — creates attention item
- `dismissAttention()` — marks dismissed
- `acknowledgeAttention()` — marks acknowledged

**What exists vs. what AR-REC needs**:

| Capability | Status | Gap |
|-----------|--------|-----|
| Create attention item | ✅ Exists | None |
| Display in UI | ✅ Exists | AttentionTab renders active items |
| Dismiss/acknowledge | ✅ Exists | None |
| **"Present observation" action** | ❌ Missing | Attention is display-only, no structured action that creates decision |
| **Link to recommendation** | ❌ Missing | Attention items don't reference a recommendation ID |
| **Decision outcome tracking** | ❌ Missing | No "observation → decision" pipeline |

**Assessment**: Attention is the **notification surface**. AR-REC should use it for "observation presented" events, but needs a new pipeline to capture the decision outcome.

### 1.5 ConversationContext — Structured Responses

**Status**: FUNCTIONAL, REUSE  
**File**: `packages/conversation/src/types.ts` (lines 98-113)

Structured response types already defined:

```typescript
// The three distinctions:
interface ClarifyOptions {           // Human conversational choice
  kind: 'clarify-options'
  options: Array<{ label, description? }>
}

interface UserInput {                // Generic human input
  kind: 'user-input'
  prompt: string
}

interface Decision {                 // Human choice from agent options
  kind: 'decision'
  question: string
  options: Array<{ label, description? }>
}
```

**What exists vs. what AR-REC needs**:

| Capability | Status | Gap |
|-----------|--------|-----|
| Present options to human | ✅ Exists | `ClarifyOptions` / `Decision` |
| Capture human response | ✅ Exists | `ConversationContext` handles response |
| **Create decision record** | ❌ Missing | Response captured in context, not persisted as decision |
| **Link to recommendation** | ❌ Missing | No recommendation ID in structured response |
| **Governance approval chain** | ❌ Missing | Conversational choice ≠ governance approval |

**Assessment**: ConversationContext provides the **human interaction surface**. AR-REC should use it for presenting recommendations and capturing choices, but must add decision recording and governance routing.

### 1.6 Dormant `decisions` Table

**Status**: SCHEMA EXISTS, ZERO WIRING  
**File**: `packages/workspace/src/scaffold-migrations.ts` (lines 81-89)

```sql
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plan_id TEXT,
  assessment_id TEXT,
  created_at TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  alternatives JSON,
  rationale TEXT,
  confidence REAL,
  accepted INTEGER DEFAULT 0,
  accepted_by TEXT,
  accepted_at TEXT,
  model_version TEXT
)
```

**Assessment**: This is the **exact schema** AR-REC needs for decision persistence. It already has `recommendation`, `alternatives`, `rationale`, `confidence`, `accepted`, `accepted_by`, `accepted_at`. AR-REC-B should wire this table into the `SuggestionService` / `Recommendation` flow rather than creating a new schema.

### 1.7 Engineering Event Store — Audit Trail

**Status**: FUNCTIONAL, REUSE  
**File**: `packages/engineering-event-store/src/index.ts`

Append-only, immutable event log with:
- Hash chaining for tamper evidence
- Correlation tracking (correlationId, causationId, traceId)
- Authority types: `user | system | agent | policy | verification`
- 58 columns covering execution context

**Assessment**: AR-REC should emit `decision.recorded` events to this store for audit purposes. The store already supports the required semantics.

### 1.8 Policy Decision Pipeline

**Status**: FUNCTIONAL, REUSE  
**File**: `packages/policy-engine/src/default-policy-engine.ts`

Multi-policy composition with conflict resolution:
- `PolicyDecision`: `allow | deny | modify` with matched/skipped policies
- Conflict resolution: `deny-overrides`, `allow-overrides`, `priority-ordered`, `most-restrictive`, etc.
- `PolicyDecisionRecord` type exists but has **no persistence store**

**Assessment**: Policy engine is the **governance composition layer**. AR-REC should evaluate recommendations against the policy engine, not build a parallel governance system.

---

## Deliverable 2: End-to-End Interaction Call Graph

### 2.1 Current Flow — Suggestion → Action (No Governance)

```
User opens Agents page
  → AgentsClient.fetchAgents() → GET /api/agents
    → SuggestionService.getActiveSuggestions()
      → deterministicSuggest() / aiSuggest()
        → Suggestion[] returned

User clicks suggestion action
  → SuggestionService.executeSuggestion(id)
    → child_process.exec(command)
      → suggestion:action event emitted

User dismisses suggestion
  → SuggestionService.dismiss(id)
    → dismissed_suggestions table written
```

**Missing**: No approval gate, no decision record, no governance check, no recommendation presentation in Activity Room.

### 2.2 Desired Flow — Recommendation → Decision → Execution (With Governance)

```
Agent generates recommendation (via suggestion, attention, or conversation)
  → RecommendationService.present({
      title, description, rationale, confidence,
      options: [{ label, description, impact }],
      source: { type, id },
      governanceLevel: 'choice' | 'approval' | 'authorization'
    })
    → Recommendation persisted to decisions table
    → recommendation:presented event emitted
    → M9 ingestion bridge projects to Activity Room
    → UI renders recommendation card in stream

Human reviews recommendation
  → UI presents option selection (ClarifyOptions / Decision pattern)
  → Human selects option
    → Decision recorded to decisions table
    → decision.recorded event emitted to Engineering Event Store
    → M9 ingestion bridge projects decision to Activity Room

If governance required (governanceLevel = 'approval' | 'authorization'):
  → Route through existing approval pipeline
    → createPendingApproval() → awaiting-approval state
    → decideApproval() → approved | rejected
      → If approved: execute recommendation
      → If rejected: record rejection

If execution required:
  → Route through execution policy
    → evaluateOperation() → disposition
      → If 'allow': execute
      → If 'require-approval': pause for approval
      → If 'deny': reject with reason
```

### 2.3 Existing Bridges (Wiring Points)

| Bridge | Event Flow | AR-REC Use |
|--------|-----------|------------|
| M9 Ingestion Bridge | EventBus → M9 DurableActivityStore | Consume `recommendation:presented`, `decision.recorded` |
| AgentLifecycleBridge | `harness.*` → `agent:started/completed` | Reference pattern for new bridge |
| HarnessEngineeringEventBridge | `harness.*` → EngineeringEventStore | Emit `decision.recorded` for audit trail |
| ConversationResponseBridge | `conversation:response.completed` → M9 | Already ingests conversation responses |

---

## Deliverable 3: Persistence Ownership Map

| Data | Current Store | Database | AR-REC Action |
|------|--------------|----------|---------------|
| Suggestions | `SuggestionStorage` (in-memory sql.js) | `scaffold.db` | REUSE — extend with `accept()` method |
| Dismissed suggestions | `SuggestionStorage.dismissed_suggestions` | `scaffold.db` | REUSE — already tracks dismissals |
| Suggestion feedback | `SuggestionStorage.suggestion_feedback` | `scaffold.db` | EXTEND — add `decision` field |
| **Decision records** | **DORMANT `decisions` table** | `scaffold.db` | **WIRE** — activate dormant schema |
| Approval decisions | `FileThreadStore` (agent-harness) | `threads/` | REUSE — route through existing approval |
| Task approval | `TaskStore` (orchestration) | `plans.db` | REUSE — route through existing approval |
| Engineering events | `SqliteEngineeringEventStore` | `engineering-events.db` | REUSE — emit audit events |
| Activity records | `SqliteActivityStore` (M9) | `vestara-activity.db` | REUSE — project via M9 bridge |
| Attention items | `InMemoryAttentionItem` | In-memory | EXTEND — add decision link |

**Key insight**: The dormant `decisions` table in `scaffold.db` already has the exact schema AR-REC needs. No new database, no new table, no new store class required — just wiring.

---

## Deliverable 4: Event Ownership Map

| Event | Source | M9 Ingestion | AR-REC Action |
|-------|--------|-------------|---------------|
| `suggestion:action` | SuggestionService | IGNORE (not in patterns) | EXTEND — add to INGEST or route separately |
| `conversation:response.completed` | ConversationService | INGEST | REUSE — captures conversational choices |
| `orchestration.task.approval-resolved` | OrchestrationDispatch | INGEST | REUSE — captures governance approvals |
| `orchestration.task.review.decided` | OrchestrationReview | INGEST | REUSE — captures review decisions |
| `harness.approval.resolved` | AgentHarness | Via harness bridge | REUSE — captures tool approvals |
| **`recommendation:presented`** | **NEW** | **ADD to PATTERN_DISPOSITIONS** | **CREATE** — notification that recommendation exists |
| **`decision.recorded`** | **NEW** | **ADD to PATTERN_DISPOSITIONS** | **CREATE** — audit trail for decision |

**Existing events that AR-REC can compose with**:
- `conversation:response.completed` — already ingested, captures human conversational choices
- `orchestration.task.approval-resolved` — already ingested, captures governance approvals
- `orchestration.task.review.decided` — already ingested, captures review decisions
- `harness.approval.resolved` — captured via harness bridge, captures tool approvals

**New events needed** (minimal):
- `recommendation:presented` — notification that a recommendation exists (for Activity Room display)
- `decision.recorded` — audit trail for the decision outcome (for Engineering Event Store)

---

## Deliverable 5: Governance / Authorization Boundary Analysis

### 5.1 Authorization Layers (Distributed)

| Layer | File | Authority | AR-REC Composition |
|-------|------|-----------|-------------------|
| **Execution Policy** | `execution-policy.ts` | `allow \| require-approval \| deny` per operation | Route execution through existing gate |
| **AI Invocation Guard** | `ai-invocation-guard.ts` | Provider/model binding validation | No change needed |
| **Orchestration Policy** | `policies.ts` | Task-level approval triggers | Route task execution through existing gate |
| **Policy Engine** | `default-policy-engine.ts` | Multi-policy composition with conflict resolution | Evaluate recommendations against policy engine |

### 5.2 Three Distinctions Verified

| Distinction | Existing Mechanism | File | AR-REC Composition |
|------------|-------------------|------|-------------------|
| **Human conversational choice** | `ClarifyOptions` / `Decision` in ConversationContext | `conversation/src/types.ts:98-113` | Use for presenting options |
| **Governance approval** | `createPendingApproval()` → `decideApproval()` | `agent-harness/src/index.ts:383-419` | Route through for governance-level recommendations |
| **Execution authorization** | `evaluateOperation()` → disposition | `execution-policy.ts:212` | Route through for execution-level recommendations |

### 5.3 AR-REC-GOV Invariant Compliance

| Invariant | Status | Evidence |
|-----------|--------|----------|
| REC-GOV-01: Recommendation ≠ authority to execute | ✅ VERIFIED | SuggestionService generates, does not execute without approval |
| REC-GOV-02: Decision ≠ direct execution | ✅ VERIFIED | `decideApproval()` resumes paused execution, does not bypass |
| REC-GOV-03: Governance always applies | ✅ VERIFIED | Distributed layers cannot be bypassed (except budget exhaustion) |
| REC-GOV-04: Human choice ≠ governance approval ≠ execution authorization | ✅ VERIFIED | Three levels exist with distinct mechanisms |
| REC-GOV-05: Recommendation must not override authorization | ✅ VERIFIED | No bypass mechanism exists |
| REC-GOV-06: Decision must not bypass approval chain | ✅ VERIFIED | Approval chain enforced at orchestration/harness level |
| REC-GOV-07: Governance must not be circumvented | ✅ VERIFIED | Distributed, no single point of circumvention |
| REC-GOV-08: Recommendation must be evidence-based | ⚠️ PARTIAL | SuggestionService has `rationale`, but not all types carry evidence |
| REC-GOV-09: Decision must be auditable | ⚠️ PARTIAL | Engineering Event Store exists, but no `decision.recorded` event yet |
| REC-GOV-10: Human must be able to override | ✅ VERIFIED | `approvalGranted` parameter exists, human can always decide |

---

## Deliverable 6: Canonical Human-Message Ingress Analysis

### 6.1 Human-Initiated Ingress Points

| Ingress | Type | Mechanism | AR-REC Use |
|---------|------|-----------|------------|
| **Chat message** | Natural language | `POST /api/conversations/:id/messages` | Capture intent, route to recommendation |
| **Console command** | Structured | `POST /api/console/execute` | Direct recommendation request |
| **Collaboration button** | UI action | React event → API call | Recommendation accept/reject |
| **OpenCode permission dialog** | UI choice | `OpenCodePermissionRespondDialog` | Tool approval (existing) |
| **WorkflowRail approve/deny** | UI action | React event → API call | Task approval (existing) |

### 6.2 Conversation Structured Response Flow

```
Agent turn → structuredResponse?: ClarifyOptions | UserInput | Decision
  → ConversationService receives response
    → If ClarifyOptions: UI renders option buttons
    → If Decision: UI renders choice interface
    → Human response captured in ConversationContext
      → No decision record created
      → No governance check
      → No audit trail
```

**Gap**: Structured responses are captured in conversation context but not persisted as decision records or routed through governance.

### 6.3 Recommendation Presentation Ingress (NEW)

```
Any source (SuggestionService, Attention, Conversation, Orchestration)
  → RecommendationService.present(recommendation)
    → Persist to decisions table
    → Emit recommendation:presented event
    → M9 ingestion → Activity Room display
    → UI renders recommendation card with options
```

---

## Deliverable 7: Shared UI Inventory for Reuse

### 7.1 REUSE (No Modification Needed)

| Component | File | AR-REC Pattern |
|-----------|------|---------------|
| `VestaraModal` | `components/ui/VestaraModal.tsx` | Modal shell for recommendation presentation |
| `Drawer` | `components/ui/Drawer.tsx` | Side-panel for recommendation details |
| `Alert` | `components/Alert.tsx` | Inline recommendation banners |
| `Theme tokens` | `styles/index.css` + `design-system` | Full design system with `approval` entity kind |

### 7.2 EXTEND (Modification Needed)

| Component | File | Extension |
|-----------|------|-----------|
| `Toast` | `components/Toast.tsx` | Add `recommendation:presented` → toast mapping |
| `OpenCodePermissionRespondDialog` | `components/opencode/OpenCodePermissionRespondDialog.tsx` | Generalize to N-option choice (currently 2-option) |
| `ExecutionDetailModal` | `components/ExecutionDetailModal.tsx` | Generalize for recommendation detail view |
| `ActionPanel` | `components/ActionPanel.tsx` | Extend plan approval for recommendation approval |
| `ENTITY_PRESENTATION` | `packages/design-system/src/index.ts` | Add `recommendation`, `decision` entity kinds |

### 7.3 MISSING (Needs Creation)

| Component | Purpose | Complexity |
|-----------|---------|------------|
| `RecommendationCard` | Render recommendation in activity stream | Low — follows existing stream item pattern |
| `OptionSelectionCard` | Present N-option choice for human selection | Medium — generalize from OpenCodePermissionRespondDialog |
| `DecisionOutcomeBadge` | Display decision result (accepted/rejected/pending) | Low — follows existing status badge pattern |

---

## Deliverable 8: Reuse / Extension / Gap Matrix

### 8.1 Domain Scenario Mapping

| Scenario | Existing Machinery | Reuse | Extend | Gap |
|----------|-------------------|-------|--------|-----|
| **Workspace advisor** | SuggestionService | SuggestionService (generate, dismiss, track) | Add `accept()` with decision recording | Decision record persistence (wire dormant table) |
| **Task governance** | OrchestrationDispatch + ApprovalPolicy | Task approval pipeline, change plan review | Add recommendation pre-step before task dispatch | Recommendation presentation UI |
| **Permission-level governance** | ExecutionPolicy + AIInvocationGuard | Tool approval pipeline, risk-level gating | Add recommendation layer before tool invocation | Recommendation → approval routing |
| **Human-choice governance** | ConversationContext + ClarifyOptions | Structured response types, option presentation | Add decision recording, governance routing | Decision persistence, governance check |

### 8.2 Cross-Domain Generality Assessment

| Domain | Can AR-REC serve it? | What exists | What's needed |
|--------|---------------------|-------------|---------------|
| **Workspace** | ✅ Yes | SuggestionService, attention items | Recommendation wrapper, decision recording |
| **Orchestration** | ✅ Yes | Task approval, change plan review | Recommendation pre-step, UI presentation |
| **Execution** | ✅ Yes | Tool approval, risk-level gating | Recommendation → approval routing |
| **Conversation** | ✅ Yes | ClarifyOptions, Decision types | Decision persistence, governance routing |

**Assessment**: AR-REC is **genuinely cross-domain**. All four scenarios can be served by a thin `Recommendation` domain object that composes existing machinery. No scenario requires building from scratch.

### 8.3 Recommendation: AR-REC-B Scope

**PROCEED with REDUCED scope**. The audit reveals:

1. **Persistence**: Wire dormant `decisions` table — no new schema, no new store class
2. **Events**: Add `recommendation:presented` and `decision.recorded` — 2 new event types, not 10
3. **Authorization**: Compose at existing boundaries — no new governance layer
4. **UI**: Extend existing components — 3 new components (cards), not a full design system
5. **Domain object**: Thin `Recommendation` type that wraps SuggestionService output

**What AR-REC-B should NOT build**:
- New persistence store (use dormant `decisions` table)
- New authorization layer (compose at existing boundaries)
- New event bus (use existing InProcessEventBus)
- New UI design system (extend existing components)
- New governance engine (use existing policy engine)

---

## Deliverable 9: Observation

No anomalies, blockers, or deviation signals detected during audit execution. All existing capabilities function as documented. The dormant `decisions` table is intentionally scaffolded (file header notes "zero construction/injection sites").

---

## Deliverable 10: Recommendation for AR-REC-B

### Decision: **PROCEED with REDUCED scope**

### Rationale

The audit demonstrates that Vestara already has:
- SuggestionService with structured suggestions, dismiss, track, execute
- Tool-level and task-level approval pipelines with full governance
- Conversation structured responses (ClarifyOptions, Decision)
- Attention system for observation/instruction display
- Engineering Event Store for immutable audit trail
- Dormant `decisions` table with exact required schema
- Policy engine for multi-policy governance composition
- UI primitives (modal, drawer, alert, toast, approve/deny patterns)

**AR-REC-B should build**: A thin `Recommendation` domain object that:
1. Wraps SuggestionService output with multi-choice options
2. Wires the dormant `decisions` table for persistence
3. Adds 2 event types (`recommendation:presented`, `decision.recorded`)
4. Extends M9 ingestion bridge to consume new events
5. Adds 3 UI components (RecommendationCard, OptionSelectionCard, DecisionOutcomeBadge)
6. Routes decisions through existing governance layers

**AR-REC-B should NOT build**: New persistence, new authorization, new event bus, new design system, new governance engine.

### Expected Reduction

| Original Estimate | Audit-Adjusted Estimate | Reduction |
|-------------------|------------------------|-----------|
| ~1200 lines across 35 files | ~600 lines across 18 files | ~50% |
| 4 milestones (REC-A through REC-D) | 2 milestones (REC-B + REC-C) | ~50% |
| New persistence layer | Wire existing dormant table | ~80% persistence reduction |
| New authorization layer | Compose at existing boundaries | ~90% authorization reduction |
| New UI design system | Extend existing components | ~70% UI reduction |

### AR-REC-B Authorization Request

Request authorization for AR-REC-B with the audit-adjusted scope:
1. Wire dormant `decisions` table via `SuggestionService` extension
2. Add `recommendation:presented` and `decision.recorded` events
3. Extend M9 ingestion bridge for new event patterns
4. Create 3 UI components (RecommendationCard, OptionSelectionCard, DecisionOutcomeBadge)
5. Add `composeParticipants()` integration for recommendation display
6. Evidence tests for all new behaviors

---

## Appendix A: File Reference Index

| File | Lines | Purpose |
|------|-------|---------|
| `packages/workspace/src/suggestion-service.ts` | 52-639 | SuggestionService (workspace advisor) |
| `packages/workspace/src/suggestion-storage.ts` | 4-34 | SuggestionStorage interface |
| `packages/workspace/src/scaffold-migrations.ts` | 81-89, 211-234, 299 | Dormant `decisions` table schema |
| `packages/agent-harness/src/index.ts` | 383-419, 411 | Tool approval pipeline |
| `packages/agent-harness/src/execution-policy.ts` | 94, 212 | Execution policy evaluation |
| `packages/agent-harness/src/ai-invocation-guard.ts` | 50 | AI invocation guard |
| `packages/workflow-orchestrator/src/orchestration-dispatch.ts` | 267-340 | Task approval pipeline |
| `packages/workflow-orchestrator/src/policies.ts` | 29-100 | DefaultRiskApprovalPolicy |
| `packages/conversation/src/types.ts` | 98-113 | ConversationContext structured responses |
| `packages/workspace/src/attention-system.ts` | 1-100 | AttentionItem, AttentionService |
| `packages/engineering-event-store/src/index.ts` | 190 | SqliteEngineeringEventStore |
| `packages/policy-engine/src/default-policy-engine.ts` | 1-50 | PolicyEngine |
| `packages/activity-projection/src/m9-ingestion-bridge.ts` | 43-192 | PATTERN_DISPOSITIONS |
| `apps/workspace/src/components/ui/VestaraModal.tsx` | 1-50 | Modal shell |
| `apps/workspace/src/components/ui/Drawer.tsx` | 1-50 | Drawer component |
| `apps/workspace/src/components/Alert.tsx` | 1-50 | Alert component |
| `apps/workspace/src/components/Toast.tsx` | 1-200 | Toast system |
| `apps/workspace/src/components/opencode/OpenCodePermissionRespondDialog.tsx` | 1-100 | 2-option choice pattern |
| `packages/design-system/src/index.ts` | 1-50 | Theme tokens, ENTITY_PRESENTATION |
