---
title: Floating Assistant Tool + Context Path Audit
version: 1.0.0
status: complete
owner: vestara
date: 2026-09-11
mode: audit + architecture recommendation
---

# Floating Assistant Tool + Context Path Audit

## 1. Executive Summary

The Floating Assistant has **two execution paths** with different tool/context behavior:

| Path | Tool Source | Context Assembly | Observations → Context |
|------|-----------|-----------------|----------------------|
| **Conversation** (UI chat) | OpenCode tool list | Last 20 messages + system prompt | ❌ NOT wired |
| **Agent Harness** (workflow) | Vestara `ToolRuntime` (9+6 tools) | Task + workspace + policies + messages + tool results | ✅ Wired |

**Key finding**: The Conversation path (Floating Assistant UI) does NOT persist tool observations back into conversation context. Tool calls/results are projected as SSE chunks for display but not stored as structured conversation data. Subsequent turns cannot reference what tools did.

The Agent Harness path correctly persists tool results as thread items and includes them in subsequent turns via `compactContext()`.

## 2. Two Execution Paths

### Path A: Conversation (Floating Assistant UI Chat)

```
User types → POST /api/conversations/:id/stream
  → DefaultConversationService.sendMessageStream()
    → DefaultContextAssembler.buildContext() [system + last 20 messages + user message]
    → AssistantOpenCodeAdapter
      → buildToolsMap() [per-turn tool availability from capability policy]
      → POST /session/:id/prompt_async
      → Consume SSE events → project to StreamChunks
    → Persist assistant message (TEXT ONLY)
    → Emit conversation:response.completed
```

**Tool availability**: Controlled by `AssistantOpenCodeAdapter.buildToolsMap()` based on `GA-CAP-003` capability policy. Tools come from OpenCode's tool list, not Vestara's `ToolRuntime`.

**Context**: Last 20 conversation messages (user/assistant role) + system prompt. No tool observations.

### Path B: Agent Harness (Multi-Step Workflow)

```
API route → AgentHarnessRuntime.run()
  → continueTurn()
    → HarnessContextAssembler.assemble() [task + workspace + policies + human messages + tool results]
    → provider.complete() [messages = system + compacted summary + raw thread items]
    → tools.definitions() [Vestara ToolRuntime: 9 always + 6 conditional]
    → executeToolCalls() [ToolRuntime.invoke() with policy]
    → Append tool-result items to ThreadStore
    → Emit harness.tool.completed events
    → Next iteration: tool results IN context
```

**Tool availability**: Vestara `ToolRuntime` — 9 always-registered + 6 conditional browser tools.

**Context**: Task identity + workspace + policies + recent human messages + last 8 tool results + compacted summary.

## 3. Tool Availability Analysis

### Floating Assistant Tools (Conversation Path)

The Floating Assistant does NOT use Vestara's `ToolRuntime`. Instead:

1. `AssistantOpenCodeAdapter.buildToolsMap()` checks `GA-CAP-003` capability policy
2. Policy maps tool names to `ALLOW | ASK | DENY`
3. The tool list comes from **OpenCode's session tool discovery**, not Vestara's tool registry
4. Vestara's `ToolRuntime` (filesystem, git, shell, browser) is only used by the Agent Harness

**Gap**: The Floating Assistant's tool availability is determined by OpenCode, not by Vestara's tool governance. If OpenCode doesn't expose a tool, the Assistant can't use it — even if Vestara has it registered.

### Agent Harness Tools

| Tool | Risk | Available | Notes |
|------|------|-----------|-------|
| `filesystem.read` | low | ✅ | Always |
| `filesystem.search` | low | ✅ | Always |
| `filesystem.write` | medium | ✅ | Always |
| `shell.execute` | high | ✅ | Requires approval |
| `git.status` | low | ✅ | Always |
| `git.diff` | low | ✅ | Always |
| `git.log` | low | ✅ | Always |
| `git.add` | high | ✅ | Requires approval |
| `git.commit` | high | ✅ | Requires approval |
| `browser.*` | varies | ⚠️ | Only when `VESTARA_BROWSER_URL` set |

## 4. Context Assembly Analysis

### Conversation Path Context

**What goes in**:
- System prompt (default or caller-supplied)
- Last 20 conversation messages (user/assistant)
- Current user message
- Surface context (workspace name, route, selected item) — via OpenCode adapter

**What does NOT go in**:
- Tool calls made during previous turns
- Tool results from previous turns
- Execution observations
- File changes made by tools
- Verification results

**Impact**: After the Assistant executes a tool (e.g., reads a file, runs a command), the next turn has no memory of what the tool did. The user must re-explain context.

### Agent Harness Context

**What goes in**:
- Task identity + thread title + turn instruction
- Workspace root + policies (network, filesystem, process)
- Recent human messages (from Activity Room, with receipt tracking)
- Last 8 tool results (tool name + status)
- Compacted summary (older items compressed)

**What does NOT go in**:
- Full tool output (only last 8, summary only)
- External system state (browser page content, etc.)

## 5. Observations Flow Analysis

### What Happens After a Tool Executes

