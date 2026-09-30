# ACTOR-IDENTITY-004R-BUILD-001 — Full Build Failure Audit

Status: audit complete. Documentation only. No source, runtime, database,
systemd, or browser state was modified.

Deployment status: **NOT DEPLOYED**. The running API is treated as using the
previously compiled `dist` artifacts.

## Executive finding

The build failure is a compile-time contract mismatch in the uncommitted
administrative route additions:

```text
apps/api/src/routes/auth.ts:140
apps/api/src/routes/auth.ts:187
authenticatedUser.username
```

`authenticatedUser` is typed as `AuthUser`, but `AuthUser` exposes `name`, not
`username`.

The underlying `UserStore.User` record does have `username`, but
`requireExplicitAdmin()` returns the canonical API authentication shape
`AuthUser`, not a `UserStore.User`.

## 1. Canonical AuthUser contract

The canonical definition is:

`apps/api/src/auth.ts` — `AuthUser`

```ts
interface AuthUser {
  id: string;
  name: string;
  type: 'user' | 'agent' | 'system';
  role: 'admin' | 'editor' | 'viewer';
}
```

`authenticate()` maps a verified `UserStore.User.username` into
`AuthUser.name`:

```ts
return {
  id: user.id,
  name: user.username,
  type: 'user',
  role: user.role,
};
```

The owning account contract is separate:

`packages/workspace/src/user-store.ts` — `User`

```ts
interface User {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  token: string;
  createdAt: string;
}
```

`User.username` is an account field. It is not a `HumanPrincipal.id`, a
HumanPrincipal representation, or an external identity binding.

## 2. Origin of the failing references

Both references are inside source additions absent from `HEAD`, as shown by
the current worktree diff:

- line 140 is the audit call for the principal-provisioning route;
- line 187 is the audit call for the human-representation POST/PUT route.

The review inventory already attributes these route additions to the
004-attributable implementation, with the principal-provisioning portion
carried from the earlier ACTOR-IDENTITY-002D provisioning work.

The ACTOR-IDENTITY-004R repair itself did not change the `AuthUser` contract
and did not introduce a new `username` field. The references were already
present before the F-01 through F-04 repair was verified.

Therefore the precise classification is:

**A — introduced by the uncommitted 004-era administrative route additions,
not by the 004R repair patch itself.**

There is no committed history showing an earlier `AuthUser.username` field.
`git log -p -- apps/api/src/auth.ts` shows `AuthUser` was introduced with
`name`; the historical contract never exposed `username`.

## 3. Semantic purpose of the two values

The failing value is passed as the fourth argument to:

`apps/api/src/audit-log.ts` — `logAudit(audit, req, userId, username, ...)`

The audit store persists the field under the historical column name
`audit_log.username`.

In these routes it is intended to be the authenticated administrative actor's
audit/provenance label. It is not used to establish identity binding or to
grant authorization.

The relevant semantics are:

| Value | Meaning |
|---|---|
| `authenticatedUser.id` | authenticated API account identifier / audit actor ID |
| `authenticatedUser.name` | authenticated account's audit/display label; bearer users receive the UserStore username here |
| `authenticatedUser.role` | authorization role used by `requireRole` |
| `HumanPrincipal.id` | canonical human identity anchor; not involved in these audit calls |
| representation `preferredName` | governed assistant-readable human representation; not an authentication account field |

The route does not and must not use the audit label as canonical human
identity.

## 4. Existing administrative conventions

Existing routes use the `AuthUser`/actor shape through `getActor()` and pass
`actor.id` plus `actor.name` to `logAudit`, including:

- `apps/api/src/routes/auth.ts` user creation and token rotation;
- `apps/api/src/routes/agents.ts`;
- `apps/api/src/routes/projects.ts`;
- `apps/api/src/routes/plans.ts`;
- `apps/api/src/routes/orders.ts`;
- `apps/api/src/routes/workspace.ts`.

`apps/api/src/routes/types.ts` defines `getActor()` as the API boundary that
returns `authenticate()`'s `AuthUser` contract.

