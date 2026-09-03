# Agent Control Run Binding Audit

**Date:** 2026-09-03
**Status:** Audit Complete — Awaiting Director Decision
**Authorization:** Audit only. No mutation.
**Reproduction:** Agent Control → Developer → Run → "Read README"

---

## 1. Complete Run-Task Call Graph

```
AgentCard.runAgent()
  ↓ harnessApi.createRun('agent-developer', { instruction: 'Read README' })
  ↓ POST /api/agents/agent-developer/runs
  ↓
handleAgentHarnessRoute()
  ↓ agentId = 'agent-developer'
  ↓ harness.createThread({ taskId, title, environment, metadata: { agentId: 'agent-developer' } })
  ↓ harness.run({ threadId, instruction: 'Read README', agentId: 'agent-developer', environment })
  ↓
AgentHarnessRuntime.continueTurn()
  ↓ resolveExecutionOverride('agent-developer')
  ↓
resolveAgentExecutionFor(agents, routingStore)
  ↓ agents.listAgents() → finds agent-developer in DB
  ↓ agent.model = 'mimo-v2.5-free' → returns { providerId: 'opencode', modelId: 'mimo-v2.5-free', runtimeAgent: 'vestara-developer' }
  ↓
executionOverride = { providerId: 'opencode', modelId: 'mimo-v2.5-free', runtimeAgent: 'vestara-developer' }
  ↓
provider.complete({
  model: executionModel(executionOverride, 'opencode-runtime'),  → 'opencode/mimo-v2.5-free'
  agent: executionOverride?.runtimeAgent || agentId,             → 'vestara-developer'
  ...
})
  ↓
OpenCodeRuntimeProvider.complete()
  ↓ resolveProvider('opencode/mimo-v2.5-free') → { providerId: 'opencode', reason: 'explicit-model' }
  ↓ createSession('opencode', 'mimo-v2.5-free', 'vestara-developer')
  ↓
OpenCodeRuntimeProvider.createSession()
  ↓ client().createSession({ title, agent: 'vestara-developer', providerID: 'opencode', modelID: 'mimo-v2.5-free' }, { workspaceId })
  ↓
OpenCodeHttpClient.createSession()
  ↓ body = { directory: input.directory, title, agent: 'vestara-developer', providerID: 'opencode', modelID: 'mimo-v2.5-free' }
  ↓ POST /session  (directory is UNDEFINED)
  ↓
OpenCode Server
  ↓ Cannot find .opencode/agents/vestara-developer.md (no directory context)
  ↓ Falls back to default agent: Build
  ↓ Falls back to default model: Nemotron 3 Ultra Free
```

---

## 2. Requested vs Resolved vs Effective Bindings

| Boundary | agentId | provider | model | runtimeAgent | directory |
|----------|---------|----------|-------|--------------|-----------|
| **UI (Agent Control)** | agent-developer | opencode | mimo-v2.5-free | vestara-developer | N/A |
| **DB (agents table)** | agent-developer | opencode | mimo-v2.5-free | vestara-developer | N/A |
| **Harness resolution** | agent-developer | opencode | mimo-v2.5-free | vestara-developer | N/A |
| **Provider.complete() request** | vestara-developer | N/A | opencode/mimo-v2.5-free | N/A | N/A |
| **RuntimeProvider.createSession()** | vestara-developer | opencode | mimo-v2.5-free | N/A | **UNDEFINED** |
| **HTTP client → OpenCode** | vestara-developer | opencode | mimo-v2.5-free | N/A | **UNDEFINED** |
| **OpenCode effective** | **Build** | **(default)** | **Nemotron 3 Ultra Free** | N/A | **(default)** |

---

## 3. Hypothesis Classification

### H1 — Agent model isn't propagated
**REJECTED.** The model `mimo-v2.5-free` is correctly propagated through:
- DB → `resolveAgentExecutionFor()` → `executionOverride.modelId`
- `executionModel()` → `'opencode/mimo-v2.5-free'`
- `OpenCodeRuntimeProvider.complete()` → `explicitModelOf()` → `'mimo-v2.5-free'`
- `createSession()` → `modelID: 'mimo-v2.5-free'`

The model reaches the OpenCode session creation API. The issue is not model propagation.

