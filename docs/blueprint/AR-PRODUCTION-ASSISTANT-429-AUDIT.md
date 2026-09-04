# AR-PRODUCTION-ASSISTANT-429-AUDIT

**Date**: 2026-09-04  
**Classification**: Production audit — zero-assumption trace  
**Status**: Root cause identified, fix NOT implemented

---

## Failure Summary

| Field | Value |
|-------|-------|
| **Failure classification** | **PROVIDER_RATE_LIMITED** |
| **UI message** | "Backend unavailable — messages may not send" |
| **Actual error** | `FreeUsageLimitError` — upstream provider rate limit exceeded |
| **HTTP status from upstream** | 429 |
| **Backend health** | ✅ HEALTHY (API responded HTTP 200, SSE stream opened) |
| **Root cause** | `opencode` provider free tier rate limit exceeded |

---

## Production Trace

### Request Path

```
ConversationPanel
     │
     │ File: apps/workspace/src/components/assistant/ConversationPanel.tsx:266
     │ Symbol: handleSend()
     │
     ▼
useAssistantConversation.sendMessage()
     │
     │ File: apps/workspace/src/hooks/useAssistantConversation.ts:161
     │ Symbol: sendMessage()
     │
     ▼
POST /api/conversations/:id/stream
     │
     │ File: apps/api/src/routes/conversations.ts:77
     │ Symbol: handleConversationsRoute()
     │
     ▼
resolveAssistantModel(ctx)
     │
     │ File: apps/api/src/routes/conversations.ts:13
     │ Symbol: resolveAssistantModel()
     │ Returns: "mimo-v2.5-free" (from agent-assistant AgentDefinition)
     │
     ▼
ctx.conversationService.sendMessageStream(convId, message, { model: "mimo-v2.5-free" })
     │
     │ File: packages/conversation/src/index.ts:258
     │ Symbol: DefaultConversationService.sendMessageStream()
     │
     ▼
this.contextAssembler.buildContext(conversation, content, { model: "mimo-v2.5-free" })
     │
     │ File: packages/context/src/index.ts:39
     │ Symbol: DefaultContextAssembler.buildContext()
     │ Returns: { model: "mimo-v2.5-free", messages: [...], temperature: 0.7, maxTokens: 2048 }
     │
     ▼
this.providerExecutor.stream(request)
     │
     │ File: packages/conversation/src/index.ts:287
     │ Symbol: providerExecutor.stream()
     │
     ▼
resolveConversationRoute(request.model)
     │
     │ File: apps/api/src/workspace-context.ts:687
     │ Symbol: resolveConversationRoute()
     │ Logic: routingStore.developer.role → opencode provider → model exists? → use it
     │ Returns: { providerId: "opencode", modelId: "mimo-v2.5-free" }
     │
     ▼
providerManager.getProvider("opencode")
     │
     │ Returns: OpenCodeProvider instance
     │ baseUrl: "https://opencode.ai/zen/v1" (default)
     │
     ▼
OpenCodeProvider.stream(request)
     │
     │ File: packages/providers/opencode/src/index.ts
     │ Symbol: OpenCodeProvider.stream()
     │
     ▼
HTTP POST https://opencode.ai/zen/v1/chat/completions
     │
     │ Upstream: OpenCode Zen cloud (NOT local :4096)
     │
     ▼
HTTP 429: FreeUsageLimitError
     "Rate limit exceeded. Please try again later."
```

### Captured Values

| Field | Value |
|-------|-------|
| conversationId | `conv-1788494541096-7` |
| agentId | `agent-assistant` |
| AgentDefinition.provider | `opencode` |
| AgentDefinition.model | `mimo-v2.5-free` |
| Resolved provider | `opencode` |
| Resolved model | `mimo-v2.5-free` |
| Provider implementation | `OpenCodeProvider` |
| Upstream host | `opencode.ai` |
| Upstream path | `/zen/v1/chat/completions` |
| HTTP status | 429 |
| Error type | `FreeUsageLimitError` |
| Error message | "Rate limit exceeded. Please try again later." |
| Reached local OpenCode :4096? | **NO** |
| Reached OpenCode Zen/cloud? | **YES** |
| Another transport used? | **NO** |

### Configured vs Resolved vs Outbound

