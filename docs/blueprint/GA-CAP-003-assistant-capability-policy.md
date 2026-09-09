---
title: GA-CAP-003 — Assistant Capability Policy (Contract Reconstruction)
version: 1.0.0
status: implemented
owner: vestara
last-reviewed: 2026-09-07
next-review: 2026-10-07
implementation-repository: vestara-ai-core
implementation-commit: cd9e33a
---

# GA-CAP-003 — Assistant Capability Policy (Contract Reconstruction)

**Date**: 2026-09-07
**Status**: RECONSTRUCTED — contract rebuilt from accepted repository evidence (code + tests); supersedes the permission profile sections of GA-CAP-001
**Prerequisite**: GA-CAP-001 (historical inventory), GA-RUNTIME-001 (accepted: binding, sessions, interaction broker), GA-SSE-002 (accepted: continuous streaming)

---

## 1. Purpose

GA-CAP-003 is the Vestara-owned capability boundary for the Global Assistant. It intercepts OpenCode
permission requests and enforces an explicit tool-level policy BEFORE execution reaches the OpenCode
server. It is the single source of truth for what the Global Assistant is authorized to do.

This document is a **reconstruction**, not an architecture design: every statement below is grounded in
the current accepted implementation and its deterministic tests (§13, §14), including the authorized
changes made after the original implementation (most notably the GA-RUNTIME-001 Addendum B tightening of
`edit` and `bash` from automatic to interactive ASK). Where older documentation disagrees with the
current accepted state, this document describes the current state and records the discrepancy (§16).

## 2. Governing Invariants

Preserved verbatim from the implementation header (`apps/api/src/assistant-capability-policy.ts:8-21`)
and reinforced across the codebase:

```
capability exists            ≠ capability authorized            ≠ capability executed
runtime capability           ≠ Vestara authority
skill availability           ≠ permission escalation
provider/model selection     ≠ capability authority
OpenCode runtime agent capability ≠ Vestara authorization
successful tool execution    ≠ verification verdict
```

Composition rule:

```
Assistant authority =
    AssistantCapabilityPolicy
  ∩ OpenCodeRuntimeCapability
  ∩ RepositoryBinding
```

Granting a capability in an agent definition (or possessing it in the runtime) does NOT bypass Vestara's
permission authority. Every permission request is evaluated by the Vestara policy before execution.

## 3. Authority Boundary & Ownership

| Concern | Owner |
|---|---|
| Capability classification and decisions | `apps/api/src/assistant-capability-policy.ts` (Vestara API) |
| Permission request interception and decision execution | `apps/api/src/assistant-opencode-adapter.ts` |
| Interactive ASK decisions (browser round-trip) | `apps/api/src/assistant-interaction-broker.ts` + UI |
| Conversation → runtime session mapping (repository binding) | `apps/api/src/assistant-conversation-sessions.ts` |
| Agent definition permissions (runtime-side gate) | `packages/workspace/src/agents.registry.ts` → generated `.opencode/agents/*.md` |
| Policy wiring | `apps/api/src/workspace-context.ts` (constructed once per boot with the canonical repository root) |

The policy is intentionally constructed with exactly one input: the canonical repository directory
(`createDefaultAssistantPolicy(abs)` at `apps/api/src/workspace-context.ts:807-821`, where `abs` derives
from the canonical workspace resolver — never the UI, never cwd, never runtime state). There is no
provider, model, session, or conversation parameter on the policy interface
(`AssistantCapabilityPolicy`, `assistant-capability-policy.ts:46-53`). When the policy is absent, the
adapter degrades to surfacing all permissions (pre-GA-CAP-003 behavior) — the policy is wired for the
Global Assistant only; other agents are unaffected (`assistant-opencode-adapter.ts:88-95`, test
`apps/api/__tests__/assistant-capability-policy.test.ts:157-165`).

## 4. Capability Classification

Canonical classification (`createDefaultAssistantPolicy`, `assistant-capability-policy.ts:76-119`).
First matching rule wins; unmatched actions fall to `defaultDecision: 'deny'` (line 79).

