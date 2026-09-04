# GA-CAP-001 — Global Assistant Full Permissions & Capabilities

**Date**: 2026-09-04  
**Status**: COMPLETE — live-verified full capability profile  
**Prerequisite**: GA-SSE-002 (accepted)

---

## Governing Invariant

```
effective capability
    =
Vestara authorization
    ∩
AgentDefinition permissions
    ∩
runtime capability
```

Granting capabilities in the agent definition does NOT bypass Vestara's permission authority. OpenCode `ask` surfaces a governed permission request; the Floating Assistant presents it, the backend/runtime governance owns the decision.

---

## 1. Capability Inventory & Classification

Audited the OpenCode 1.18.27 permission surface and Vestara tool packages.

| OpenCode permission | Vestara classification | Authorization mode |
|--------------------|------------------------|-------------------|
| `read` | READ | AUTOMATIC (repository) |
| `list` | SEARCH | AUTOMATIC |
| `glob` | SEARCH | AUTOMATIC |
| `grep` | SEARCH | AUTOMATIC |
| `edit` | WRITE (files/dirs within repo) | AUTOMATIC (repo root) |
| `bash` | EXECUTE (bounded shell) | AUTOMATIC for repo commands; governed for privileged |
| `task` | DELEGATE (subagents) | AUTOMATIC — see §4 delegation proof |
| `external_directory` | EXTERNAL_DIRECTORY | POLICY (`ask`) |
| `webfetch` | NETWORK | POLICY (`ask`) |
| `websearch` | NETWORK | POLICY (`ask`) |
| `todowrite` | WRITE (todo metadata) | AUTOMATIC |
| `lsp` | READ (language server) | AUTOMATIC |
| `skill` | OTHER (skills) | AUTOMATIC |
| `question` | POLICY (user question) | POLICY (`ask`) |
| `doom_loop` | POLICY (loop guard) | POLICY (`ask`) |

Notable: the OpenCode schema has **no `write` key** — writes/edits/patches are all gated by `edit`. Vestara `AgentPermission.action` uses `read | create | modify | execute`.

### Repository operations now available

- inspect repository, search files, read files
- create / modify / delete files (within repositoryDir)
- create directories
- run formatting / lint / tests / builds
- inspect dependencies
- inspect Git, produce diffs

---

## 2. Permission Mapping (AgentDefinition → OpenCode)

Updated the canonical persisted `agent-assistant` AgentDefinition:

```json
{
  "id": "agent-assistant",
  "provider": "opencode-go",
  "model": "muse-spark-1.3-contributor",
  "runtimeAgent": "vestara-assistant",
  "capabilities": [
    "conversation", "context-reading", "question-answering",
    "repository-read", "search-files", "read-files", "write-files",
    "run-commands", "git-status", "git-diff"
  ],
  "permissions": [
    {"resource":"repository","action":"read","approvalRequired":false},
    {"resource":"repository","action":"modify","approvalRequired":false},
    {"resource":"repository","action":"execute","approvalRequired":false},
    {"resource":"collaboration","action":"read","approvalRequired":false},
    {"resource":"changeset","action":"read","approvalRequired":false}
  ]
}
```

Generated `vestara-assistant` OpenCode definition (`.opencode/agents/vestara-assistant.md`):

```yaml
permission:
  read: allow
  edit: allow
  glob: allow
  grep: allow
  list: allow
  bash: allow
  task: allow
  external_directory: ask
  todowrite: allow
  webfetch: ask
  websearch: ask
  lsp: allow
  skill: allow
  question: ask
  doom_loop: ask
```

`external_directory` remains **governed** (`ask`) — repository authority is not defeated by giving the Assistant arbitrary filesystem scope. The server's rule `read *.env` / `read *.env.*` = `ask` also protects credentials.

---

## 3. Shell Capability (Governed)

`bash: allow` enables bounded shell execution. The agent prompt enforces:

- Ordinary repo commands (pnpm test/build/lint, git status/diff): automatic
- Privileged/system-impacting (sudo, systemctl, package install, filesystem ops outside repo, destructive Git, credential access, process termination): **never silently automatic** — governed

The adapter surfaces tool activity as continuous status ("Running bash…", "bash completed") and the OpenCode server's `ask`-policy gates sensitive operations.

---

## 4. Delegation Semantics (task)

`task: allow` was re-enabled only after verifying the OpenCode delegation model. OpenCode subagents are configured via the same permission ruleset system — a subagent inherits the **parent agent's permission configuration**, so a task spawned by `vestara-assistant` runs under the same `ASSISTANT_GRANT`. Invariant:

```
parent effective permissions
    ↓
delegated task
    ↓
equal or narrower permissions
```

Because `task` is granted in the same AgentDefinition as all other capabilities, a delegated subagent cannot exceed the parent's granted surface. `external_directory`, `webfetch`, `websearch`, `question`, `doom_loop` remain `ask` for both parent and any subagent.

