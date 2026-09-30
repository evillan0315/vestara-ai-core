---
title: "ACTOR-IDENTITY-002D — Principal Creation and Telegram Enrollment"
version: 1.0.0
status: partially-complete-api-reload-required
owner: vestara
last-reviewed: 2026-09-25
---

# ACTOR-IDENTITY-002D — Principal Creation and Telegram Enrollment

## Result

The single operator-approved canonical principal creation was executed:

```ts
await ctx.humanPrincipals.create({ status: 'active' });
```

Generated principal:

```text
id: hp-2df23f59d30f84dc
status: active
created_at: 2026-09-25T07:46:47.555Z
updated_at: 2026-09-25T07:46:47.555Z
```

The row was persisted through `HumanPrincipalStorage` to
`.vestara/plans/plans.db`. The live database now contains exactly one
`human_principals` row.

## Pre-enrollment state

Before creation and enrollment checks:

- Telegram subject `8531736505` had one active legacy pairing.
- Its legacy pairing value remained `tg-principal-8531736505`.
- `human_external_identities` contained no Telegram binding for the subject.
- The newly created principal was active.
- The creation operation created no credential binding, role, permission, or
  canonical workspace membership.

The existing Telegram workspace binding for `tg-principal-8531736505` was
observed but not changed. It is legacy provider-specific state and is not a
new membership created by principal provisioning.

## Enrollment result

Enrollment could not be executed in this turn because the currently running
API does not have the ACTOR-IDENTITY-002A route loaded.

The supported probe:

```text
POST /api/telegram/enroll
```

returned HTTP `404 RESOURCE_NOT_FOUND`. The source route exists in
`apps/api/src/routes/telegram.ts`, but the live process is serving an older
build. No direct mutation of `human_external_identities` was performed, and
no alternate enrollment path was used.

Therefore the current persisted external identity state is:

```text
provider: none
subject: none
principalId: none
```

The expected binding remains pending:

```text
telegram:8531736505 -> hp-2df23f59d30f84dc
```

## Canonical resolution

Canonical resolution cannot yet prove the post-enrollment path because the
external identity binding was not created. The legacy Telegram pairing still
resolves only to `tg-principal-8531736505`, which is distinct from the newly
created canonical ID and is not itself a `HumanPrincipal` row.

The next enrollment attempt must use the existing authenticated boundary:

```text
POST /api/telegram/enroll
{
  "telegramUserId": "8531736505",
  "principalId": "hp-2df23f59d30f84dc"
}
```

It must then be followed by the canonical resolver and idempotency checks.

## Authority and namespace delta

Creation produced exactly one identity row and no authority:

- `human_principals`: increased from 0 to 1.
- `human_external_identities`: remains 0.
- `human_credential_bindings`: remains 0.
- `users`: unchanged; `user-admin` remains the separate admin account.
- workspace bindings: no new binding was created.
- roles and permissions: unchanged.
- execution authority: unchanged.
- Activity Room: unchanged.
- assistant/model ActorContext: unchanged.

The generated canonical ID remains distinct from both the Telegram subject
`8531736505` and the legacy pairing ID `tg-principal-8531736505`.

## API runtime status

```text
API_RELOAD_REQUIRED
```

Reason: the live API returned 404 for the ACTOR-IDENTITY-002A enrollment route,
so it cannot perform the supported enrollment operation. The operator may
reload it with the existing project command:

```bash
pnpm dev:api
```

The API was not restarted or terminated by this verification.

## Post-restart verification update

After the operator ran the build and restarted the existing systemd service,
the live API route became available. An authenticated validation request to
`POST /api/telegram/enroll` returned the expected `400` required-fields
response, confirming that the ACTOR-IDENTITY-002A route is loaded.

The approved enrollment attempt for
`8531736505 -> hp-2df23f59d30f84dc` then failed closed with:

```text
HumanPrincipal not found: hp-2df23f59d30f84dc
```

A direct read of the persisted `.vestara/plans/plans.db` after the restart
confirmed that `human_principals` is again empty and
`human_external_identities` remains empty. The previously recorded principal
row did not survive the systemd API restart. No replacement principal was
created because this milestone authorizes exactly one principal creation and
does not authorize creating a second one.

Consequently, Telegram enrollment, canonical resolution, and idempotency
verification remain incomplete and must not be bypassed with direct database
mutation or a new principal.

## Remaining gap before ACTOR-IDENTITY-003

After the API is reloaded, complete 002D enrollment and verify the canonical
Telegram resolver. ACTOR-IDENTITY-003 remains deferred: the resolved
`HumanPrincipal` must still be propagated through conversation/execution
`ActorContext` without changing authorization semantics.
