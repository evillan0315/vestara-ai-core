---
id: "adr-119"
adr: "ADR-119"
title: "Agent Type Selection — Workspace vs Registry Agents"
category: "implementation"
version: 1.0
date: "2026-08-02"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@ai-engineer"]
consulted: ["@security-engineer"]
informed: ["@team"]
tags: ["agents", "workspace", "registry", "marketplace", "ui", "reconciliation"]
depends_on: ["adr-116", "adr-117", "adr-118"]
referenced_by:
  - type: "runtime"
    target: "vestara-ai-core/packages/workspace/src/types.ts"
  - type: "runtime"
    target: "vestara-ai-core/packages/workspace/src/agent-storage.ts"
  - type: "ui"
    target: "vestara-ai-core/apps/workspace/src/pages/Agents/AgentRegistryModal.tsx"
  - type: "api"
    target: "vestara-ai-core/apps/api/src/routes/agents.ts"
---

## Context

The Agent Control Center allows users to create and manage agents, but all agents
are treated identically regardless of their origin. Some agents are created locally
within the workspace (workspace agents), while others are installed from the
marketplace registry (registry agents). This distinction affects:

1. **Configuration**: Registry agents source their provider/model from the
   marketplace package, while workspace agents use locally configured providers.
2. **Lifecycle**: Registry agents can be updated/uninstalled via the marketplace,
   while workspace agents are managed entirely within the workspace.
3. **Discovery**: Users need to distinguish between agents they created and agents
   installed from the registry.

Without an explicit agent type, the system cannot properly route configuration,
lifecycle management, or display appropriate UI controls.

## Decision

Introduce an `agentType` field on `AgentDefinition` with two values:
- `'workspace'` — Local agents created in the workspace
- `'registry'` — Agents installed from the marketplace registry

### Implementation Details

1. **Type Definition** (`packages/workspace/src/types.ts`):
   ```typescript
   export type AgentType = 'workspace' | 'registry';
   
   export interface AgentDefinition {
     // ... existing fields
     agentType: AgentType;
     // ...
   }
   ```

2. **Storage Layer** (`packages/workspace/src/agent-storage.ts`):
   - Added `agent_type TEXT DEFAULT 'workspace'` column to agents table
   - Updated `saveAgent()` and `rowToAgent()` to persist/read the field
   - All built-in agents default to `agentType: 'workspace'`

3. **UI Layer** (`apps/workspace/src/pages/Agents/AgentRegistryModal.tsx`):
   - Added radio button selector for agent type
   - Contextual helper text explains the difference
   - When "Registry Agent" selected, provider/model dropdowns replaced with:
     - Registry Source (package identifier)
     - Version (semver constraint)

4. **API Layer** (`apps/api/src/routes/agents.ts`):
   - POST handler reads `body.agentType` and defaults to `'workspace'`
   - PUT handler merges `agentType` from request body

## Alternatives Considered

- **Infer type from provider field**: rejected — no reliable way to distinguish
  registry-installed agents from workspace-configured agents.
- **Separate agent lists**: rejected — adds complexity without addressing the
  underlying type distinction.
- **Metadata tags**: rejected — overengineered for the current binary distinction.

## Trade-offs

- One new column in agents table; minimal migration burden (default value handles
  existing rows).
- UI complexity increases slightly with conditional field display; accepted for
  the clarity gain.
- Registry agents require additional fields (source, version) that workspace
  agents don't need; the conditional UI handles this cleanly.

## Consequences

- Agent CRUD operations now include `agentType` in request/response payloads.
- Agent list UI can filter/display by type (future enhancement).
- Marketplace integration can auto-set `agentType: 'registry'` on install.
- Built-in agents (architect, developer, verifier, etc.) are workspace agents.
- Future: registry agents may have version tracking, update notifications.

---

- Supersedes: none (new capability)
- Dependencies: ADR-116 (capability system), ADR-117 (filesystem runtime),
  ADR-118 (multi-agent workflow)