This establishes `authenticatedUser.name` / `actor.name` as the canonical
route-level audit label. Direct access to `UserStore.User.username` is only
appropriate while operating on the `UserStore.User` value itself, such as
login responses and account listings.

## 5. Contract history and completeness

`AuthUser` was introduced historically with `id`, `name`, `type`, and `role`.
The bearer-auth path deliberately translates the account-level
`User.username` into the route-level `AuthUser.name` field.

There is no evidence that removal or renaming of `AuthUser.username` was an
unfinished migration. The existing route conventions consistently consume
`.name`. The defect is an unfinished integration of the new administrative
routes with the established authentication contract.

## 6. Minimum architecturally correct repair

Change only the two audit arguments in the new route additions:

```text
authenticatedUser.username
→ authenticatedUser.name
```

Do not:

- add `username` back to `AuthUser`;
- cast to `UserStore.User`;
- use `any`;
- derive a HumanPrincipal identity;
- alter authorization;
- change audit schema;
- change representation or Telegram behavior.

This preserves the existing authentication boundary and the existing audit
provenance convention.

## 7. Why focused 004R verification missed this

The focused verification exercised route behavior through Vitest's runtime
transformation and asserted HTTP status semantics. That validates execution
behavior but does not type-check every source file as the repository build
does.

The authoritative `pnpm build` runs TypeScript project compilation and
therefore catches the invalid property access on `AuthUser`. A focused test
run without a successful full TypeScript build was insufficient as a release
gate for this route change.

## 8. 004R acceptance assessment

The F-01 through F-04 design remains architecturally valid subject to the
bounded compile repair above:

- GET authentication remains required;
- migration ordering remains append-only;
- OpenCode and Codex receive the same bounded identity projection;
- HTTP error mappings remain intentional;
- identity remains distinct from authentication, representation,
  authorization, authority, context, and intelligence.

The implementation is not deployable until the TypeScript build succeeds.

## Final classification

- Root cause: `AuthUser` versus `UserStore.User` field-name mismatch.
- Regression source: uncommitted 004-era admin route additions; not the 004R repair itself.
- Minimum repair: use `authenticatedUser.name` at both audit calls.
- Focused verification gap: no successful authoritative TypeScript build before deployment.
- Deployment: **NOT DEPLOYED**.
- Production/runtime mutation: none performed during this audit.

## 9. Authentication contract history and producers

`AuthUser` has no historical `username` field in the available repository
history. Its initial committed definition already contained `name`, `id`,
`type`, and `role`.

The important producers are:

- `authenticate()` with a valid Bearer token: reads `UserStore.User`, maps
  `User.id` to `AuthUser.id`, `User.username` to `AuthUser.name`, and
  `User.role` to `AuthUser.role`;
- `authenticate()` with the legacy `X-Vestara-Actor` header: derives a runtime
  actor name and uses it as both `id` and `name`, with the legacy admin role;
- `requireRole()`: consumes `AuthUser` for authorization and returns the same
  runtime authentication shape;
- `getActor()`: exposes `authenticate()` to route handlers.

`AuthUser` is runtime-derived authentication and authorization context. It is
not persisted as a domain identity record. Its `name` is a route/audit
presentation label, while its `id` is the authenticated account/actor key.

## 10. Exact failing call-site trace

### Line 140

The enclosing operation is `POST /api/admin/human-principals`. After an active
canonical HumanPrincipal is created, the route calls:

```text
logAudit(ctx.audit, req, authenticatedUser.id,
  authenticatedUser.username, HUMAN_PRINCIPAL_CREATE, ...)
```

The destination is the historical `AuditStore` field named `username`. The
expected semantic value is the authenticated administrative actor's audit
label. It affects audit/provenance persistence only; it does not affect
authentication, authorization, HumanPrincipal identity, representation
ownership, disclosure, or model context.

### Line 187

The enclosing operation is POST/PUT representation mutation. After a
principal-scoped representation is created or updated, the route calls the
same `logAudit` shape with:

```text
authenticatedUser.username
```

The semantic purpose is identical: record which authenticated administrative
API actor performed the mutation. The representation subject and its
preferred name are separate from this mutator provenance.

## 11. Representation provenance semantics

The 004A representation contract stores:

