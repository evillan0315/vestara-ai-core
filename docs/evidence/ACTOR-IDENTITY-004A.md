# ACTOR-IDENTITY-004A — Governed Human Representation Contract Evidence

Status: complete locally; not deployed to the live systemd API.

## Result

Vestara now has a separate principal-scoped `HumanIdentityRepresentation`
contract. `HumanPrincipal` remains unchanged and identity-only.

The initial contract contains:

- `principalId`;
- explicit `preferredName`;
- `status: active | unavailable`;
- `source: explicit`;
- `createdAt` and `updatedAt`.

Provider-specific display names, usernames, OS identity, Git identity, roles,
permissions, memberships, credentials, and authority are not accepted.

## Canonical owner and persistence

- Contract: `packages/workspace/src/human-identity-representation.ts`.
- Storage: `packages/workspace/src/human-identity-representation-storage.ts`.
- Migration: `packages/workspace/src/human-identity-representation-migrations.ts`.
- Composition: `apps/api/src/workspace-context.ts`.
- Database: API-owned authoritative `plans.db`.
- Table: `human_identity_representations`.

The table has one row per principal, references `human_principals(id)`, and is
appended to `PLANS_MANIFEST` after existing human-principal and knowledge
migrations. No existing row is rewritten and no live representation was
created.

## Supported mutation boundary

The existing authenticated administrative route convention was reused:

```text
POST /api/admin/human-principals/:principalId/representation
PUT  /api/admin/human-principals/:principalId/representation
GET  /api/admin/human-principals/:principalId/representation
```

Mutation requires a valid Bearer token belonging to an admin user and accepts
only `preferredName` and `status`. The storage owner verifies that the target
principal exists and is active. Duplicate creation fails; update requires an
existing representation. Audit actions are recorded through the existing
`AuditStore` boundary.

## Security and lifecycle behavior

- Missing principal: fails closed.
- Inactive principal: fails closed for create/update.
- Missing representation: read returns `null`, preserving UNKNOWN.
- Duplicate representation: fails closed.
- Provider-shaped fields: rejected by the API boundary and absent from the
  storage input contract.
- Name changes do not modify HumanPrincipal identity or authorization state.
- No Telegram binding, workspace membership, role, permission, credential, or
  execution authority is created.

## Focused verification

`packages/workspace/__tests__/human-identity-representation.test.ts` verifies:

- principal ownership and isolation;
- explicit create/update and duplicate rejection;
- absent representation;
- missing and inactive principal failure;
- database durability within the API-owned storage instance;
- provider presentation fields are not part of the contract.

`apps/api/__tests__/human-principal-provisioning.test.ts` verifies the admin
HTTP boundary rejects provider fields and performs create/update without
external identity side effects.

Focused result: 9 tests passed in the workspace/context run. The repository's
general Vitest invocation also discovers a Playwright visual spec and reports
the existing `Playwright Test did not expect test() to be called here`
configuration mismatch; this is unrelated to the changed production code.

## Deployment boundary

The live API was not restarted. Because the API/workspace source and migration
chain changed, deployment requires the operator's existing process:

```bash
pnpm build
sudo systemctl restart vestara-api.service
```

No live Eddie representation was created.

