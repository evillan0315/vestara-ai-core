# OpenCode Project Authority Trace — Complete Evidence

**Date:** 2026-09-03
**Status:** Audit Complete — No Mutation
**Root Cause:** PROVEN

---

## 1. Root Cause: PROVEN

**`directory` belongs in HTTP query parameters, NOT in the request body.**

The OpenCode SDK contract (`SessionCreateData`) specifies:

```typescript
export type SessionCreateData = {
  body?: {
    parentID?: string
    title?: string
  }
  query?: {
    directory?: string   // ← QUERY PARAMETER
  }
  url: "/session"
}
```

Vestara's `OpenCodeHttpClient.createSession()` sends `directory` in the **body**:

```typescript
const body = {
  directory: input.directory,  // ← WRONG: body, not query
  title: input.title,
  agent: input.agent,
  ...(providerID ? { providerID } : {}),
  ...(modelID ? { modelID } : {}),
};
return this.requestJson({ path: '/session', method: 'POST', body, ... });
```

**Result:** OpenCode ignores `directory` in body, resolves to server CWD (`/home/user/projects/vestara`).

---

## 2. Second Root Cause: PROVEN

**`agent` and `model` belong in `POST /session/{id}/message`, NOT in `POST /session`.**

The OpenCode SDK contract (`SessionPromptData`) specifies:

```typescript
export type SessionPromptData = {
  body?: {
    model?: { providerID: string; modelID: string }
    agent?: string
    parts: Array<TextPartInput | FilePartInput | ...>
  }
  path: { id: string }
  query?: { directory?: string }
  url: "/session/{id}/message"
}
```

The `POST /session` contract (`SessionCreateData`) only supports `parentID` and `title` in the body. `agent`, `providerID`, `modelID` are **not part of the session creation contract**.

---

## 3. Evidence Table

### 3.1 Session Creation: Body vs Query

| Test | directory location | Project Resolved | Directory Effective |
|------|-------------------|------------------|-------------------|
| Body: `{"directory":"/home/user/projects/vestara/vestara-ai-core"}` | **Body** | `59d6f60...` (parent) | `/home/user/projects/vestara` ❌ |
| Query: `?directory=/home/user/projects/vestara/vestara-ai-core` | **Query** | `715788...` (vestara-ai-core) | `/home/user/projects/vestara/vestara-ai-core` ✅ |

### 3.2 Session + Message: Correct Contract

| Step | Endpoint | Body | Query | Result |
|------|----------|------|-------|--------|
| Create session | `POST /session` | `{ "title": "Read README" }` | `?directory=/home/user/projects/vestara/vestara-ai-core` | project=`715788...`, directory=`vestara-ai-core` ✅ |
| Send message | `POST /session/{id}/message` | `{ "agent": "vestara-developer", "model": { "providerID": "opencode", "modelID": "mimo-v2.5-free" }, "parts": [...] }` | `?directory=...` | agent=`vestara-developer`, model=`mimo-v2.5-free` ✅ |

### 3.3 Message Response Evidence

```
Assistant message:
  role: assistant
  agent: vestara-developer          ✅
  modelID: mimo-v2.5-free           ✅
  providerID: opencode              ✅
  mode: vestara-developer           ✅
  path.cwd: /home/user/projects/vestara/vestara-ai-core   ✅
  path.root: /home/user/projects/vestara/vestara-ai-core  ✅
```

---

## 4. Complete Transformation Chain

### 4.1 Current (BROKEN)

```
Vestara: workspaceDir = /home/user/projects/vestara/vestara-ai-core
    ↓
OpenCodeRuntimeProvider: { directory: this.directory }
    ↓
OpenCodeHttpClient.createSession(): { body: { directory: "...", agent: "...", ... } }
    ↓
HTTP: POST /session  body: { "directory": "/home/user/projects/vestara/vestara-ai-core", "agent": "vestara-developer", ... }
    ↓
OpenCode: IGNORES body.directory → resolves from server CWD
    ↓
Session: directory=/home/user/projects/vestara, projectID=59d6f60..., agent=build
```

### 4.2 Correct (PROPOSED)