### H2 — Runtime agent isn't propagated
**CONFIRMED (partial).** The runtime agent `vestara-developer` IS passed to the OpenCode session creation API:
```json
{ "agent": "vestara-developer", "providerID": "opencode", "modelID": "mimo-v2.5-free" }
```

However, the `directory` parameter is **UNDEFINED**, so OpenCode cannot locate the `.opencode/agents/vestara-developer.md` file. Without directory context, OpenCode falls back to its default agent (`Build`).

**Root cause:** `OpenCodeRuntimeProvider.createSession()` does not pass `directory` to the HTTP client.

### H3 — M4/routing override
**REJECTED.** M4 routing (`/api/routing/selection`) is not consulted in this execution path. The harness uses `resolveAgentExecutionFor()` which reads directly from the agents DB, not from routing.json.

### H4 — OpenCode default
**CONFIRMED.** OpenCode falls back to defaults because:
1. `directory` is undefined → cannot locate agent definition files
2. Agent `vestara-developer` is not a built-in OpenCode agent
3. OpenCode uses its default agent (`Build`) and default model (`Nemotron 3 Ultra Free`)

### H5 — Session reuse
**REJECTED.** A new session is created every time:
```typescript
const sessionId = await this.createSession(...);
```
The session is aborted after each turn (line 232-234). No session reuse occurs.

### H6 — Agent Control display is non-authoritative
**REJECTED.** Agent Control displays the correct values from the DB:
- provider: `opencode` ✓
- model: `mimo-v2.5-free` ✓
- runtimeAgent: `vestara-developer` ✓

The issue is NOT in Agent Control display but in the OpenCode session creation missing the `directory` parameter.

---

## 4. Model Authority Precedence Table

| Priority | Authority | Value | Wins When |
|----------|-----------|-------|-----------|
| 1 | `AgentDefinition.model` (DB) | `mimo-v2.5-free` | Present on agent |
| 2 | `routing.json` selection | `opencode/mimo-v2.5-free` (developer role) | Agent has no model |
| 3 | Harness default model | `opencode-runtime` | No agent match |
| 4 | `RuntimeProvider` config | (env/config) | No override |
| 5 | OpenCode default | `Nemotron 3 Ultra Free` | No modelID in session |

**Evidence:** `resolveAgentExecutionFor()` (line 1591-1625) checks agent.model first, then falls back to routing.json. The harness default (`this.options.model = 'opencode-runtime'`) is the sentinel value passed to `executionModel()`.

---

## 5. Runtime-Agent Authority Precedence

| Priority | Authority | Value | Wins When |
|----------|-----------|-------|-----------|
| 1 | `AgentDefinition.runtime_agent` (DB) | `vestara-developer` | Present on agent |
| 2 | `active.agentId` | `agent-developer` | No runtimeAgent override |
| 3 | `RuntimeProvider` config | (env/config) | No request.agent |
| 4 | OpenCode default | `Build` | Agent not found in directory |

**Evidence:** Line 643: `agent: executionOverride?.runtimeAgent || active.agentId || undefined`. Line 205: `request.agent ?? this.agent`.

---

## 6. Session Creation/Reuse Behavior

**Session creation:** Every harness turn creates a fresh OpenCode session:
```typescript
// runtime-provider.ts line 202-206
const sessionId = await this.createSession(
  resolved.providerId,
  explicitModelOf(request.model, this.id) ?? this.modelId,
  request.agent ?? this.agent,
);
```

**Session lifecycle:**
1. Created via `POST /session`
2. Message sent via `POST /session/{id}/message`
3. Aborted after turn completes (line 232-234): `await this.client().abortSession(sessionId, ...)`

**Session reuse:** None. Each turn is independent. This is by design (line 231 comment: "Sessions are created per invocation so agent turns never share history").

---

## 7. Explanation for Build

OpenCode displays `Build` because:

1. The `directory` parameter is `undefined` in the session creation request
2. Without `directory`, OpenCode cannot resolve the project context
3. OpenCode cannot locate `.opencode/agents/vestara-developer.md`
4. `vestara-developer` is NOT a built-in OpenCode agent (built-ins are: `build`, `plan`, `general`, `explore`)
5. OpenCode falls back to its default primary agent: `Build`