| Aspect | Configured (AgentDefinition) | Resolved (runtime) | Outbound (HTTP) |
|--------|------------------------------|--------------------|--------------------|
| provider | `opencode` | `opencode` | `opencode` |
| model | `mimo-v2.5-free` | `mimo-v2.5-free` | `mimo-v2.5-free` |

**configured == resolved == outbound** — The architecture is working correctly. The 429 is a legitimate upstream provider rate limit.

### Alternative Model Test

Using `opencode-go: mimo-v2.5` (explicitly passed in request body):

```bash
curl -X POST "http://127.0.0.1:3001/api/conversations/$CONV_ID/stream" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello","model":"mimo-v2.5"}'
```

**Result**: ✅ SUCCESS — Assistant responded with coherent text.

This proves the architecture works. The issue is specifically `opencode: mimo-v2.5-free` hitting the free tier rate limit.

---

## UI Misclassification

The UI reports "Backend unavailable" for an upstream HTTP 429. This is incorrect:

| Actual condition | UI message | Correct? |
|-----------------|------------|----------|
| Backend healthy, upstream rate limited | "Backend unavailable" | ❌ NO |

A 429 means the backend was reachable but the upstream provider rejected/throttled the request. The error should be classified as provider rate limiting, not backend unavailability.

---

## Failure Classification

| Category | Status |
|----------|--------|
| BACKEND_UNAVAILABLE | ❌ No — backend responded HTTP 200, SSE stream opened |
| **PROVIDER_RATE_LIMITED** | ✅ **YES** — `FreeUsageLimitError` from opencode free tier |
| PROVIDER_QUOTA_EXHAUSTED | ❌ No — rate limit, not quota |
| PROVIDER_AUTH_FAILURE | ❌ No — authentication succeeded |
| MODEL_UNAVAILABLE | ❌ No — model exists on provider |
| CONFIGURATION_ERROR | ❌ No — configured == resolved == outbound |
| LOCAL_OPENCODE_FAILURE | ❌ No — request went to cloud, not local :4096 |
| OTHER | ❌ No |

---

## agent-assistant Persisted Definition

```json
{
  "id": "agent-assistant",
  "name": "Assistant",
  "role": "conversation",
  "agentType": "workspace",
  "provider": "opencode",
  "model": "mimo-v2.5-free",
  "runtimeAgent": "vestara-assistant",
  "status": "active",
  "permissions": [
    {"resource": "repository", "action": "read", "approvalRequired": false},
    {"resource": "collaboration", "action": "read", "approvalRequired": false}
  ]
}
```

---

## resolveAssistantModel() Sufficiency

AR-006C claimed agent-assistant provider/model authority. AR-007A added `resolveAssistantModel()` which only resolves the **model**.

**Question**: Is resolving only the model sufficient to select the intended provider?

**Answer**: **NO — not directly.** The `resolveConversationRoute()` function in `workspace-context.ts` resolves the **provider** from the routing store's developer role, NOT from the agent definition. The model override works because `resolveConversationRoute()` checks if the requested model exists on the resolved provider.

However, since `opencode: mimo-v2.5-free` exists on the `opencode` provider (which is the developer role's default), the model override correctly selects the intended provider. This is **incidental correctness**, not architectural guarantee.

**Recommendation**: If agent-assistant's provider differs from the developer role's provider, `resolveAssistantModel()` alone would NOT correctly resolve the provider. A future milestone should resolve both provider and model from the agent definition.

---

## Verification Evidence

| Check | Result |
|-------|--------|
| agent-assistant persisted | ✅ Verified via GET /api/agents |
| agent-assistant in sync | ✅ vestara-assistant.md created |
| Configured == Resolved == Outbound | ✅ All three match |
| Architecture working | ✅ Yes — upstream 429 is legitimate |
| UI misclassification | ⚠️ "Backend unavailable" for provider 429 |
| Alternative model works | ✅ `opencode-go: mimo-v2.5` succeeded |

---

## Recommendation

The architecture is working correctly. The 429 is a legitimate upstream provider rate limit. No code fix is needed for the architecture. The options are:

1. **Wait** for rate limit to reset
2. **Switch model** to `opencode-go: mimo-v2.5` (which works)
3. **Configure a different provider** with available quota

Do not redesign the architecture to handle rate limits — that is a provider configuration concern.
