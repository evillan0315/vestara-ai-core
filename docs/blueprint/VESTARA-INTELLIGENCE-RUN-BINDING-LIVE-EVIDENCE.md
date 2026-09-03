# OpenCode Runtime Binding — Live Evidence

**Date:** 2026-09-03
**Test:** Agent Control → Developer → Run → "Read README"
**Status:** Live Evidence Captured

---

## 1. Test Execution

### Request

```
POST /api/agents/agent-developer/runs
Body: {"instruction": "Read README"}
```

### Response

```json
{
  "threadId": "thread-1788456945645-1",
  "turnId": "turn-1788456945792-2",
  "runId": "run-1788456945793-3",
  "state": "queued",
  "sessionId": "session-1788456945652-1"
}
```

---

## 2. Harness Thread Evidence

### Thread Metadata

| Field | Value |
|-------|-------|
| Thread ID | `thread-1788456945645-1` |
| Title | `agent-developer` |
| Status | `completed` |
| Metadata.agentId | `agent-developer` |
| Metadata.runSource | `api` |

### Turn

| Field | Value |
|-------|-------|
| Turn ID | `turn-1788456945792-2` |
| Input | `Read README` |
| State | `completed` |
| Outcome | `Verification passed` |

### Model Response (Harness Record)

| Field | Value |
|-------|-------|
| Model | `opencode` |
| Provider | `opencode-runtime` |
| Content | README summary returned |

---

## 3. OpenCode Session Evidence

### Session List Query

```
GET /api/opencode/sessions
```

**First session (our test):**

| Field | Value |
|-------|-------|
| Session ID | `ses_f97a88acfffe6nG4a0rBqAEkam` |
| Title | `agent-developer` |
| Agent | **`build`** |
| Provider | N/A |
| Model | N/A |

### Sessions with `agent=vestara-developer`

```
Found 3 sessions with agent=vestara-developer
  ID: ses_f983c651fffeY0jIwBxI83rqo5, Title: Creating AGENTS.md for repository
  ID: ses_fb3bf6471ffe3Pb2UfaS1pOI91, Title: Vestara Activity Room Documentation
  ID: ses_fc00d4e68ffebjLDIURT7AP678, Title: vestara-agent-1787779259539
```

### Session Messages

```
GET /api/opencode/sessions/ses_f97a88acfffe6nG4a0rBqAEkam/messages
Found 0 messages
```

---

## 4. Requested vs Effective Binding Table

| Boundary | agent | provider | model | title | directory |
|----------|-------|----------|-------|-------|-----------|
| **Vestara DB (agent-developer)** | agent-developer | opencode | mimo-v2.5-free | N/A | N/A |
| **Harness resolution** | vestara-developer | opencode | mimo-v2.5-free | N/A | N/A |
| **Provider.complete() request** | vestara-developer | N/A | opencode/mimo-v2.5-free | agent-developer | N/A |
| **RuntimeProvider.createSession()** | vestara-developer | opencode | mimo-v2.5-free | agent-developer | `/home/user/projects/vestara/vestara-ai-core` |
| **OpenCode effective** | **build** | N/A | N/A | agent-developer | N/A |

---

## 5. Session Title Lifecycle Verification

### Current Behavior

1. **API route** sets thread title: `const title = typeof body.title === 'string' ? body.title : agentId;`
   - No title in request body → title = `agent-developer`
2. **Harness** creates thread with title `agent-developer`
3. **Harness** passes `thread.title` to `provider.complete({ title: thread.title })`
4. **RuntimeProvider** passes title to `createSession({ title: 'agent-developer' })`
5. **OpenCode** creates session with title `agent-developer`

### Title Lifecycle Finding

The session title IS being passed correctly from the harness thread to OpenCode. However:

- The thread title is `agent-developer` (not `Read README`) because the API route defaults to `agentId` when no title is provided
- The OpenCode session title matches the thread title: `agent-developer`
- The instruction `Read README` is in the turn input, not the session title

### Required Title Fix

The API route should use the instruction as the title when no explicit title is provided:

```typescript
// Current:
const title = typeof body.title === 'string' ? body.title : agentId;

// Should be:
const title = typeof body.title === 'string' ? body.title : instruction;
```

---

## 6. Causal Hypothesis Classification

### H4 (directory absent → Build/Nemotron fallback)

**INDETERMINATE**

The directory parameter was supplied (`/home/user/projects/vestara/vestara-ai-core`), but OpenCode still used `build` as the agent. This means:

1. The directory alone does NOT cause OpenCode to use the correct agent
2. There may be additional factors (e.g., agent definition file format, OpenCode agent resolution logic)
3. The hypothesis "directory absent → Build/Nemotron fallback" is NOT proven by this test

### Additional Finding

The OpenCode session shows `agent: build` even though we passed `agent: vestara-developer`. This suggests that OpenCode's agent resolution may depend on:

1. The agent definition file format (`.opencode/agents/vestara-developer.md`)
2. The OpenCode server's agent registration
3. The session creation API's agent parameter handling

---

## 7. OpenCode Session Title Lifecycle

### Current Implementation

```
1. createSession({ title: 'agent-developer', agent: 'vestara-developer', ... })
   → OpenCode creates session with title 'agent-developer'
   → OpenCode session agent = 'build' (not 'vestara-developer')
```

### Required Lifecycle (per Director)

```
1. create OpenCode session
2. receive sessionId
3. send/bind execution
4. update session title from authoritative task/workflow title
```

### Investigation Needed

1. Does OpenCode support updating session titles after creation?
2. Does OpenCode automatically update the title after the first message?
3. Should Vestara use OpenCode's session update API?

---

## 8. Summary

| Finding | Status |
|---------|--------|
| Directory supplied correctly | **YES** |
| Title supplied correctly | **YES** (but title is `agent-developer`, not `Read README`) |
| OpenCode agent = vestara-developer | **NO** — still `build` |
| OpenCode model = mimo-v2.5-free | **UNKNOWN** — session has no messages |
| Causal hypothesis proven | **NO** — INDETERMINATE |

### Next Steps

1. Fix API route to use instruction as title when no explicit title provided
2. Investigate OpenCode agent resolution — why does `agent: vestara-developer` not work?
3. Check OpenCode agent definition file format and registration
4. Investigate OpenCode session title update API

---

*Live evidence captured. Awaiting Director decision.*
