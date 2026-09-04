# GA-UX-PREMIUM M3 — Structured Assistant Execution Projection Contract

**Status:** IMPLEMENTED (contract/infrastructure milestone — M2 accepted, M3 delivered)
**Contract:** `assistant.execution.v1`
**Source runtime audited:** OpenCode **1.18.27** (live server, `127.0.0.1:4096`)
**Scope:** tool lifecycle, edit, terminal, task, permission, verification, artifact projections + sanitization + bounds + versioning. **No rich UI** (M4–M7 held), **no GA-CAP-002 UI**, **AR-009 remains paused**.

---

## 1. Source-event audit (OpenCode 1.18.27)

Audited via the pinned generated contract (`packages/opencode-runtime/src/generated/opencode-contracts.ts`, refreshed by `opencode:spec:update`) **and** live capture against the running server (see §13).

### Tool lifecycle — the real path

`consumeEvent()`/`yieldResult` are not reachable in this repository — they live inside the OpenCode server binary. The observable boundary is the `/event` SSE stream plus message parts. **Live capture proves the tool-call sequence arrives as `message.part.updated` events carrying tool parts** (NOT `session.next.tool.*` events in this server configuration):

```
message.part.updated { part: { type: "tool", callID: "call_73fdf0c…", tool: "read",
                               state: { status: "pending",  input, raw } } }
message.part.updated { part: { type: "tool", callID: "call_73fdf0c…", tool: "read",
                               state: { status: "running",  input, time } } }
message.part.updated { part: { type: "tool", callID: "call_73fdf0c…", tool: "read",
                               state: { status: "completed", input, output, metadata, title, time } } }
```

| Identity | Field | Provenance |
|---|---|---|
| Tool-call identity | `part.callID` (e.g. `call_b55512e995674acd8462f7c1`) | **Authoritative** — stable across pending→running→completed |
| Tool name | `part.tool` (`read`, `grep`, `write`, `bash`, `todowrite`) | Authoritative |
| Lifecycle | `part.state.status` (`pending` / `running` / `completed` / `error`) | Authoritative — explicit, never text-derived |
| Display title | `part.state.title` (`package.json`, `m3-live-evidence.txt`) | Authoritative, bounded |
| Timing | `part.state.time.start` / `.end` | Authoritative → `durationMs` derived |
| Part/message identity | `part.id`, `part.messageID`, `payload.sessionID` | Authoritative |

The generated contract also declares `session.next.tool.input.started/ended`, `.called`, `.success`, `.failed` — the adapter supports both paths (`projectMessagePartUpdated` + the `session.next.tool.*` functions); the part path is what the live server emits.

### Other audited source events

| Capability | Source events / endpoints | Evidence available |
|---|---|---|
| Text streaming | `message.part.delta` (`payload.delta`) | Live: text deltas observed |
| Session diff | `session.diff` event + `GET /session/:id/diff` → `OpenCodeDiffFile{path, operation, additions, deletions, hunks}` | Live: `session.diff` observed; diff endpoint returns `{path, operation, additions, deletions, hunks}` |
| Todos (OpenCode local) | `todo.updated { sessionID, todos: Todo[]{content, priority, status} }` + `GET /session/:id/todo` | Live: `todo.updated` observed in task scenario |
| Permission | `permission.v2.asked { action, id, resources[], save?, metadata?, source{callID} }` / `permission.v2.replied { reply, requestID }` | Contract-audited; **not observed live** (this server auto-approves) — recorded as explicit absence, never fabricated |
| Terminal | `session.next.shell.started/ended`; `pty.created/updated/exited` (`Pty{command, cwd, exitCode?, status}`) | Contract-audited |
| File edit | `file.edited { file }` | Contract-audited |
| Verification | **none** in the 1.18.27 contract | Unavailable — no test-run/verdict events exist |
| Artifacts | `tool.state.outputPaths?`, `ToolFileContent{uri}` | Contract-audited |

## 2. Contract schema (`assistant.execution.v1`)

Implemented in `packages/shared/src/assistant-execution.ts`.

