# ACTOR-IDENTITY-003B — Assistant Intelligence Identity Context Audit

Status: audit complete; no production implementation performed.

## A. Executive finding

ACTOR-IDENTITY-003A correctly carries the canonical `ExecutionActor` through
the provider-neutral request boundary. The actor is not lost from runtime
metadata. It is intentionally omitted when model-facing input is serialized.

The first model-visible omission is at the runtime/provider input construction
boundary:

- OpenCode's Global Assistant adapter builds the optional model-visible
  `system` block from `surfaceContext` and submits only the user text, agent,
  model, system block, and tools (`apps/api/src/assistant-opencode-adapter.ts`,
  `buildSurfaceSystem()` and `runAssistantOpenCodeTurn()`, lines 467-486 and
  606-714).
- The Codex adapter reduces the request to the last user message and calls
  `thread.runStreamed(prompt)` (`apps/api/src/assistant-codex-adapter.ts`,
  `runCodexTurn()`, lines 207-239).
- The generic OpenCode provider renders only `CompletionRequest.messages` or
  serializes those messages into the upstream wire body
  (`packages/providers/opencode/src/runtime-provider.ts`, lines 452-460;
  `packages/providers/opencode/src/index.ts`, lines 203-211 and 450-467).

Vestara currently has no governed, canonical human-readable identity
attribute for a `HumanPrincipal`. `HumanPrincipal` contains only `id`,
`status`, `createdAt`, and `updatedAt`; its presentation type is explicitly
non-authoritative and caller-supplied (`packages/workspace/src/human-principal.ts`,
lines 47-86). Therefore the correct result is not to expose the Telegram
display name or invent a prompt sentence. A small prerequisite is required:
define an identity-owned, governed assistant-readable human identity
projection before implementing model context propagation.

## B. Current end-to-end path

Observed source path for the enrolled Telegram flow:

```text
Telegram ingress
  → resolveTelegramIdentity()
  → Conversation.userId = canonical HumanPrincipal.id
  → Telegram router sends ExecutionActor { kind: 'human', id }
  → ConversationService SendOptions.actor
  → DefaultContextAssembler ContextOptions.actor
  → CompletionRequest.actor
  → selected executor
      ├─ OpenCode Global Assistant adapter
      ├─ Codex SDK adapter
      └─ generic OpenCode provider adapter where selected
  → provider/runtime request
  → model input
```

The shared request contract declares `actor?: ExecutionActor` as canonical
initiator attribution and explicitly states that it carries no role,
permission, membership, or execution authority
(`packages/shared/src/provider.ts`, lines 105-124). `ExecutionActor` itself
is the existing provider-neutral runtime contract; no new identity
abstraction is needed for this audit.

`DefaultContextAssembler` constructs the system message, bounded conversation
history, and current user message. It forwards `options.actor` as a separate
structured field at return time; it does not place actor data in any message
(`packages/context/src/index.ts`, lines 65-146).

## C. Boundary-by-boundary trace