**Evidence:** The `.opencode/agents/vestara-developer.md` file exists and contains the correct agent definition, but OpenCode needs the `directory` parameter to find it.

---

## 8. Explanation for Nemotron 3 Ultra Free

OpenCode displays `Nemotron 3 Ultra Free` because:

1. The `modelID: 'mimo-v2.5-free'` IS passed to OpenCode
2. However, the `directory` is undefined, so OpenCode may not resolve the model correctly
3. OpenCode falls back to its configured default model
4. The OpenCode instance has `Nemotron 3 Ultra Free` as its default model

**Note:** The model ID reaches OpenCode correctly. The issue may be that OpenCode requires the `directory` to resolve model configurations from the project's `.opencode/config.json`.

---

## 9. M4/M7/Harness Interaction

| Component | Role | Authority |
|-----------|------|-----------|
| **M4 (Routing)** | Provider/model selection for engineering roles | NOT consulted in this path |
| **M7 (Harness)** | Durable agent execution | Uses `resolveAgentExecutionFor()` → DB → routing.json fallback |
| **HarnessSession** | Session lifecycle management | Creates `ExecutionSession` records, not OpenCode sessions |
| **OpenCodeRuntimeProvider** | OpenCode runtime bridge | Creates OpenCode sessions, resolves provider |

**Interaction:** The harness delegates to `OpenCodeRuntimeProvider.complete()` which creates OpenCode sessions. M4 routing is only consulted as a fallback when the agent has no model set in the DB.

---

## 10. BLOCKER / ADJACENT / OBSERVATION

### BLOCKER

**BIND-001: Missing `directory` parameter in OpenCode session creation**

The `OpenCodeRuntimeProvider.createSession()` method does not pass the workspace directory to the OpenCode HTTP client. This causes OpenCode to:
- Cannot locate agent definition files (`.opencode/agents/*.md`)
- Cannot resolve project-specific model configurations
- Falls back to default agent (`Build`) and default model

**Remediation:** Pass the workspace directory path through the chain:
1. `WorkspaceContext` → `AgentHarnessRuntime` → `OpenCodeRuntimeProvider`
2. `OpenCodeRuntimeProvider.createSession()` → `client().createSession({ directory: workspaceDir, ... })`
3. The workspace directory should come from `session.fingerprint.id` or the workspace path resolution

### ADJACENT

**BIND-002: `workspaceId` vs `directory` confusion**

The `OpenCodeRuntimeProvider` stores `this.workspaceId` (default: `'vestara'`) which is used as a context identifier in the OpenCode client, NOT as the filesystem directory path. The `CreateOpenCodeSessionInput.directory` field expects the actual workspace directory path (e.g., `/home/user/projects/vestara/vestara-ai-core`).

### OBSERVATION

**BIND-003: Agent model reaches OpenCode but may not be resolved without directory**

Even though `modelID: 'mimo-v2.5-free'` is passed to OpenCode, the model resolution may depend on the project context (`.opencode/config.json`). Without `directory`, OpenCode may not find the model configuration.

---

## 11. Minimum Remediation Recommendation

**Required changes:**

1. **`OpenCodeRuntimeProvider`**: Add `directory` parameter to `createSession()` method
2. **`WorkspaceContext`**: Pass workspace directory to `AgentHarnessRuntime` constructor
3. **`OpenCodeRuntimeProviderOptions`**: Add `directory` option
4. **`OpenCodeHttpClient.createSession()`**: Already supports `directory` field (line 173)

**Example fix:**
```typescript
// In WorkspaceContext:
const agentHarness = new AgentHarnessRuntime({
  // ... existing options
  provider: new OpenCodeRuntimeProvider({
    directory: session.fingerprint.id,  // workspace directory
  }),
});

// In OpenCodeRuntimeProvider.createSession():
private async createSession(providerId?: string, modelId?: string, agentId?: string): Promise<string> {
  const session = await this.client().createSession(
    {
      title: `vestara-agent-${Date.now()}`,
      agent: agentId,
      providerID: providerId ?? undefined,
      modelID: modelId ?? undefined,
      directory: this.directory,  // NEW: workspace directory
    },
    { workspaceId: this.workspaceId },
  );
  return session.id;
}
```

---

*Audit complete. Awaiting Director decision.*
