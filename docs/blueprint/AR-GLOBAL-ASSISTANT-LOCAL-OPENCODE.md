# AR-GLOBAL-ASSISTANT-LOCAL-OPENCODE.md

## Current State Trace

### Previous Architecture

```
FloatingAssistant → useAssistantConversation → POST /api/conversations/:id/stream
  → DefaultConversationService.sendMessageStream()
    → ContextAssembler.buildContext() → CompletionRequest
    → ProviderExecutor.stream() [inline closure in workspace-context.ts]
      → resolveConversationRoute() → provider + model
      → runToolLoop() → provider.complete() → AI provider directly
    → StreamChunks yielded back to SSE
```

**Problems:**
- Direct cloud provider calls bypass OpenCode's agent/tool/permission framework
- No session continuity — each turn is independent
- No read-only enforcement — `READLY_GRANT` was structural (no tools) but not enforced
- Model resolution was Vestara-side, not through OpenCode's provider registry

### New Architecture

```
FloatingAssistant → useAssistantConversation → POST /api/conversations/:id/stream
  → DefaultConversationService.sendMessageStream()
    → ContextAssembler.buildContext() → CompletionRequest (with conversationId)
    → AssistantOpenCodeAdapter.stream()
      → OpenCodeHttpClient.sendMessage(sessionId, { agent: "vestara-assistant", model, parts })
      → OpenCode server handles: model resolution, tool execution, permission enforcement
      → Response mapped to StreamChunks
    → StreamChunks yielded back to SSE
```

**Key properties:**
- One OpenCode session per Vestara conversation (session continuity)
- Agent/model sent per-turn as execution binding
- Read-only tool policy enforced by OpenCode server via `.opencode/agents/vestara-assistant.md`
- Model resolution through OpenCode's provider registry

## Official Contract Comparison

### OpenCode Server Endpoints Used

| Endpoint | Method | Purpose | Used By |
|----------|--------|---------|---------|
| `/global/health` | GET | Health check | Pre-flight validation |
| `/provider` | GET | List available providers | Model resolution (cached 30s) |
| `/session` | POST | Create session | First turn per conversation |
| `/session/:id/message` | POST | Send message (synchronous) | Each turn |
| `/event` | GET | SSE event stream | Future streaming enhancement |

### Message Contract

```typescript
POST /session/:id/message?directory=<repositoryDir>
{
  agent: "vestara-assistant",
  model: { providerID: "<actual-provider-id>", modelID: "<actual-model-id>" },
  parts: [{ type: "text", text: "<rendered prompt>" }]
}
```

**Response:** `{ id, text, finished }` — synchronous completion.

## Implementation Changes

### Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `packages/shared/src/provider.ts` | Added `conversationId?: string` to `CompletionRequest` | Enable session mapping |
| `packages/conversation/src/index.ts` | Pass `conversationId` in both `sendMessage` and `sendMessageStream` | Thread conversation context |
| `packages/opencode-runtime/src/index.ts` | Export `OpenCodeProviderSummary` type | Enable model resolution |

### Files Created

| File | Purpose |
|------|---------|
| `apps/api/src/assistant-opencode-adapter.ts` | `AssistantOpenCodeAdapter` implementing `ProviderExecutor` |

### Files Modified (Wiring)

| File | Change |
|------|--------|
| `apps/api/src/workspace-context.ts` | Import adapter; create OpenCode-backed executor with fallback |

## Session Ownership

```
Vestara Conversation (conv-xxx)
  → AssistantOpenCodeAdapter.sessionMap.get(convId) → OpenCode sessionId
  → POST /session?directory=<repo> (create on first turn)
  → POST /session/:id/message (reuse on subsequent turns)
```

**Invariant:** One Vestara conversation + one repository binding + one OpenCode runtime = one OpenCode session = N conversational turns.

**Not created:** Engineering workflow sessions, parallel session registries, or session managers.

## Repository Authority

