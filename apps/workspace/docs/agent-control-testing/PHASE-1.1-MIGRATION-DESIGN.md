# Phase 1.1 — Migration Architecture Design (rev 2)

Design only. Revision 2 incorporates the Reviewer's round-1 findings. Grounded
in the drift audit and the live DB topology.

## Locked decisions (approved for Phase 1.1a)

1. **Package name**: `@vestara/sqlite-migrations`.
2. **Composition-owned manifest API**: the composition root builds the file's
   manifest via `buildManifest(file, groups)`; versions are assigned 1..N by
   manifest order. Packages export `MigrationStep` content only.
3. **Legacy detection is conservative and fingerprint-based**: the only
   recognized states are exact postconditions of a contiguous run of versions.
   Anything else fails `UNKNOWN_LEGACY_SCHEMA`; the runner never guesses.
4. **Checksums cover the step's identity + declared postcondition**:
   `sha256(name | canonical(produces))`, recorded in `_vestara_migrations`.
   A mismatch means the step definition changed after it was applied → fail
   closed with `MIGRATION_CHECKSUM_MISMATCH`; the DB is not mutated.


## Revision log (round-1 findings → correction)

| Reviewer finding | Resolution |
|---|---|
| **Migration-0 semantics defective** (`version > current` with migration 0 = CREATE skips the CREATE on fresh DBs) | **Confirmed.** Corrected to **1-based versions**: v1 = baseline CREATE, v2/v3 = additions. A fresh DB at `user_version = 0` runs 1 → 2 → 3. |
| **Legacy unversioned adoption missing** | **Confirmed.** Added an explicit bootstrap rule distinguishing *pristine* (empty) from *legacy-known* (has baseline tables) from *UNKNOWN_LEGACY_SCHEMA*. |
| **Shared-file numbering under-specified** (two packages could both pick version 4) | **Confirmed.** The **composition root owns the file-level sequence** via an ordered manifest; packages own migration *content* only. |
| **sql.js export persistence unspecified** | **Confirmed with evidence**: `openSqlDb` persists only on INSERT/UPDATE/DELETE/CREATE/DROP (exec) and INSERT/UPDATE/DELETE (prepare) — `ALTER TABLE`/`PRAGMA user_version` are not persisted. The runner must **explicitly persist + verify by reopen**. |
| **Newer-than-binary too permissive** (warn-and-proceed assumes additive) | **Confirmed.** Refuse: `DATABASE_VERSION_INCOMPATIBLE`, do not mutate, fail that subsystem's startup, preserve the DB. |
| **Transaction language imprecise** | Corrected to exact wording. |
| **Applied-log under-valued + no invariant** | Promoted to first-class provenance with invariant `MAX(log.version) == user_version`. |
| **Drift-guard mechanism path-based** | Changed to a **semantic** guard: schema DDL is allowed only inside registered migration steps. |

---

## Design principles (unchanged + tightened)

1. **One authoritative evolution path per SQLite file.** Storage constructors
   never run `CREATE TABLE`/`ALTER TABLE`; schema state is produced by the
   migration chain (the chain can produce the entire schema from zero).
2. **Version is a property of the database file**, owned by the composition
   root, not by packages.
3. **Fresh and legacy databases converge through the same chain.**
4. **Smallest architecture that migrates AgentStorage now and scales later.**

---

## Versioning scheme

Versions are **1-based integers** on `PRAGMA user_version`:

```
v1  agents baseline schema   (the frozen original CREATE: agents, agent_executions,
                              agent_teams, agent_schedules, agent_memory, execution_sessions)
v2  + agents.agent_type      (represents d838201)
v3  + agents.runtime_agent   (the former ad-hoc ALTER, now a registered step)
```

Fresh DB (`user_version = 0`, no tables) → runner applies 1 → 2 → 3.
The original pre-migration DB (tables exist, `user_version = 0`) → **adopted as
v1**, then applies 2 → 3.

## API surface

```ts
// Domain packages export CONTENT; they never choose a file-level version.
export interface MigrationStep {
  readonly name: string;                                   // 'agents.agent_type'
  readonly up: (db: Database, ctx: MigrationContext) => void;
  readonly down?: (db: Database) => void;
  readonly destructive?: boolean;
  /** Postcondition — used by legacy adoption and the drift guard. */
  readonly produces?: { readonly table: string; readonly columns: readonly string[] };
}

// The composition root owns the FILE's ordered manifest → versions 1..N by order.
export interface MigrationManifest {
  readonly file: string;                                   // 'plans'
  readonly steps: readonly MigrationStep[];
  /** Highest contiguous legacy baseline version present in an unversioned DB, or null. */
  readonly detectLegacyVersion?: (db: Database) => number | null;
}

export interface MigrationContext {
  /** Idempotent column-add used by additive steps (safe against partially-migrated legacy DBs). */
  addColumnIfMissing(db: Database, table: string, column: string, ddl: string): void;
  recordBaseline(db: Database, version: number): void;
}

export interface MigrateOptions {
  readonly persist: (db: Database) => void;               // export + write + rename (the file's own persist)
  readonly recordApplied?: boolean;                       // default true
}

export interface MigrationResult {
  readonly from: number;
  readonly to: number;
  readonly adopted?: number;                              // set when a legacy DB was bootstrapped
  readonly applied: readonly string[];                    // steps applied this run
}

export function buildManifest(file: string, groups: readonly (readonly MigrationStep[])[]): MigrationManifest;
export function currentVersion(db: Database): number;
export function migrate(db: Database, manifest: MigrationManifest, options: MigrateOptions): MigrationResult;
```

