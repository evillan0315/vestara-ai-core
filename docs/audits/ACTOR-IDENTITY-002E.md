---
title: "ACTOR-IDENTITY-002E — HumanPrincipal Persistence Restart Audit"
version: 1.0.0
status: complete-audit-only
owner: vestara
last-reviewed: 2026-09-25
---

# ACTOR-IDENTITY-002E — HumanPrincipal Persistence Restart Audit

## Conclusion

The original creation and the systemd API used the same database path:

```text
/home/user/projects/vestara-ai-core/.vestara/plans/plans.db
```

The loss was not caused by different database paths or by `pnpm build`.

Root cause classification: **E — persistence write defect**, specifically a
stale in-memory database snapshot being written over the durable database
during API shutdown.

The API process had opened the plans database before the approved principal
creation. The creation was then performed by a separate process against the
same file. On SIGTERM, the API shutdown path unconditionally called
`persistDb(db, dbPath)`, exporting its older in-memory snapshot and replacing
the file. The next API process consequently loaded a database without the
principal.

## Database paths

### Original creation

The approved creation operation was run from
`/home/user/projects/vestara-ai-core` against:

```text
/home/user/projects/vestara-ai-core/.vestara/plans/plans.db
```

The creation evidence recorded the generated row at
`2026-09-25T07:46:47.555Z`:

```text
hp-2df23f59d30f84dc | active
```

The operation used `HumanPrincipalStorage` over that file; it did not write a
different database or mutate the table directly.

### Current systemd API

The systemd unit is:

```text
ExecStart=/usr/bin/node apps/api/dist/index.js
WorkingDirectory=/home/user/projects/vestara-ai-core
User=user
Environment=VESTARA_API_PORT=3001
EnvironmentFile=/home/user/projects/vestara-ai-core/.env
```

The environment file contains:

```text
VESTARA_REPO=/home/user/projects/vestara-ai-core
```

The API journal reports:

```text
[api] opening workspace at /home/user/projects/vestara-ai-core...
```

Therefore its `workspaceDir` is the same repository, and its plans path is
the same absolute path:

```text
path.join(workspaceDir, 'plans', 'plans.db')
→ /home/user/projects/vestara-ai-core/.vestara/plans/plans.db
```

The service's configured working directory is also the repository root, so no
relative-path difference exists between the service and the original shell
operation. The service was observed running as systemd PID `280307`; direct
process-cwd inspection was unavailable from the audit sandbox, but systemd's
`WorkingDirectory` and the API startup log establish the effective path.

### HumanPrincipalStorage construction

`apps/api/src/workspace-context.ts` opens the shared plans database, then
constructs:

```ts
const humanPrincipals = new HumanPrincipalStorage(db);
```

`packages/workspace/src/human-principal-storage.ts` receives the already-open
SQL.js database object. It does not choose a file path and its constructor
does not migrate or reset the schema.

## Startup and shutdown call graph

```text
systemd
  → /usr/bin/node apps/api/dist/index.js
  → apps/api/src/index.ts main()
  → resolveRepoRoot(VESTARA_REPO)
  → createWorkspaceContext(repoPath, publish)
  → workspaceDir = path.join(repoPath, '.vestara')
  → dbPath = path.join(workspaceDir, 'plans', 'plans.db')
  → openSqlDb(dbPath, migrateRaw)
  → migrate(raw, PLANS_MANIFEST, { persist })
  → new HumanPrincipalStorage(db)
```

The relevant source symbols are:

- `apps/api/src/index.ts:resolveRepoRoot()` and `main()`;
- `apps/api/src/workspace-context.ts:openSqlDb()`;
- `apps/api/src/workspace-context.ts:createWorkspaceContext()`;
- `apps/api/src/workspace-context.ts:persistDb()`;
- `packages/workspace/src/agent-migrations.ts:PLANS_MANIFEST`;
- `packages/workspace/src/human-principal-storage.ts:HumanPrincipalStorage`.

On shutdown, `createWorkspaceContext().close()` executes:

```ts
persistDb(db, dbPath);
```

This is an unconditional full-database export from the API's in-memory SQL.js
object.

## Timeline evidence

1. The API process `199855` started on September 24 at 22:54:50 local time
   and opened the workspace plans database.
2. The approved principal was created on September 25 at 15:46:47 local time
   in the same plans file.
3. Process `199855` was still the long-running API process when that external
   write occurred; it therefore retained the older database snapshot in
   memory.
4. At 15:52:35 the service sent SIGTERM to process `199855`.
5. Its shutdown path completed at 15:52:36 and includes the unconditional
   `persistDb(db, dbPath)` call described above.