| Boundary | Evidence and representation | Visibility/ownership finding |
|---|---|---|
| Telegram resolution | `apps/api/src/routes/telegram.ts` resolves the external subject through the canonical human-principal resolver and uses the resulting ID for conversation binding and routing. | Provider ingress; canonical identity is available here. Telegram presentation remains separate. |
| Conversation | Conversation `userId` is the canonical conversation participant reference. `packages/conversation/src/index.ts` passes `SendOptions.actor` into context assembly and uses conversation identity for persisted attribution. | Conversation/runtime boundary; actor remains structured. |
| Context assembly | `ContextOptions.actor` is copied to `CompletionRequest.actor`; messages contain only system prompt, history, tool observations, and current user content (`packages/context/src/index.ts:65-146`). | Provider-neutral context assembly; actor is retained but not model-visible. |
| Shared provider request | `CompletionRequest.actor?: ExecutionActor` (`packages/shared/src/provider.ts:105-124`). | Provider-neutral execution metadata; not a message and not an authorization input. |
| OpenCode Global Assistant adapter | `runAssistantOpenCodeTurn()` reads messages, surface context, agent/model, and tool policy. `buildSurfaceSystem()` renders only bounded workspace/surface/selection data. The async prompt payload has no actor field (`apps/api/src/assistant-opencode-adapter.ts:467-486, 606-714`). | Adapter-specific serialization; actor is available on the request object but omitted from model input. |
| Codex adapter | `runCodexTurn()` obtains `lastUserText(request.messages)` and calls `thread.runStreamed(prompt, ...)`; no actor or presentation is serialized (`apps/api/src/assistant-codex-adapter.ts:207-239`). | Adapter-specific serialization; actor is omitted. |
| Generic OpenCode runtime provider | `renderPrompt()` maps messages to `[System]`, `[User]`, and `[Assistant]` text only (`packages/providers/opencode/src/runtime-provider.ts:452-460`). | Provider-specific prompt rendering; actor is omitted. |
| Generic OpenCode HTTP provider | `complete()` sends `request.messages.map(serializeMessage)`; `serializeMessage()` maps role/content/tool fields only (`packages/providers/opencode/src/index.ts:203-211, 450-467`). | Provider wire serialization; actor is omitted. |
| Final model invocation | The model receives the provider-produced prompt/message payload, not the complete `CompletionRequest` object. | Model-visible context does not include canonical actor identity today. |

### Actor retained, transformed, or dropped

The actor is retained as structured execution metadata until the executor
boundary. It is then deliberately not included in any current model-facing
serializer. This is an omission from model context, not a failure of
canonical identity resolution and not a replacement by `tg-principal-*`.

OpenCode also emits internal operational attribution for the runtime agent in
tool mirror events. That runtime-agent attribution is not the human actor and
must not be treated as such (`apps/api/src/assistant-opencode-adapter.ts:656-665`).

## D. Exact model-visibility loss/omission point

The exact first omission is the provider/runtime request-to-model
serialization step, with two concrete variants:

1. In the Global Assistant OpenCode path, `runAssistantOpenCodeTurn()` creates
   `systemText` from `request.surfaceContext` and sends a prompt payload made
   of user text plus optional surface system text, agent, model, and tools. It
   never reads `request.actor` for that payload.
2. In the Codex path, `runCodexTurn()` extracts only the last user message and
   passes that string to the SDK.

The generic provider paths independently confirm the same rule: their prompt
and wire serializers enumerate message fields, not actor fields. Thus the
actor is not accidentally dropped by `DefaultContextAssembler`; it remains
available to runtime code but is intentionally not model-visible.

## E. Existing contracts that can be reused

Keep and reuse:

- `ExecutionActor` from `@vestara/execution-types` for provider-neutral actor
  identity and actor kind.
- `CompletionRequest.actor` from `@vestara/shared` for structured execution
  attribution across the provider boundary.
- `ContextOptions.actor` and `DefaultContextAssembler` from
  `@vestara/context` as the natural provider-neutral assembly seam.
- `TurnSurfaceContext` / `surfaceContext` from `@vestara/shared` for bounded,
  trusted application context. It is not a human identity contract and must
  not be overloaded for that purpose.
- `HumanPrincipal`, `HumanExternalIdentity`, and the existing resolver/storage
  boundary from `@vestara/workspace` for canonical identity resolution.

Contracts that should not become the identity source:

- Telegram `displayName`, username, or `tg-principal-*` pairing IDs.
- Activity Room actor/participant projections, which are operational
  presentation data rather than the assistant identity authority.
- Generic metadata actor structures with optional name/email fields; they do
  not establish the canonical human-principal semantics required here.
- Workspace repository profiles, Git identity, OS identity, or conversation
  prose.

No existing contract found in the audited path translates a canonical
`HumanPrincipal.id` into a governed, assistant-readable human identity.

## F. HumanPrincipal human-readable-data assessment

### Observed canonical data

`HumanPrincipal` has:

- opaque canonical `id`;
- lifecycle `status`;
- `createdAt` and `updatedAt`.

`HumanExternalIdentity` has provider, external subject, canonical principal
ID, and link time. These are binding/provenance facts, not a human-readable
name.

