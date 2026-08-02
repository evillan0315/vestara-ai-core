# Artifact Catalog

**Canonical inventory of Vestara's durable domain objects.**

Every capability in Vestara produces or consumes durable artifacts. This catalog defines each artifact's purpose, lifecycle, dependencies, consumers, persistence mechanism, and versioning strategy. Artifacts are the foundation of the architecture — they outlive any single session, command, or AI provider.

---

## Artifact Dependency Map

```
RepositoryWorkspace
        │
        ├──────────────────┐
        ▼                  ▼
Explanation         ConversationSession
        │                  │
        ▼                  ▼
Plan           ←──── UserProfile
        │
        ├──────────────┐
        ▼              ▼
ImpactAssessment  ChangeSet
        │              │
        │              ▼
        │         Verification
        │              │
        └──────────┐   │
                   ▼   ▼
               Workflow
                   │
                   ▼
             AgentExecution
                   │
                   ▼
             CollaborationRecord
                   │
                   ▼
             ActivityLog
```

> If you change an artifact, all downstream consumers are affected. This map shows the dependency chain.

---

## Artifact Inventory

### RepositoryWorkspace

| Property | Value |
|----------|-------|
| **Introduced** | v0.3.0 |
| **Purpose** | Canonical representation of an opened repository. Enriched by every pipeline stage. |
| **Lifecycle** | `opened → analyzing → ready → closed` |
| **Owning Capability** | `vestara open` |
| **Dependencies** | Filesystem, Git |
| **Consumers** | Explain, Plan, Dashboard, Knowledge, Memory, ConversationSession |
| **Persistence** | `.vestara/workspace.json` (manifest) |
| **Key Fields** | `fingerprint`, `profile`, `presentation`, `manifest` |
| **Versioning** | Immutable per workspace session — re-created on `open` |

---

### Explanation

| Property | Value |
|----------|-------|
| **Introduced** | v0.3.3 |
| **Purpose** | Deterministic and AI-synthesized explanations of architecture, modules, symbols, and data flows. |
| **Lifecycle** | `requested → completed` |
| **Owning Capability** | `explain` |
| **Dependencies** | `RepositoryWorkspace` |
| **Consumers** | Plan, ConversationSession |
| **Persistence** | In-memory (session-scoped), optionally cached to knowledge graph |
| **Key Fields** | `target`, `tier` (deterministic/knowledge/AI), `content`, `confidence` |
| **Versioning** | Not versioned — regenerated per request |

---

### UserProfile

| Property | Value |
|----------|-------|
| **Introduced** | v4.0 |
| **Purpose** | Conversational identity: name, role, preferred stack, communication style, goals. Enriched with every conversation. |
| **Lifecycle** | `created → enriched → persisted` |
| **Owning Capability** | Conversational Onboarding |
| **Dependencies** | None (independent artifact) |
| **Consumers** | ConversationSession, ConversationEngine, Suggestions |
| **Persistence** | SQLite (`user_profiles` table) |
| **Key Fields** | `name`, `role`, `preferredStack`, `communicationStyle`, `goals`, `conversationCount` |
| **Versioning** | Single active profile per installation — updated in place |

---

### ConversationSession

| Property | Value |
|----------|-------|
| **Introduced** | v4.0 |
| **Purpose** | Links a conversation transcript to the workspace artifact graph. References Workspace, Plan, ChangeSet, Workflow. |
| **Lifecycle** | `started → active → ended` |
| **Owning Capability** | Conversational Onboarding |
| **Dependencies** | `UserProfile`, `RepositoryWorkspace` |
| **Consumers** | Analytics, Collaboration, ActivityLog |
| **Persistence** | SQLite (`conversation_sessions`, `session_transcripts`, `session_audio_timeline`) |
| **Key Fields** | `transcript`, `audioTimeline`, `referencedArtifacts`, `context`, `summaries` |
| **Versioning** | Immutable append-log — messages and timeline entries are appended, never modified |

---

### Plan