| Tool / action | OpenCode permission key | Agent grant (vestara-assistant) | Policy action-class | Policy decision | Basis |
|---|---|---|---|---|---|
| `read` | yes | `allow` | `read` | **ALLOW** | safe read-only access |
| `glob` | yes | `allow` | `glob` | **ALLOW** | safe file discovery |
| `grep` | yes | `allow` | `grep` | **ALLOW** | safe content search |
| `list` | yes | `allow` | `list` | **ALLOW** | safe directory listing |
| `edit` | yes | `ask` | `edit` | **ASK** | mutation requires user approval |
| `write` | no key (writes gated by `edit`) | — | `write` | **ASK** | mutation requires user approval |
| `bash` / shell | yes | `ask` | `bash` | **ASK** | shell execution requires user approval |
| `task` (todo/task delegation) | yes | `allow` | `other` matched by `/^(skill\|todowrite\|task\|lsp)/i` | **ALLOW** | assistant support tools |
| `todowrite` | yes | `allow` | `other` (same rule) | **ALLOW** | assistant support tools |
| `lsp` | yes | `allow` | `other` (same rule) | **ALLOW** | assistant support tools |
| `skill` | yes | `allow` | `other` (same rule) | **ALLOW** | instructional/orchestration capability (§8) |
| `question` | yes | `ask` | — (not a permission; interactive question flow, §11) | n/a | agent-level `ask` gate; question events ride the interaction broker |
| `doom_loop` | yes | `ask` | — (agent-level gate; never a Vestara policy rule) | n/a | OpenCode loop-guard, agent-level `ask` (`agents.registry.ts:69`) |
| `webfetch` | yes | `ask` | `webfetch` | **ASK** | network access requires user approval |
| `websearch` | yes | `ask` | `other` matched by `/^websearch/i` | **ASK** | network access requires user approval |
| `external_directory` | yes | `ask` | `other` matched by `/external/i` | **ASK** | external scope requires user approval |
| anything unknown | — | — | `other` (normalized) | **DENY** | fail-safe default (§6) |

This table is the **currently intended applicable surface** — it is explicitly NOT the permanent
universe of OpenCode capabilities. New or renamed OpenCode tools must remain fail-safe (DENY) until
they are explicitly classified here and in code.

## 5. ASK / ALLOW / DENY Semantics

Decisions are applied in the adapter (`assistant-opencode-adapter.ts:353-484`, case
`permission.v2.asked` / legacy `permission.asked`):

- **ALLOW — auto-approve.** The adapter answers OpenCode immediately with an approve scoped to the
  session (`respondToPermission(..., { decision: 'approve', scope: 'session', reason })`, adapter
  lines 369-388) and projects a status chunk ("Auto-approved: `<action>`"). No user interaction.
- **ASK — interactive user decision.** The adapter registers a pending decision with the interaction
  broker (`broker.awaitPermission(conversationId, permissionId)`, adapter lines 408-418) and projects
  the request to the Floating Assistant. The user decides (Allow once / Allow for session / Deny);
  the decision is forwarded to OpenCode with its native response vocabulary (`once` / `always` /
  `reject` — `packages/opencode-runtime/src/client/opencode-http-client.ts:367-387`).
- **DENY — auto-reject.** The adapter answers OpenCode with an explicit reject and the policy reason
  (adapter lines 389-407), projecting "Denied: `<action>` — `<reason>`". No user interaction.

