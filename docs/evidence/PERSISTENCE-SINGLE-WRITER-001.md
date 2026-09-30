---
title: "PERSISTENCE-SINGLE-WRITER-001 — Shared plans.db Persistence Boundary"
version: 1.0.0
status: implemented-live-verified
owner: vestara
last-reviewed: 2026-09-25
---

# PERSISTENCE-SINGLE-WRITER-001 — Shared plans.db Persistence Boundary

## Result

The stale shutdown overwrite path has been removed from the API workspace
context. API-owned mutations now persist at mutation time for the database
write mechanisms used by shared plans stores:

- `Database#exec()`;
- `Database#run()`;
- prepared-statement `run()`;
- prepared-statement `step()` followed by `free()`.

Before any API-owned write-through export, the API hashes the durable file and
compares it with the last file version it opened or wrote. If another process
changed the file, the API fails closed and refuses to export its stale
snapshot.

The API no longer exports its entire in-memory plans database during shutdown.
This prevents an older in-memory snapshot from replacing newer durable state
when the service stops.

## Original defect

`ACTOR-IDENTITY-002E` established that the API opened
`/home/user/projects/vestara-ai-core/.vestara/plans/plans.db` into SQL.js while
another process could write the same file. The API retained its older snapshot
and `createWorkspaceContext().close()` called `persistDb(db, dbPath)`.

That full export overwrote newer file state. The HumanPrincipal loss was one
instance of a shared plans database problem, not a HumanPrincipal-specific
storage defect.

## Writer inventory

### API workspace context — authoritative runtime writer

- Source: `apps/api/src/workspace-context.ts`.
- Owner: the running Vestara API process and its `WorkspaceContext`.
- Open: `createWorkspaceContext()` → `openSqlDb()` at
  `path.join(workspaceDir, 'plans', 'plans.db')`.
- Mutations: storage classes receive the same SQL.js database object.
- Persistence: write-through wrappers around `exec`, `run`, prepared
  `statement.run`, and prepared `statement.free` after write statements.
- Shutdown: disposes runtime services without exporting the full database.

Representative shared stores include `PlanStorage`, `SessionStorage`,
`UserStore`, `AuditStore`, `HumanPrincipalStorage`, CI stores, and
orchestration/workspace stores. They share the API-owned database object.

### CLI shared database helper — offline writer

- Source: `apps/cli/src/lib/db.ts:openSharedDb()`.
- Owner: a separately invoked CLI process.
- Open: explicit path or the current process's
  `.vestara/plans/plans.db`.
- Persistence: migration persistence only; the returned raw SQL.js database
  is not wrapped with API write-through behavior.
- Coexistence: it must not mutate the authoritative file while the API is
  running. It is an offline writer/read-write entrypoint and remains outside
  the API single-writer runtime.

### Migration composition roots

- API: `apps/api/src/workspace-context.ts` runs `PLANS_MANIFEST` before
  storage construction.
- CLI: `apps/cli/src/lib/db.ts` runs `PLANS_MANIFEST` for CLI-owned startup.
- Tests: use in-memory SQL.js databases or explicit temporary files. The
  focused persistence test uses a temporary file and never targets `.vestara`.

### Direct storage construction

`HumanPrincipalStorage` and the other workspace stores accept a database
object; they do not select a file or own schema migration. Production API
composition is the only normal path that supplies the authoritative plans
database. Direct construction in tests is in-memory. A script that opens the
production file directly is an unsupported concurrent writer and must not run
while the API owns the database.

## Single-writer semantics after correction

The authoritative boundary is:

```text
running API WorkspaceContext
  → one in-memory SQL.js plans database
  → API-owned storage services
  → write-through persistence after each mutation
```

Allowed readers:

- API services using the shared context;
- offline diagnostics/readers that do not write;
- a CLI process only when the API is stopped and it owns the database for its
  operation.

Mutation entry boundary:

- normal runtime mutations enter through API services/stores;
- offline CLI mutation is allowed only with exclusive process ownership;
- direct concurrent file mutation is unsupported and must fail operationally,
  rather than be treated as a second writer.

Shutdown semantics:

- no full-database snapshot export occurs during API shutdown;
- all supported API mutation paths persist before returning;
- restart reads the durable file produced by those mutation paths.

An external process must not mutate the file while the API is running. If it
does, the generation check rejects the next API export instead of silently
overwriting the external state. This milestone does not add a cross-process
lock or merge protocol.

## Files changed

- `apps/api/src/workspace-context.ts`
  - exported the testable `openSqlDb` composition helper;
  - centralized write-statement detection;
  - added write-through handling for `Database#run` and statement `run`;
  - added a SHA-256 durable-file generation check that fails closed on an
    external change;
  - retained existing `exec` and prepared-statement persistence;
  - removed shutdown `persistDb(db, dbPath)`.
- `apps/api/__tests__/plans-persistence.test.ts`
  - added bounded stale-snapshot and API-owned durability regression tests;
  - verified representative `plans` and `human_principals` tables.
- `docs/evidence/PERSISTENCE-SINGLE-WRITER-001.md`

No schema, migration version, Telegram database, Activity Room database, or
systemd unit was changed.

## Regression proof

Focused test command:

```bash
pnpm exec vitest run apps/api/__tests__/plans-persistence.test.ts --maxWorkers=2
```

Result: 1 test file passed, 4 tests passed.

The tests prove:

1. API snapshot A is opened and durable state A is written.
2. An external writer changes the file to newer durable state B.
3. API snapshot close performs no full export.
4. A subsequent reader observes B, not stale A.
5. API-owned `Database#run` and prepared-statement mutations are durable
   before close.
6. A later API mutation refuses to overwrite externally newer state.
7. Representative `plans` and `human_principals` rows survive close/readback.

Additional verification:

- API TypeScript no-emit check: passed.
- Biome check on changed source/test files: passed.
- `git diff --check`: passed.
- `pnpm build`: completed successfully; dependency boundaries were valid across
  119 workspace projects and references were generated for 118 buildable
  projects.

## Live restart verification

The operator rebuilt the project and restarted the existing systemd-managed
API. This task did not start or restart another process.

Live evidence:

- `vestara-api.service`: active;
- systemd `MainPID`: `286858`;
- `/api/health`: HTTP `200`, workspace ready;
- `POST /api/telegram/enroll` with an empty body: HTTP `400` with the expected
  route validation error, confirming the rebuilt ACTOR-IDENTITY-002A route is
  loaded;
- compiled `apps/api/dist/workspace-context.js` contains the
  `plans.db changed outside the API writer` fail-closed guard;
- current plans database remained unchanged by this verification:
  `human_principals = 0`, `human_external_identities = 0`;
- no Telegram or identity mutation was performed.

The bounded local regression suite remains the mutation-level proof. Live
verification confirms the corrected compiled API is running without creating
or modifying production plans data. Telegram identity work remains paused.

## Remaining limitations

- No cross-process lock or merge protocol was added; the generation check is
  the fail-closed protection at the API export boundary.
- The CLI remains a separate offline writer and must not run concurrently with
  the API against the same `plans.db`.
- `persistDb` retains best-effort error swallowing; durable-write error
  reporting remains a future hardening item.
- Historical data was not repaired.
