---
title: "ACTOR-IDENTITY-001 — Actor Identity Architecture Audit"
version: 1.0.0
status: audit-complete
owner: vestara
last-reviewed: 2026-09-25
---

# ACTOR-IDENTITY-001 — Actor Identity Architecture Audit

## Scope and verdict

This is an audit-only milestone. No production behavior, identity binding,
prompt, Activity Room grouping, authentication path, PTY/filesystem authority,
or agent behavior was changed.

The repository already contains the intended canonical identity contracts in
`packages/workspace/src/human-principal.ts` and
`packages/workspace/src/human-principal-storage.ts`. They are not yet the
runtime identity authority for Telegram or API authentication. Telegram has a
separate provider-local pairing table and passes a caller-supplied
`principalId`/`principalName` into that table. Activity Room currently projects
Telegram ingress separately from the paired conversation identity. This is the
direct cause of the observed duplicate participants.

The smallest safe next boundary is:

```text
Telegram user/channel subject
        │ normalized external identity, no human inference
        ▼
explicit governed external-identity binding
        ▼
canonical HumanPrincipal
        ▼
workspace membership / role / permission context
        ▼
execution actor context
        ▼
conversation and assistant runtime
```

The existing `TelegramIdentityBinding` is a useful explicit-pairing seam, but
it must be adapted to reference and validate the canonical `HumanPrincipal`
store rather than becoming a competing principal authority.

## A. Current identity architecture map

### End-to-end path

```text
Telegram Bot API update
  → normalizeTelegramMessage()
  → ChannelMessage.sender { channel: telegram, externalId: raw Telegram user id,
                             displayName: Telegram profile claim }
  → handleTelegramRoute()/processTelegramMessage()
  → TelegramPairingService.getBindingByTelegramId()
  → TelegramWorkspaceBindingService.getPreferredWorkspace()
  → TelegramConversationBindingService.getActiveBinding()
     or ConversationService.createConversation(identity.principalId)
  → GlobalAssistantTextRouter.routeStream()
  → ConversationService.sendMessageStream(conversationId, content,
                                           { agentId: agent-assistant })
  → ContextAssembler.buildContext()
  → CompletionRequest / OpenCode or Codex adapter
  → assistant response and runtime events
  → optional Activity Room mirrors and M9 projection
```

Concrete source path:

1. `packages/telegram-integration/src/telegram-types.ts`
   `normalizeTelegramMessage()` converts `TelegramMessage.from.id` to
   `ChannelIdentity.externalId` and copies Telegram `first_name`/`last_name`
   into `displayName`. This is provider metadata, not proof of a Vestara human.

2. `apps/api/src/routes/telegram.ts`
   `handleTelegramRoute()` receives webhook/simulated input. The route calls
   `processTelegramMessage()`, which resolves the Telegram pairing by raw
   `message.sender.externalId`, then resolves workspace and conversation.

3. `packages/telegram-integration/src/pairing.ts`
   `TelegramPairingService` owns an in-memory cache and persists
   `TelegramIdentityBinding` records. `approvePairing()` accepts
   `principalId` and `principalName` from its caller after token approval. It
   does not resolve or validate that ID against `HumanPrincipalStorage`.

4. `packages/telegram-integration/src/workspace-binding.ts`
   `TelegramWorkspaceBindingService` maps the pairing's `principalId` to a
   workspace. This is a Telegram integration binding, not canonical workspace
   membership. It is currently the effective Telegram workspace relationship.

5. `packages/telegram-integration/src/conversation-binding.ts`
   `TelegramConversationBindingService` maps `(telegramChatId,
   principalId, workspaceId)` to a Vestara conversation. It intentionally does
   not own provider/model routing.

6. `packages/telegram-integration/src/global-assistant.ts`
   `GlobalAssistantTextRouter.routeStream()` uses the paired principal for
   rate limiting and concurrency, but passes only the conversation ID, text,
   and target agent `agent-assistant` to its execution backend. It does not
   pass a typed actor context to the assistant backend.

7. `packages/conversation/src/index.ts`
   `DefaultConversationService.createConversation()` stores the supplied
   `userId` as `Conversation.userId`. `sendMessage()` creates a user message,
   emits `conversation:message.sent` with `actor.id = conversation.userId`,
   and builds the provider request from conversation history.

