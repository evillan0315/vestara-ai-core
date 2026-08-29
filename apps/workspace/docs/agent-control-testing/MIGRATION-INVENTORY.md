# Migration Inventory (Track 3, Step 1) — 74 tables / 42 files

Repository-wide schema evolution inventory. Companion to Phase 1.1a (the
AgentStorage proof) and `PHASE-1.1-MIGRATION-DESIGN.md`.

## DB-file topology (production-opened files)

| File | Owner(s) | Tables |
|---|---|---|
| `plans.db` (shared) | AgentStorage, SessionStorage, PlanStorage, ChangeSetStorage, VerificationStorage, CollaborationStorage, UserStore, AuditStore, KnowledgeGraphStorage, ProjectStorage, orchestration stores, WorkerStore | agents ✓(migrated), agent_executions, agent_teams, agent_schedules, agent_memory, execution_sessions ✓, engineering_sessions, workspace_events, plans, change_sets, verification_reports, collaboration_records, approvals, comments, users, audit_log, knowledge_nodes, knowledge_relations, projects, tasks, sprints, orchestrated_projects, orchestrated_plans, orchestrated_tasks, orchestrated_artifacts, orchestrated_file_locks, orchestrated_worker_nodes, orchestrated_task_leases, orchestrated_parent_projects, orchestrated_parent_children |
| `events/engineering-events.db` | SqliteEngineeringEventStore | engineering_events |
| `threads/agent-harness.db` | FileThreadStore | task_threads, agent_turns, thread_items, thread_checkpoints |
| `conversations/saved-chats.db` | SqliteConversationSessionStore | conversation_sessions, session_transcripts, session_audio_timeline |
| `conversations/conversations.db` | SqliteConversationStore | conversations, conversation_messages |
| `worktrees/leases.db` | WorktreeLeaseRuntime | workspace_leases, file_leases |

Standalone / own-file stores (verify wiring before inclusion): activity-log,
settings-framework, state-runtime, memory, knowledge, conversation user-profile,
impact, engineering-memory, preference, desktop.
Unwired feature scaffolds (0 construction AND 0 injection sites — dormant,
referenced by live services; do not delete): cloud, enterprise, organization,
accuracy, decision, suggestion, analytics, plugin-registry (+ cloud-service,
enterprise-service, organization-service, decision-service, plugin-runtime).

## Drift detection (current CREATE vs original, via git history)

| Table | File | Drift | Action |
|---|---|---|---|
| agents | agent-migrations.ts | +agent_type, +runtime_agent | **MIGRATED** (v2/v3) |
| orchestrated_projects | workflow-orchestrator/stores/project-store.ts | **+verification_reopens** (has an ad-hoc `ALTER` in source — the anti-pattern) | needs migration step |
| orchestrated_tasks | workflow-orchestrator/stores/task-store.ts | **+approval_reason** | needs migration step |
| all others in production files | — | stable (36 tables) | baseline-only |
| thread_checkpoints | thread-runtime | stable (verified) | baseline-only |

**Result: only 2 un-migrated drift tables remain in the production-opened
files**, both in the orchestration domain.

## Per-file manifest plan

- **plans.db** — extend the existing `PLANS_MANIFEST` **additively** (preserve the
  applied agents log at v1–v3):
  - v4 `plans.baseline` — idempotent CREATE of the remaining plans.db tables
    (their current/frozen DDL);
  - v5 `orchestrated_projects.verification_reopens` (addColumnIfMissing);
  - v6 `orchestrated_tasks.approval_reason` (addColumnIfMissing).
  Fresh DBs produce the entire schema from zero (v1–v6). Legacy DBs adopt the
  contiguous baseline then apply the drift steps.
- **events / threads / conversations ×2 / worktrees** — one manifest per file
  with a single baseline step (no drift migrations). Removes the anti-migration
  `CREATE TABLE IF NOT EXISTS` pattern and version-stamps each file.
- **Standalone/unwired stores** — deferred; verify each store's DB file before
  authoring.

## Step 2 — implementation result

**plans.db orchestration domain (done):**
- `@vestara/workflow-orchestrator/src/orchestration-migrations.ts`: baseline (original 9-table orchestration schema) + v2 `orchestrated_projects.verification_reopens` + v3 `orchestrated_tasks.approval_reason`; exported `ORCHESTRATION_MANIFEST`.
- All 7 orchestration stores no longer create schema (the ad-hoc `ALTER` in `project-store.ts` removed).
- `PLANS_MANIFEST` is now composed (agents + orchestration); agent-only `AGENT_MANIFEST` retained for agent tests.
- 11 direct-construction test files migrate first.
- **Live migration: uv 3 → 6**, `orchestrated_tasks.approval_reason` added (a real latent defect — task INSERTs would have failed), 18 agents preserved.

**Finding — sql.js wrapper/transaction conflict:** the API `openSqlDb` auto-persist wrapper calls `db.export()` on CREATE/DML, which sql.js commits an open transaction — incompatible with the migration runner's per-step transactions. Fixed by migrating on the **raw** Database before the wrappers apply (`openSqlDb(dbPath, migrateRaw)`).