```ts
interface AssistantExecutionBase {
  contract: 'assistant.execution.v1';   // §12 versioning
  version: 1;
  operationId: string;                  // stable identity (OpenCode callID preserved)
  state: 'running' | 'completed' | 'failed';  // §4 explicit lifecycle
  tool?: string;
  source: 'opencode' | 'vestara-workflow';    // §6 provenance
  timestamp: number;                    // authoritative epoch ms
  assistantMessageId?: string;          // authoritative only
  sessionId?: string;                   // authoritative only
  parentOperationId?: string;
  sequence?: number;
}

type AssistantExecutionDetail =
  | ToolExecutionDetail      { kind: 'tool', tool, title?, preview?, error?, durationMs? }
  | EditExecutionDetail      { kind: 'edit', file, operation?, additions?, deletions?,
                               diffProvenance, beforeAfterProvenance }
  | TerminalExecutionDetail  { kind: 'terminal', command?, cwd?, exitCode?, durationMs?,
                               outputPreview?, cwdProvenance, exitCodeProvenance }
  | TaskSnapshotDetail       { kind: 'task-snapshot', source: 'opencode', todos[] }
  | PermissionExecutionDetail{ kind: 'permission', permissionRequestId, action,
                               resources[], permissionState: 'requested'|'resolved', reply? }
  | VerificationExecutionDetail { kind: 'verification', verdict?, evidence: 'unavailable' }
  | ArtifactExecutionDetail  { kind: 'artifact', file }
  | GenericToolExecutionDetail { kind: 'generic', preview? };   // safe degradation
```

Correlation fields (`assistantMessageId`, `sessionId`, `timestamp`) are included only when the runtime supplied them — never manufactured (§2). `operationId` is the OpenCode `callID` verbatim for tool operations; namespaced projection identities (`edit:<session>:<path>`, `todo:<session>`) are used only where the runtime exposes no per-operation id, with provenance documented.

## 3. Authority / provenance matrix

| Projection | Runtime-provided | Vestara-derived | Unavailable | Never |
|---|---|---|---|---|
| Tool lifecycle | identity, tool, state, title, time | durationMs (start−end) | — | text-derived lifecycle |
| Edit | `file.edited.file`, session diff (path, operation, additions, deletions, hunks) | — | before/after full content | diff parsed from prose / post-hoc file reads |
| Terminal | command (`shell.started`), cwd/exitCode (`Pty`) | durationMs (timestamps) | cwd/exitCode when absent | cwd inferred from browser state |
| Task | OpenCode todos (`todo.updated`, `/todo`) | — | Vestara Workflow Task (absent from assistant path) | merging opencode vs vestara-workflow authority |
| Permission | request id, action, resources, reply | — | policy metadata (excluded) | UI authority mutation |
| Verification | — | — | **everything** (no source events) | `✓ Verified` from exit code |
| Artifact | `outputPaths`, file evidence | — | unrestricted absolute external paths | raw absolute paths without policy |

## 4. Sanitization policy (§11)

**Construct safe projections — never clone-and-delete.** The normalizer builds a new object from an explicit allowlist; unknown payload fields (system prompts, hidden reasoning, credentials, environment secrets, authorization headers, raw tool arguments, unrestricted terminal output, OpenCode internal state) are structurally impossible to leak.

| Field | Allowlist rule |
|---|---|
| `preview` / `error` / `outputPreview` / `command` / `file` / `cwd` | bounded strings (see §5), `trim()` |
| `operationId` / ids | ≤ 200 chars |
| `resources` | ≤ 20 entries × ≤ 500 chars |
| `todos` | ≤ 20 entries × title ≤ 200 / status ≤ 50 |
| unknown keys | **dropped** (tested: poisoned payloads with `credentials`, `hiddenReasoning`, `authorizationHeaders`, `rawToolArguments` produce output containing none) |
| permission `metadata` / `save` | **never projected** (tested) |
| reasoning / step-finish parts | **never projected** (`step-start`/`step-finish`/`reasoning` parts are ignored) |

## 5. Field bounds (§7, §11)

`ASSISTANT_EXECUTION_BOUNDS`: preview 200, error 500, terminal output preview 2000, command 500, path 500, identity 200, permission resources 20, todo items 20. All enforced by the normalizer after the adapter's extraction.

