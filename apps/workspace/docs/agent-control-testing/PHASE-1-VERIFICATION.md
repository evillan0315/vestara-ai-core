# Phase 1 — Live Verification Report (Agent Control CRUD)

Environment: real API (`apps/api/dist/index.js`, port 3001, workspace
`vestara-ai-core`) + real Workspace UI (Vite dev, port 5173, proxying `/api`
to 3001). Automation: Playwright/Chromium. Evidence:
`apps/workspace/docs/agent-control-testing/evidence/phase1/`.

## Important environment note

The API process found running at 3001 had started **before** the Phase 1 build
(stale dist, no Phase 1 route changes). It was restarted from the current dist
to serve the code under verification. No source was modified.

## Defect discovered — blocks most of the CRUD lifecycle

**Observed**: `POST /api/agents` → `500 {"error":"table agents has no column
named agent_type"}` (live curl probe and in-browser create both reproduce it).

**Expected**: 201 + persisted agent.

**Classification**: **Persistence / schema-migration defect** (not UI, not
test, not API code). The route and `AgentStorage` are internally consistent;
the defect is in database evolution.

**Root cause** (evidence-backed):
- Current schema (`packages/workspace/src/agent-storage.ts:47-62`) includes
  `agent_type TEXT DEFAULT 'workspace'` and `saveAgent` writes it (`:503-505`).
- Git history: commit `d838201 "feat: add agent type selection (workspace vs
  registry)"` introduced `agent_type` — in the `CREATE TABLE` **and** the
  `INSERT` column list.
- `ensureSchema` uses `CREATE TABLE IF NOT EXISTS` with **no `ALTER TABLE`
  migration**, so a database whose `agents` table predates `d838201` never gains
  the column.
- Dump of the live DB (`vestara-ai-core/.vestara/plans/plans.db`):
  `CREATE TABLE agents (id, name, role, description, capabilities, permissions,
  provider, model, team_id, color, status, created_at, runtime_agent)` — **no
  `agent_type`**, `runtime_agent` appended at the end (older schema).

**Impact**: create and update (and therefore enable/disable, which is a PUT)
return 500 on any workspace whose `agents` table predates `d838201`. `GET` and
`DELETE` work.

Per the task boundary, **no fix was implemented**; root cause is documented and
the decision to migrate (ALTER vs recreate) is left for review.

## Interaction log

| # | Interaction | Expected | Observed | Result |
|---|---|---|---|---|
| 1 | Open Agent Control, capture baseline | catalog renders, no temp agent | 18 seeded agents; no `LiveVerify-*` present | **PASS** (`01-before-create.png`) |
| 2 | Create temp agent "LiveVerify-*" via Registry modal | success toast, modal closes, agent appears | **error toast** `Failed to save agent`; modal stayed open; agent NOT persisted (count 18) | **FAIL (blocked by defect)** (`02-create-form-filled.png`, `03-after-create-attempt.png`) |
| 3 | Reload persistence after create | agent remains | n/a — create failed, nothing to persist | **INDETERMINATE (blocked)** |
| 4 | Update a property | 200 + UI reflects + persists on reload | PUT would hit the same `agent_type` 500 | **BLOCKED (same defect)** |
| 5 | Status transition (enable/disable) | visible state change + persistence | status toggle is a PUT → same 500 | **BLOCKED (same defect)** |
| 6 | Delete temp agent | agent disappears, survives reload | `DELETE` returns 200 (verified via probe); delete path works | **PASS (delete only)** |
| 7 | False-success regression | API failure → error toast, NO success toast, no false state | **error toast shown, success toast absent, count unchanged (18)** | **PASS — fix verified live** |

## False-success regression — VERIFIED CLOSED in the running product

The browser create attempt produced an API failure (the schema 500). The UI:
- recognized the failure and displayed `Failed to save agent` (error toast);
- did **not** display any success notification (`Agent "…" registered` absent);
- left the modal open (no false close);
- presented **no** false persisted state (agent count unchanged at 18; no
  `LiveVerify-*` record in `GET /api/agents`).

This is the exact behavior the Phase 1 production fix (`Agents.tsx` mutations
now route through `apiFetch`, which throws on non-OK) was intended to produce —
confirmed against the real product.

## API / runtime evidence

- `POST /api/agents` 500 body: `{"error":"table agents has no column named
  agent_type"}` (curl probe; reproduced by the browser request).
- `GET /api/agents` returns 18 agents; the attempted create added none.
- API boot log contains 3 `statusCode:500` entries for the create attempts.
- DB schema dump + git history (`d838201`) establish the migration gap.

## Defects discovered

1. **PERSISTENCE / MIGRATION**: `agent_type` schema change (`d838201`) has no
   migration for pre-existing `agents` tables → create/update 500. Root-cause
   hypothesis established; fix intentionally not implemented.

## Remaining uncertainty

- The **green path** (successful create → persists → update → status → delete)
  could not be exercised end-to-end on this workspace because create/update are
  blocked by the defect.
- A fresh workspace (new DB with the current schema) would allow the full green
  lifecycle to be verified against the real product without touching this
  workspace — proposed as the next step after review.
- The enable/disable status control's UI + persistence semantics remain
  unverified live until update succeeds.

## Verdict

**Phase 1 CANNOT yet be considered VERIFIED on this workspace.** The automated
tests pass (14/14) and the false-success regression is confirmed live, but a
pre-existing schema-migration defect breaks agent create/update in the running
product — a defect the automated suite could not catch (tests use a fresh
in-memory DB). Recommend: (a) decide the migration approach for `agent_type`
(and any other schema drift), apply it, then (b) re-run this live verification,
optionally on a fresh workspace for the green path.

Stopped per the task boundary: no production changes made, no Phase 2 work
started.
