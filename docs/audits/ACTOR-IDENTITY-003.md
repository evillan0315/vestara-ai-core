# ACTOR-IDENTITY-003 — Canonical Human ActorContext Propagation Audit

Status: audit-only, completed 2026-09-25

Current canonical identity verified by the preceding milestone:

```text
telegram:8531736505
  → HumanExternalIdentity(provider="telegram", subject="8531736505")
  → HumanPrincipal hp-524fd68846015a0b
```

The legacy Telegram pairing remains `tg-principal-8531736505`. No code or
runtime state was changed by this audit.

## A. Current end-to-end propagation graph

```text
Telegram webhook/update
  → ChannelMessage.sender { channel, externalId, displayName }
  → mirrorTelegramIncomingToActivityRoom()        [raw projection, before resolution]
  → TelegramPairingService.getBindingByTelegramId()
  → resolveTelegramIdentity(binding, HumanPrincipalStorage)
  → ResolvedTelegramIdentity { HumanPrincipal, HumanExternalIdentity }
  → canonicalBinding = { ...legacyBinding, principalId: hp-... }
  → workspace binding lookup/bind
  → TelegramConversationBindingService
  → ConversationService.createConversation(canonicalPrincipalId)
  → Conversation.userId / conversations.user_id
  → GlobalAssistantTextRouter.routeStream()
  → backend(conversationId, content, { agentId })
  → ConversationService.sendMessageStream()
  → DefaultContextAssembler.buildContext()
  → CompletionRequest { conversationId, messages, routing/runtime options }
  → AssistantOpenCodeExecutor / Codex executor
  → provider/runtime
```

The concrete entrypoint is `processTelegramMessage()` in
`apps/api/src/routes/telegram.ts`. The canonical resolution is first
available at its `resolveTelegramIdentity(identity, ctx.humanPrincipals)` call.
The resolver returns a provider-neutral `HumanPrincipal` plus the explicit
external binding; it does not grant authorization.

## B. Boundary-by-boundary findings

### 1. Telegram ingress and channel normalization

`packages/channel-types/src/index.ts` defines `ChannelIdentity` and
`ChannelMessage`. `externalId` is a channel/provider subject and
`displayName`/`username` are explicitly non-authoritative. Telegram therefore
enters with:

```text
channel = telegram
externalId = 8531736505
displayName = Eddie
```

No `HumanPrincipal.id` exists at this boundary. The raw subject and display
name remain transient channel evidence unless separately persisted by a
channel store.

### 2. Activity Room mirror

`processTelegramMessage()` calls
`mirrorTelegramIncomingToActivityRoom(message)` before pairing resolution.
The audit baseline in `docs/audits/ACTOR-IDENTITY-001.md` and the current
implementation show that this projection uses raw Telegram identity and
display data. It does not receive `ResolvedTelegramIdentity`.

This is intentionally outside the assistant execution path, but it means the
Activity projection can retain raw actor IDs independently. ACTOR-IDENTITY-003
must not merge or rewrite this projection.

### 3. Canonical Telegram resolution

`apps/api/src/telegram-identity.ts` is the current canonical Telegram
resolution boundary. `resolveTelegramIdentity()` first looks up
`HumanExternalIdentity(provider="telegram", subject=telegramUserId)` and
validates the resulting principal. If the explicit binding is absent, it may
use the pairing principal only to establish the external link in the resolver's
legacy-compatible path; an unresolved/missing/inactive principal returns
`undefined`.

`enrollTelegramIdentity()` is the explicit binding writer. It does not infer
from `telegramDisplayName`, `principalName`, Git, OS, email, or conversation
content.

At this boundary `HumanPrincipal.id` is available in memory. The canonical
external binding and principal are persisted in `plans.db`; the Telegram
pairing remains persisted separately in `.vestara/telegram.db`.

### 4. Workspace and conversation binding

`processTelegramMessage()` derives `canonicalPrincipalId` from the resolver
and uses it for workspace lookup and `createConversation(canonicalPrincipalId)`.
`TelegramConversationBindingService` stores the same canonical value in its
`ConversationBinding.principalId` and persistent conversation binding.

`DefaultConversationService.createConversation()` stores the value as
`Conversation.userId`; `SqliteConversationStore` persists it as
`conversations.user_id`. Thus the canonical ID is not currently lost at
conversation creation for a newly routed Telegram conversation. It is carried
as a generic string author/owner reference, without a typed actor envelope.

The legacy `tg-principal-8531736505` remains in the Telegram pairing record,
but the post-resolution conversation path uses `hp-524fd68846015a0b`.

### 5. Router and execution request

`GlobalAssistantTextRouter` in
`packages/telegram-integration/src/global-assistant.ts` receives the
Telegram binding and uses `identity.principalId` for rate limiting and
concurrency accounting. The API creates `canonicalBinding` before calling it,
so this transient value is canonical on the resolved path.

However, the router's `ExecutionBackend` receives only:

