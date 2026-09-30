# ACTOR-IDENTITY-004 — Governed Human Identity Projection Audit

Status: audit complete; audit-only milestone.

No production or runtime mutation was performed.

## A. Executive finding

Vestara already has a canonical identity anchor and a nearby governed human
knowledge substrate, but it does not yet have a canonical mechanism for a
principal's preferred human-readable representation.

The relevant boundaries are currently separate:

```text
HumanPrincipal
  = canonical identity anchor

HumanExternalIdentity
  = explicit provider binding

HumanKnowledgeStorage
  = principal-scoped governed knowledge storage
  = not publication or assistant-context authority

UserProfile / Telegram pairing / Activity presentation
  = legacy or surface-specific presentation/context

future identity projection
  = missing responsibility
```

The smallest correct addition is not a field on `HumanPrincipal`, not a
Telegram name migration, and not a general profile system. It is a narrowly
scoped, principal-owned human identity representation contract—initially able
to hold an explicitly governed preferred name—plus a resolver and a separate
assistant-context disclosure step.

This is an architectural recommendation only. It was not implemented.

## B. Existing human, user, and profile concepts

### B.1 Canonical HumanPrincipal

`packages/workspace/src/human-principal.ts` defines `HumanPrincipal` as:

```text
id, status, createdAt, updatedAt
```

The file explicitly freezes the separation between principal, profile,
presentation, membership, and authority. `HumanPrincipalStorage` persists only
identity columns in `plans.db` and performs principal-scoped reads and explicit
external-identity linking (`packages/workspace/src/human-principal-storage.ts`;
`packages/workspace/src/human-principal-migrations.ts`).

Observed conclusion: this is the correct identity anchor and should remain
identity-only.

### B.2 HumanExternalIdentity

`HumanExternalIdentity` stores `(provider, subject, principalId, linkedAt)`.
The unique `(provider, subject)` key and explicit link operation make it the
correct provider-binding contract. Provider claims such as username or email
are not stored as canonical human names.

Observed conclusion: it resolves an external subject to a principal; it does
not describe how that principal should be represented to a person or model.

### B.3 HumanKnowledge

`packages/workspace/src/human-knowledge.ts` and
`human-knowledge-storage.ts` define principal-scoped structured knowledge with:

- `subdomain` and `kind`;
- value;
- source and provenance;
- verification status;
- confidence;
- sensitivity;
- `agentReadable`;
- primary and related subject references;
- timestamps.

The contract explicitly says storage is not publication authority. Default
sensitivity is `PRIVATE`, default `agentReadable` is false, and no retrieval,
policy, or prompt rendering is performed by the storage module. Its migration
is `human_knowledge_items` in `plans.db`
(`packages/workspace/src/human-knowledge-migrations.ts`).

This is the closest existing governed substrate, but it is not currently a
preferred-name or identity-presentation contract. A future identity
projection may reuse its provenance and disclosure principles, but the
assistant must not search arbitrary knowledge to discover a name.

### B.4 Legacy conversational UserProfile

`packages/shared/src/conversation-types.ts` defines `UserProfile` with
`name`, `role`, `experience`, `preferredStack`, `communicationStyle`,
`goals`, `preferences`, timestamps, and conversation/session fields.
`packages/conversation-runtime/src/user-profile-store.ts` persists it in the
`user_profiles` table of the conversation/profile database. The
`DefaultConversationEngine` loads one profile, enriches it from conversation
text, and extracts a name/role from messages
(`packages/conversation-runtime/src/index.ts`, `_enrichProfile()`).

Observed classification:

- owner: conversation onboarding runtime;
- persistence: profile database, not canonical `plans.db` principal storage;
- scope: effectively one active profile per store/installation;
- source: conversational self-report and extraction;
- authority: none for authentication or authorization;
- canonical principal link: none demonstrated;
- assistant suitability: not suitable as the canonical identity source for
  multi-human operation.

It may remain useful for legacy onboarding, but it must not be silently
reinterpreted as the HumanPrincipal identity representation.

### B.5 Admin/API User

