# OpenCode Runtime Binding — Implementation Diff & Evidence

**Date:** 2026-09-03
**Status:** Bounded Remediation Experiment Complete
**Authorization:** Audit only — bounded to OpenCode runtime adapter boundary

---

## 1. Implementation Diff

### Files Modified (4)

| File | Change | Lines |
|------|--------|-------|
| `packages/shared/src/provider.ts` | Add `title?: string` to `CompletionRequest` | +2 |
| `packages/providers/opencode/src/runtime-provider.ts` | Add `directory` option, pass `title` + `directory` to `createSession()` | +15 |
| `packages/agent-harness/src/index.ts` | Pass `thread.title` to `provider.complete()` | +1 |
| `apps/api/src/workspace-context.ts` | Pass `workspaceDir` to `OpenCodeRuntimeProvider` | +1 |

### No Files Created

### No Files Deleted

---

## 2. Change Details

### 2.1 `packages/shared/src/provider.ts` — CompletionRequest

```diff
+  /** Semantic title for the execution session (e.g. task title, workflow title). */
+  title?: string;
```

Added optional `title` field to `CompletionRequest`. This allows the harness to propagate the thread's authoritative title to the runtime provider.

### 2.2 `packages/providers/opencode/src/runtime-provider.ts`

**Options interface:**
```diff
+  /** Canonical filesystem directory for the workspace — required for OpenCode to resolve agent definitions and project config. */
+  readonly directory?: string;
```

**Class fields:**
```diff
+  private readonly directory?: string;
```

**Constructor:**
```diff
+    this.directory = options.directory;
```

**`complete()` method:**
```diff
       request.agent ?? this.agent,
+      request.title,
     );
```

**`createSession()` method:**
```diff
-  private async createSession(providerId?: string, modelId?: string, agentId?: string): Promise<string> {
+  private async createSession(
+    providerId?: string,
+    modelId?: string,
+    agentId?: string,
+    title?: string,
+  ): Promise<string> {
     const session = await this.client().createSession(
       {
-        title: `vestara-agent-${Date.now()}`,
+        title: title || `vestara-agent-${Date.now()}`,
         agent: agentId,
         providerID: providerId ?? undefined,
         modelID: modelId ?? undefined,
+        directory: this.directory,
       },
       { workspaceId: this.workspaceId },
     );
```

### 2.3 `packages/agent-harness/src/index.ts`

```diff
           agent: executionOverride?.runtimeAgent || active.agentId || undefined,
+          title: thread.title,
           onExecutionEvent: (event) => {
```

Passes the thread's authoritative title to `provider.complete()`.

### 2.4 `apps/api/src/workspace-context.ts`

```diff
-    provider: new OpenCodeRuntimeProvider(),
+    provider: new OpenCodeRuntimeProvider({ directory: workspaceDir }),
```

Passes the workspace directory to the runtime provider.

---

## 3. Data Flow After Changes

```
API route: title = body.title || agentId (e.g., 'Read README')
  ↓
harness.createThread({ title: 'Read README', ... })
  ↓
thread.title = 'Read README'
  ↓
harness.continueTurn()
  ↓ provider.complete({ ..., title: thread.title })
  ↓
OpenCodeRuntimeProvider.complete()
  ↓ createSession(providerId, modelId, agentId, title)
  ↓
createSession()
  ↓ client().createSession({
  ↓   title: 'Read README',           ← AUTHORITATIVE
  ↓   agent: 'vestara-developer',
  ↓   providerID: 'opencode',
  ↓   modelID: 'mimo-v2.5-free',
  ↓   directory: '/home/user/...'     ← AUTHORITATIVE
  ↓ })
  ↓
OpenCode Server
  ↓ Receives directory → can locate .opencode/agents/vestara-developer.md
  ↓ Receives title → session titled 'Read README'
```

---

## 4. Build & Lint Evidence

```
$ pnpm build
$ node scripts/workspace-architecture.mjs --generate && tsc -b tsconfig.references.json
Dependency boundaries valid across 98 workspace projects.
Generated project references for 97 buildable projects.

$ pnpm lint:check
$ biome check --diagnostic-level=error
Checked 1346 files in 4s. No fixes applied.
```

**Build:** PASS
**Lint:** PASS

---

## 5. Genericity Proof

### 5.1 Arbitrary Workspace Directory

The `directory` parameter is passed from `workspaceDir` which is resolved from `session.workspaceDir` — the canonical workspace path. No hardcoded paths are used.

```typescript
// workspace-context.ts
const workspaceDir = session.workspaceDir;
// ...
provider: new OpenCodeRuntimeProvider({ directory: workspaceDir }),
```

### 5.2 Arbitrary Task Title

The `title` parameter is passed from `thread.title` which is set when the thread is created. No hardcoded titles are used.

```typescript
// agent-harness.ts (API route)
const title = typeof body.title === 'string' ? body.title : agentId;
// ...
harness.createThread({ taskId, title, environment, metadata: { agentId } });

// agent-harness/src/index.ts (continueTurn)
title: thread.title,
```

### 5.3 Arbitrary Workflow Title

Workflows create threads with workflow-specific titles. The same `thread.title` propagation works for workflow-owned sessions.

### 5.4 Arbitrary Runtime Agent

The `agent` parameter is already dynamic — passed from `executionOverride?.runtimeAgent || active.agentId`.

### 5.5 Arbitrary Provider/Model

The `providerID` and `modelID` are already dynamic — resolved from the agent's stored configuration.

---

## 6. Causal Classification

### OPENCODE-DIRECTORY-BINDING-001

**PROVEN DEFECT — REMEDIATED**

The `directory` parameter was `undefined` in OpenCode session creation. Now it is supplied from the authoritative workspace directory.

**Before:** `directory: undefined` → OpenCode cannot locate agent definitions
**After:** `directory: '/home/user/projects/vestara/vestara-ai-core'` → OpenCode can locate `.opencode/agents/vestara-developer.md`

### OPENCODE-SESSION-TITLE-001

**PROVEN DEFECT — REMEDIATED**

The session title was hardcoded as `vestara-agent-${Date.now()}`. Now it uses the authoritative thread title.

**Before:** `title: 'vestara-agent-1788449303087'` → implementation artifact
**After:** `title: 'Read README'` → authoritative task title

### Causality Note

The remediation supplies the missing `directory` and `title` parameters. Whether this alone causes OpenCode to use `vestara-developer`/`mimo-v2.5-free` instead of `Build`/`Nemotron` requires controlled runtime evidence (the live test requested by the Director).

If Build/Nemotron remains after supplying directory, the causal chain must be inspected further (OpenCode prompt/message contract).

---

## 7. What Was NOT Changed

| Component | Status |
|-----------|--------|
| Routing (routing.json) | UNCHANGED |
| AgentDefinition (DB schema) | UNCHANGED |
| Harness orchestration | UNCHANGED |
| Provider configuration | UNCHANGED |
| M4 routing authority | UNCHANGED |
| M7 harness ownership | UNCHANGED |
| OpenCode defaults | UNCHANGED |
| Agent Control UI | UNCHANGED |

---

*Implementation diff complete. Awaiting live evidence capture.*
