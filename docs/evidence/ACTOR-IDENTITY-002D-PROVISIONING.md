# ACTOR-IDENTITY-002D-PROVISIONING — Evidence

Status: implemented, deployed, and live recovery verified 2026-09-25.

Historical distinction:

- Lost historical principal: `hp-2df23f59d30f84dc`
- Replacement principal: `hp-524fd68846015a0b`

## Selected boundary

The selected endpoint is:

`POST /api/admin/human-principals`

This follows the existing `/api/admin/*` route convention and is handled by
`apps/api/src/routes/auth.ts`, which is already registered for the
`/api/admin` prefix in `apps/api/src/server.ts`. It is also listed by
`GET /api/routes` in `apps/api/src/routes/misc.ts`.

## Authentication and authorization

The boundary requires:

1. an actual `Authorization: Bearer <token>` header;
2. a token resolving through the existing `UserStore`; and
3. the existing `admin` role check via `requireRole`.

Requests without a valid bearer token receive `401`. Authenticated non-admin
users receive `403`. The legacy unauthenticated `local-operator` fallback is
therefore not accepted for principal provisioning.

## Input and operation

The request body accepts only the canonical `HumanPrincipalInput` field:

```json
{ "status": "active" }
```

An empty object defaults to the canonical `active` status. Invalid statuses,
unsupported fields, non-object bodies, and malformed JSON fail before storage
creation. The handler calls the existing API-owned
`ctx.humanPrincipals.create({ status })` operation. The storage generates the
`hp-<16 hex characters>` identifier.

The response is `201` with the created canonical principal representation.
Creation is audit-logged as `human-principal.create`; audit logging does not
add identity or authority fields to the principal.

## Storage and authority boundary

The owner is the `HumanPrincipalStorage` instance constructed by
`createWorkspaceContext()` in `apps/api/src/workspace-context.ts`. Its write
uses the API workspace SQL.js instance and the corrected plans.db write-through
boundary from PERSISTENCE-SINGLE-WRITER-001.

The endpoint does not:

- create or link `HumanExternalIdentity` rows;
- enroll Telegram;
- create workspace membership;
- assign roles or permissions;
- create credentials;
- grant administrator, execution, or agent authority;
- accept display name, email, Git, OS, provider, or Telegram fields.

## Verification

Added `apps/api/__tests__/human-principal-provisioning.test.ts`. The bounded
HTTP tests use an isolated in-memory SQL.js database and prove:

- unauthenticated request → `401`;
- authenticated editor request → `403`;
- unsupported identity-like input → `400` with zero principal mutation;
- authenticated admin request → one active generated principal;
- the created row is immediately queryable from the persistence-backed store;
- no external identity row is created.

Focused result: **2 tests passed**.

`pnpm build` completed successfully. The focused Biome check for all changed
provisioning files passed. The repository-wide lint command also encountered
pre-existing formatting findings in adjacent ACTOR-IDENTITY-002 files outside
this provisioning change; those files were not broadened or rewritten.

## Deployment boundary

The currently running systemd API was not restarted, so it does not load this
new route until the operator deploys the rebuilt output. Required operator
commands:

```bash
pnpm build
sudo systemctl restart vestara-api.service
```

At implementation time, no principal was created and no production database
was mutated. After deployment, ACTOR-IDENTITY-002D-R1 called this endpoint
once, verified durable persistence, and then called the existing
`POST /api/telegram/enroll` boundary separately; the live result is recorded
below.

## Live recovery result

The operator rebuilt and restarted the existing systemd-managed API. Live
preconditions were verified:

- `vestara-api.service`: active, running `apps/api/dist/index.js` from the
  workspace root;
- readiness: `{"status":"ok","ready":true,"workspaceStatus":"ready"}`;
- `POST /api/admin/human-principals`: loaded; unauthenticated probe returned
  `401`;
- before recovery: `human_principals = 0`,
  `human_external_identities = 0`;
- before and after recovery: `PRAGMA integrity_check = ok`.

Using the existing local admin bearer token, exactly one API-owned request with
`{}` created:

```text
hp-524fd68846015a0b / active
```

Immediately after that request, a fresh read of authoritative
`.vestara/plans/plans.db` showed one principal and zero external identities.
The generated row was present without shutdown persistence.

The existing authenticated enrollment boundary then accepted:

```text
POST /api/telegram/enroll
telegramUserId = 8531736505
principalId = hp-524fd68846015a0b
```

The durable result is exactly one row:

```text
provider = telegram
subject = 8531736505
principal_id = hp-524fd68846015a0b
```

The legacy Telegram pairing remains present and active with its original
provider-local value `tg-principal-8531736505`. The canonical resolver used by
Telegram routing resolves that pairing to the new HumanPrincipal through the
external identity row. The Telegram subject and canonical principal ID remain
distinct.

Repeating the same enrollment returned `200` and the same principal, proving
idempotency. The final database has one active principal, one Telegram
external identity, zero credential bindings, and no new workspace membership,
role, permission, administrator relationship, or execution authority. No
ActorContext, prompt, Activity Room, or persistence implementation was
changed.

ACTOR-IDENTITY-002D-R1 recovery is complete. ACTOR-IDENTITY-003 may begin as a
separate milestone for ActorContext propagation; assistant/model identity
awareness remains intentionally absent.