`packages/workspace/src/user-store.ts` defines `User` as:

```text
id, username, role, token, createdAt
```

The `users` table is created in `workspace-migrations.ts`. `UserStore` seeds
`user-admin` as an administrator when empty. `apps/api/src/auth.ts` resolves
Bearer tokens into `AuthUser` and has a legacy `X-Vestara-Actor` fallback.

Observed conclusion: this is an authenticated account/credential and
authorization namespace. It is not a HumanPrincipal, and no canonical
principal relationship is established by the inspected contracts. Its
`username` is not a governed HumanPrincipal preferred name.

### B.6 Telegram pairing and channel identity

`packages/channel-types/src/index.ts` defines `ChannelIdentity` with:

```text
channel, externalId, displayName?, username?, metadata?
```

The comments explicitly classify `displayName` and `username` as not
authoritative. Telegram normalization populates those values from Telegram
`first_name`, `last_name`, and `username`
(`packages/telegram-integration/src/telegram-types.ts`).

`TelegramPairingService` persists pairing values including
`telegramDisplayName` and `principalName` in its provider-specific binding
(`packages/telegram-integration/src/pairing.ts`). `approvePairing()` accepts
`principalId` and `principalName` as separate arguments; the inspected method
does not itself resolve or persist a canonical HumanPrincipal representation.

Observed conclusion: Telegram names are provider/pairing presentation. They
must not overwrite a canonical human-readable identity without a separate,
explicit governed mutation.

### B.7 Activity participants and presence

`packages/types/src/activity.ts` defines `ActivityActor` and `Participant`
with required `displayName`, membership, presence, and work state.
`packages/activity-room/src/projection-types.ts` describes participant
`displayName` as projection presentation, with human display names supplied by
the relevant participant source. The Activity Room routes and UI consume these
values for operational presentation.

Observed conclusion: participant/display data is Activity projection state,
not the HumanPrincipal identity authority. Activity Room is out of scope and
must not become the identity store.

### B.8 Preferences

`packages/workspace/src/preference-service.ts` persists unscoped key/value
preferences such as provider, model, theme, panels, and agent selection. It
has no principal identity ownership or human-readable identity contract.
Workspace UI theme/profile settings are also presentation configuration.

Observed conclusion: preferences are not the correct owner for identity
representation.

### B.9 OS and repository identity

`apps/api/src/diagnostics/collect.ts` reads `os.userInfo().username` for
diagnostic reporting. Repository identity contracts and project profiles
describe repository roots, Git remotes, branches, language, and project
metadata (`packages/repository-contracts/src/identity.ts`,
`packages/workspace/src/project-profile.ts`).

`os/customization/identity/eddie.yaml` contains an OS/image profile with
`display_name`, `role`, organization, and biography. It is image/profile
content, not linked to a `HumanPrincipal`, not an authenticated actor binding,
and not a multi-human runtime authority.

Observed conclusion: OS, Git, repository, and image-profile identity must not
be used to resolve or name an inbound human actor.

## C. Ownership matrix

| Concept | Source/owner | Persistence | Semantics | Canonical HumanPrincipal identity? |
|---|---|---|---|---|
| HumanPrincipal | `@vestara/workspace` / `HumanPrincipalStorage` | `plans.db`, `human_principals` | Identity anchor and lifecycle | Yes |
| External identity | `@vestara/workspace` / `HumanPrincipalStorage` | `plans.db`, `human_external_identities` | Explicit provider binding | No; resolves to one |
| Human knowledge | `@vestara/workspace` / `HumanKnowledgeStorage` | `plans.db`, `human_knowledge_items` | Governed principal-scoped facts/claims | No; separate knowledge domain |
| API user/account | `@vestara/workspace` / `UserStore` | `plans.db`, `users` | Credential/account and role | No; separate namespace |
| Conversational UserProfile | `@vestara/conversation-runtime` | profile/conversation DB, `user_profiles` | Onboarding and personalization context | No demonstrated link |
| Telegram identity | `@vestara/channel-types`, Telegram integration | Telegram pairing DB/runtime store | External subject and presentation | No |
| Activity participant | Activity packages/API/UI | activity projection/storage | Operational participant/presence presentation | No |
| Preferences | workspace `PreferenceService` | preferences storage | Product/runtime choices | No |
| OS/image identity | OS customization/diagnostics | YAML/runtime diagnostics | Host/image/product presentation | No |
| Repository identity | repository/workspace packages | workspace manifest/profile | Repository locator and metadata | No |
| Missing identity representation | Not currently owned | Not currently persisted | Preferred governed human-readable representation | Required future responsibility |

