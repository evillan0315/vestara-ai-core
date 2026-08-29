# Phase 1.1 — Agent Storage Schema Drift Audit

Analysis only. No production code changed. Fixture preserved:
`apps/workspace/docs/agent-control-testing/fixtures/plans-pre-migration.db`
(sha256 `38920eb75a301b3be02fea1d76cd4e94bfeb24a8cb03008ee826353abb9bb55e`,
identical to the live `vestara-ai-core/.vestara/plans/plans.db`). The live DB is
kept as-is — it is the migration fixture.

## Headline

The root cause is **not** "one missing column". It is the absence of a
**schema-evolution mechanism**. Vestara has schema *creation* (74
`CREATE TABLE IF NOT EXISTS`) but no schema *evolution*: only **two ad-hoc
column-level `ALTER TABLE` migrations** exist in the entire codebase and there
is **no database versioning**. `agents.agent_type` is the live symptom of a
systemic gap.

## 1. Canonical vs live `agents` schema

| # | Canonical (current `agent-storage.ts:47-62`) | Live (fixture) | Drift |
|---|---|---|---|
| 1 | id | id | — |
| 2 | name | name | — |
| 3 | role | role | — |
| 4 | `agent_type` | **missing** | **DRIFT** |
| 5 | description | description | — |
| 6 | capabilities | capabilities | — |
| 7 | permissions | permissions | — |
| 8 | provider | provider | — |
| 9 | model | model | — |
| 10 | runtime_agent | runtime_agent (last column) | order differs (ALTER-added) |
| 11 | team_id | team_id | — |
| 12 | color | color | — |
| 13 | status | status | — |
| 14 | created_at | created_at | — |

Indexes: all canonical indexes present in the live DB
(`idx_sched_agent`, `idx_sched_next`, `idx_exec_agent`, `idx_exec_status`,
`idx_memory_agent`, `idx_exs_status`). No index/constraint drift.

Other `AgentStorage` tables — `agent_executions`, `agent_teams`,
`agent_schedules`, `agent_memory`, `execution_sessions` — **match canonical**.
No drift.

## 2. Evolution history of the `agents` table (git evidence)

| Commit / state | Change to `agents` | Migration added? |
|---|---|---|
| `8d81f03` "v0.3.0 — Foundation Complete" (Jul 27) | original CREATE: id, name, role, description, capabilities, permissions, provider, model, team_id, color, status, created_at | — |
| `d838201` "feat: add agent type selection" (Aug 2) | adds `agent_type` to CREATE **and** to the `INSERT` column list | **NO** |
| Uncommitted working tree | adds `runtime_agent` to CREATE **and** `INSERT` | **YES** — `PRAGMA table_info` presence check + `ALTER TABLE agents ADD COLUMN runtime_agent` (`agent-storage.ts:129-133`) |

Columns added since original: `agent_type` (not migrated), `runtime_agent`
(migrated). The live DB was created from the original schema, then received only
`runtime_agent` via the ad-hoc ALTER (verified present) — `agent_type` was never
backfilled.

## 3. Live defect chain (verified)

```
original schema (no agent_type, no runtime_agent)
  → CREATE TABLE IF NOT EXISTS agents  (no-op on existing table)
  → uncommitted migration adds runtime_agent only
  → saveAgent INSERT expects agent_type
  → SQLite error "table agents has no column named agent_type"
  → POST/PUT /api/agents → 500
```

## 4. Systemic pattern audit

- **74** `CREATE TABLE IF NOT EXISTS` statements across **41** files
  (packages + apps) — the standard way all SQLite stores are initialized.
- **2** `ALTER TABLE` statements in the whole codebase:
  1. `orchestrated_projects.verification_reopens`
     (`workflow-orchestrator/src/stores/project-store.ts:40`) — **applied** on the live DB.
  2. `agents.runtime_agent` (`agent-storage.ts:132`) — **applied** on the live DB.
- **Zero database versioning**: no `PRAGMA user_version`, no migration table,
  no migration runner. (`SCHEMA_VERSION`, `APE_SCHEMA_VERSION`,
  `TUI_BOOTSTRAP_SCHEMA_VERSION` are document/artifact metadata, not DB
  migrations.)
- No transactional migration framework; the two ALTERs are idempotent only by
  column-presence check, and only for the columns someone remembered to migrate.

## 5. Conclusion

`agents.agent_type` is the **only** live drift in this database (every other
table checked, including the second ALTER target, is current) — but it is
direct evidence of a systemic condition: **schema creation exists, schema
evolution does not.** Any migration fix must therefore:

1. Establish a **versioned, transactional, idempotent migration mechanism** for
   these SQLite stores (e.g. `PRAGMA user_version` or a `migrations` table), not
   a one-off `ALTER TABLE ... ADD COLUMN agent_type`.
2. **Backfill every known schema change** — audit all 41 files / 74 tables for
   columns added to `CREATE` since each table's introduction (the two known
   post-original additions are `agent_type` and `runtime_agent`; the audit
   should confirm no others exist across storages).
3. Add **upgrade-path tests** using the preserved pre-migration fixture
   (`old DB → migrate → schema upgraded → historical rows preserved → CRUD
   succeeds`), in addition to fresh-DB regression tests. This is the test class
   that is currently missing: fresh-DB tests verify today's architecture;
   migration tests verify the history of the product.
4. Define rollback/failure behavior and backward-compatibility expectations
   before implementing.

Not implemented — this is the audit deliverable; migration design is the next
step pending review.

## Migration-design considerations (for the next step, not built)

- Mechanism: `PRAGMA user_version` vs migrations table; single shared runner
  vs per-store.
- Idempotency: column-presence checks (already the de-facto pattern) vs
  declarative target-schema diff.
- Transactionality: wrap schema DDL in `BEGIN`/`COMMIT`.
- Backfill order: `agent_type` for the live fixture; audit all other stores for
  latent drift before finalizing.
- Fixture policy: keep `plans-pre-migration.db`; never delete the live DB.
