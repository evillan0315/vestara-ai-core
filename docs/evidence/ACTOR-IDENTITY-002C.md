---
title: "ACTOR-IDENTITY-002C — Canonical Human Principal Provisioning"
version: 1.0.0
status: ready-for-operator-approval
owner: vestara
last-reviewed: 2026-09-25
---

# ACTOR-IDENTITY-002C — Canonical Human Principal Provisioning

## Result

The existing canonical lifecycle is sufficient. No new principal registry,
schema, API, or provisioning abstraction is required for the first live
principal.

No live `HumanPrincipal` was created in this milestone.

## Canonical owner

`HumanPrincipalStorage` in
`packages/workspace/src/human-principal-storage.ts` owns canonical principal
creation and persistence. It is constructed over the workspace `plans.db` in
`apps/api/src/workspace-context.ts`.

The schema is defined by
`packages/workspace/src/human-principal-migrations.ts` and appended to the
workspace `PLANS_MANIFEST` in
`packages/workspace/src/agent-migrations.ts`.

The existing API user/account store is separate. `UserStore` owns API
credentials and roles; it is not a `HumanPrincipal` registry. The live
`user-admin` record therefore cannot be converted or assumed to represent
Eddie.

## Current live findings

The live workspace database was read without mutation:

- `human_principals`: 0 rows
- `human_external_identities`: 0 rows
- `human_credential_bindings`: 0 rows
- Eddie-linked `human_knowledge_items`: 0 rows
- API users: `user-admin` / `admin` only

The existing Telegram record remains separate in `.vestara/telegram.db`:

```text
telegram_user_id: 8531736505
principal_id: tg-principal-8531736505
display name: Eddie
active: true
```

That display value and legacy pairing identifier are not canonical principal
evidence and were not used to create a principal.

## Canonical record and required fields

`HumanPrincipal` contains identity lifecycle data only:

```text
id         generated canonical principal identifier
status     invited | active | suspended | disabled | deleted
createdAt  storage-generated ISO timestamp
updatedAt  storage-generated ISO timestamp
```

Required caller input: none.

Optional caller input:

```ts
{ status?: HumanPrincipalStatus }
```

When omitted, `HumanPrincipalStorage.create()` uses `status: 'active'`.
No display name, email, biography, Telegram subject, Git identity, OS
identity, or repository metadata is accepted by this creation contract.

Presentation is explicitly separate. `HumanPrincipalPresentation` supports a
display name/avatar only as a caller-side projection and is not persisted in
`human_principals`.

## Exact creation operation

The operation to create the first canonical principal is:

```ts
const principal = await ctx.humanPrincipals.create({ status: 'active' });
```

The `status` object may be omitted because `active` is the existing default:

```ts
const principal = await ctx.humanPrincipals.create();
```

`create()` generates an ID of the form `hp-<16 hex characters>` using
`crypto.randomBytes(8)`, persists one row in `human_principals`, and returns
the canonical record. The primary-key constraint rejects an actual collision;
the generated space makes collisions cryptographically improbable. The
operation does not create external identity, credential, workspace, role, or
permission rows.

There is currently no public HTTP principal-provisioning route. The canonical
storage operation is the governed creation boundary available to the API
composition root and focused lifecycle tests.

## Authority separation

Creating a principal grants identity ownership only. It does not:

- bind Telegram or any other external identity;
- bind an API credential;
- create workspace membership;
- assign a workspace role;
- grant permissions;
- grant execution or agent authority;
- make the principal an administrator;
- alter Activity Room grouping;
- modify prompts or assistant/model context.

`human_credential_bindings` is populated only by the separate explicit
`bindCredential()` operation. Workspace bindings and roles remain owned by
their existing stores/services.

## Lifecycle semantics

The supported status values are `invited`, `active`, `suspended`, `disabled`,
and `deleted`. `HumanPrincipalStorage.updateStatus()` validates the value and
updates only the principal lifecycle timestamps. External identity enrollment
later requires an existing `active` principal, but principal creation itself
does not enroll any provider.

## Verification

Inspected source contracts and live persistence without mutation:

- `packages/workspace/src/human-principal.ts`
- `packages/workspace/src/human-principal-storage.ts`
- `packages/workspace/src/human-principal-migrations.ts`
- `packages/workspace/src/human-knowledge-storage.ts`
- `packages/workspace/src/user-store.ts`
- `apps/api/src/auth.ts`
- `apps/api/src/workspace-context.ts`
- `packages/telegram-integration/src/workspace-binding.ts`
- `.vestara/plans/plans.db`
- `.vestara/telegram.db`

No production code was changed. No principal was created. No Telegram
external identity was bound.

## READY FOR PRINCIPAL CREATION

Required input: none beyond operator approval to invoke the existing canonical
operation.

Optional input: `status`, with the existing default `active`. No name or
personal/profile data is required or accepted by the canonical identity
record.

After approval, the exact operation is:

```ts
await ctx.humanPrincipals.create({ status: 'active' });
```

The returned generated `principal.id` must then be reported and separately
used by the explicit ACTOR-IDENTITY-002A Telegram enrollment operation. That
enrollment is not part of this milestone.
