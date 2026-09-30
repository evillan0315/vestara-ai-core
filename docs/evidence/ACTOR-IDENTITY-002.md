---
title: "ACTOR-IDENTITY-002 — Canonical Telegram Identity Binding Evidence"
version: 1.0.0
status: implemented
owner: vestara
last-reviewed: 2026-09-25
---

# ACTOR-IDENTITY-002 — Canonical Telegram Identity Binding Evidence

## Result

Implemented the smallest canonical Telegram identity-resolution path without
changing prompts, model behavior, Activity Room grouping, execution authority,
or broad authentication.

The canonical owner is the existing `HumanPrincipalStorage` in
`@vestara/workspace`. Telegram pairing remains the provider-specific evidence
source. The API resolver validates the paired principal and persists a
provider-neutral `HumanExternalIdentity` link:

```text
TelegramIdentityBinding
  telegramUserId = external subject
        │ explicit persisted pairing evidence
        ▼
HumanPrincipalStorage
  human_external_identities(provider='telegram', subject=...)
        ▼
HumanPrincipal
```

## Files changed

- `apps/api/src/telegram-identity.ts`
  - Added the single `resolveTelegramIdentity()` boundary.
  - Validates active pairing evidence against `HumanPrincipalStorage`.
  - Creates the canonical provider-neutral external identity link on first
    successful resolution.
  - Fails closed on missing principal, deleted principal, or conflicting link.
- `apps/api/src/workspace-context.ts`
  - Instantiates the existing `HumanPrincipalStorage` over the existing
    `plans.db` connection and exposes it through `WorkspaceContext`.
- `apps/api/src/routes/telegram.ts`
  - Resolves Telegram identity before workspace/conversation routing.
  - Uses the canonical principal ID for workspace and conversation binding.
  - Simulation creates a generated canonical principal rather than using a
    Telegram-shaped principal ID.
  - Existing Activity mirroring was not changed.
- `apps/api/__tests__/telegram-identity.test.ts`
  - Added focused canonical resolution, unresolved, namespace-separation,
    display/Git/OS non-inference, authority-separation, and collision tests.

## Persistence used

No new schema was introduced. The existing `PLANS_MANIFEST` already includes
the `human_principal.baseline` migration, which owns:

- `human_principals`
- `human_external_identities`
- `human_credential_bindings`

The Telegram pairing record remains in `.vestara/telegram.db` under
`telegram_identity_bindings`. The canonical external link is persisted in the
same existing workspace `plans.db` used by `HumanPrincipalStorage`.

## Resolution algorithm

`resolveTelegramIdentity(binding, principals)`:

1. Rejects absent or inactive `TelegramIdentityBinding` as unresolved.
2. Loads `binding.principalId` from `HumanPrincipalStorage`.
3. Rejects missing or deleted principals as unresolved.
4. Looks up `(provider='telegram', subject=binding.telegramUserId)` in
   `human_external_identities`.
5. Rejects a collision where the subject is already linked to another
   principal.
6. If no link exists, records the explicit pairing as the canonical external
   identity link.
7. Returns `{ externalIdentity, principal }` with separate identifiers.

The resolver does not inspect display names, usernames, Git configuration, OS
identity, repository ownership, model context, or conversational content.

## Namespace and authority rules

- Telegram subject `8531736505` remains a provider-scoped external subject.
- `HumanPrincipal.id` remains a separate canonical identity.
- Telegram binding ID, conversation ID, Activity participant ID, execution ID,
  and runtime session ID remain separate identifiers.
- Resolving a principal does not resolve workspace membership, role,
  permission, execution authority, or agent authority.
- The principal contract contains lifecycle identity only; it has no role or
  permission fields.
- Activity Room remains a projection and was not migrated in this milestone.

## Unresolved behavior

The following remain unresolved and do not enter Telegram conversation routing:

- no pairing exists;
- pairing is inactive;
- pairing references no existing canonical principal;
- referenced principal is deleted;
- Telegram subject is already linked to a different principal.

The historical `.vestara/telegram.db` row for
`8531736505 → tg-principal-8531736505` remains legacy pairing evidence. Because
no canonical `HumanPrincipal` row exists for that legacy string, the new
resolution boundary treats it as unresolved rather than manufacturing an
identity or rewriting history.

## Focused verification

Added `apps/api/__tests__/telegram-identity.test.ts` covering:

- paired Telegram subject resolves to an existing `HumanPrincipal`;
- canonical `(telegram, subject)` link is persisted;
- absent/unknown pairing remains unresolved;
- display name does not establish identity;
- Git namespace does not establish identity;
- OS namespace does not establish identity;
- Telegram subject and canonical principal IDs remain distinct;
- returned principal has no authority fields;
- conflicting external identity links fail closed.

The existing Telegram routing contract remains unchanged at the router level:
the Global Assistant still receives the conversation ID, message text, and
target `agent-assistant`; this milestone adds only the canonical identity gate
before conversation routing.

## Known remaining gaps

- Activity Room incoming mirroring still writes raw Telegram subject/display
  data independently. Activity convergence is intentionally deferred.
- Assistant/model context does not yet receive `HumanPrincipal` context.
- API `UserStore`/`AuthUser` is not yet converged with canonical principals.
- Workspace membership and authorization remain separate future work.
- Existing legacy Telegram pairings require an explicit governed migration or
  re-pairing; this milestone does not infer or rewrite them.

## Security conclusion

Identity resolution is explicit, persisted, provider-scoped, collision-safe,
and fail-closed. It grants no authority. No Eddie name, Telegram ID, Git
identity, OS identity, repository ownership, prompt, or model behavior was
used to create the canonical binding.