8. `packages/context/src/index.ts`
   `DefaultContextAssembler.buildContext()` supplies the default system prompt,
   recent conversation messages, the current user message, conversation ID,
   optional target agent, optional surface context, and runtime session ID.
   It does not add `Conversation.userId`, Telegram metadata, a HumanPrincipal,
   or a verified display name to the model context.

9. `apps/api/src/workspace-context.ts`
   The composition root wires the conversation service to the local OpenCode
   adapter and the Codex adapter. The adapter receives the
   `CompletionRequest`; the current Telegram path supplies no
   `surfaceContext` or identity envelope.

10. `apps/api/src/routes/telegram.ts`,
    `mirrorTelegramIncomingToActivityRoom()` writes an independent best-effort
    M9 human event before identity/conversation execution. It uses the raw
    Telegram user ID as `userId` and formats the Telegram display claim as
    `${displayName} (Telegram)`.

11. `packages/activity-room/src/m9-adapter.ts`
    `fromHumanMessage()` copies `input.userId` to `ActivityEvent.actor.id` and
    `input.displayName` to `ActivityEvent.actor.displayName`. It does not
    resolve identities. M10/M11 then project those durable actor values into
    Activity Room stream items and participants.

### Identity-bearing representations found

| Representation | Source and symbol | Current owner | Persistence | Classification | Linkability now | Risk |
|---|---|---|---|---|---|---|
| Raw Telegram user | `telegram-types.ts`, `ChannelIdentity.externalId` | Telegram adapter boundary | Telegram update only; copied into Telegram DB/M9 when used | External provider identifier / claim | Used as lookup key in Telegram pairing | Provider subject can be mistaken for a human ID |
| Telegram pairing | `pairing.ts`, `TelegramIdentityBinding` | Telegram integration | `.vestara/telegram.db`, `telegram_identity_bindings` | Explicit binding record, but provider-local and not canonical | Yes, by `telegramUserId → principalId`; target principal is not validated | Competing principal namespace; accepts arbitrary principal labels |
| Telegram workspace binding | `workspace-binding.ts`, `WorkspaceBinding` | Telegram integration | `.vestara/telegram.db`, `telegram_workspace_bindings` | Surface-specific workspace relationship | Yes, by local `principalId` and workspace ID | Can be confused with canonical workspace membership |
| Telegram conversation binding | `conversation-binding.ts`, `ConversationBinding` | Telegram integration | `.vestara/telegram.db`, `telegram_conversation_bindings` | Channel-to-conversation mapping | Yes, through local principal ID | Does not itself prove actor identity |
| Canonical human principal | `human-principal.ts`, `HumanPrincipal` | `@vestara/workspace` contract | Intended in `plans.db`, `human_principals` | Canonical identity contract | Supports explicit external and credential bindings | Storage is not instantiated in API composition currently |
| External identity | `human-principal.ts`, `HumanExternalIdentity`; `HumanPrincipalStorage.linkExternalIdentity()` | `@vestara/workspace` | Intended in `plans.db`, `human_external_identities` | Provider-neutral explicit binding | Yes, unique `(provider, subject)` | Not currently wired to Telegram pairing |
| API credential binding | `human-principal.ts`, `HumanCredentialBinding`; storage methods | `@vestara/workspace` | Intended in `plans.db`, `human_credential_bindings` | Explicit credential-to-principal binding | Yes, by credential ID | API `UserStore` currently uses a separate user/token table |
| API user | `packages/workspace/src/user-store.ts`, `User` | Workspace/API legacy auth | `plans.db`, `users` | Credential/account record plus role | No canonical principal linkage | `User.id` and `HumanPrincipal.id` are separate namespaces |
| Auth request actor | `apps/api/src/auth.ts`, `AuthUser` | API auth middleware | Request-local | Authentication result or fallback | Bearer token resolves `UserStore`; fallback trusts legacy header | `X-Vestara-Actor` is caller-provided and must not be treated as human proof |
| Conversation user | `packages/shared/src/conversation-types.ts`, `Conversation.userId` | Conversation service | `.vestara/conversations/conversations.db` | Conversation author/owner reference | String only; no foreign-key enforcement to principal | Can carry Telegram-local or legacy IDs |
| Conversation participant/author event | `packages/conversation/src/index.ts`, `conversation:message.sent` | Conversation service/event bus | Conversation DB plus events | Derived from `Conversation.userId` | No separate participant entity | Actor is structurally attributed but not resolved to canonical identity |
| Execution actor | `packages/execution-types/src/request.ts`, `ExecutionActor` | Execution contract | Per request / execution stores | Runtime-neutral initiator attribution | Can carry an actor ID, but callers vary | No universal constructor/propagation from Telegram observed |
| Agent identity | `@vestara/workspace` agent storage and `CompletionRequest.agentId` | Agent definition/routing | `plans.db`, `agents` | Agent target/configuration, not human actor | Explicitly separate | Must not be merged with human participant IDs |
| Runtime session | `Conversation.runtimeSessionId`, OpenCode session registry | Conversation/runtime adapter | Conversation DB plus runtime state | Runtime continuity identity | Correlation only | Never actor identity |
| Activity actor/participant | `m9-adapter.ts`, `ActivityActor`; M10 `ParticipantProjection` | Activity projection | `.vestara/m9-activity.db` records; participant projection rebuilt | Durable event projection / display projection | No canonical identity resolution | Duplicate IDs/display records are currently possible |
| User profile | `packages/shared/src/conversation-types.ts`, `UserProfile`; `SqliteUserProfileStore` | Conversation onboarding runtime | `saved-chats.db`/profile store when used | Conversational profile/context | No authentication link | Name/profile claims are not identity proof |
| Product/founder knowledge | `packages/workspace/src/human-profile-seed.ts`, `os/customization/identity/eddie.yaml` | Profile/OS content | Source files and governed knowledge tables when seeded | Self-described/product context | Not an authentication link | Should not be used to identify an inbound actor |