---

## 5. Global Assistant vs Engineering Workflow

Full capability does NOT make the Assistant the Workflow Orchestrator. The Assistant performs bounded direct operations when authorized (as demonstrated). For substantial engineering requests, the future architecture remains:

```
Human → Global Assistant → intent/command → policy → Workflow Orchestrator
      → Context → Planner → Developer → Reviewer → Verifier
```

This is NOT recreated inside `vestara-assistant`.

---

## 6. Continuous UI (extended GA-SSE-002 status projection)

New capability statuses observed live:
- "Thinking…"
- "Checking the existing test file. (starting read)" / "Running read…" / "read completed"
- "Found the file — now summarizing repo state. (starting bash)" / "Running bash…" / "bash completed"
- "Preparing response…"

Human message renders immediately, then continuous status, then streamed final answer. No hidden reasoning exposed.

---

## 7. Permission UI

The Floating Assistant distinguishes `executing automatically` from `waiting for authorization`. For `ask`-policy operations, OpenCode emits `permission.asked` / `permission.v2.asked`; the adapter normalizes it (via `normalizePermissionRequest`) and surfaces a status: `Waiting for permission: <action>…`. The UI presents/answers a permission request owned by the backend/runtime governance layer — **no second permission authority in React**.

---

## 8. SSE Capability Events

The existing continuous-stream architecture is preserved. The adapter now emits (in addition to GA-SSE-002's status/tool events):

- `assistant.status` (existing `status`)
- `assistant.tool.started` / `assistant.tool.completed` (existing `tool` / `tool_result`)
- `assistant.permission.requested` → surfaced as a `status` "Waiting for permission: <action>…"
- `assistant.text.delta` (existing `delta`)
- `assistant.turn.completed` (existing `done`)
- `assistant.turn.failed` (existing `error`)

Raw OpenCode events remain behind the adapter.

---

## 9. Human Message Behavior

Preserved from GA-SSE-002B:

```
Send → human message immediately visible → Thinking… → tool/capability status
    → streamed Assistant response
```

Tool execution never hides the human message.

---

## 10. Auditability

Every mutating capability execution is attributable to:
- conversationId, turnId (SSE messageId), human messageId (persisted user message)
- agentId (`agent-assistant`), runtimeAgent (`vestara-assistant`)
- repositoryId (workspace fingerprint), repositoryDir (`/home/user/projects/vestara/vestara-ai-core`)
- OpenCode sessionId (per-conversation)
- tool/capability (`read`, `bash`, `edit`, …)
- permission decision (allow/ask per rule)
- affected target (tool_result content)
- result (tool_result / final message)

Provider/model remain execution metadata, not authorization authority.

---

## 11. Deterministic Tests

`apps/api/__tests__/assistant-opencode-adapter.test.ts` (14 tests) now includes:
- **permission request surfaced as status** (new test)
- All GA-SSE-001/002 tests retained (correlation, dedup, final-answer persistence, tool status)

All 59 affected tests pass.

---

## 12. Live Acceptance Evidence

### Create file (write/edit capability)

Prompt: "Create a temporary file named .vestara-assistant-capability-test.txt in the repository root containing exactly: Vestara Assistant capability test"

Result: file created at repository root with exact content (33 bytes: "Vestara Assistant capability test"). Continuous status: Thinking → read preface → read completed → Preparing → final response.

### Read back + git status (read + bash)

Prompt: "Read the file ... and tell me its contents. Then run git status and summarize."

- Read returned the exact contents ✅
- `bash` ran `git status` → returned actual repo state (branch main, 15 modified, 17 untracked) ✅
- Continuous status: Thinking → Reading → read completed → bash preface → Running bash → bash completed → Preparing → final response ✅
- Persisted: exactly 1 assistant message (final answer, not preface) ✅

### Cleanup (delete via governed shell)

Prompt: "Delete the temporary file ..." → `bash` ran the delete, `tool_result` "0\ndeleted", file confirmed absent. ✅

### Cardinality

| Metric | Count |
|--------|-------|
| persisted human messages | 1 per turn |
| persisted assistant messages | 1 per turn (final answer) |
| OpenCode user messages | 1 per turn |
| OpenCode assistant messages | 1 per turn (final) |
| OpenCode sessions | 1 per conversation |

---

## READY FOR GA-CAP-001 VISUAL TEST

**URL**: `http://localhost:5173/activity-v2`  
**Agent**: `vestara-assistant`  
**Provider**: `opencode-go`  
**Model**: `muse-spark-1.3-contributor`  
**Profile**: FULL GOVERNED (read/edit/bash/task allow; external_directory/webfetch/websearch/question/doom_loop ask)

Services left running. Stopping for Director review — no AR-009 work.