## D. Existing human-readable fields and classification

| Field | Owning domain | Source | Canonical or presentation | User-controlled/verified | Assistant suitability |
|---|---|---|---|---|---|
| `HumanPrincipal.id` | HumanPrincipal | Vestara generated | Canonical opaque identity | Generated, not a name | Internal provenance only |
| `HumanPrincipal.status` | HumanPrincipal | Lifecycle operation | Canonical lifecycle | Governed operation | Policy input, not a name |
| `User.username` | API account | Account creation/auth | Account identifier/presentation | User/admin supplied; not human-principal verified | Not identity projection |
| `UserProfile.name` | Conversation onboarding | Extracted from conversation/self-report | Conversational profile | Self-reported/unverified | Not canonical; legacy context only |
| Telegram `displayName` | Telegram/channel | Provider `first_name`/`last_name` or pairing input | Provider presentation | Provider/user supplied; not canonical | Never as identity proof |
| Telegram `username` | Telegram/channel | Provider username | Provider claim/presentation | Provider-controlled; mutable | Never as canonical identity |
| Pairing `principalName` | Telegram pairing | Caller argument to approval | Pairing presentation | Caller supplied; no canonical resolver in method | Not sufficient |
| Activity `displayName` | Activity projection | Producer/projection source | Operational presentation | Projection input | Not identity authority |
| `os.userInfo().username` | Host diagnostics | Operating system | Host identity | OS-controlled | Never actor proof |
| Git/project names | Repository/workspace | Repository metadata | Project/repository presentation | Repository-controlled | Never actor proof |
| `os/customization/identity/eddie.yaml` `display_name` | OS/image profile | Checked-in image content | Product/image profile | File-controlled, self-described | Not linked to principal |
| Human knowledge `value` | HumanKnowledge | Explicit seed/input | Governed claim/knowledge | Source and verification metadata exist | Only through future authorized projection |

The names of fields do not change these classifications.

## E. HumanPrincipal relationship to user/account domains

The inspected repository keeps the namespaces separate:

- `HumanPrincipal.id` uses `hp-*` generation and is stored in
  `human_principals`.
- API users use IDs such as `user-admin`, bearer tokens, and roles in `users`.
- Conversations and legacy sessions use their own `userId` values and are not
  proof of canonical human identity by themselves.
- Human credential bindings exist in the HumanPrincipal storage contract, but
  the credential ID is an opaque handle and authority remains with the
  credential/account boundary (`human-principal.ts`, `HumanCredentialBinding`).

No inspected source establishes `user-admin == a HumanPrincipal`, nor does a
username automatically create or bind one. Converting the account model into
the principal model would collapse authentication, identity, and authority.

## F. Candidate reusable contracts

Keep/reuse:

1. `HumanPrincipal` and `HumanPrincipalStorage` as identity anchor and
   canonical read owner.
2. `HumanExternalIdentity` and explicit provider-binding operations.
3. `HumanKnowledgeStorage`'s principal scoping, provenance, epistemic status,
   sensitivity, and default-deny principles where relevant.
4. `ExecutionActor` and `CompletionRequest.actor` for internal actor
   provenance.
5. `ContextOptions` / `DefaultContextAssembler` as the eventual
   provider-neutral context assembly boundary.
6. `HumanPrincipalPresentation` only as a non-authoritative projection shape
   if its semantics are tightened before it is used for assistant context.

Do not reuse as the canonical identity representation without an explicit
linking contract:

- `UserProfile`;
- `User.username`;
- Telegram `displayName`, `username`, or `principalName`;
- Activity `displayName`/participant records;
- OS/Git/repository identity;
- arbitrary HumanKnowledge retrieval.