`buildManifest` allocates the file-level sequence deterministically (1..N by
group/step order), validates unique names, and rejects collisions.

## Runner algorithm (exact)

```
uv = PRAGMA user_version
maxV = manifest.steps.length

if uv > maxV:
    throw DATABASE_VERSION_INCOMPATIBLE        // do NOT mutate; fail this subsystem's startup

changed = false
if uv == 0:
    if dbEmpty(db):                            // no user tables at all
        start = 1
    else:
        adopted = manifest.detectLegacyVersion?.(db) ?? null
        if adopted == null: throw UNKNOWN_LEGACY_SCHEMA     // do NOT mutate, do NOT guess
        transaction { PRAGMA user_version = adopted; ctx.recordBaseline(db, adopted) }
        start = adopted; changed = true

for v in (start + 1) .. maxV:
    step = manifest.steps[v - 1]
    transaction {                                 // BEGIN ... COMMIT (ROLLBACK on error)
        step.up(db, ctx)
        PRAGMA user_version = v
        if recordApplied: insert _vestara_migrations(v, step.name, now, checksum)
    }                                              // N commits; N+1 rolls back; uv stays N

if recordApplied:
    assert MAX(_vestara_migrations.version) == PRAGMA user_version
        else throw SCHEMA_METADATA_INCONSISTENT

if changed: options.persist(db)                    // explicit file export AFTER commit
return { from: uv, to: currentVersion(db), adopted?, applied }
```

## Answers to the hard questions (revised)

### 1. Version per file, not per storage/domain
Unchanged: `PRAGMA user_version` per SQLite **file**. Domains are identified by
`name` prefixes inside the file's chain; the integer belongs to the file.

### 2. Who owns migrations on shared DBs?
**The composition root that opens the file builds the manifest and runs the
chain** once, before any storage is constructed. Packages export `MigrationStep`
content; the root's `buildManifest` assigns the file-level sequence. Ownership
of *numbering* = file/composition; ownership of *content* = package.

### 3. Deterministic ordering
By manifest order → integer versions 1..N. `buildManifest` rejects duplicate
names and non-contiguous gaps. The runner never infers order.

### 4. N succeeds, N+1 fails
Exact language: **N commits and `user_version` becomes N; N+1 is rolled back and
`user_version` remains N; the DB file is left at N (persisted only if `changed`
includes committed steps); startup throws and the next boot begins by applying
N+1.** A failed step can never leave a partial migration or a version that
claims an unapplied step.

### 5. Transactionality
One transaction per step (never a chain-wide transaction). `user_version` and
the applied-log row commit atomically with the step's DDL. SQLite journals the
database-header change, so `PRAGMA user_version` is transactional under sql.js.

### 6. DB newer than binary
**`DATABASE_VERSION_INCOMPATIBLE`**: do not mutate, fail that subsystem's
startup, preserve the DB untouched. No warn-and-proceed. A future manifest may
declare `backwardCompatibleThrough` only when compatibility is explicitly
declared and tested — not today.

### 7. Irreversible migrations
`down` absent ⇒ irreversible (recorded). `destructive: true` requires
acknowledgment, is forward-only, and is never run against a newer-than-binary
DB. There is no destructive downgrade path.

### 8. Historical DB fixtures
- Gold fixture: preserved `plans-pre-migration.db` (sha256-pinned) — the real
  "v1 legacy" for AgentStorage upgrade tests.
- Synthetic fixtures: a `fixture-builder` regenerates historical schemas from
  source history (runs that era's DDL against a temp DB, exports). Maintained
  with a checksum manifest; the live `plans.db` is never used directly.

### 9. One authoritative path
- Storage constructors no longer call `ensureSchema()`; `CREATE TABLE IF NOT
  EXISTS` is removed from them for migrated domains.
- The baseline CREATE lives in v1's `up` and is **frozen** (diff-guarded against
  the original schema).
- The applied-log is first-class provenance; the invariant `MAX(log.version) ==
  user_version` is checked; disagreement ⇒ `SCHEMA_METADATA_INCONSISTENT` (do
  not silently trust either).

## Legacy adoption / bootstrap (new — the core of this incident)

`user_version = 0` alone cannot distinguish a fresh DB from an unversioned
legacy DB. The runner therefore bootstraps:

```
if uv == 0:
    if DB empty             → pristine: start from v1
    else:
        manifest.detectLegacyVersion(db)   // inspect actual tables/columns
        → v (known)         → adopt baseline v (metadata only; NO recreate,
                              NO destructive change) then apply v+1..N
        → null              → UNKNOWN_LEGACY_SCHEMA (fail, no mutation)
```