Fail-safe (ASK, no timely decision): if no user decision arrives within the broker wait window
(`PERMISSION_TIMEOUT_MS`, 10 minutes, `assistant-interaction-broker.ts:37`), the adapter rejects
fail-safe with reason "Vestara permission request timed out" (adapter lines 453-468). Degradation: if
no policy or no broker is present, the request is surfaced status-only ("Permission needed:
`<action>`") with no decision authority (adapter lines 470-481).

ASK is not a failure: it is the designed interactive path for mutation, shell, network, and external
scope.

## 6. Unknown-Tool Fail-Safe

Unknown actions normalize to `'other'`
(`packages/opencode-runtime/src/permissions/permission-types.ts:53-68`) and then match no explicit rule
and none of the `other` resource patterns — so they fall through to `defaultDecision: 'deny'` with
reason `default: no policy rule matched action '<action>'` (`assistant-capability-policy.ts:159-167`).

Consequence: a newly appearing OpenCode tool cannot automatically acquire mutation authority. It is
denied until it is explicitly classified (§4) and, if it should be interactive, granted in the agent
definition and documented. Proven deterministically:
`apps/api/__tests__/assistant-capability-policy.test.ts:185-189` ("denies unknown actions by default").

## 7. RepositoryBinding Constraint

Three enforcement layers; all three are active:

1. **Policy confinement** — `checkRepositoryConfinement(repositoryDir, resourcePath)`
   (`assistant-capability-policy.ts:178-196`): a resource must equal or be under the repository root;
   otherwise "resource is outside repository — external scope". Tests reject sibling directories and
   dotfiles outside the repository (`assistant-capability-policy.test.ts:117-136`).
2. **Session-mapping immutability** — the conversation→session registry refuses to rebind a
   conversation to a different repository directory
   (`apps/api/src/assistant-conversation-sessions.ts:103-114`: "Repository directory is immutable for
   the mapping — refusing to rebind"). The stored `repositoryDir` is canonical and never UI-supplied
   (same file, lines 39-41).
3. **Boot wiring** — the policy is created with the canonical repository root resolved by the workspace
   resolver (`apps/api/src/workspace-context.ts:807-821`), which walks up for the workspace marker and
   honors the repo-root env override; unresolved authority fails closed. The parallel formal resolver
   (`packages/workspace/src/repository-binding.ts:18-24`) states the same rule: process cwd is never
   silently authoritative.

## 8. Skill Authority Invariant

- **Skill availability = instructional/orchestration capability.** Discovering or loading a skill makes
  its instructions available to the model; it grants nothing else.
- **Skill availability ≠ permission escalation.** A skill that instructs the model to use `bash`,
  `edit`, `webfetch`, or any other governed capability remains fully subject to that capability's
  effective policy. A skill must never transform DENY → ALLOW or ASK → ALLOW
  (`assistant-capability-policy.ts:20-21`).
- Action-level rules take precedence over resource names: even a skill whose name contains "bash" or
  "edit" stays classified by its action (test:
  `assistant-capability-policy.test.ts:97-114` — "skill usage does not upgrade ask authority to
  allow"; "skill resource pattern does not match mutation actions").
- The `skill` tool itself (invoking/loading a skill) is classified ALLOW via the support-tools rule
  (§4); that authorizes reading instructions, nothing more.
- Agent-definition grant for `skill: 'allow'` (vestara-assistant) permits the runtime tool call; it
  does not bypass the policy for any tool the skill goes on to use.

## 9. Provider/Model Independence

- The policy interface has no provider/model parameter (§3); the policy is constructed once at boot
  with only the repository root.
- Provider/model is **Execution Binding**: it rides the turn (`prompt_async` body
  `model: { providerId, modelId }` — `assistant-opencode-adapter.ts:238-243`) after deterministic
  pre-stream validation (`apps/api/src/routes/conversations.ts:209-217` resolves and validates the
  requested binding against live provider discovery; invalid requests fail with a deterministic 400
  before any SSE starts).
- Deterministic proof that decisions are independent of model/provider:
  `assistant-capability-policy.test.ts:167-182` ("policy decisions are independent of model/provider")
  and the UI-side wiring proof in `apps/workspace/__tests__/ga-ui-008.test.ts:318-331`.
- Conversation continuity is likewise provider-independent: the session registry maps
  conversationId → runtimeSessionId and "provider/model never key the mapping"
  (`assistant-conversation-sessions.ts:4-6`).

## 10. SSE Permission Interaction (canonical path)

Canonical identifiers: the permission request id is the OpenCode request id exposed as `payload.id`
(projected as `permissionRequestId`; adapter comments at `assistant-opencode-adapter.ts:360-363`).
The historical `callID` identifies **tool** executions (`operationId` for tools; shell start/end
pairing) — it is NOT the permission identifier. The reply projection uses `requestID`
(`apps/api/src/assistant-execution-projection.ts:232-246`).

Intended interactive path (all steps implemented):

```
OpenCode runtime
      ↓  (event: permission.v2.asked — payload.id, action, resources; legacy permission.asked accepted)
Assistant adapter (apps/api/src/assistant-opencode-adapter.ts:353-484; session-scoped filtering)
      ↓  evaluatePermission(policy, action, resources)  — ALLOW/DENY resolved here
      ↓  ASK: broker.awaitPermission(conversationId, permission.id)  — assistant-interaction-broker.ts
      ↓  status chunk, execution.kind = "permission", permissionState = "requested"
Vestara conversation SSE stream (apps/api/src/routes/conversations.ts:201-291)
      ↓
Floating Assistant (useAssistantConversation.ts:603-632 → ConversationPanel permission card;
                    Allow once / Allow for session / Deny)
      ↓  user decision
Decision endpoint: | POST | /api/conversations/:conversationId/permissions/:permissionId |
                   body { decision: "allow-once" | "allow-session" | "deny" }
                   (apps/api/src/routes/conversations.ts:97-121; matched early by design)
      ↓  broker.decidePermission(...) resolves the waiting adapter
respondToPermission(sessionId, permission.id, { decision, scope }) — OpenCode native vocabulary
      ↓  (approve + scope session → "always"; approve otherwise → "once"; deny → "reject")
OpenCode continues the turn
      ↓
session settles (status idle) → assistant continuation completes
```

Note on decision vocabularies: the UI/API layer uses `allow-once | allow-session | deny`
(`useAssistantConversation.ts:183-187`); OpenCode's wire vocabulary is `once | always | reject`; the
Vestara policy layer uses `allow | ask | deny`. The mapping lives in the OpenCode HTTP client
(`opencode-http-client.ts:367-387`). These are three layers of the same decision, not three authorities.

A second, distinct permission surface exists for the Console (OCV-006 event bridge + in-memory registry
in `apps/api/src/routes/opencode.ts:479-541`), with its own approve/reject vocabulary and audit trail.
It is separate from the assistant broker; do not conflate them (recorded also in §16).

## 11. Question Interaction Path

OpenCode questions follow the same correlation discipline:

```
OpenCode (question.v2.asked — payload.id, questions[])
      ↓ projection (assistant-execution-projection.ts:249-261 → questionRequestId)
status chunk → interaction broker (awaitQuestion)
      ↓ SSE
Floating Assistant question card (ConversationPanel.tsx:391-430)
      ↓ user answer
Answer endpoint: | POST | /api/conversations/:id/questions/:requestId | body { answers: string[][] }
      ↓ broker.decideQuestion → replyToQuestion / rejectQuestion (opencode-http-client.ts:632-658)
OpenCode continues generation
```

Fail-safe: no timely answer → reject. Proven in `apps/api/__tests__/ga-runtime-001.test.ts:570-593`.

## 12. Runtime Agent Definition Interaction

The runtime-side gate is the generated agent definition: the canonical registry
(`packages/workspace/src/agents.registry.ts`, `ASSISTANT_GRANT` lines 50-70) renders to
`.opencode/agents/vestara-assistant.md` via `scripts/agents-sync.mjs` (and the API sync route,
`apps/api/src/routes/agents.ts:367-403`). The assistant grant is `edit: ask`, `bash: ask`,
`question: ask`, `doom_loop: ask`, `webfetch: ask`, `websearch: ask`, `external_directory: ask`,
with read/glob/grep/list/task/todowrite/lsp/skill allowed. Effective capability remains the
intersection (§2): the agent grant can only narrow what reaches the Vestara policy, never widen it.

The agent definition is loaded by the OpenCode server from the session `directory` (the canonical
repository root); the assistant turn always executes as runtime agent `vestara-assistant`
(`workspace-context.ts:811`; adapter line 239).

## 13. Implementation Files

| File | Role |
|---|---|
| `apps/api/src/assistant-capability-policy.ts` | Policy rules, evaluation, confinement (single source of truth) |
| `apps/api/src/assistant-opencode-adapter.ts` | Permission interception, decision execution, fail-safe |
| `apps/api/src/assistant-interaction-broker.ts` | ASK decision round-trip (permissions + questions) |
| `api/src/assistant-execution-projection.ts` | Event → execution detail projection (identifiers) |
| `api/src/assistant-conversation-sessions.ts` | Conversation ↔ session mapping + repository immutability |
| `api/src/routes/conversations.ts` | Stream route, decision endpoints, pre-stream binding validation |
| `api/src/workspace-context.ts` | Policy/broker/executor wiring at boot |
| `packages/opencode-runtime/src/client/opencode-http-client.ts` | Upstream respond/reply/abort calls |
| `packages/opencode-runtime/src/permissions/permission-types.ts` | Action normalization + risk classes |
| `packages/workspace/src/agents.registry.ts` | Canonical agent + permission grants (runtime gate) |
| `scripts/agents-sync.mjs` | Registry → `.opencode/agents/*.md` rendering |
| `apps/workspace/src/hooks/useAssistantConversation.ts` | UI-side permission/question state + decisions |
| `apps/workspace/src/components/assistant/ConversationPanel.tsx` | Permission/question cards (presentation only) |
| `packages/shared/src/assistant-execution.ts` | Shared execution-detail normalizer (bounded) |

## 14. Deterministic Evidence

| Invariant | Test |
|---|---|
| Unknown actions denied by default | `apps/api/__tests__/assistant-capability-policy.test.ts:185-189` |
| Skill cannot upgrade ASK → ALLOW; skill-named resources stay action-classified | same file, lines 97-114 |
| Repository confinement rejects external paths | same file, lines 117-136 |
| Policy independent of model/provider | same file, lines 167-182 |
| Policy absent → legacy behavior, other agents unaffected | same file, lines 157-165 |
| Interactive allow/deny + timeout fail-safe (permissions and questions) | `apps/api/__tests__/ga-runtime-001.test.ts` (permission/question broker sections) |
| Production wiring + model/provider independence at UI layer | `apps/workspace/__tests__/ga-ui-008.test.ts:275` ("GA-CAP-003 production wiring"), `:318-331` |
| Permission identity is `payload.id` / `permissionRequestId` (not callID) | `apps/api/src/assistant-execution-projection.ts:210-246`; `packages/opencode-runtime/src/permissions/permission-types.ts:85-102` |

## 15. Known Runtime-Definition Caching Limitation

There is no hot reload of runtime agent definitions. Three documented caching points:

1. **OpenCode server holds definitions at startup.** The server reads `.opencode/agents/*.md` from the
   session directory at startup; no runtime reload/refresh call exists anywhere in the repository.
   After any registry change (or `pnpm agents:sync`), a server restart is required for the change to be
   visible end-to-end. This is why capability-boundary changes are verified through a restart cycle
   (GA-RUNTIME-002 acceptance).
2. **Per-turn model binding, vestigial boot fallback.** GA-SSE-001 documented (and fixed) a boot-time
   agent-config cache; the model is now resolved per turn (`resolveProviderModel`,
   `workspace-context.ts:814-815`). The vestigial boot-time read remains only as the fallback binding
   (`workspace-context.ts:790-797`).
3. **Process-lifetime latches in the API.** The OpenCode config latch caches resolution failure for the
   process lifetime (`apps/api/src/opencode-runtime-service.ts:38-54`), and the console permission/
   session registries are in-memory (`apps/api/src/routes/opencode.ts:34-57`). Additionally, the
   agent store never silently re-seeds a populated catalog (`packages/workspace/src/agent-storage.ts:54-61`),
   so a mutated stored agent row can diverge from the canonical registry until explicit re-sync.

Consequence: capability-authority changes are only guaranteed effective after agents sync **and** an
OpenCode runtime restart; runtime introspection (not file equality) is the acceptance proof
(GA-RUNTIME-002).

## 16. Recorded Discrepancies (documentation vs implementation — not silently repaired)

1. **GA-CAP-001's permission profile is superseded but unamended.** GA-CAP-001 §2/§6 records
   `edit`/`bash` as repository-automatic and shows a generated definition with `edit: allow`,
   `bash: allow`. The accepted current state (this document, the registry, and the generated
   `vestara-assistant.md`) is `edit: ask`, `bash: ask` (GA-RUNTIME-001 Addendum B). GA-CAP-001 carries
   no superseded-by marker.
2. **GA-CAP-001 claims a credential rule that the assistant policy does not implement.** GA-CAP-001
   §6 states a server-side rule makes `.env` reads ASK. No such pattern exists in
   `assistant-capability-policy.ts` (patterns are only the support-tools, websearch, and external
   matchers). Legacy agent definitions outside the canonical `.opencode/agents/` directory carry
   env-file deny patterns; the canonical assistant surface has none.
3. **GA-CAP-001 §7/§8 describe the pre-broker interaction model.** They record permissions surfaced as
   status-only with no decision round-trip. The accepted current state is the full interactive path
   (§10/§11) via the interaction broker.
4. **Two live permission surfaces with different vocabularies.** The assistant broker (§10) and the
   console/OCV-006 surface (`apps/api/src/routes/opencode.ts:479-541`) coexist. No single prior
   document reconciles them; this document records the distinction.
5. **Frontmatter conventions are mixed inside the blueprint directory.** GA-* execution documents
   (including this one) follow the sibling no-frontmatter header convention; VESTARA-INTELLIGENCE-*
   governance documents carry governed frontmatter. Non-strict validation tolerates this as warnings;
   strict governance would fail on the GA-* set.

## 17. Non-Universality Statement

The capability table in §4 is a bounded, evidence-based description of the **currently intended
applicable Assistant surface**. It is not a claim about the complete OpenCode capability universe.
OpenCode may expose tools beyond this table at any time; until a new tool is classified here and in
`assistant-capability-policy.ts`, the fail-safe default (DENY) applies to it (§6).

---

## Acceptance Boundary

This document describes the accepted contract as reconstructed. Live proof that the declared contract,
the generated agent definition, and the observed runtime enforcement agree is owned by GA-RUNTIME-002.