## G. Missing responsibility

### Observed gap

No current contract both:

1. stores a principal-scoped human-readable representation;
2. defines who may set/update it;
3. records minimum provenance;
4. resolves it by canonical principal ID; and
5. exposes only an authorized subset to assistant context.

HumanKnowledge provides several of these properties for general claims, but
its own contract explicitly stops before publication and projection. UserProfile
provides a name but lacks principal binding, multi-human scoping, and governed
provenance.

### Recommendation

Choose a narrow identity-owned representation contract separate from
`HumanPrincipal` itself. A suitable conceptual name is
`HumanIdentityRepresentation` or `HumanIdentityAttributes`; the exact name is
less important than its boundary.

This is not a general social profile. It should initially represent only the
minimum human-readable identity needed for a user-facing or assistant-facing
address, with no role, relationship, credential, membership, or permission
fields.

## H. Recommended canonical ownership

The identity/workspace domain should own the durable representation and its
principal-scoped read/write operations. It should be adjacent to
`HumanPrincipalStorage`, but not inside the `human_principals` table if the
identity-only invariant is preserved.

The context domain should own the decision to construct an assistant-readable
projection from that representation. Storage ownership and disclosure/context
ownership should remain separate:

```text
HumanIdentityRepresentationStore
  → principal-scoped governed representation

HumanIdentityResolver
  → HumanPrincipal.id → representation or UNKNOWN

AssistantIdentityProjector / ContextAssembler
  → allowlisted projection or UNKNOWN

OpenCode / Codex adapters
  → serialize the prepared provider-neutral context
```

Provider adapters and Telegram must not resolve or author this information.

## I. Recommended minimal data contract

The first dogfood does not require legal name, email, phone, username, or a
general biography. The minimum is conceptually:

```text
HumanIdentityRepresentation {
  principalId: HumanPrincipal.id
  preferredName: string
  source: explicit | imported | verified
  verificationStatus: ...
  updatedAt: timestamp
}
```

The exact enumeration should be decided during implementation; the important
requirements are:

- `principalId` is the owner and foreign key, never a display-name key;
- `preferredName` is explicitly supplied through a governed operation;
- empty/absent value is valid and resolves to UNKNOWN;
- no role, permission, membership, credential, relationship, or authority
  fields are included;
- provider presentation does not update it implicitly.

The storage record may retain a minimal source/provenance marker and timestamps
without becoming a general claims system. A separate identity representation
is preferable to adding fields to `HumanPrincipal` because the existing
identity contract and migration comments explicitly prohibit presentation and
profile columns there.

### Is `preferredName` sufficient initially?

Yes for the narrow first dogfood capability—allowing the assistant to address
the current human by a governed preferred representation—provided the
projection can also represent absence and disclosure denial.

It is not sufficient for all future identity needs, but expanding now into
legal names, usernames, contact information, relationships, or a social
profile would exceed the evidence and scope of this milestone.

## J. Provenance requirements

The minimum provenance needed is:

- explicit source category, such as operator-configured or verified account
  workflow;
- verification/status state sufficient to distinguish established from
  unavailable or revoked representation;
- `createdAt`/`updatedAt`;
- mutation actor/audit event through the normal administrative audit boundary
  if the existing API mutation convention supports it.

The first version does not need a complex provenance graph. It does need to
avoid silently treating a Telegram display name, Git author, OS username, or
conversation extraction as verified canonical identity.

Existing HumanKnowledge provenance concepts may inform the design, but a
preferred name should not be stored as arbitrary knowledge and then discovered
by semantic search.

## K. Persistence and mutation boundary

The authoritative plans database is owned by the API/workspace runtime's
single-writer boundary, established by PERSISTENCE-SINGLE-WRITER-001.

If the recommended representation is durable, its storage should be owned by
the same API-owned workspace context and plans database, using a schema
migration rather than a direct database edit. The supported boundary should be:

```text
authenticated, explicitly authorized identity mutation
  → API/workspace context
  → principal-scoped representation store
  → write-through plans.db persistence
```

