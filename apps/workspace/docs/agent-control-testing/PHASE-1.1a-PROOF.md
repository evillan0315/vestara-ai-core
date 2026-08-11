# Phase 1.1a — AgentStorage Migration Proof (report)

## Result

**Phase 1.1a migration proof: VERIFIED.** **Overall Phase 1: NOT YET VERIFIED**
(completion withheld pending disposition of the slot-bound visibility finding —
see `AGENT-CONTROL-SLOT-FINDING.md`).

## Implemented

| Path | Change |
|---|---|
| `packages/sqlite-migrations/` | New `@vestara/sqlite-migrations`: types, `buildManifest`, conservative fingerprint legacy detector, checksums, runner (per-step transactions, fail-closed, explicit persist). |
| `packages/workspace/src/agent-migrations.ts` | v1 frozen original schema, v2 `agents.agent_type`, v3 `agents.runtime_agent`; `PLANS_MANIFEST`. |
| `packages/workspace/src/agent-storage.ts` | **Schema mutation removed entirely** (no `ensureSchema`, no `migrate`) — execution owned by entrypoints. |
| `apps/api/src/workspace-context.ts` | `openSqlDb` → run `PLANS_MANIFEST` chain **with explicit `persist`** before storages construct. |
| `apps/cli/src/lib/db.ts` | `openSharedDb` now runs the chain with explicit persist (CLI composition root). |

## Migration-execution ownership (revised per reviewer round 2)

- The migration **chain** is the single schema authority; the **drift guard**
  now asserts `AgentStorage` contains no DDL *and no `migrate` call*, while the
  API root and CLI `openSharedDb` do.
- Storage constructors no longer own schema mutation. Direct-construction tests
  migrated before constructing `AgentStorage` (helper `migratedDb` or explicit
  `migrate(db, PLANS_MANIFEST, {})`).

## Automated evidence (23 tests)

| # | Requirement | Result |
|---|---|---|
| 1 | pristine 0 → v1 → v2 → v3 | PASS |
| 2 | synthetic historical v1 upgrades, rows preserved | PASS |
| 3 | Incident state (runtime_agent present, agent_type absent) converges | PASS |
| 4 | historical rows survive unchanged | PASS (18 rows) |
| 5 | metadata + user_version consistent | PASS |
| 6 | failed migration rolls back without advancing | PASS |
| 7 | newer-than-supported fails closed, no mutation | PASS |
| 8 | unknown legacy fails, no mutation | PASS |
| 9 | migrated sql.js DB explicitly persisted | PASS |
| 10 | exported DB reopened + version/schema verified | PASS |
| 11 | fresh DB behavior correct | PASS |
| 12 | drift guard rejects unregistered schema mutation | PASS (updated for entrypoint ownership) |

`pnpm test`: 2043 passed, 3 pre-existing environment failures (unchanged).

## Live verification

**Migration**: live `plans.db` migrated in place — `agent_type` added,
`user_version = 3`, applied-log populated, **18 rows preserved**,
`POST /api/agents` → 201.

**Agent Control lifecycle** (Playwright, `evidence/phase1/p11a-01..09`): create →
reload → update → reload → disable → reload → delete — all PASS **under an
available-slot condition** (the `developer` slot was temporarily vacated because
of the slot-bound finding below; seed restored afterward).

## Findings

1. **Slot-bound create visibility (Phase 1 blocker).** In the default seeded
   workspace all 16 role slots are occupied; a newly created agent persists but
   is invisible in Agent Control. Classified as an accidental UI/presentation
   mismatch; disposition pending (`AGENT-CONTROL-SLOT-FINDING.md`).
2. Duplicate-name / max-length / create-status domain rules remain **HELD**.

## Scope respected

No Phase 2, no unrelated DB files migrated, no 74-table remediation, no
Observer/hierarchy/recovery platform features. Organizational findings preserved
separately in `ORGANIZATIONAL-FINDINGS.md`.