| Step | Conversation Path | Agent Harness Path |
|------|------------------|-------------------|
| Tool executes | OpenCode runs tool | `ToolRuntime.invoke()` runs tool |
| Result returned | SSE `tool_result` chunk | `tool-result` item appended to ThreadStore |
| UI displays | `AssistantToolCard` renders result | `AssistantToolCard` renders result |
| **Persisted to context?** | **NO** — only final assistant text saved | **YES** — tool-result items are thread items |
| **Available in next turn?** | **NO** — conversation only stores text | **YES** — `compactContext()` includes tool results |

### The Critical Gap

In the Conversation path:
1. Tool calls produce `tool` and `tool_result` SSE chunks
2. These are displayed in the UI as `AssistantToolCard` components
3. But the `DefaultConversationService` only persists the **final assistant message text**
4. Tool calls and results are **not stored** as structured conversation data
5. The next turn's context (`DefaultContextAssembler`) only sees the last 20 messages (text)
6. **Tool observations are lost between turns**

In the Agent Harness path:
1. Tool calls produce `tool-call` and `tool-result` thread items
2. These are persisted to `ThreadStore` (SQLite)
3. `compactContext()` includes them in the summary
4. `messages()` maps them to `role: 'tool'` in the CompletionRequest
5. **Tool observations persist across turns**

## 6. Recommendations

### Priority 1: Wire Tool Observations into Conversation Context

The Floating Assistant needs to persist tool observations so subsequent turns can reference them. Options:

**Option A: Persist tool calls/results as conversation messages**
- After each tool execution, store a structured message with role `tool` or a custom role
- `DefaultContextAssembler` would include these in the context window
- Pro: Simple, reuses existing conversation infrastructure
- Con: Increases message count, may exceed 20-message window quickly

**Option B: Store tool observations as metadata on the assistant message**
- Attach `toolCalls[]` and `toolResults[]` to the assistant `Message` object
- Context assembler includes a summary of recent tool observations
- Pro: Clean separation, doesn't pollute message history
- Con: Requires schema change to Message type

**Option C: Use the Agent Harness path for tool-using conversations**
- Route conversations that use tools through the Agent Harness instead of the Conversation service
- Pro: Already works correctly
- Con: Different execution model, may not be appropriate for simple chat

**Recommendation**: Option A (simplest) or Option B (cleanest). Option A is the smallest change.

### Priority 2: Align Tool Availability Between Paths

The Floating Assistant should have access to the same tools as the Agent Harness when appropriate. Options:

**Option A: Expose Vestara ToolRuntime definitions to the OpenCode adapter**
- `buildToolsMap()` queries Vestara's `ToolRuntime.definitions()` for available tools
- Maps Vestara tool names to OpenCode tool names
- Pro: Single source of truth for tool availability
- Con: Requires mapping between Vestara and OpenCode tool namespaces

**Option B: Register Vestara tools with OpenCode**
- At session creation, register Vestara tools as OpenCode tools
- Pro: OpenCode natively knows about Vestara tools
- Con: Requires OpenCode extension point

**Option C: Keep separate tool lists, document the gap**
- Accept that Floating Assistant and Agent Harness have different tool surfaces
- Pro: No code change
- Con: Users may be confused by different capabilities

**Recommendation**: Option A — expose Vestara tool definitions to the adapter for visibility, even if OpenCode doesn't use them directly.

### Priority 3: Observation Feedback Loop

After a tool executes, its observations should influence future context:

1. **Tool result → memory**: Store tool results in the memory system for long-term recall
2. **Tool result → knowledge**: Index tool outputs in the knowledge graph
3. **Tool result → Activity Room**: Already wired via M9 ingestion bridge
4. **Tool result → next turn context**: Gap identified above (Priority 1)

## 7. Current State Summary

| Capability | Conversation Path | Agent Harness |
|-----------|------------------|---------------|
| Tool execution | ✅ Via OpenCode | ✅ Via ToolRuntime |
| Tool governance | ⚠️ OpenCode-controlled | ✅ Vestara RiskBasedToolPolicy |
| Context assembly | ✅ System + history | ✅ Task + workspace + policies + tool results |
| Tool observations → context | ❌ NOT wired | ✅ ThreadStore + compactContext |
| Tool observations → Activity Room | ✅ Via M9 bridge | ✅ Via M9 bridge |
| Tool observations → memory | ❌ NOT wired | ⚠️ Via engineering memory projection |
| Verification | ❌ NOT in conversation path | ✅ HarnessVerifier |

## 8. Files Involved

| File | Role |
|------|------|
| `packages/context/src/index.ts` | `DefaultContextAssembler` — conversation context builder |
| `packages/agent-harness/src/index.ts` | `AgentHarnessRuntime` — multi-step execution loop |
| `apps/api/src/assistant-opencode-adapter.ts` | OpenCode adapter for Floating Assistant |
| `apps/api/src/assistant-binding-resolver.ts` | Provider/model validation |
| `apps/api/src/workspace-context.ts` | Composition root — wires all services |
| `apps/workspace/src/hooks/useAssistantConversation.ts` | Client-side conversation management |
| `apps/workspace/src/components/assistant/ConversationPanel.tsx` | Chat UI |

---

> **Audit complete. Primary gap: Floating Assistant does not persist tool observations into conversation context.**