6. Process `278878` started at 15:52:37 and opened the same workspace.
7. The later build/restart cycle repeated the same lifecycle with process
   `278878` and process `280307`.
8. After the restart, `human_principals` and
   `human_external_identities` were both empty, and enrollment returned
   `HumanPrincipal not found`.

The source and journal evidence establish the same-path stale-snapshot
overwrite mechanism. The exact byte-level write event is not separately
logged, but the shutdown call is deterministic and the observed result is its
direct failure mode.

## Migration and initialization audit

The plans database is opened from disk when present. Otherwise SQL.js creates
an empty database. `openSqlDb()` runs the migration callback before installing
auto-persist wrappers.

`PLANS_MANIFEST` appends, in order, the human principal and human knowledge
migrations. The human principal migration uses only:

```sql
CREATE TABLE IF NOT EXISTS human_principals (...);
CREATE TABLE IF NOT EXISTS human_external_identities (...);
CREATE TABLE IF NOT EXISTS human_credential_bindings (...);
```

It does not delete rows or drop these tables. The migration runner is
forward-only and has no reset/down path in this startup flow. No startup code
was found that executes `DELETE FROM human_principals`,
`DELETE FROM human_external_identities`, or drops those tables.

`HumanPrincipalStorage` only inserts a principal during explicit
`create()`. Its constructor does not seed, clear, or recreate principal data.

## Build audit

The root build scripts are:

```text
build → build:references
build:references → scripts/workspace-architecture.mjs --generate
                    tsc -b tsconfig.references.json
```

The build generates project-reference metadata and TypeScript `dist` output.
It does not open `.vestara/plans/plans.db`, run the API composition root, or
invoke `persistDb()`. Therefore `pnpm build` did not touch runtime persistence.
The destructive overwrite occurred during API shutdown, not build time.

## Database inventory

Relevant `plans.db` files found under the accessible user/runtime locations:

| Absolute path | Human tables | Principal count | External identity count | Target ID |
|---|---:|---:|---:|---:|
| `/home/user/projects/vestara-ai-core/.vestara/plans/plans.db` | yes | 0 | 0 | absent |
| `/home/user/projects/vestara/.vestara/plans/plans.db` | no | 0 | 0 | absent |
| `/home/user/projects/vestara/vestara-ai-core/.vestara/plans/plans.db` | no | 0 | 0 | absent |
| `/home/user/projects/vestara/vestara-ai-core/apps/api/.vestara/plans/plans.db` | no | 0 | 0 | absent |
| `/home/user/projects/vestara/vestara-ai-core/apps/workspace/.vestara/plans/plans.db` | no | 0 | 0 | absent |

The API's active file is the first row. The other files are fixtures or
separate historical/runtime trees and are not selected by the systemd
configuration.

The current active file has `PRAGMA user_version = 23`, with the expected
`human_principal.baseline` and `human_knowledge.baseline` migration records.
The schema exists; only the rows are absent.

## Blast radius

The defect is not limited to HumanPrincipal data. The API uses one shared
SQL.js in-memory database for the plans database, including agent,
orchestration, workspace, CI-observer, credential-binding, and human-context
tables. The shutdown export can overwrite any durable changes made by another
writer after the API opened its snapshot.

No evidence in this audit proves loss of other specific rows. The established
blast radius is the entire shared `plans.db`, not the separate Telegram,
conversation, Activity Room, preferences, or other independently opened
database files.

This is a single-writer/concurrency boundary defect: an external writer must
not modify the file while the API owns an in-memory copy that may later be
exported over it.

## Smallest recommended correction

Do not perform live principal creation or any other direct file-level write
while the API owns the shared SQL.js database. The smallest safe operational
correction is to expose/use a canonical API/service operation that performs
the mutation on the API's already-open `HumanPrincipalStorage` instance.

At the storage/runtime boundary, the shutdown path should also stop
unconditionally overwriting the file from a potentially stale snapshot. A
minimal implementation should establish one writer for `plans.db` and either
persist mutations through that writer or add optimistic/concurrency protection
before shutdown export. The correction should be implemented and verified
before another principal creation is authorized.

## Authorization decision

It is **not safe to authorize another principal creation yet**. The previous
principal was lost by the shared-database stale-snapshot overwrite path. Fix
and verify the single-writer/persistence boundary first; then authorize one
new creation only after confirming the row survives a controlled API restart.

No database, service, systemd unit, or production source code was modified by
this audit. No principal was created and no Telegram identity was enrolled.