## B. Telegram → assistant runtime call/identity flow

### Ingress and normalization

Raw Telegram `from.id = 8531736505` becomes the string external subject
`"8531736505"` in `ChannelIdentity.externalId`. The Telegram first/last name
becomes `ChannelIdentity.displayName`; username is copied as another provider
claim. The chat ID independently becomes `ChannelConversationRef.externalId`.

The normalized object preserves channel and provider namespaces, but does not
contain a canonical Vestara principal until the pairing service is consulted.

### Pairing and workspace resolution

`processTelegramMessage()` looks up `TelegramPairingService` by the raw
Telegram external ID. If found, it receives a `TelegramIdentityBinding` with a
`principalId`. It then resolves the preferred workspace using that string and
creates or resolves a Telegram conversation binding.

The normal pairing endpoint is explicit: `/api/telegram/pairing` creates a
one-time request, and `/api/telegram/pairing/approve` accepts
`token`, `principalId`, and `principalName`. The code comments describe this as
authenticated UI approval, but the route itself does not call
`HumanPrincipalStorage.require()` or resolve an authenticated principal. That
missing cross-store validation is a material audit finding.

Simulation is less authoritative by design: `/api/telegram/simulate` auto-
approves a synthetic account and constructs
`sim-principal-${telegramUserId}`. This is test/demo identity, not proof of a
human.

### Conversation and execution

For a first message, `createConversation(identity.principalId)` stores the
pairing principal string in `Conversation.userId`. On each message,
`conversation:message.sent` uses that value as its event actor. The Telegram
router supplies target agent `agent-assistant`; it does not supply a model as
identity and does not create an actor context envelope.

The assistant request therefore contains:

- system prompt: the generic Vestara assistant prompt unless another caller
  supplies one;
- recent conversation messages and the current Telegram text;
- `conversationId` and the selected target agent;
- runtime/session and provider/model routing fields resolved by the server;
- no `TelegramIdentityBinding` object;
- no raw Telegram user metadata;
- no canonical `HumanPrincipal` projection;
- no verified preferred/display name;
- no explicit workspace membership/role context;
- no Telegram `surfaceContext` from this path.

The assistant can still inspect repository files, Git metadata, OS/runtime
diagnostics, and product/profile artifacts when those capabilities or context
are available. Those observations are context, not authentication.

## C. Identity namespace matrix