| Field | Meaning | Source | Model-visible | Authorization-relevant |
|---|---|---|---|---|
| `principal_id` | representation subject | route target / canonical HumanPrincipal | no | no |
| `preferred_name` | governed human-readable representation | explicit admin mutation | bounded projection only | no |
| `status` | representation availability | explicit admin mutation | no | resolver fail-closed behavior only |
| `source` | explicit representation provenance marker | storage constant `explicit` | no | no |
| `created_at` / `updated_at` | representation lifecycle timestamps | storage | no | no |

The representation table stores no authenticated mutator ID. Mutator
provenance is recorded separately in `audit_log.user_id` and the historical
`audit_log.username` label. Therefore the failing value is being supplied as
audit metadata, not as representation identity or ownership.

HumanPrincipal X, authenticated account Y, representation subject X, and
preferred name are intentionally allowed to remain distinct.

## 12. OS and external identity leakage check

The relevant authentication and representation route path contains no fallback
from:

- `process.env.USER`;
- `process.env.USERNAME`;
- `os.userInfo()`;
- `whoami`;
- Git author identity;
- Telegram display name;
- repository metadata.

`apps/api/src/diagnostics/collect.ts` reports the OS username for diagnostics,
but that value is not used by `AuthUser`, representation storage, audit actor
resolution, or assistant identity projection. The Debian OS account `user`
therefore does not become Eddie, a HumanPrincipal, or a preferred name.

Result: **NONE FOUND in the failing authentication/representation path.**

## 13. Focused verification gap in repository terms

The focused test command used Vitest. Vitest transforms TypeScript for test
execution and does not provide the authoritative project-reference type-check
performed by `tsc -b`.

The repository has two materially different compilation paths:

- package-local `apps/api` uses `apps/api/tsconfig.json` and the package
  `tsc` script;
- authoritative `pnpm build` first generates dependency project references
  through `scripts/workspace-architecture.mjs`, then runs
  `tsc -b tsconfig.references.json` across the repository.

The prior focused workflow reported successful affected-package builds and
passing runtime tests, but the authoritative root project-reference build is
the run that exposed the invalid `AuthUser.username` access. The available
evidence does not prove whether the package-local success was caused by
incremental `.tsbuildinfo` reuse, reference ordering, or another invocation
difference; determining that would require another build diagnostic and is
outside this audit's no-build boundary.

What is proven is that runtime test success did not type-check the failing
route contract, and the authoritative build was not a passing release gate.
The earlier 004R evidence should therefore be read as focused architectural
and behavioral evidence, not as proof of deployable build readiness.

## 14. Minimum repair options

### Recommended: use `authenticatedUser.name`

Affected file: `apps/api/src/routes/auth.ts` only.

Replace the two audit-label reads with `authenticatedUser.name`. This is the
existing canonical route convention, preserves strict typing, and leaves
authentication, authorization, representation, HumanPrincipal, and audit
schema semantics unchanged.

### Alternative: centralize the audit actor helper

The route could call an existing actor helper that returns `id` and `name`,
but this adds unnecessary route refactoring for the same semantics and has
greater compatibility surface. It is not needed for this bounded defect.

### Rejected options

- adding `username?: string` to `AuthUser` would duplicate the established
  `name` contract and permit undefined audit labels;
- casting or `any` would conceal the contract defect;
- OS, Git, Telegram, repository, or hardcoded names would violate identity
  boundaries;
- using `preferredName` would confuse representation with authentication;
- removing audit provenance would lose the authenticated mutator record.

No option requires changes to HumanPrincipal, representation, migration,
Telegram, or authorization contracts.

## 15. Repair acceptance gate

After the separately authorized bounded source repair, acceptance must require:

1. focused auth/representation tests, including authenticated actor audit
   provenance;
2. authorization tests for unauthenticated, non-admin, and admin requests;
3. an audit assertion proving `audit_log.user_id` is the authenticated
   account ID and the stored label is the account's `AuthUser.name` value;
4. successful `apps/api` type-check/build;
5. authoritative `pnpm build`;
6. `pnpm dependencies:check`;
7. `git diff --check`.

No deployment decision should be based only on `/api/health` or service
status.