Direct DB edits, offline CLI writes against a live API database, Telegram
simulation, and provider callbacks should not be accepted as normal mutation
paths. Reads should be principal-scoped and return UNKNOWN when absent,
inactive, or denied.

No migration, store, route, or database mutation was performed in this audit.

## L. Assistant-context projection boundary

The recommended direction from ACTOR-IDENTITY-003B is confirmed:

```text
HumanPrincipal.id
  → identity-owned governed representation resolver
  → authorized assistant identity projection
  → DefaultContextAssembler / provider-neutral context
  → OpenCode / Codex serializers
  → model
```

The resolver should read only the current canonical principal. The projector
should expose only the allowlisted representation needed for the specific
assistant turn. It should retain the opaque principal ID internally for
correlation/provenance while omitting it from natural-language model context
unless a later, explicit requirement establishes a safe structured use.

Stored human data must not automatically become assistant context. In
particular, `HumanKnowledgeItem.agentReadable` is not equivalent to “readable
by every assistant in every execution”; the HumanKnowledge contract explicitly
reserves retrieval/policy for a later projection boundary.

## M. UNKNOWN and fail-closed behavior

| State | Resolution/projection result |
|---|---|
| No `ExecutionActor` | No human identity projection; UNKNOWN. |
| Non-human actor | Preserve non-human execution metadata; do not resolve a human representation. |
| HumanPrincipal missing | UNKNOWN; no name fallback. |
| Principal inactive/suspended/disabled/deleted | UNKNOWN by default; no new assistant identity disclosure. |
| Principal exists, no representation | UNKNOWN. |
| Representation unavailable or storage failure | UNKNOWN/fail closed; do not use stale provider presentation. |
| Projection denied | UNKNOWN; deny disclosure without changing identity or authority. |
| Multiple external identities for one principal | One principal-scoped representation; no duplication by provider. |

Forbidden fallbacks remain Telegram display name/username, pairing ID,
`principalName`, OS account, Git identity, repository ownership, email,
conversation text, and model memory.

## N. Multi-human isolation analysis

The recommended store and resolver must be keyed by canonical `principalId`,
not by provider, display name, installation, or a process-global current user.
The context projection must derive its input from the current
`ExecutionActor.id`.

For two humans:

```text
ExternalIdentity A → Principal A → Representation A
ExternalIdentity B → Principal B → Representation B
```

Many external identities may resolve to one principal without duplicating the
representation. Two principals must never share a mutable “current display
name” cache or a single legacy UserProfile. Any future cache must include the
principal ID and relevant disclosure scope in its key.

Future relationships such as spouse/colleague can reference principal IDs in
a separate relationship domain. Nothing in the recommended representation
contract should encode relationships.

## O. Privacy and security implications

Human-readable identity must not grant authentication, authorization, roles,
permissions, workspace membership, administrator status, execution/agent
authority, credential access, private conversation access, or file access.

Changing `preferredName` must not change `HumanPrincipal.id`, external
bindings, membership, or permissions.

The initial assistant projection should expose only the preferred name when:

- the current actor resolves to an active canonical principal;
- the representation exists;
- the representation is allowed for the current assistant context.

Legal name, email, phone, provider usernames, relationships, location,
credentials, private preferences, and general HumanKnowledge should remain out
of the initial projection. Their storage or future disclosure requires separate
authority and policy decisions.

## P. Smallest future implementation scope

The smallest implementation milestone after this audit should be:

1. Add a principal-scoped identity representation contract and storage owner
   outside `HumanPrincipal` columns.
2. Add an API-owned, authenticated and explicitly authorized create/update/read
   boundary for `preferredName` only.
3. Add principal/status/absence/conflict tests and persistence tests through
   the API-owned single writer.
4. Add a provider-neutral resolver/projector consumed by context assembly.
5. Add OpenCode/Codex parity tests proving only the bounded projection reaches
   model context.

This is the smallest implementation scope that supports the first dogfood
without converting Telegram presentation, legacy UserProfile, or arbitrary
human knowledge into identity authority.