`HumanPrincipalPresentation` permits `displayName` and `avatar`, but the
contract explicitly says this is caller-constructed convenience metadata, not
stored principal identity and not an identity authority
(`packages/workspace/src/human-principal.ts:63-86`). It cannot currently serve
as the canonical source for assistant identity.

### Finding

The current canonical data is not sufficient for the assistant to know a
governed human-readable identity such as “Eddie”. The missing capability is a
purpose-bound, identity-owned human-readable attribute or projection with
clear lifecycle, provenance, read authorization, and unknown behavior.

Using the Telegram presentation value would violate the established namespace
separation. Hardcoding a name or deriving one from Git, OS, email,
repository ownership, history, or model inference is prohibited.

## G. Provider-neutrality assessment

The identity-to-assistant-context translation should belong upstream of
provider adapters, in the provider-neutral context assembly layer or a
canonical identity/profile projection consumed by that layer. Provider
adapters should receive already-prepared, bounded assistant context and
serialize it according to their native input shape.

OpenCode and Codex can consume the same provider-neutral identity context if
it is represented as an ordinary bounded context/message plan before their
different serializers run. They should not independently resolve
`HumanPrincipal` or decide what external identity attributes are disclosed.

The adapters remain responsible for transport-specific conversion, not
HumanPrincipal semantics. This avoids Telegram-specific prompts, OpenCode
special cases, and Codex-specific identity behavior.

## H. UNKNOWN and fail-closed behavior

The current structured actor is optional, so the following states remain
representable:

| Condition | Required model-context result |
|---|---|
| Actor absent | No human identity context; UNKNOWN. |
| Actor kind is `agent`, `system`, or `workflow` | Preserve the non-human actor internally; do not perform human-principal lookup or expose human identity. |
| HumanPrincipal missing | Fail closed; no inferred human identity. |
| HumanPrincipal inactive, suspended, disabled, or deleted | Do not create assistant-readable identity context unless a separately governed policy explicitly permits it; default is UNKNOWN. |
| Human-readable identity unavailable | Keep canonical actor internal for provenance; omit model-readable identity. |
| Multiple external identities resolve to one principal | Use only the current canonical principal scope; do not expose all linked providers automatically. |

No fallback is permitted to Telegram presentation, legacy pairing ID, Git,
OS identity, repository owner, email, model memory, or conversation guessing.

## I. Security and privacy analysis

`ExecutionActor { kind: 'human', id }` identifies the actor; it grants no
role, permission, membership, administrator status, credentials, execution
authority, or agent authority. Existing request comments make that boundary
explicit (`packages/shared/src/provider.ts:119-123`).

The model must not automatically receive merely because a principal exists:

- opaque external subjects or provider usernames;
- Telegram display names or contact metadata;
- credentials, tokens, or authentication claims;
- workspace memberships, roles, permissions, or administrator state;
- private files, conversations, locations, or relationship data;
- HumanKnowledge, memory, biography, goals, preferences, or profile data;
- internal IDs unless a separate, explicit provenance requirement justifies
  them.

Any future assistant-readable identity projection must be allowlisted,
bounded, purpose-specific, and independently read-authorized. Identity is not
relationship, permission, disclosure authority, context, or intelligence.

## J. Multi-human implications

The future context must be derived from the current request's canonical actor,
not from a process-global “current user”, last Telegram user, display cache,
or conversation text. A resolver/cache must be keyed by canonical principal
ID and any applicable workspace/read scope; it must not share one person's
presentation across principals.

For independently enrolled humans, the path must remain:

```text
current external subject
  → current explicit binding
  → current HumanPrincipal.id
  → current authorized assistant-readable projection
```

Linked external identities are provenance for resolution, not a list to expose
to the model. A principal's context must never be selected from another
principal merely because both use Telegram or share a conversation surface.

## K. Smallest recommended implementation seam

The smallest safe future seam has two bounded parts:

1. Establish a canonical, governed human-readable identity projection owned by
   the identity/profile boundary. It may be a minimal preferred/display name
   capability, but it must not be sourced from Telegram presentation and must
   not become a broad profile system. Its absence must be valid.