## 6. Lifecycle rules (§3, §4)

- `tool.started` (part `pending`/`running` or `tool.called`) → `state: 'running'`, same `operationId`
- `tool.completed` (part `completed` or `tool.success`) → `state: 'completed'`, same `operationId`
- `tool.failed` (part `error` or `tool.failed`) → `state: 'failed'`, same `operationId`
- **`output === "failed"` is never lifecycle authority** — a successful tool returning exactly `failed` stays `completed` (regression-tested at normalizer, projection, adapter, and browser-hook layers)
- M2's same-name dedup is now unnecessary for identity-bearing events; it remains only as the legacy fallback for detail-less servers
- Permission lifecycle: `permissionState: 'requested' → 'resolved'` (envelope `state` stays `running → completed` so the common contract holds)

## 7. Compatibility strategy (§13)

Additive only. Existing browser contract (`delta`, `status`, `tool`, `tool_result`, `done`, `error`) is preserved — the route now additionally emits `tool` and `status` (which M2's hook already handled) and attaches the optional `execution` field. Legacy clients ignore `execution`. Direct-provider executor path is unchanged (no `execution` detail). Unknown contract/version payloads degrade to `undefined` → legacy M2 behavior (fail-closed, no crash).

## 8. Unsupported fields

- **Verification**: explicitly `{ kind: 'verification', evidence: 'unavailable' }` — no authoritative source exists in 1.18.27.
- **Permission in this environment**: not observed live (auto-approve) — the contract and adapter support it; evidence records explicit absence.
- **Vestara Workflow Task**: not present in the assistant execution path; `task-snapshot.source` is pinned `opencode`.
- **Terminal cwd/exitCode**: projected only when `Pty` provides them (`cwdProvenance`/`exitCodeProvenance` otherwise `unavailable`).

## 9. Browser consumption (§14)

`apps/workspace/src/hooks/useAssistantConversation.ts` consumes `operationId` + explicit state to improve lifecycle/dedup — **no rich detail rendered** (M2 UI unchanged: `toolOperations` keeps `{id, name, state, preview}`). The hook imports the contract **type-only**; a cheap inline guard (`parseExecutionDetail`) validates `contract`/`version`/`operationId`/`state` on the already-server-normalized payload. This sidesteps the Vite `/@fs` raw-CJS interop constraint for linked workspace packages (the browser never imports a runtime normalizer from a CJS package).

## 10. Server wiring

- `apps/api/src/assistant-execution-projection.ts` — pure OpenCode event → detail mapping (allowlisted extraction).
- `apps/api/src/assistant-opencode-adapter.ts` — `runAssistantOpenCodeTurn` async-generator: creates a session, consumes the `/event` stream (session-scoped FIFO), projects events, enriches at turn end with session diff + todos, yields `StreamChunk`s with `detail`.
- `apps/api/src/workspace-context.ts` — optional executor selection behind `VESTARA_ASSISTANT_OPENCODE=1` with graceful fallback to the direct provider (**AR-009 paused**: never mandatory, never fail-hard).
- `apps/api/src/routes/conversations.ts` — SSE emission of `tool`/`status`/`tool_result` with the additive `execution` field.
- Provider provenance: real upstream provider resolution per turn via `resolveProviderModel` (never a hardcoded provider label).

## 11. Tests (§15)

Deterministic suites (all green):

| Suite | Coverage |
|---|---|
| `packages/shared/__tests__/assistant-execution.test.ts` | identity, started→completed/failed correlation, `failed`-output regression, unknown kind/tool/version degradation, bounds, sanitization allowlist, reasoning exclusion, permission safe-fields/no-authority-mutation, edit provenance, task provenance, terminal bounds, verification unavailable, fail-closed validation |
| `apps/api/__tests__/assistant-execution-projection.test.ts` | each OpenCode event → detail mapping; no leak of `result`/`structured`/`metadata`; explicit absence for malformed events |
| `apps/api/__tests__/assistant-opencode-adapter.test.ts` | full turn projection: lifecycle correlation, `failed` regression, distinct same-tool ops, permission status details, part-based live path, junk-payload sanitization, text passthrough, turn-end diff/todo enrichment, terminal bounds |
| `apps/workspace/__tests__/ga-ux-premium-m3-hook-detail.test.tsx` | browser hook: operationId correlation, started→completed/failed, distinct same-name ops, `failed`-output regression, unknown version ignored, permission no-card, delta streaming unchanged, M2 API shape unchanged |

M1/M2 regression: `ga-ux-premium-m1-foundation` (pass), `ga-ux-premium-m2-tool-surface` (14/14 pass) — **existing M2 UI unchanged**.

## 12. Live evidence (§16)

Captured against the live OpenCode 1.18.27 server (redacted — no secrets, no private reasoning, no raw tool arguments). Full machine-readable evidence: `docs/blueprint/GA-UX-PREMIUM-M3-live-evidence.json`.

| Scenario | Prompt | Event types observed | Tool projection |
|---|---|---|---|
| read | "Read package.json and tell me the package name." | `session.updated`, `message.updated`, `message.part.updated`, `session.status`, `session.diff`, `message.part.delta` | `read` pending→running→completed, `operationId=call_…`, `title=package.json`, `durationMs≈28` |
| search | "Search … for normalizeAssistantExecutionDetail" | same | `grep` → completed, `title=normalizeAssistantExecutionDetail`, `durationMs≈55` |
| edit (disposable) | "Create … m3-live-evidence.txt …" | same | `write` → completed, `title=m3-live-evidence.txt`, `durationMs≈87` |
| bash (harmless) | "echo m3-live-evidence" | same | `bash` running parts observed (no completed part before idle in this run) |
| task/todo | "Create a todo list with exactly two steps …" | same + **`todo.updated`** | `todowrite` → completed (`title=2 todos`) + 4 `task-snapshot` projections |
| governed ask | "List the files in /etc …" | same | `read` → completed (`title=../../../../../etc`, bounded) |

Interpretation chain captured per scenario: **OpenCode event → adapter projection → `assistant.execution.v1` detail → browser SSE frame shape (`event.execution`) → M2 projection (hook `toolOperations`)**. Permission events were **not** emitted by this server configuration (auto-approve) — recorded as explicit absence; verification events do not exist in the contract (unavailable).

## 13. M4–M7 readiness

- **M4 (edit/diff rendering):** `EditExecutionDetail` carries `file`, `operation`, `additions`, `deletions`, `diffProvenance: 'runtime-provided'` (session `/diff`) — ready for bounded diff presentation.
- **M5 (task UI):** `TaskSnapshotDetail` carries bounded OpenCode todos with `source: 'opencode'` provenance — presentation-ready; Vestara Workflow Task authority intentionally separate.
- **M6 (terminal):** `TerminalExecutionDetail` carries `command`, `cwd` (when proven), `exitCode` (when proven), `durationMs`, bounded `outputPreview` — ready.
- **M7 (verification):** **NOT ready** — the contract exposes `verification` only as `evidence: 'unavailable'`. A verification source (VCTRL/test-run events or a Vestara verification bridge) must be added before M7 can present any verdict.
- **GA-CAP-002 (permission UI):** contract-ready — `PermissionExecutionDetail` projects request id, action, bounded resources, and state without any authority mutation; UI and backend response flow remain future work.

## 14. Deliverable checklist

- [x] Source-event audit (generated contract + live capture; no guessed names)
- [x] Contract schema (`assistant.execution.v1`, discriminated union)
- [x] Authority/provenance matrix
- [x] Sanitization policy (construct, never clone-delete)
- [x] Field bounds
- [x] Lifecycle rules (explicit state; `failed`-output regression)
- [x] Compatibility strategy (additive; legacy contract preserved)
- [x] Unsupported fields (verification unavailable; permission absence recorded)
- [x] Live evidence matrix (redacted)
- [x] M4–M7 readiness (M7 gated on a verification source)
- [x] Combined Assistant tests: 50 M3 + 108 M1/M2/GA-UI regression (all passing)
## 15. M3.1 erratum — edit hunk projection contract repair

> **Erratum (GA-UX-PREMIUM M3.1, commit boundary: `fix(assistant): project bounded runtime diff hunks`).**
>
> M3 documentation stated runtime hunks were projected, but `EditExecutionDetail`
> omitted them. The M3 adapter's turn-end enrichment read
> `diffFile.path/operation/additions/deletions` and **discarded `diffFile.hunks`**,
> so no hunk evidence ever reached the browser. M3.1 repairs that omission
> additively. This erratum preserves the defect and the repair as evidence —
> history is not rewritten to make M3 appear originally correct.

### 15.1 Additive contract extension (M3.1)

```ts
interface AssistantEditHunk {
  readonly oldStart?: number;   // preserved when the runtime supplies it
  readonly oldLines?: number;   // preserved when the runtime supplies it
  readonly newStart?: number;   // preserved when the runtime supplies it
  readonly newLines?: number;   // preserved when the runtime supplies it
  readonly content: string;     // unified-diff hunk text (bounded)
}

interface EditExecutionDetail {
  // existing M3 fields remain unchanged
  readonly hunks?: readonly AssistantEditHunk[];
  readonly hunksTruncated?: boolean;  // true whenever any bound caused loss
}
```

- Bounds centralized in `ASSISTANT_EXECUTION_BOUNDS`: `hunkCount: 50`, `hunkContent: 1000`, `hunkContentTotal: 8000`.
- Deterministic truncation: hunk count, per-hunk content, aggregate content; `hunksTruncated` is set on any loss. Absent `hunks` input stays absent (legacy M3 payloads remain valid).
- Line metadata: preserved when a non-negative integer; invalid/absent → `undefined` — never manufactured (no 0, no previous+1, no array index).
- Sanitization: construct-never-clone; arbitrary upstream hunk/runtime fields are excluded (tested).
- SSE propagation proven end-to-end: `OpenCode → adapter → StreamChunk.detail → ConversationChunk.event.execution → browser hook` (route-level test).

### 15.2 Live finding — the 1.18.27 runtime provides no structured hunks in this environment

The M3 audit documented `OpenCodeDiffFile.hunks` (structured line metadata) as the
runtime evidence without a populated live capture. M3.1's live proof attempted a
disposable repository edit through the governed assistant and found:

- `GET /session/:id/diff` returns `[]` (empty) for untracked, git-staged, and tracked-file edits — polled 60s after idle.
- `session.diff` events fire with `diff: Array(0)`.
- The OpenAPI contract for 1.18.27 defines diff payloads as `SnapshotFileDiff { additions, deletions, file?, patch?: string, status? }` and `VcsFileDiff { …, patch?: string, … }` — **patch is a string; there are no structured hunk fields** (`oldStart`/`oldLines`/`newStart`/`newLines`/`content`).
- The client's `normalizeDiff` expects `hunks[]`, which the server schema never sends — a shape mismatch that would yield `hunks: []` even for a populated response.
- The `edit` tool part reports `"Edit applied successfully."` — no diff in the tool output.

**Consequence:** M3.1's contract extension and adapter repair are correct and
test-proven (including SSE propagation with synthetic hunks), but an honest live
proof of upstream structured hunks is **impossible against this server** — nothing
was fabricated, derived, or reconstructed. Redacted evidence:
`docs/blueprint/GA-UX-PREMIUM-M3.1-live-evidence.json`.

**Decision needed (stopped per authorization):** the runtime's actual diff evidence
is a `patch: string` (when the endpoint populates at all). Options for the user:

1. **Hold M4's diff requirement on a runtime that emits structured hunks** (or fix/configure the OpenCode snapshot mechanism so `/session/:id/diff` populates).
2. **Authorize a second additive contract form** for `patch: string` evidence (e.g. `EditExecutionDetail.patch?: string`, bounded), preserving `hunks` for runtimes that supply structured line metadata.
3. **Authorize mechanical parsing** of a runtime-provided patch string into `AssistantEditHunk` entries (line metadata taken from the patch's `@@` headers — parsed, not invented), with `hunksTruncated` applied to the parsed form.

M4 remains stopped. No UI code was added during M3.1.