| Namespace | Example | Semantics | Authority | May identify a human? | May grant authority? |
|---|---|---|---|---|---|
| Telegram provider subject | `telegram:8531736505` | Stable Telegram account subject | Telegram + normalized adapter | No, until explicitly governed/verified | No |
| Telegram chat | `telegram-chat:<chat id>` | Conversation/channel endpoint | Telegram conversation binding | No | No |
| Telegram pairing binding | `binding-...` | Explicit link record | Telegram pairing service today; should adapt to canonical identity authority | It records a link claim | No by itself |
| Human principal | `hp-...` | Vestara canonical human identity | `HumanPrincipalStorage` contract | Yes, when governed and active | No by itself |
| External identity | `(provider, subject)` | Provider subject bound to principal | Provider-neutral principal storage | Resolves to principal only when binding is explicit and active | No |
| API user/credential | `user-admin`, bearer token | Credential/account and API role | `UserStore` + auth middleware | Authenticated account, but not yet canonical principal | Role is an authorization input only; fallback header is unsafe |
| Workspace relationship | `(principalId, workspaceId)` | Membership/access relationship | Not one canonical implementation in current path; Telegram has local binding | No | Contributes to authorization only after policy evaluation |
| Conversation | `conv-...` | Conversation container | Conversation service/store | No | No |
| Conversation author | `Conversation.userId` | Author reference copied into messages/events | Conversation service | Only as authoritative reference if its namespace was resolved upstream | No |
| Activity participant | `participantId` | Projection membership/display key | Activity M10/M11 projection | No; projection is not identity authority | No |
| Execution actor | `{kind,id,role}` | Runtime-neutral initiator attribution | Execution contract/caller | Only references an already-resolved actor | No; permissions are separate |
| Agent | `agent-assistant` | AI target/persona/configuration | Agent storage/routing | No | No human authority |
| Runtime session | OpenCode session ID | Runtime continuity | Runtime adapter/session registry | No | No |
| Git author | `Eddie Villanueva <...>` | Repository commit metadata | Git repository/config | No | No |
| OS user | `os.userInfo().username`, UID | Host/process identity | Operating system/runtime | No | No human identity proof |
| Display name/profile | `Eddie Villanueva` | Presentation or self-described context | Provider/profile/source document | No | No |
| Vestara product fact | `Eddie is founder` | Organization/product knowledge | Governed source/profile/product metadata | Not an inbound actor link | No |

## D. Authority and persistence matrix

| Concern | Current owner | Storage | Creation/resolution | Downstream consumers | Audit classification |
|---|---|---|---|---|---|
| Telegram subject | Telegram adapter | Ingress update; copied into Telegram/M9 records | `normalizeTelegramMessage()` | Pairing, mirror, route | Authoritative only as Telegram's subject; not human identity |
| Telegram pairing | Telegram package | `.vestara/telegram.db` | `createPairingRequest()` → `approvePairing()` → `getBindingByTelegramId()` | Workspace/conversation/router | Explicit but provider-local binding; incomplete canonical validation |
| Canonical principal | Workspace package contract | `plans.db` schema exists | `HumanPrincipalStorage.create()`; not wired in `workspace-context.ts` | Profile/storage callers | Intended authoritative owner, currently unused by Telegram/API path |
| External identity | Workspace package contract | `human_external_identities` schema exists | `linkExternalIdentity()` / `findPrincipalByExternalIdentity()` | Future auth/binding flows | Best existing canonical seam; not connected to Telegram |
| API auth account | `UserStore` / `authenticate()` | `plans.db.users` | `UserStore.seedDefaultUser()`, bearer lookup, or legacy header fallback | API role checks/audit | Existing auth mechanism, not canonical human identity |
| Telegram workspace access | Telegram package | `.vestara/telegram.db` | `bindWorkspace()` / preferred resolution | Telegram route | Derived/local relationship, not general membership authority |
| Conversation author | Conversation service | `conversations.db.user_id` | `createConversation(userId)` | Message events, context, activity bridge | Author reference; validity depends on caller |
| Runtime session | Conversation/runtime/OpenCode | `conversations.db.runtime_session_id` plus runtime registry | First turn/session creation and reuse | Provider adapter, reconnect/status | Runtime continuity only |
| Activity record | Activity Room M9 store | `.vestara/m9-activity.db` | `fromHumanMessage()` and other adapters | M10 projection, M11 API/UI | Durable derived/projection input, not identity authority |
| Product/founder context | Profile seed/OS identity files and governed knowledge | Source files and possible human knowledge tables | Seed/configuration/read paths | Context or tools when explicitly loaded | Context only; not actor authentication |

## E. Exact explanation of the two observed Activity participants

### `tg-principal-8531736505`

This value is the paired principal string used by the Telegram simulation/seed
path and then stored in the Telegram identity binding. The current runtime
database evidence is:

```text
telegram_identity_bindings
telegram_user_id:      8531736505
telegram_display_name: Eddie
principal_id:          tg-principal-8531736505
principal_name:        Eddie
active:                1
```

