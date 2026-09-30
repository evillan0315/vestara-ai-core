# PERSISTENCE-INTEGRITY-001 — Shared `plans.db` Audit

Status: audit-only, completed 2026-09-25

## Scope and authoritative source

This audit inspected the live durable database at:

`/home/user/projects/vestara-ai-core/.vestara/plans/plans.db`

No database, service, source implementation, or Activity Room store was
modified. The audit uses the historical evidence in
[`ACTOR-IDENTITY-002E.md`](./ACTOR-IDENTITY-002E.md) and the runtime
persistence correction documented in
[`PERSISTENCE-SINGLE-WRITER-001.md`](../evidence/PERSISTENCE-SINGLE-WRITER-001.md).

## 1. Database inventory

The database is readable and structurally consistent with the current
migration set:

- SQLite user version: `23`.
- `_vestara_migrations`: `23` rows, migrations 1 through 23 present.
- File size: `1,011,712` bytes.
- No duplicate primary identifiers were returned by the schema-backed tables.
- The database contains the expected shared domains: agents, orchestration,
  workspace, knowledge, CI/verification, credentials, and human context.

Representative row counts:

| Domain/table | Rows | Observation |
| --- | ---: | --- |
| `agents` | 7 | The seven canonical active agents are present. |
| `execution_sessions` | 9 | 7 completed and 2 failed. |
| `audit_log` | 777 | Durable audit history is present. |
| `orchestrated_projects` | 1 | Project is in `verifying`. |
| `orchestrated_plans` | 1 | Plan is `approved` and linked to the project. |
| `orchestrated_tasks` | 3 | 2 completed and 1 testing. |
| `orchestrated_artifacts` | 11 | Project/plan/task references resolve. |
| `orchestrated_file_locks` | 5 | Task references resolve. |
| `knowledge_nodes` / `knowledge_relations` | 129 / 128 | Explicit source/target orphan checks are empty. |
| CI tables | 0 | No current CI records; no historical loss evidence was found. |
| `human_principals` | 0 | No canonical human principal currently exists. |
| `human_external_identities` | 0 | No canonical external identity binding currently exists. |
| `human_credential_bindings` / `human_knowledge_items` | 0 / 0 | No child rows exist. |
| `users` | 1 | `user-admin` remains in its separate account namespace. |

The connection used for inspection reported `PRAGMA foreign_keys = 0`, so the
empty `PRAGMA foreign_key_check` result is not sufficient by itself. Explicit
read-only orphan queries were therefore run for orchestration tasks, plans,
artifacts, file locks, knowledge relations, and human-context child tables;
all returned zero rows. The schema foreign keys are defined by the migration
implementations in `packages/workflow-orchestrator/src/orchestration-migrations.ts`
and the human-context migrations used by `HumanPrincipalStorage`.

Observed lifecycle values are valid against the source contracts in
`packages/workflow-orchestrator/src/types.ts`: the project is `verifying`, the
plan is `approved`, and tasks are `completed`/`testing`. No invalid status
value or impossible parent/status relationship was observed.

One non-FK relationship needs caution: some historical artifact `agent_id`
values (`agent-1789371602795`, `architect`, `planner`, and `analyst`) do not
match the seven current canonical agent IDs. `orchestrated_artifacts.agent_id`
is not a foreign key; `packages/workflow-orchestrator/src/stores/artifact-store.ts`
accepts an artifact actor identifier for historical provenance. This is a
logical reference discrepancy, not proof that an authoritative agent record
was lost.

## 2. Historical evidence

### CONFIRMED

The principal `hp-2df23f59d30f84dc` existed in this same authoritative
database before the stale API snapshot was persisted during shutdown. The
evidence in `docs/evidence/ACTOR-IDENTITY-002D.md` records one active principal
at `/home/user/projects/vestara-ai-core/.vestara/plans/plans.db`; after the
restart, the database contained zero principals and zero external identities.
`docs/audits/ACTOR-IDENTITY-002E.md` establishes the mechanism: an older
in-memory SQL.js snapshot unconditionally overwrote the file during shutdown.

This is a confirmed historical inconsistency and the only confirmed durable
record loss identified by this audit.

### NO EVIDENCE

There is no source-backed evidence that any of the following previously
contained records that are now missing:

- `human_external_identities`: no successful enrollment was recorded before
  the principal disappeared.
- `plans`: the table is empty, but no historical row or write evidence was
  found.
- CI/verification tables: all are empty, but no prior durable records were
  identified as lost.
- current agents, orchestration project/plan/tasks, artifacts, locks,
  execution sessions, audit history, or `user-admin`: records remain present
  and no historical before/after discrepancy was found.

The empty state of a table is not treated as evidence of loss.

### SUSPECTED / OBSERVATION

The artifact actor identifiers described in the inventory may represent
historical or ephemeral agent identities that no longer have canonical agent
rows. Existing repository documentation treats this as a historical-reference
and presentation concern. Because there is no FK and no authoritative
before-state proving deletion, it remains suspected rather than confirmed
corruption. No repair is authorized by this audit.

## 3. Activity Room correlation

Activity Room uses separate persistence:

- `.vestara/m9-activity.db`: 11,094 events.
- `.vestara/activity.db`: 208 legacy events.
- `.vestara/telegram.db`: Telegram adapter state.
- `.vestara/conversations/conversations.db`: conversation/message state.

The M9 activity store contains three distinct task IDs, and all three match
the current `orchestrated_tasks` rows. It contains no execution IDs matching
`agent_executions` (which currently has zero rows). The activity and
conversation stores were not rewritten by this audit.

The Activity Room architecture documents identify M9 as a projection rather
than the plans/orchestration authority (`docs/audits/ACTOR-IDENTITY-001.md` and
`docs/activity-room/arx-015-architecture-review.md`). Existing observations
about parallel activity stores, snapshot caching, and stream population are
therefore classified as Activity Room projection/storage concerns. No concrete
record links the observed Activity Room inconsistencies to the historical
`plans.db` stale-snapshot overwrite. Causation is unknown/unproven.

## 4. Repair assessment

The missing `hp-2df23f59d30f84dc` principal is repairable only through a new,
explicit canonical provisioning operation. The historical evidence supports
the former generated ID and active status, but this audit must not recreate it
or directly edit the database. The smallest future boundary is:

1. obtain fresh operator approval for one principal creation;
2. create it through the corrected API-owned writer;
3. verify persistence across restart;
4. separately perform explicit Telegram enrollment if still desired.

No external identity should be repaired because there is no evidence that a
binding was ever committed. Artifact actor references should remain untouched
unless a later, separately authorized provenance-repair design establishes
authoritative replacement records.

## 5. Integrity conclusion and write safety

Current `plans.db` is structurally intact: migration version is complete,
representative shared-domain records are present, explicit orphan checks are
clean, and no invalid lifecycle values were observed.

It is safe for normal new writes through the corrected API/workspace single
writer described in `PERSISTENCE-SINGLE-WRITER-001.md`. This does not make
concurrent offline writers safe, and it does not authorize historical repair.

ACTOR-IDENTITY-002D must not resume automatically. The prior one-principal
approval was consumed by the historical creation and the resulting record is
absent. A new explicit operator approval is required before provisioning a
replacement principal; after that, Telegram enrollment remains a separate
explicit operation.

No production behavior or durable production state was changed.