```text
conversationId, content, { agentId }
```

The router does not pass a provider-neutral actor object. The Telegram package
also declares its own channel-local `ExecutionRequest` with `principalId`, but
the production backend path does not construct or forward that request, and
it is not the canonical `@vestara/execution-types` request.

### 6. Conversation service and context assembler — exact loss boundary

`DefaultConversationService.sendMessage()` and
`sendMessageStream()` in `packages/conversation/src/index.ts` load the
conversation and emit a conversation event whose actor is:

```ts
actor: { id: conversation.userId, role: 'user' }
```

This event has canonical attribution, but it is an event payload, not a
provider request contract. The service calls
`contextAssembler.buildContext(conversation, content, options)`.

`DefaultContextAssembler.buildContext()` in `packages/context/src/index.ts`
uses conversation messages and selected turn options, then returns
`CompletionRequest`. It does **not** copy `conversation.userId` into the
request, and `CompletionRequest` has no actor/principal field. It also does not
copy Telegram pairing or display metadata.

Therefore the exact current identity-loss boundary before assistant execution
is:

```text
Conversation.userId = hp-524fd68846015a0b
  → DefaultContextAssembler.buildContext()
  → CompletionRequest has no canonical actor field
```

The assistant adapter then receives conversation history and `conversationId`,
but not a structured canonical human actor. `conversationId` is a continuity
correlation, not an identity credential.

### 7. Provider/runtime invocation

`apps/api/src/assistant-opencode-adapter.ts` and the Codex adapter consume
`CompletionRequest`. They resolve provider/model and runtime session from the
request, but no canonical HumanPrincipal is present. The provider may receive
the system prompt, messages, surface context, agent target, and runtime
session; it does not receive `hp-524fd68846015a0b` as an actor context.

No prompt currently tells the model who the human is. This is why current
assistant identity awareness remains intentionally absent.

## C. Existing contracts and namespace comparison

| Contract | Current role | Canonical suitability |
| --- | --- | --- |
| `HumanPrincipal` in `packages/workspace/src/human-principal.ts` | Identity-only lifecycle record | KEEP as identity authority; no authority fields |
| `HumanExternalIdentity` | Explicit provider/subject binding | KEEP as provenance; never replace principal ID |
| `ChannelIdentity` | Ingress subject and presentation | KEEP as external/provider evidence; display is non-authoritative |
| `TelegramIdentityBinding` | Telegram pairing and legacy local principal | KEEP for compatibility; do not use as canonical human identity |
| `Conversation.userId` | Persisted conversation author/owner string | ADAPT/validate as canonical author reference; do not overload with presentation |
| `ExecutionActor` in `packages/execution-types/src/request.ts` | Runtime-neutral `{ kind, id, role? }` | Existing canonical execution shape; use `{ kind: 'human', id: hp-... }` |
| `ExecutionRequest` | Runtime-neutral execution envelope | Correct conceptual execution boundary, but not constructed by the current conversation path |
| `ExecutionContext` | Workspace/repository/surface conditions | Keep separate from actor identity |
| `ActivityActor` / `Participant` in `packages/types/src/activity.ts` | Activity projection identity plus display | Projection contract, not assistant identity authority |
| `CorrelationContext` in Telegram telemetry | Optional principal/workspace/conversation correlation | Useful observability carrier, not model/execution authority |
| `CompletionRequest` | Current provider-facing turn contract | Missing actor field; smallest propagation seam is here or its context assembler input |

`ExecutionActor` already represents `kind: 'human'` and an opaque ID, so it can
carry:

```ts
{ kind: 'human', id: 'hp-524fd68846015a0b' }
```

without Telegram-specific fields. Its optional `role` must remain absent for
identity-only propagation; a principal ID must not be converted into a role.

The package dependency graph matters: `@vestara/shared` currently has no
dependencies, while `@vestara/execution-types` is a separate runtime-neutral
contract package. The implementation milestone should either establish the
approved shared contract dependency direction or introduce an equivalent
provider-neutral actor value at the existing context boundary. It should not
create a Telegram-specific model context type.

## D. Answers to the required questions

1. **Where first available?** In `processTelegramMessage()` immediately after
   `resolveTelegramIdentity()` returns `ResolvedTelegramIdentity`.

2. **Where lost?** At `DefaultContextAssembler.buildContext()`: the canonical
   `Conversation.userId` is not copied into `CompletionRequest`, and the
   provider request has no actor field.

3. **Existing contract to carry it?** `ExecutionActor` is the best existing
   provider-neutral execution identity contract. `HumanExternalIdentity`
   remains separate provenance, and `ExecutionContext` remains scope/context.

4. **Can it represent a human principal?** Yes:
   `{ kind: 'human', id: 'hp-524fd68846015a0b' }`. Current production code does
   not yet construct this object on the conversation/provider path.