The conversation database contains conversations whose `user_id` is
`tg-principal-8531736505`. The Activity records for those conversation messages
therefore use that value as `actor_id` and `actor_display_name`.

Source origin:

- simulation constructs `sim-principal-${telegramUserId}` in
  `apps/api/src/routes/telegram.ts`;
- the real approval endpoint accepts any non-empty `principalId` supplied by
  its caller;
- the observed `tg-principal-8531736505` was persisted in `.vestara/telegram.db`
  and then carried into conversation creation.

This is evidence of an explicit pairing record in the current Telegram store,
not evidence that the string is a canonical `HumanPrincipal` or that its owner
is Eddie. No row linking this value to `human_principals` was found in the
runtime database, and the API composition root constructs `UserStore` but not
`HumanPrincipalStorage`.

### `Eddie Villanueva (Telegram)`

This value is constructed directly by
`mirrorTelegramIncomingToActivityRoom()`:

```ts
const displayName = message.sender.displayName ?? message.sender.externalId;
userId: message.sender.externalId;
displayName: `${displayName} (Telegram)`;
```

For the dogfood messages, the runtime M9 row is therefore:

```text
actor_id:           8531736505
actor_display_name: Eddie Villanueva (Telegram)
source:             human-input
```

This mirror occurs before pairing resolution and does not read
`TelegramIdentityBinding`. It uses raw Telegram subject `8531736505`, while
the conversation path later uses `tg-principal-8531736505`. M9 stores both as
separate actor IDs, so M10/M11 can display both participants. The suffix
`(Telegram)` is a display annotation, not a binding and not a canonical name.

### Is there an actual binding between them?

There is an explicit Telegram-store row binding raw Telegram subject
`8531736505` to the string `tg-principal-8531736505`. That binding is consumed
by Telegram conversation routing. There is no corresponding binding in the
Activity mirror path between actor ID `8531736505` and actor ID
`tg-principal-8531736505`, and no source evidence that either string is linked
to a canonical `HumanPrincipal` record. Therefore:

- `8531736505 ↔ tg-principal-8531736505`: explicit Telegram pairing record;
- `8531736505 ↔ Eddie Villanueva`: only Telegram display metadata in the
  observed path, not canonical proof;
- `tg-principal-8531736505 ↔ HumanPrincipal`: not established by current
  source/runtime evidence;
- `tg-principal-8531736505 ↔ Eddie Villanueva (Telegram)` in Activity Room:
  no binding; the apparent relationship is created by two independent writes
  describing one dogfood interaction differently.

## F. Current execution `ActorContext` supplied to the model

### Contract exists

`packages/execution-types/src/request.ts` defines the runtime-neutral
`ExecutionRequest` and `ExecutionActor`:

```ts
ExecutionActor = { kind: 'human' | 'agent' | 'system' | 'workflow', id, role? }
ExecutionRequest = { id, actor, objective, context, routing?, permissions?, ... }
```

This is the correct conceptual contract for future execution attribution. It
separates actor identity from execution context, routing, and permission
context.

### Telegram assistant path does not supply it

The Telegram `ExecutionRequest` in
`packages/telegram-integration/src/global-assistant.ts` is a channel-router
request containing message, `principalId`, workspace ID, conversation ID,
target agent, and timestamp. It is not the shared
`@vestara/execution-types` request and is not converted into one before the
conversation backend call. The `principalId` is used for rate limits and
conversation routing; it is not delivered as a typed model actor context.

The model-facing `CompletionRequest` receives conversation history and
optional surface context. Telegram does not set `surfaceContext`, and the
context assembler does not include `Conversation.userId` or Telegram metadata
in the system message. Thus the current model receives no authoritative actor
identity context. This explains why a safe assistant can refuse to answer
“do you know who I am?” without an explicit canonical identity context.

## G. Identity-confusion and security risks

1. **Two Telegram Activity identities for one message.** The raw ingress
   mirror and paired conversation path write different actor IDs. This is a
   proven duplication, not merely a UI defect.

2. **Telegram pairing is a competing principal authority.**
   `TelegramIdentityBinding.principalId` is an arbitrary string accepted by
   `approvePairing()`. It is not foreign-keyed to `human_principals` and is
   not checked by `HumanPrincipalStorage`.

3. **Display-name trust.** Telegram display names are provider claims and are
   copied into Activity Room display fields. Display-name equality must never
   resolve a human identity.

4. **Simulation auto-approval.** `/api/telegram/simulate` intentionally
   creates synthetic pairings. Those records must remain clearly non-production
   and cannot establish a real human identity.