**Deferred to next increments:** the 9 workspace plans.db domain stores (session/plan/changeset/verification/collaboration/user/audit/knowledge/project — all stable, 0 test churn), the 5 single-owner files (events/threads/conversations×2/worktrees — stable baselines), and standalone/unwired stores (wiring verification first).

## Enforcement (Step 3)

- Repo-wide drift guard: `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` allowed
  only inside registered migration files; storage constructors must not mutate
  schema.
- Per-file upgrade tests (synthetic historical fixtures) + fresh-DB regression.

## Step 2 — increments 2a + 2b result
- **Finding:** the conversation stores persist via lazy `_persist()`; the others at `.open()`. All use the raw-DB-then-persist pattern (migration before any auto-persist wrapper).

**Verification:** full suite 2047 passed (3 pre-existing env failures); live plans.db at uv=7 with complete applied-log; API serves agents/plans/sessions correctly. Note: `persistDb` writes are non-atomic (truncate+write), so concurrent readers can transiently see an empty file — pre-existing behavior, not introduced by the migration work.

## Step 3 — repo-wide drift guard + per-file tests (done)

- `packages/sqlite-migrations/__tests__/drift-guard.test.ts`: scans `packages/*` +
  `apps/*` for `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE`; DDL is allowed only
  in registered `*migrations.ts` files, the runner, or the explicit deferred
  allowlist (20 standalone/unwired store files). Any new DDL outside these
  fails.
- `packages/sqlite-migrations/__tests__/domain-manifests.test.ts`: pristine
  migrate + idempotency for all six domain file manifests (workspace-domain,
  engineering-events, threads, conversations, conversation-sessions, worktrees)
  + a legacy-adopt test.
- Live sanity: `POST /api/agents` 201 → `DELETE` 200, 18 agents preserved.
- Full suite: 2055 passed, 3 pre-existing env failures.

## Track 3C — finish migration (result)

- **Live verification of the other DB files — done (implicit, evidence captured):**
  `events/engineering-events.db`, `threads/agent-harness.db`,
  `conversations/conversations.db`, `conversations/saved-chats.db`,
  `worktrees/leases.db` all at `uv: 1` with populated applied-log after the API
  boots; `engineering_events` preserved **6254 rows**.
- **Unwired feature scaffolds — 13, NOT removal candidates:** `CloudStorage`,
  `EnterpriseStorage`, `OrganizationStorage`, `AccuracyStorage`,
  `DecisionStorage`, `SuggestionStorage`, `AnalyticsService`, `PluginRegistry`
  (+ `CloudService`, `EnterpriseService`, `OrganizationService`,
  `DecisionService`, `PluginRuntime`). Zero production construction sites AND
  zero injection sites (no `accuracyStorage:`/`pluginRuntime:`/etc. anywhere),
  but their optional fields are referenced by live service logic
  (`verification-service`, `implementation-service`, `planning-service`,
  `collaboration-service`, `session-service`, `suggestion-service`) that
  executes when wired. These are dormant feature scaffolds, not dead code;
  deleting would remove referenced logic. Leave allowlisted; wire or remove
  deliberately when the feature is built.
- **Migrated:** `user-profile-store` (`USER_PROFILE_MANIFEST`), `state-runtime`
  (`STATE_MANIFEST`, `vestara-state.db`), `preference-service`
  (`PREFERENCES_MANIFEST`, `prefs.db`), `impact-storage` (folded into
  `WORKSPACE_DOMAIN_MIGRATIONS` as `impact_assessments.baseline` — live
  `plans.db` verified uv 7 → 8). The 8 scaffold stores' DDL moved to
  `scaffold-migrations.ts` (`CLOUD`/`ENTERPRISE`/`ORGANIZATION`/`ACCURACY`/
  `DECISION`/`SUGGESTION`/`ANALYTICS`/`PLUGIN_MANIFEST`); each class now runs
  `migrate(this.db, MANIFEST)` and is ready to be versioned the moment it is
  wired.
- **Runner fix:** `deriveLegacyDetector` now requires only the baseline tables
  to exist (an older DB missing later-step tables — e.g. a historical
  `plans.db` without `impact_assessments` — is adopted at its contiguous
  version, then upgraded) while still refusing unknown columns.
- **Drift-guard allowlist shrunk to 8 entries**, all justified
  (in-memory / no-write-back / test-only): settings-framework, desktop-service,
  engineering-memory, knowledge, activity-log, notifications, memory, cli
  config.

## Remaining increments (next)

1. **Deferred/allowlisted stores:** the 8 remaining entries are all
   in-memory, no-write-back, or test-only — no production persistent-file
   drift remains. Revisit only if one gains a persistent file.
2. **Feature scaffolds:** wire or remove the 13 dormant classes deliberately
   when their features are built (do not delete — live services reference
   them). Their manifests in `scaffold-migrations.ts` are ready.