| Property | Value |
|----------|-------|
| **Introduced** | v0.4 |
| **Purpose** | Executable intent with tasks, dependencies, and effort estimates. First-class durable artifact with lifecycle. |
| **Lifecycle** | `draft → proposed → approved → executing → completed → cancelled` |
| **Owning Capability** | `plan` |
| **Dependencies** | `RepositoryWorkspace`, `Explanation` |
| **Consumers** | ImpactAssessment, ChangeSet, Workflow |
| **Persistence** | SQLite (`.vestara/plans/plans.db`) |
| **Key Fields** | `goal`, `tasks`, `status`, `scope`, `risks`, `effort` |
| **Versioning** | Versioned by ID — new plan creates new ID; approval transitions are append-only |

---

### ImpactAssessment

| Property | Value |
|----------|-------|
| **Introduced** | v2.4 |
| **Purpose** | Prediction of change impact: scope, risk, effort, health delta. Optional AI narrative. |
| **Lifecycle** | `created → assessed` |
| **Owning Capability** | `predict` |
| **Dependencies** | `Plan` |
| **Consumers** | Recommendation, Implementation |
| **Persistence** | SQLite (`.vestara/impact/impact.db`) |
| **Key Fields** | `scope`, `riskAssessment`, `effortEstimate`, `healthPrediction`, `recommendations` |
| **Versioning** | One assessment per plan — replaced on re-prediction |

---

### ChangeSet

| Property | Value |
|----------|-------|
| **Introduced** | v0.5 |
| **Purpose** | Records every file modification with full traceability to the originating plan. |
| **Lifecycle** | `created → applied → verified` |
| **Owning Capability** | `implement` |
| **Dependencies** | `Plan` |
| **Consumers** | `Verification`, `CollaborationRecord` |
| **Persistence** | SQLite (`.vestara/plans/plans.db`) |
| **Key Fields** | `files[]`, `status`, `planId`, `message`, `assessmentId` |
| **Versioning** | Immutable after creation — files are proposed, reviewed, then applied |

---

### Verification

| Property | Value |
|----------|-------|
| **Introduced** | v0.6 |
| **Purpose** | Evidence-based verification report. AI never decides pass/fail. |
| **Lifecycle** | `running → passed/failed` |
| **Owning Capability** | `verify` |
| **Dependencies** | `ChangeSet` |
| **Consumers** | `CollaborationRecord`, `Enterprise` |
| **Persistence** | SQLite (`.vestara/plans/plans.db`) |
| **Key Fields** | `checks[]`, `summary`, `status`, `changeSetId`, `planId` |
| **Versioning** | One verification per change set — re-run replaces |

---

### CollaborationRecord

| Property | Value |
|----------|-------|
| **Introduced** | v0.7 |
| **Purpose** | Human coordination around engineering artifacts. Approvals are immutable append-only events. |
| **Lifecycle** | `draft → submitted → reviewing → approved/rejected → completed` |
| **Owning Capability** | `collaborate` |
| **Dependencies** | `ChangeSet`, `Verification` |
| **Consumers** | `Workflow`, `Enterprise`, `ActivityLog` |
| **Persistence** | SQLite (`.vestara/plans/plans.db`) |
| **Key Fields** | `status`, `approvals[]`, `comments[]`, `changeSetId`, `owners[]` |
| **Versioning** | Immutable append-log — approvals and comments are appended, never overwritten |

---

### AgentExecution

| Property | Value |
|----------|-------|
| **Introduced** | v0.8 |
| **Purpose** | Records every agent task execution with input, output, status, and duration. |
| **Lifecycle** | `queued → running → completed/failed` |
| **Owning Capability** | `agent run` |
| **Dependencies** | `AgentDefinition` |
| **Consumers** | `Workflow`, `ActivityLog`, `Analytics`, `Suggestions` |
| **Persistence** | SQLite (`agent_executions` table) |
| **Key Fields** | `agentId`, `task`, `status`, `inputArtifacts`, `outputArtifacts`, `result`, `startedAt`, `completedAt` |
| **Versioning** | Immutable append-log — each execution creates a new record |

---

### Workflow

| Property | Value |
|----------|-------|
| **Introduced** | v1.0 |
| **Purpose** | Orchestrates multi-step feature development across agents. Defines step order, required artifacts, and approval gates. |
| **Lifecycle** | `created → running → completed/failed` |
| **Owning Capability** | `workspace run` |
| **Dependencies** | `Plan`, `ChangeSet`, `Verification`, `AgentExecution` |
| **Consumers** | `Dashboard`, `Enterprise` |
| **Persistence** | SQLite (`.vestara/plans/plans.db`) |
| **Key Fields** | `steps[]`, `status`, `goal`, `results[]`, `currentStep` |
| **Versioning** | One workflow per session — re-run creates new instance |