5. **API auth split.** Bearer tokens resolve `UserStore.User`, while missing
   or invalid bearer credentials fall back to `X-Vestara-Actor` or
   `local-operator`. The fallback is useful for local development but is not
   proof of a human identity and must not be used as canonical binding input.

6. **Profile/knowledge confusion.** `UserProfile`, the self-described human
   profile seed, Git author, OS username, repository metadata, and model memory
   can describe a person or product. None authenticates the current Telegram
   subject.

7. **Product-fact confusion.** “Eddie Villanueva is the Founder of Vestara”
   is product/organization context found in `human-profile-seed.ts` and
   `os/customization/identity/eddie.yaml`. It is a separate fact from “the
   current Telegram actor is Eddie.” The assistant should answer the former
   only from an authorized product/organization context source, not by
   attributing the latter.

8. **Namespace collapse pressure.** Conversation `userId`, Activity
   `participantId`, runtime session ID, execution ID, Telegram subject, and
   canonical principal are all string-shaped in parts of the codebase. The
   existing repository identity contracts demonstrate the desired tagged/
   kind-separated approach; the actor milestone must preserve that separation.

9. **Historical rewrite risk.** Existing M9 records contain both raw and
   paired IDs. A later canonical binding must project historical provenance
   honestly; it must not rewrite old records to manufacture certainty.

## H. Existing contracts: KEEP / ADAPT / REPLACE

| Existing contract | Decision | Audit rationale |
|---|---|---|
| `HumanPrincipal` identity-only contract | KEEP | It already states principal ≠ credential, membership, profile, authority, and presentation. |
| `HumanExternalIdentity { provider, subject, principalId }` | KEEP / ADAPT | It is the correct provider-neutral binding shape; add explicit status/verification metadata only through the authorized identity milestone. |
| `HumanPrincipalStorage` external and credential methods | ADAPT | Make this the canonical writer/resolver used by Telegram and API auth. It already enforces unique external subject collision behavior. |
| `TelegramIdentityBinding` and one-time pairing flow | ADAPT | Keep Telegram-specific proof/UX and persistence, but make approval resolve an existing canonical principal and persist a canonical external-identity link/reference. |
| `TelegramWorkspaceBindingService` | ADAPT | Preserve as a Telegram surface preference/selection cache, but do not treat it as general workspace membership or authorization. |
| `TelegramConversationBindingService` | KEEP / ADAPT | Keep chat-to-conversation mapping; use canonical principal ID only after governed resolution. |
| `ChannelIdentity` / `ChannelMessage` | KEEP | Correct ingress boundary; external channel identity stays separate from canonical actor identity. |
| `Conversation.userId` | ADAPT | Preserve backward compatibility as an author reference, but add a typed/validated actor context at the service boundary and classify legacy values. |
| `ExecutionActor` / `ExecutionRequest` | KEEP / ADAPT | Use as the canonical execution attribution envelope; ensure Telegram and conversation routes construct it from resolved actor context. |
| `ActivityActor` / `ParticipantProjection` | KEEP as projection | Activity Room must consume resolved actor references plus provenance; it must not become an identity store. |
| M9 `fromHumanMessage()` | ADAPT | Accept canonical actor reference plus external/surface provenance, while preserving raw source identity for historical evidence. |
| `UserStore.User` and `AuthUser` | ADAPT, do not duplicate | Either bind credential records to `HumanPrincipal` using existing credential bindings or clearly classify `UserStore` as legacy local auth. Do not create another user/principal system. |
| `UserProfile` / `HumanKnowledgeItem` | KEEP separate | Profile and knowledge are context/content, never authentication identity. |
| Git/OS/repository metadata | KEEP as observation only | Never use it for authentication or external-identity linking. |
| OpenCode/Codex session IDs | KEEP as runtime identity | Never promote a runtime session to actor identity. |
| Ad hoc `tg-principal-*` convention | REPLACE as canonical identity | Retain as legacy historical data and pairing migration evidence; new bindings must reference canonical principal IDs. |

## I. Smallest proposed canonical identity-binding architecture

Do not introduce a parallel actor registry. Adapt the existing workspace
contracts in this order:

```text
ExternalPrincipalRef
  provider: 'telegram'
  subject: '8531736505'
        │
        │ explicit pairing proof + authenticated approver
        ▼
HumanExternalIdentity
  provider + subject → canonical principalId
        │
        ▼
HumanPrincipal
  identity lifecycle only
        │
        ├── WorkspaceMembership / surface relationship
        ├── presentation/profile/knowledge projections
        └── authenticated session / credential binding
        │
        ▼
ExecutionActorContext
  principalId, source external identity, workspace relationship,
  authentication/binding assurance, surface, authority reference
        │
        ├── Conversation author reference
        ├── Activity actor provenance
        └── Assistant/runtime context
```

Minimum rules:

- The canonical primary key is `HumanPrincipal.id`; it is not a Telegram ID,
  display name, API user ID, conversation ID, participant ID, or session ID.
- Telegram stores provider-specific subject metadata and pairing proof, but
  calls the canonical identity service to resolve the principal.
- A Telegram message with no valid binding remains `UNKNOWN` for canonical
  human identity. It may still be represented as a Telegram external actor.
- A valid binding resolves identity, not permission. Workspace membership and
  authorization remain separate checks.
- The assistant receives a bounded identity/context projection only after
  resolution. The projection must state assurance/unknown status and must not
  imply authority from identity alone.
- Activity M9 stores both canonical actor reference when known and raw source
  provenance. Existing records are not rewritten.
- Product/org facts such as founder, company, and product name live in a
  governed organization/product context authority, separate from HumanPrincipal
  and external identity binding. Existing profile/product sources may be
  adapted into that context authority, but must not authenticate a channel.

## J. Explicit implementation invariants

1. `Identity ≠ Authority ≠ Context ≠ Intelligence` remains enforced.
2. `ExternalPrincipal` is never automatically a `HumanPrincipal`.
3. A display name, username, email, Git author, OS username, repository owner,
   profile claim, or model memory never creates a binding.
4. One `(provider, subject)` resolves to zero or one canonical principal;
   collisions fail closed and remain `UNKNOWN`/conflicted.
5. One principal may have many external identities; one external identity may
   not silently belong to multiple principals.
6. Pairing approval requires explicit governed proof and an authenticated
   approver; the approval endpoint must not accept an unvalidated arbitrary
   principal string.
7. Resolving a principal grants no workspace membership, role, permission, or
   execution capability.
8. Workspace membership, role, permission, and execution actor context remain
   distinct contracts.
9. Conversation author, Activity participant, execution actor, agent, and
   runtime session IDs are not collapsed.
10. Telegram surface/chat identity remains separate from Telegram user subject.
11. Activity Room remains a derived/projection authority and never resolves or
    mutates canonical identity.
12. Unknown, unpaired, revoked, disabled, and conflicted identity states are
    representable and fail closed.
13. Historical Activity records preserve original source IDs and are not
    rewritten merely because a later binding becomes available.
14. Product/organization facts are resolved from product/org context, not from
    the current human actor binding.
15. The model must not infer “current actor = Eddie” from repository, Git, OS,
    product, profile, or conversational evidence.
16. Runtime session continuity never becomes authentication or actor identity.

## K. Proposed sequential implementation tasks — not executed

1. **Identity authority wiring audit gate.** Instantiate/read the existing
   `HumanPrincipalStorage` only in a controlled diagnostic path; inventory
   current `human_principals`, external identities, credential bindings, and
   `UserStore` rows without mutation.

2. **Canonical actor context contract.** Define a provider-neutral,
   fail-closed `ResolvedActorContext`/`ExecutionActorContext` that references
   `HumanPrincipal`, external subject provenance, workspace relationship,
   surface, and assurance without embedding permissions.

3. **Telegram pairing adaptation.** Change pairing approval to validate an
   existing canonical principal and create/update the provider-neutral external
   identity binding through the canonical owner. Preserve Telegram-specific
   pairing proof and legacy rows for migration/read compatibility.

4. **API credential convergence.** Decide whether existing `UserStore` users
   become credential records bound to canonical principals or remain a local
   legacy mode. Add no second principal table and do not infer identity from
   `X-Vestara-Actor`.

5. **Conversation propagation.** Add actor context at the conversation service
   boundary, preserve `Conversation.userId` compatibility, and ensure message
   events distinguish canonical author, external source, and surface.

6. **Telegram mirror convergence.** Make the Activity mirror consume the same
   resolved actor context as conversation routing. For unknown/unpaired input,
   emit an explicitly unknown/external actor rather than a guessed human.

7. **Activity projection provenance.** Adapt M9/M10 contracts to retain source
   namespace and canonical resolution status. Keep Activity grouping a
   projection concern; do not make it an identity store.