```
Vestara: workspaceDir = /home/user/projects/vestara/vestara-ai-core
    ↓
OpenCodeRuntimeProvider: { directory: this.directory }
    ↓
OpenCodeHttpClient.createSession(): { query: { directory: "..." }, body: { title: "..." } }
    ↓
HTTP: POST /session?directory=/home/user/projects/vestara/vestara-ai-core  body: { "title": "Read README" }
    ↓
OpenCode: resolves project from query.directory → 715788...
    ↓
Session: directory=/home/user/projects/vestara/vestara-ai-core, projectID=715788... ✅
    ↓
Then send message: POST /session/{id}/message?directory=...
    body: { "agent": "vestara-developer", "model": { "providerID": "opencode", "modelID": "mimo-v2.5-free" }, "parts": [...] }
    ↓
Message: agent=vestara-developer, model=mimo-v2.5-free ✅
```

---

## 5. OpenCode Project Comparison

| Property | Parent Vestara | vestara-ai-core |
|----------|---------------|-----------------|
| directory | `/home/user/projects/vestara` | `/home/user/projects/vestara/vestara-ai-core` |
| projectID | `59d6f60657d7b5d37fda08d80463119964e8fe97` | `71578899bb5946c2ee769246d396b6dc7c0398ce` |
| vestara-developer visible? | YES (discovered via parent) | YES (discovered directly) |
| session directory | `/home/user/projects/vestara` | `/home/user/projects/vestara/vestara-ai-core` |
| effective agent (with correct contract) | build (default) | vestara-developer ✅ |

---

## 6. OpenCode Server Process

| Property | Value |
|----------|-------|
| PID | 71041 |
| Command | `/home/user/.opencode/bin/opencode serve --hostname 127.0.0.1 --port 4096` |
| CWD | `/home/user/projects/vestara` |
| Config model | `opencode/nemotron-3-ultra-free` |
| Registered projects | 6 (including vestara-ai-core) |

---

## 7. Session Title Lifecycle

### OpenCode Contract

```
POST /session?directory=...
body: { title: "Read README" }
→ creates session with title "Read README"

POST /session/{id}?directory=...
body: { title: "Updated Title" }
→ updates session title
```

### Title Update API

```typescript
export type SessionUpdateData = {
  body?: { title?: string }
  path: { id: string }
  query?: { directory?: string }
  url: "/session/{id}"
}
```

**OpenCode supports explicit session title update via `PUT /session/{id}?directory=...`**

---

## 8. Divergence Classification

| Field | Vestara Resolved | HTTP Wire | OpenCode Received | Classification |
|-------|-----------------|-----------|-------------------|----------------|
| **directory** | `/home/user/projects/vestara/vestara-ai-core` | `body.directory` (ignored) | `/home/user/projects/vestara` | **HTTP CLIENT SERIALIZATION** — body vs query mismatch |
| **agent** | `vestara-developer` | `body.agent` (wrong endpoint) | `build` (default) | **OPENCODE API CONTRACT** — agent belongs in message, not session |
| **provider** | `opencode` | `body.providerID` (wrong endpoint) | `opencode` (default) | **OPENCODE API CONTRACT** — providerID belongs in message |
| **model** | `mimo-v2.5-free` | `body.modelID` (wrong endpoint) | `nemotron-3-ultra-free` (default) | **OPENCODE API CONTRACT** — modelID belongs in message |
| **title** | `Read README` | `body.title` | `agent-developer` | **VESTARA RESOLUTION** — API route defaults to agentId |

---

## 9. Minimum Remediation

### Required Changes

1. **`OpenCodeHttpClient.createSession()`**: Move `directory` from body to query parameters
2. **`OpenCodeRuntimeProvider.complete()`**: Split into two calls:
   - `POST /session?directory=...` with `{ title }` only
   - `POST /session/{id}/message?directory=...` with `{ agent, model, parts }`
3. **`OpenCodeHttpClient`**: Add `sendMessage()` method for `POST /session/{id}/message`

### What NOT to Change

- Routing, AgentDefinition, Harness orchestration
- Provider configuration, M4/M7 ownership
- OpenCode defaults

---

*Evidence complete. Awaiting Director decision.*