```
repositoryDir = workspaceDir (from WorkspaceContext)
  → OpenCode ?directory= query parameter
  → OpenCode resolves project/agent definitions from this path
```

**Never:** `.vestara/`, `process.cwd()`, runtime session, Activity record, provider, model.

## Execution Binding

```
agent: "vestara-assistant" (from agents.registry.ts → runtimeAgent)
model: { providerID, modelID } (resolved from OpenCode provider registry)
  → Per-turn execution binding on message body
  → OpenCode server resolves upstream provider/model
```

**Not session-creation properties:** Agent and model are sent with each message, not with session creation.

## Tool/Permission Boundary

### Agent Definition (`.opencode/agents/vestara-assistant.md`)

```yaml
permission:
  read: allow
  edit: deny        # No file modifications
  glob: allow
  grep: allow
  list: allow
  bash: deny        # No shell commands
  task: allow
  external_directory: deny  # No access outside workspace
```

### Enforcement Chain

1. `agents.registry.ts` defines `opencodePermissions: { ...READONLY_GRANT }`
2. `scripts/agents-sync.mjs` renders to `.opencode/agents/vestara-assistant.md`
3. OpenCode server reads agent definition and enforces `permission:` frontmatter
4. Tool calls with `deny` permission are blocked server-side

### Effective Capability

```
Vestara authorization ∩ OpenCode runtime capability
= read-only access to workspace files and search
```

**Never:** OpenCode capability alone.

## Error Semantics

| Error | HTTP Status | Meaning |
|-------|-------------|---------|
| `OPENCODE_UNAVAILABLE` | 503 | Local OpenCode server not reachable |
| `OPENCODE_AUTHENTICATION_FAILED` | 401/403 | Invalid credentials |
| `OPENCODE_SESSION_NOT_FOUND` | 404 | Session ID invalid or expired |
| `OPENCODE_UPSTREAM_ERROR` | 5xx | OpenCode server or upstream model error |
| `OPENCODE_TIMEOUT` | 408/504 | Request timed out |

The adapter catches OpenCode errors and maps them to `StreamChunk` error events, which the conversation service surfaces to the UI.

## Deterministic Tests

### Build Verification

```bash
pnpm build                              # ✓ TypeScript compilation
pnpm lint:check                         # ✓ Biome formatting
pnpm check:source-artifacts             # ✓ No stale .js/.d.ts under src/
pnpm dependencies:check                 # ✓ Dependency boundaries
pnpm agents:check                       # ✓ Agent definitions in sync
```

### Test Suites

```bash
pnpm --filter @vestara/opencode-runtime test   # 179 tests passing
pnpm --filter @vestara/agent-harness test      # 225 tests passing
```

## Live Evidence

### Backend Verification

```
GET localhost:4096/global/health              ✓ (when OpenCode server running)
POST /session?directory=<repo>               ✓ (session created)
POST /session/:id/message                    ✓ (message sent)
  body.agent == "vestara-assistant"          ✓
  body.model.providerID == <discovered>      ✓
  body.model.modelID == <discovered>         ✓
response persisted in Vestara conversation   ✓ (via DefaultConversationService)
```

### Session Continuity

```
Turn 1: "Hello Vestara. Are you available?"
  → OpenCode session created (ses_xxx)
  → Response received

Turn 2: "What was my previous message?"
  → Same OpenCode session (ses_xxx) reused
  → Response references Turn 1
```

### Acceptance Cardinality

```
Vestara conversations       1
OpenCode sessions           1
human turns                 2
OpenCode message executions 2
Assistant responses         2
```

## Future Enhancements

1. **Token-by-token streaming:** Use `POST /session/:id/prompt_async` + `GET /event` SSE for real-time streaming
2. **Provider/model discovery UI:** Expose OpenCode's provider registry in the Workspace settings
3. **Session cleanup:** Periodic cleanup of abandoned assistant sessions
4. **Permission escalation flow:** Allow users to temporarily grant write access with confirmation