2. Extend provider-neutral context preparation, preferably adjacent to
   `DefaultContextAssembler`, to accept the resolved `ExecutionActor`, resolve
   only the allowlisted assistant-readable projection, and add a bounded
   provider-neutral context item/message. Preserve `CompletionRequest.actor`
   as internal structured provenance. OpenCode and Codex then consume that
   prepared context through their existing serializers.

The opaque `HumanPrincipal.id` should remain internal by default. It is useful
for correlation, authorization checks, and provenance, but it is not a
meaningful human-readable answer. If a future audit identifies a model-facing
provenance need, expose it only as an explicitly governed structured field,
not as an identity-name substitute.

## L. Focused verification required for the future implementation

The implementation milestone should add bounded tests proving:

1. A resolved human actor selects only that principal's governed projection.
2. The same prepared context is consumed by OpenCode and Codex paths.
3. No Telegram-specific field or provider adapter lookup is required.
4. Absent, non-human, missing, inactive, and unavailable identity cases remain
   UNKNOWN/fail-closed.
5. Presentation-only display names cannot establish or replace canonical
   identity.
6. Multiple principals cannot cross-contaminate context or cache entries.
7. External subjects, roles, permissions, memberships, credentials, and
   private profile/relationship data are not serialized.
8. `CompletionRequest.actor` remains structured execution metadata and does
   not grant authority.
9. Existing OpenCode/Codex routing and ordinary non-human execution paths
   remain compatible.

Before those tests can be implemented meaningfully, the governed
human-readable identity projection must exist or be explicitly declared
unavailable. Tests must not manufacture it from Telegram display data.

## M. Explicit non-goals

This audit does not:

- modify production code, tests, prompts, model context, or runtime behavior;
- create or modify HumanPrincipals or external bindings;
- alter persistence, authentication, authorization, roles, memberships, or
  credentials;
- merge Activity Room participant projections;
- add founder/product self-knowledge;
- create a universal profile or relationship system;
- expose the current opaque principal ID to the model;
- restart services, refresh browser state, stage, commit, or push.

## N. Open questions and milestone boundary

The source evidence resolves the propagation and serialization boundary, but
does not establish who is authorized to set or amend a canonical human
readable name, whether that name is globally scoped or workspace-scoped, or
which assistant-read disclosure policy applies. Those decisions belong in a
small prerequisite identity/profile contract milestone.

Therefore the smallest recommended sequence is:

1. Define and implement the governed human-readable identity projection and
   its lifecycle/authorization rules.
2. Implement provider-neutral assistant-context preparation using that
   projection, preserving UNKNOWN.
3. Verify OpenCode and Codex consume the same prepared context without
   provider-specific identity semantics.

No ACTOR-IDENTITY-003B implementation was started because the current
`HumanPrincipal` contract does not yet provide the governed human-readable
attribute required by the objective.

## Source evidence index

- `packages/shared/src/provider.ts` — `CompletionRequest`, `ExecutionActor`,
  `TurnSurfaceContext`.
- `packages/context/src/index.ts` — `ContextOptions` and
  `DefaultContextAssembler.buildContext()`.
- `apps/api/src/assistant-opencode-adapter.ts` — `buildSurfaceSystem()` and
  `runAssistantOpenCodeTurn()` OpenCode Global Assistant serialization.
- `apps/api/src/assistant-codex-adapter.ts` — `runCodexTurn()` and
  `thread.runStreamed()` input construction.
- `packages/providers/opencode/src/runtime-provider.ts` — `renderPrompt()`.
- `packages/providers/opencode/src/index.ts` — OpenAI-compatible message
  serialization.
- `packages/workspace/src/human-principal.ts` — canonical identity,
  external identity, and non-authoritative presentation contracts.

## Audit result

The exact model-visibility omission boundary is the provider/runtime
serializer, after `CompletionRequest.actor` has already reached the executor.
The current model-facing context owner is split between the provider-neutral
context assembler and runtime-specific serializers; the recommended owner for
identity translation is the provider-neutral context layer. Existing canonical
actor contracts are reusable. `HumanPrincipal` does not yet contain enough
governed human-readable data. The opaque principal ID should remain internal
by default. UNKNOWN remains fail-closed. A governed identity projection is a
prerequisite before the assistant-intelligence adaptation.

Zero production/runtime mutation occurred during this audit.