5. **How keep presentation separate?** Keep `ChannelIdentity.displayName`,
   `TelegramIdentityBinding.telegramDisplayName`, and
   `principalName` as channel/pairing presentation metadata. If surfaced to a
   model later, carry it in a separately labeled, bounded presentation field;
   never use it as `ExecutionActor.id` or principal proof.

6. **Does the assistant receive enough structured context now?** No. It
   receives messages, conversation ID, optional surface context, target agent,
   and runtime/provider data, but no canonical human actor context.

7. **Smallest implementation?** Preserve the existing resolved canonical ID
   in `Conversation.userId`, add one provider-neutral actor/resolution value at
   the conversation-to-context boundary, construct
   `ExecutionActor { kind: 'human', id: conversation.userId }` only for a
   validated active canonical principal, and carry it through the provider
   request/adapter as bounded trusted application context. Do not add Telegram
   fields, roles, permissions, or prompt-specific identity claims.

8. **UNKNOWN tests?** Existing `apps/api/__tests__/telegram-identity.test.ts`
   proves missing/unpaired and unknown principal resolution returns
   `undefined`. The propagation milestone must add tests proving that this
   unresolved result produces no `ExecutionActor`, no canonical ID, and no
   provider invocation. Resolved and unresolved paths must be tested together.

## E. Non-Telegram comparison

The generic HTTP conversation route in
`apps/api/src/routes/conversations.ts` accepts a client-supplied `body.userId`
or defaults to `local`. Its list route uses `X-Vestara-Actor` or `local`.
These are not currently resolved through `HumanPrincipalStorage`. The API
`UserStore.User`/`AuthUser` ID is an authentication-account namespace and is
not automatically a HumanPrincipal.

This confirms that the propagation problem is provider-neutral: Telegram now
has a canonical identity at ingress, while web/API and other channels do not
yet share a common principal-resolution boundary. ACTOR-IDENTITY-003 should
adapt the conversation/execution contract so future ingress adapters can
provide the same resolved actor without duplicating Telegram semantics.

## F. Authority and security analysis

Identity propagation must carry only evidence that the principal was resolved.
It must not copy:

- admin/editor/viewer roles from `UserStore`;
- workspace membership or preferred workspace;
- permission policy decisions or approved tools;
- provider/model selection;
- repository ownership, Git identity, or OS identity;
- Telegram display names or profile claims.

The existing `ExecutionRequest.permissions` and `ExecutionContext` are
separate fields and must remain separate. An actor context may identify the
initiator while authorization is still evaluated by the existing policy and
execution boundaries.

UNKNOWN remains valid. For an unresolved, unpaired, inactive, revoked, or
conflicting external identity, Telegram currently fails closed before routing.
The generic context contract should preserve an explicit unresolved state for
adapters that can continue without a canonical principal; it must not invent
an ID such as `tg-principal-*`, `Eddie`, `local`, or a display name as a
HumanPrincipal.

## G. Adjacent implementation observation

In `processTelegramMessage()`, after attempting to bind a workspace for
`canonicalPrincipalId`, the fallback reread uses `identity.principalId` rather
than `canonicalPrincipalId`. That can leave a newly enrolled canonical user in
`no-workspace` when no canonical workspace binding already exists. This is an
adjacent routing defect, not an actor-context design authorization; it should
be tested and handled in the implementation milestone before live end-to-end
Telegram execution verification.

## H. Focused verification plan

The smallest bounded implementation verification should cover:

1. Resolved Telegram binding produces `ExecutionActor { kind: 'human', id:
   hp-... }`.
2. `Conversation.userId` remains the canonical principal and is not replaced
   by `tg-principal-*`.
3. Unpaired, unknown, inactive, and conflicting identity resolution remains
   `UNKNOWN`/fail-closed and causes no provider invocation.
4. `displayName`, `principalName`, Git, OS, and repository values cannot create
   or alter the actor ID.
5. Actor context carries no role, permission, workspace membership, or
   provider/model authority.
6. The context assembler/provider request includes the actor only through the
   approved provider-neutral contract, and omits it when unresolved.
7. Both OpenCode and Codex adapter paths preserve the same actor semantics.
8. Existing conversation history, runtime session continuity, and Telegram
   legacy pairing behavior remain unchanged.

## I. Smallest recommended implementation milestone

Before changing prompts, implement one provider-neutral conversation/execution
actor propagation seam:

1. Define or adapt the shared actor-resolution value using existing
   `ExecutionActor` semantics and an explicit `resolved | unknown` state.
2. Have the Telegram path pass the resolved canonical actor into the
   conversation service without passing Telegram-specific data.
3. Have the conversation/context assembler carry the actor into the
   provider-neutral request boundary.
4. Keep provider adapters as consumers of structured context; do not infer or
   manufacture identity in prompts.
5. Add focused resolved/unknown/security tests and verify the adjacent
   canonical workspace reread behavior.

Do not yet implement organization/product knowledge, founder identity,
Activity Room participant convergence, authorization changes, or broad
authentication redesign. This audit establishes the propagation boundary;
implementation should begin only as the next authorized milestone.