---

### ActivityLog

| Property | Value |
|----------|-------|
| **Introduced** | v4.0 |
| **Purpose** | Durable domain event log. Every significant user, agent, and system action emits a structured event. |
| **Lifecycle** | Append-only — events are never modified or deleted |
| **Owning Capability** | Platform-wide (emitted by all services) |
| **Dependencies** | All artifacts (events reference artifact IDs) |
| **Consumers** | Dashboard, Analytics, Audit, Enterprise |
| **Persistence** | SQLite (`activity_events` table) |
| **Key Fields** | `category`, `type`, `actor`, `resource`, `message`, `metadata` |
| **Versioning** | Immutable append-log — events are never modified or deleted |

---

### Project

| Property | Value |
|----------|-------|
| **Introduced** | v4.2 |
| **Purpose** | Top-level organizational unit for tracking work. Contains tasks and sprints. |
| **Lifecycle** | `planning → active → on_hold → completed → cancelled` |
| **Owning Capability** | Project Management |
| **Dependencies** | None (independent artifact) |
| **Consumers** | Dashboard, Agent, ActivityLog |
| **Persistence** | SQLite (`projects`, `tasks`, `sprints` tables) |
| **Key Fields** | `name`, `description`, `status`, `priority`, `tags` |
| **Versioning** | Updated in place; status transitions are tracked |

---

### AgentSchedule

| Property | Value |
|----------|-------|
| **Introduced** | v4.4 |
| **Purpose** | Configurable schedule for automated agent execution. Supports hourly, daily, weekly, and one-time frequencies. |
| **Lifecycle** | `created → enabled → (repeated execution) → disabled/deleted` |
| **Owning Capability** | Agent Scheduling |
| **Dependencies** | `AgentDefinition` |
| **Consumers** | Agent Runtime, Dashboard |
| **Persistence** | SQLite (`agent_schedules` table) |
| **Key Fields** | `agentId`, `task`, `frequency`, `nextRunAt`, `lastRunAt`, `lastStatus`, `enabled` |
| **Versioning** | Updated in place — each run updates `lastRunAt` and `nextRunAt` |

---

## Artifact Governance Principles

1. **Immutability** — Once created, critical artifacts (Verification, CollaborationRecord, ActivityLog) are append-only. Never modify history.
2. **Traceability** — Every artifact references its upstream dependencies. `ChangeSet → Plan → Explanation → RepositoryWorkspace`.
3. **Persistence** — All artifacts survive restarts. In-memory-only artifacts (Explanation) are the exception and are clearly documented.
4. **Provider-Independence** — Artifacts never contain provider-specific data. The same Plan format works with OpenCode, OpenAI, or Local providers.
5. **Versioning** — Artifacts with append-log semantics use IDs as versions. Artifacts updated in place use `updatedAt` timestamps for conflict detection.
6. **Consumption** — Every artifact has documented consumers. No artifact exists without at least one consumer.

---

## Future Artifacts

| Artifact | Planned For | Purpose |
|----------|-------------|---------|
| ConversationAnalytics | v7.0 | Aggregated metrics and trends from conversation sessions |
| DashboardPreset | v7.1 | Saved dashboard layout configurations |
| AgentTemplate | v7.2 | Pre-built agent configurations for common tasks |
| Notification | v7.3 | Persistent notification records with read/unread state |
| KanbanBoard | v8.1 | Visual task board configuration with columns and swimlanes |
| Organization | v9.0 | Multi-workspace organizational structure |
| PluginPackage | v9.1 | Versioned plugin definitions for the marketplace |
| MarketplaceAsset | v9.2 | Catalog entry for a marketplace package (implemented in `packages/marketplace`) |
| MarketplaceOperation | v9.2 | Operation record for install/update/uninstall/verify/rescan (returned by `/api/marketplace/*`) |
| AgentFleet | v10.0 | Multi-workspace agent deployment configuration |
| GovernancePolicy | v10.1 | AI action governance rules and approval workflows |