## Q. Required tests

The future implementation should prove:

- two principals can have independent preferred representations;
- multiple external identities for one principal reuse one representation;
- unbound or unknown principal returns UNKNOWN;
- inactive principal returns UNKNOWN for new projection;
- absent or denied representation returns UNKNOWN;
- display names, usernames, Git, OS, repository, and conversational text do
  not create or overwrite the representation;
- authenticated unauthorized mutation fails closed;
- authorized mutation is principal-scoped, durable, and auditable;
- renaming changes only the representation;
- no role, permission, membership, credential, or execution authority changes;
- UserProfile, Telegram pairing, Activity participant, and API User records are
  not silently merged;
- OpenCode and Codex receive the same provider-neutral bounded projection;
- opaque principal IDs remain internal provenance unless explicitly allowed;
- projection failures do not fall back to provider presentation.

## R. Explicit non-goals

This audit did not:

- modify `HumanPrincipal` or any contract;
- create a profile, preferred name, principal, binding, or migration;
- add API routes or mutate any database;
- modify Telegram, conversation, context assembly, prompts, OpenCode, or
  Codex;
- change authentication, authorization, roles, membership, credentials, or
  persistence architecture;
- investigate Activity Room's separate operations projection inconsistency;
- model relationships, legal identity, location, contacts, or general privacy
  policy;
- restart systemd, stage, commit, or push.

## S. Open questions

The following require resolution before implementation:

1. Which existing administrative authority may explicitly set a preferred
   identity representation, and what re-authentication/audit requirement
   applies?
2. Is the preferred representation globally principal-scoped, or can a future
   surface/workspace provide a separately authorized presentation? The initial
   dogfood should choose one explicit scope rather than silently mixing them.
3. What exact status values are needed for an identity representation, beyond
   present/absent, without duplicating the full HumanKnowledge epistemic model?
4. Should the existing `HumanPrincipalPresentation` type be adapted as the
   read projection shape, or replaced by a more explicit governed contract?
5. Which assistant disclosure policy authorizes the preferred name for a given
   execution, while preserving UNKNOWN when policy or storage is unavailable?

These questions do not justify using Telegram or legacy profile data as a
temporary canonical substitute.

## Audit result

1. No suitable complete governed human-readable identity mechanism currently
   exists.
2. Relevant domains found: HumanPrincipal, HumanExternalIdentity,
   HumanKnowledge, API UserStore/AuthUser, conversational UserProfile,
   Telegram ChannelIdentity/Pairing, Activity Participant/Presence,
   preferences, OS/image identity, and repository identity.
3. Existing names/display/profile fields are classified as canonical opaque
   IDs, account identifiers, self-reported conversational profile, provider
   presentation, Activity presentation, or product/repository metadata—not a
   canonical human-readable principal representation.
4. `HumanPrincipal` should not change by adding presentation/profile fields.
5. Recommended owner: a narrow identity-owned, principal-scoped
   representation store adjacent to HumanPrincipalStorage.
6. Minimum data: principal-scoped explicitly governed `preferredName`, status
   or availability, minimal source/provenance, and timestamps.
7. Minimum provenance: source category, verification/availability state,
   timestamps, and an auditable mutation actor.
8. Persistence: API/workspace single writer to authoritative `plans.db`, via a
   supported authenticated mutation boundary; no direct DB/CLI writes.
9. Assistant projection: separate resolver/projector before provider adapters,
   exposing only an authorized preferred name and retaining opaque ID
   internally.
10. UNKNOWN remains first-class for every unresolved, inactive, absent,
    unavailable, or denied case.
11. Multi-human isolation requires principal-keyed storage, resolution, and
    caching; no global profile or display name.
12. Smallest proposed milestone: implement the narrow representation contract,
    API-owned mutation/read boundary, resolver/projector, and focused tests.
13. A prerequisite is required before assistant-visible identity context can be
    implemented: establish the governed representation contract and its
    mutation/disclosure authority.
14. Audit artifact: `docs/audits/ACTOR-IDENTITY-004.md`.
15. Zero production/runtime mutation occurred.