8. **Assistant context boundary.** Add a bounded, explicit identity/context
   block only for resolved actors and organization/product context. Include
   assurance and scope; never include authority by implication. Unknown remains
   explicit.

9. **Organization/product context authority.** Establish the canonical source
   for facts such as “who founded Vestara,” separate from human actor identity.
   Classify the existing profile seed, OS identity YAML, and repository docs as
   source candidates with provenance rather than authentication inputs.

10. **Security and migration tests.** Test unpaired Telegram, wrong-principal
    approval, collision, revoked/disabled principal, duplicate Activity writes,
    legacy `tg-principal-*` records, Git/OS mismatch, and product-fact questions.

11. **Dogfood verification.** Prove one explicitly bound Telegram actor and one
    unbound Telegram actor remain distinguishable; prove Activity, conversation,
    execution, assistant context, and organization context retain separate
    authorities.

## Files inspected

Primary implementation files:

- `packages/telegram-integration/src/telegram-types.ts`
- `packages/telegram-integration/src/pairing.ts`
- `packages/telegram-integration/src/workspace-binding.ts`
- `packages/telegram-integration/src/conversation-binding.ts`
- `packages/telegram-integration/src/global-assistant.ts`
- `packages/telegram-integration/src/persistent-store.ts`
- `packages/telegram-integration/src/migrations.ts`
- `apps/api/src/routes/telegram.ts`
- `apps/api/src/auth.ts`
- `apps/api/src/workspace-context.ts`
- `packages/workspace/src/human-principal.ts`
- `packages/workspace/src/human-principal-storage.ts`
- `packages/workspace/src/human-principal-migrations.ts`
- `packages/workspace/src/user-store.ts`
- `packages/workspace/src/agent-migrations.ts`
- `packages/conversation/src/index.ts`
- `packages/shared/src/conversation-types.ts`
- `packages/shared/src/provider.ts`
- `packages/context/src/index.ts`
- `packages/execution-types/src/request.ts`
- `packages/activity-room/src/m9-adapter.ts`
- `packages/activity-room/src/m9-types.ts`
- `packages/activity-room/src/m10-projection-runtime.ts`
- `apps/api/src/routes/activity-room-m11a.ts`
- `apps/api/src/assistant-opencode-adapter.ts`

Architecture and policy documents:

- `docs/IDENTITY-OWNERSHIP.md`
- `docs/plans/persistent-identity-binding-plan.md`
- `docs/architecture/VES-TG-001-freeze.md`
- `docs/MILESTONES.md` UIM-001 through UIM-016
- `packages/workspace/src/human-profile-seed.ts`
- `os/customization/identity/eddie.yaml`

Read-only runtime evidence inspected:

- `.vestara/telegram.db`
- `.vestara/conversations/conversations.db`
- `.vestara/m9-activity.db`
- `apps/workspace/tests/visual/fixtures/api.ts`

## Final audit result

- **Identity flow discovered:** Telegram subject → Telegram pairing → Telegram
  workspace/conversation binding → conversation user ID → provider request;
  Activity ingress is currently a parallel raw-subject mirror.
- **Authoritative owners:** Telegram owns Telegram normalization and pairing
  persistence; Conversation owns conversation authorship; runtime owns session
  continuity; Activity Room owns projection; the existing canonical principal
  contracts belong to `@vestara/workspace` but are not wired into this path.
- **Ambiguities/duplicates:** raw Telegram subject, Telegram-local principal
  string, API user, canonical HumanPrincipal, conversation user ID, Activity
  participant ID, and runtime session ID are all distinct or incompletely
  linked. The duplicate Activity participants are proven by source and runtime
  rows.
- **Security findings:** current pairing approval can persist an arbitrary
  principal string; display name and raw Telegram IDs are not human proof; API
  fallback actor headers are not authentication identity; Git/OS/repository/
  profile/product evidence must remain non-authenticating.
- **Recommended canonical boundary:** adapt existing `HumanPrincipal` plus
  `HumanExternalIdentity` storage as the single identity owner, then propagate a
  bounded actor context into conversation/execution/assistant and preserve
  source provenance into Activity.
- **Proposed next milestone:** canonical external-identity runtime and governed
  Telegram pairing adaptation, preceded by a read-only diagnostic of existing
  principal, credential, and UserStore data.
- **Production behavior changed:** no. This milestone only inspected source and
  runtime state and added this audit document.