For `agents`, `detectLegacyVersion` inspects the `agents` table's actual columns
and returns the highest **contiguous** version whose postconditions hold. The
live pre-migration DB has the original columns **plus** `runtime_agent` but
**no** `agent_type` → returns **1** → adopt v1 → apply v2 (`agent_type` added)
→ apply v3 (`runtime_agent` already present; the step is idempotent via
`addColumnIfMissing` and is recorded as satisfied). Result: identical schema,
all historical rows preserved. This is exactly the case Incident #0001 is about:
introducing versioning into an existing unversioned DB.

Idempotency inside additive steps is **safety**, not a competing schema
authority — the chain remains the single definition of schema state.

## Persistence (new — mandatory)

Migrations run on the in-memory sql.js `Database`. `openSqlDb` persists only on
INSERT/UPDATE/DELETE/CREATE/DROP — **`ALTER TABLE` and `PRAGMA user_version` are
not auto-persisted** (verified). Therefore:

- `migrate()` calls `options.persist(db)` (export + write + rename) after any
  successful adoption/application.
- **Restart-verification is mandatory**: an upgrade test that migrates a fixture
  in memory → persists → **reopens the exported bytes in a new `Database`** →
  asserts `PRAGMA user_version` and the postcondition columns. A migration that
  does not survive reopen is a failing test.

## Drift guard (semantic, not path-based)

Migration content may live in domain packages (e.g.
`packages/workspace/src/agent-migrations.ts`); the generic package must not know
every Vestara schema. The guard therefore asserts:

1. Schema-mutating DDL (`CREATE TABLE`, `ALTER TABLE`, `DROP`) appears **only
   inside registered `MigrationStep.up` functions** in a manifest — regardless
   of which package/file it lives in.
2. The v1 baseline CREATE is diff-frozen against the original schema.
3. Every `MigrationStep` in a manifest is exercised by an upgrade test (gold +
   synthetic fixtures) and a fresh-DB regression test.

## Rollout (bounded to Incident #0001)

```
Phase 1.1a — AgentStorage proof
  @vestara/sqlite-migrations  (runner, manifest, adoption, persistence contract, tests)
  agent-migrations            (v1 baseline + v2/v3) in packages/workspace
  composition root: plans.db manifest; migrate before constructing stores
  upgrade tests               (plans-pre-migration.db → adopted v1 → v2/v3 → data preserved → CRUD ok)
  fresh-DB regression         (new DB → chain → same schema)
  restart-verification test   (persist → reopen → assert)
  drift-guard test
  → re-run live CRUD on the EXISTING pre-migration workspace
  → Phase 1 VERIFIED
        |
        v
Separately (documented backlog, not Agent Control scope)
  repository-wide drift inventory (all 74 tables)
  move each domain's frozen CREATE into the chain (v1 expansion or later steps)
```

Non-goals for 1.1a: migrating `events.db`, `threads.db`, conversation files,
orchestration stores; building the inventory tooling. Other stores keep their
frozen `CREATE TABLE IF NOT EXISTS` baseline until the inventory moves them into
the chain — the drift guard prevents new columns being added to them meanwhile.

## Shared-DB transitional caveat (recorded honestly)

`plans.db` is a shared database, but its `user_version = 3` currently represents
**only the migrated AgentStorage portion**; other domains still rely on their
own `CREATE TABLE IF NOT EXISTS` baselines:

```
plans.db
├── AgentStorage schema   versioned migration chain ✓
├── PlanStorage           legacy CREATE path
├── AuditStore            legacy CREATE path
├── ProjectStorage        legacy CREATE path
└── others...             legacy CREATE path
```

This is an acceptable bounded transitional state. It means Vestara has **proven
the new migration mechanism for AgentStorage**, not yet that *plans.db* has one
authoritative evolution path. Converging the remaining domains into the
file-level manifest is the repository-wide migration backlog (separate from
Incident #0001), gated on the mechanism proven here.

## Ownership of migration execution (revised after review)

- The migration **chain** is the single schema authority (no `CREATE`/`ALTER`
  outside registered steps — enforced by the drift guard).
- **Execution** is owned by each entrypoint's composition root: the API
  (`workspace-context` `openSqlDb` → `migrate(..., { persist })`) and the CLI
  (`apps/cli/src/lib/db.ts` `openSharedDb` → `migrate(..., { persist })`).
- **Storage constructors do not run migrations** — `AgentStorage` no longer
  calls `ensureSchema()`/`migrate()`; it assumes the DB was migrated by the
  entrypoint that opened it.

## Open items for review

- Package name (`@vestara/sqlite-migrations` vs `@vestara/persistence`).
- Manifest vs explicit per-file registration API (manifest order is proposed).
- Whether `detectLegacyVersion` should be a manifest function (proposed) or a
  generic column-probe helper shared by domain migrations.
- Checksum scope for the applied-log (step content hash vs a single chain hash).
